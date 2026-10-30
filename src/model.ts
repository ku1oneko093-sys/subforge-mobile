export type Asset={path:string;sha256:string;size:number;type:'audio'|'subtitle'|'cover'}
export type Track={id:string;title:string;order:number;duration:number;audio:Asset;ja:Asset|null;zh:Asset|null}
export type Work={id:string;title:string;rj:string|null;circle:string[];voices:string[];tags:string[];cover:Asset|null;tracks:Track[];metadata:string}
export type Manifest={format:'subforge-mobile';version:1;mode:string;works:Work[];files:Record<string,Asset&{included:boolean}>;work_count:number}
export const PREFIX='SubForge-Mobile-Library/'
export const MAX_FILE=50*1024**3
export function safePath(path:string){return typeof path==='string' && path.length<600 && !path.includes('\\') && !path.includes(':') && !/[\x00-\x1f]/.test(path) && !path.startsWith('/') && path.split('/').every(p=>p!=='.'&&p!=='..'&&p!=='')}
export function validateManifest(value:unknown):Manifest{
 const m=value as Manifest
 if(!m||m.format!=='subforge-mobile'||m.version!==1||!Array.isArray(m.works)||m.works.length>10000||!m.files||typeof m.files!=='object'||Array.isArray(m.files))throw Error('不支持或损坏的作品包格式')
 const ids=new Set<string>();const tracks=new Set<string>();let count=0
 const string=(v:unknown)=>typeof v==='string'&&v.length<=10000
 const asset=(a:Asset|null)=>{
  if(a===null)return
  if(!a||!safePath(a.path)||!a.path.startsWith('works/')||!Number.isSafeInteger(a.size)||a.size<0||a.size>MAX_FILE||!/^[a-f0-9]{64}$/.test(a.sha256))throw Error('无效文件信息')
  const ext=a.path.split('.').pop()?.toLowerCase()
  if(!({audio:['mp3','flac','wav','m4a','aac','ogg','opus'],subtitle:['srt'],cover:['jpg','jpeg','png','webp']}[a.type]?.includes(ext||'')))throw Error('不支持的文件类型')
  if(a.type==='subtitle'&&a.size>8*1024**2||a.type==='cover'&&a.size>30*1024**2)throw Error('字幕或封面异常过大')
  const f=m.files[a.path];if(!f||f.sha256!==a.sha256||f.size!==a.size||f.type!==a.type||typeof f.included!=='boolean')throw Error('文件索引不一致')
 }
 for(const w of m.works){
  if(!/^[a-zA-Z0-9_-]{1,128}$/.test(w.id)||ids.has(w.id)||!string(w.title)||!Array.isArray(w.tracks)||!safePath(w.metadata))throw Error('作品索引无效或重复')
  ids.add(w.id)
  for(const v of [w.circle,w.voices,w.tags])if(!Array.isArray(v)||!v.every(string))throw Error('作品资料格式错误')
  asset(w.cover)
  for(const t of w.tracks){if(++count>50000||!t.audio||t.audio.type!=='audio'||(t.ja&&t.ja.type!=='subtitle')||(t.zh&&t.zh.type!=='subtitle')||!/^[a-zA-Z0-9_-]{1,128}$/.test(t.id)||tracks.has(t.id)||!string(t.title)||!Number.isFinite(t.order)||!Number.isFinite(t.duration)||t.duration<0)throw Error('音轨索引无效');tracks.add(t.id);asset(t.audio);asset(t.ja);asset(t.zh)}
 }
 if(m.work_count!==m.works.length)throw Error('作品数量不一致')
 if(Object.keys(m.files).length>100000)throw Error('文件索引过大')
 for(const [path,a] of Object.entries(m.files)){if(a.path!==path)throw Error('文件路径索引不一致');asset(a)}
 return m
}
export const bytes=(n:number)=>n>=1024**3?(n/1024**3).toFixed(2)+' GB':(n/1024**2).toFixed(1)+' MB'
export const clock=(n:number)=>{n=Math.max(0,Math.floor(n||0));return (n>=3600?Math.floor(n/3600)+':':'')+String(Math.floor(n/60)%60).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
