import {ZipReader,ZipWriter,BlobReader,BlobWriter,Uint8ArrayReader,type FileEntry} from '@zip.js/zip.js'
import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
import {safePath} from './model'
import {CheckedBlobReader} from './archive'
export type Paragraph={id:string;position:number;ja?:string;zh:string}
export type Chapter={work:string;id:string;title:string;position:number;paragraphs:Paragraph[]}
export type Novel={id:string;title:string;author:string;series:string;tags:string[];cover?:string;illustrations:Record<string,string>;chapters:{id:string;path:string;title?:string}[];languages:'zh'|'both';imported:number}
type Spec={sha256:string;bytes:number}
type Manifest={format:string;version:number;languages:'zh'|'both';works:{id:string;metadata:string}[];files:Record<string,Spec>}
const validId=(x:unknown):x is string=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(x)
const validText=(x:unknown,max=10000):x is string=>typeof x==='string'&&x.length<=max
export function validateNovelManifest(m:Manifest){
 if(!m||m.format!=='novelforge-library'||m.version!==1||!['zh','both'].includes(m.languages)||!Array.isArray(m.works)||!m.works.length||m.works.length>1000||!m.files||Array.isArray(m.files))throw Error('不支持的小说包格式')
 const ids=new Set();let total=0
 for(const w of m.works){if(!validId(w.id)||ids.has(w.id)||!safePath(w.metadata)||!w.metadata.startsWith('works/'+w.id+'/'))throw Error('小说编号或目录无效');ids.add(w.id)}
 if(Object.keys(m.files).length>30000)throw Error('包内文件过多，请分批导出')
 for(const [path,f] of Object.entries(m.files)){if(!safePath(path)||!path.startsWith('works/')||!f||!Number.isSafeInteger(f.bytes)||f.bytes<0||f.bytes>32*1024**2||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('文件索引无效或单文件超过 32 MB');total+=f.bytes}
 if(total>512*1024**2)throw Error('小说包解压后超过 512 MB，请分批导出')
 return m
}
let connection:Promise<IDBDatabase>|undefined
function db(){return connection??=new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('novelforge-mobile',1);r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('books',{keyPath:'id'});for(const n of ['chapters','assets'])d.createObjectStore(n,{keyPath:['work','id']}).createIndex('work','work');d.createObjectStore('state')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function read<T>(name:string,key?:IDBValidKey):Promise<T>{const d=await db();return new Promise((res,rej)=>{const tx=d.transaction(name);const r=key===undefined?tx.objectStore(name).getAll():tx.objectStore(name).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
export const novels=()=>read<Novel[]>('books')
export const chapter=(work:string,id:string)=>read<Chapter>('chapters',[work,id])
export const novelState=<T>(key:string)=>read<T|undefined>('state',key)
export async function saveNovelState(key:string,value:unknown){const d=await db();await new Promise<void>((res,rej)=>{const t=d.transaction('state','readwrite');t.objectStore('state').put(value,key);t.oncomplete=()=>res();t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})}
export async function novelAsset(work:string,path:string){return (await read<{data:Blob}>('assets',[work,path]))?.data}
function removeChildren(s:IDBObjectStore,work:string){const r=s.index('work').openCursor(IDBKeyRange.only(work));r.onsuccess=()=>{const c=r.result;if(c){c.delete();c.continue()}}}
export async function deleteNovel(id:string){const d=await db();await new Promise<void>((res,rej)=>{const t=d.transaction(['books','chapters','assets','state'],'readwrite');t.objectStore('books').delete(id);for(const name of ['chapters','assets'])removeChildren(t.objectStore(name),id);for(const key of ['progress:','favorite:','bookmarks:'])t.objectStore('state').delete(key+id);t.oncomplete=()=>res();t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})}
async function limited(entry:FileEntry,max:number){let size=0;const chunks:Uint8Array[]=[];await entry.getData(new WritableStream<Uint8Array>({write(c){size+=c.length;if(size>max)throw Error('解压文件超过限制');chunks.push(c)}}),{checkSignature:true});const out=new Uint8Array(size);let off=0;for(const c of chunks){out.set(c,off);off+=c.length}return out}
export async function importNovels(file:File,progress:(s:string)=>void,signal?:AbortSignal){
 const reader=new ZipReader(new CheckedBlobReader(file),{useWebWorkers:false});let completed=0
 try{
  const entries=new Map<string,FileEntry>();let count=0
  for await(const e of reader.getEntriesGenerator()){if(++count>30002||!safePath(e.directory?e.filename.replace(/\/$/,''):e.filename)||e.encrypted||entries.has(e.filename))throw Error('ZIP 路径、重复文件或文件数量异常');if(!e.directory)entries.set(e.filename,e)}
  const entry=entries.get('manifest.json');if(!entry||entry.uncompressedSize>4*1024**2)throw Error('请选择电脑导出的 NovelForge-Library.zip 小说包')
  const parse=(b:Uint8Array)=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b))
  const m=validateNovelManifest(parse(await limited(entry,4*1024**2)))
  const estimate=await navigator.storage?.estimate();const required=Object.values(m.files).reduce((n,s)=>n+s.bytes,0)
  if(estimate?.quota&&required>estimate.quota-(estimate.usage||0))throw Error('浏览器可用空间不足，请分批导入')
  async function get(path:string,work:string){signal?.throwIfAborted();const spec=m.files[path],e=entries.get(path);if(!safePath(path)||!path.startsWith('works/'+work+'/')||!spec||!e||e.uncompressedSize!==spec.bytes)throw Error('小说文件缺失或大小不符');const b=await limited(e,spec.bytes);if(b.length!==spec.bytes||bytesToHex(sha256(b))!==spec.sha256)throw Error('文件校验失败，请重新传输 ZIP');return b}
  for(const ref of m.works){
   signal?.throwIfAborted();progress(`检查第 ${completed+1}/${m.works.length} 部小说`)
   const raw=parse(await get(ref.metadata,ref.id));if(raw.id!==ref.id||!validText(raw.title)||!validText(raw.author)||!validText(raw.series)||!Array.isArray(raw.tags)||!raw.tags.every((t:unknown)=>validText(t))||!Array.isArray(raw.chapters)||!raw.chapters.length||raw.chapters.length>10000)throw Error('小说元数据无效')
   const book:Novel={id:raw.id,title:raw.title,author:raw.author,series:raw.series,tags:raw.tags,cover:raw.cover,illustrations:raw.illustrations||{},chapters:raw.chapters,languages:raw.languages==='zh'?'zh':m.languages,imported:Date.now()}
   const cs:Chapter[]=[];const ids=new Set<string>();const pids=new Set<string>();let bookBytes=m.files[ref.metadata].bytes
   for(const c of book.chapters){if(!validId(c.id)||ids.has(c.id)||(c.title!==undefined&&!validText(c.title)))throw Error('章节编号重复或无效');ids.add(c.id);const ch=parse(await get(c.path,book.id));bookBytes+=m.files[c.path].bytes;if(bookBytes>128*1024**2)throw Error('单本解压超过 128 MB');if(ch.id!==c.id||!validText(ch.title)||!Number.isSafeInteger(ch.position)||!Array.isArray(ch.paragraphs)||ch.paragraphs.length>100000)throw Error('章节格式无效');for(const p of ch.paragraphs){if(!validId(p.id)||pids.has(p.id)||!validText(p.zh,100000)||p.ja!==undefined&&!validText(p.ja,100000)||!Number.isSafeInteger(p.position))throw Error('段落格式或编号无效');pids.add(p.id)}cs.push({...ch,work:book.id})}
   if(typeof book.illustrations!=='object'||Array.isArray(book.illustrations)||Object.keys(book.illustrations).length>1000)throw Error('插图索引无效')
   const assets:{work:string;id:string;data:Blob}[]=[]
   for(const path of new Set([book.cover,...Object.values(book.illustrations)].filter((p):p is string=>!!p))){if(!/\.(png|jpe?g|webp)$/i.test(path))throw Error('图片格式不支持');const b=await get(path,book.id);bookBytes+=b.length;if(bookBytes>128*1024**2)throw Error('单本解压超过 128 MB，请减少插图');assets.push({work:book.id,id:path,data:new Blob([b as BlobPart],{type:path.endsWith('.png')?'image/png':path.endsWith('.webp')?'image/webp':'image/jpeg'})})}
   if(bookBytes>128*1024**2)throw Error('单本解压超过 128 MB')
   signal?.throwIfAborted();const d=await db()
   await new Promise<void>((res,rej)=>{const t=d.transaction(['books','chapters','assets'],'readwrite');t.objectStore('books').put(book);for(const name of ['chapters','assets']){const s=t.objectStore(name);const q=s.index('work').openCursor(IDBKeyRange.only(book.id));q.onsuccess=()=>{const c=q.result;if(c){c.delete();c.continue()}else for(const item of name==='chapters'?cs:assets)s.put(item)}}t.oncomplete=()=>res();t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})
   completed++;progress(`已导入 ${completed}/${m.works.length} 部小说`)
  }
  return completed
 }catch(e){throw Error(`已完成 ${completed} 部；`+((e as Error).name==='AbortError'?'已取消':String(e)))}finally{await reader.close()}
}
export async function backupNovels(){
 const books=await novels();const writer=new ZipWriter(new BlobWriter('application/zip'),{useWebWorkers:false});const manifest:Manifest={format:'novelforge-library',version:1,languages:books.some(b=>b.languages==='both')?'both':'zh',works:[],files:{}}
 async function put(path:string,data:Uint8Array){manifest.files[path]={bytes:data.length,sha256:bytesToHex(sha256(data))};await writer.add(path,new Uint8ArrayReader(data))}
 const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
 for(const b of books){for(const c of b.chapters)await put(c.path,encode(await chapter(b.id,c.id)));for(const path of new Set([b.cover,...Object.values(b.illustrations)].filter((p):p is string=>!!p))){const blob=await novelAsset(b.id,path);if(blob)await put(path,new Uint8Array(await blob.arrayBuffer()))}const path='works/'+b.id+'/metadata.json';await put(path,encode(b));manifest.works.push({id:b.id,metadata:path})}
 await writer.add('manifest.json',new Uint8ArrayReader(encode(manifest)));return writer.close()
}
