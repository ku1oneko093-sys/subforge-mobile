import type {Asset,Work} from './model'
let opened:Promise<IDBDatabase>|undefined
function db(){return opened??=new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('subforge-mobile',1);r.onupgradeneeded=()=>{r.result.createObjectStore('works',{keyPath:'id'});r.result.createObjectStore('state')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function query<T>(store:string,mode:IDBTransactionMode,action:(s:IDBObjectStore)=>IDBRequest):Promise<T>{const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(store,mode);const r=action(tx.objectStore(store));tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('本地存储写入被取消'))})}
export const allWorks=()=>query<Work[]>('works','readonly',s=>s.getAll())
export const saveWork=(w:Work)=>query('works','readwrite',s=>s.put(w))
export const removeWork=(id:string)=>query('works','readwrite',s=>s.delete(id))
export const getState=<T>(key:string)=>query<T|undefined>('state','readonly',s=>s.get(key))
export const setState=(key:string,value:unknown)=>query('state','readwrite',s=>s.put(value,key))
export const root=()=>navigator.storage.getDirectory()
export async function files(){return (await root()).getDirectoryHandle('media',{create:true})}
export async function fileFor(a:Asset){const handle=await (await files()).getFileHandle(a.sha256);const file=await handle.getFile();if(file.size!==a.size)throw Error('本地文件缺失或损坏，请重新导入完整作品包');return file}
export async function exists(a:Asset){try{await fileFor(a);return true}catch{return false}}
export function assets(w:Work){return [w.cover,...w.tracks.flatMap(t=>[t.audio,t.ja,t.zh])].filter((a):a is Asset=>!!a)}
export async function cleanup(removeAudio=false){
 const works=await allWorks();const keep=new Set(works.flatMap(assets).filter(a=>!removeAudio||a.type!=='audio').map(a=>a.sha256));const dir=await files()
 for await(const [name] of (dir as any).entries())if(!keep.has(name))await dir.removeEntry(name)
}
export async function deleteWork(id:string){
 const [history,favorites]=await Promise.all([getState<Record<string,{work:string}>>('progress'),getState<string[]>('favorites')])
 const d=await db()
 await new Promise<void>((resolve,reject)=>{const tx=d.transaction(['works','state'],'readwrite');tx.objectStore('works').delete(id);tx.objectStore('state').put(Object.fromEntries(Object.entries(history||{}).filter(([,p])=>p.work!==id)),'progress');tx.objectStore('state').put((favorites||[]).filter(v=>v!==id),'favorites');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})
 await cleanup()
}
