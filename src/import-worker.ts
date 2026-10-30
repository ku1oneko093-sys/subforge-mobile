/// <reference lib="webworker" />
import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
import {inspect} from './archive'
import {PREFIX,type Asset,type Work,type Track} from './model'
import {files,exists,allWorks,saveWork,cleanup,assets} from './storage'
let controller:AbortController
onmessage=async(event:MessageEvent)=>{
 if(event.data.cancel){controller?.abort();return}
 controller=new AbortController()
 const errors:string[]=[];let completed=0;let processed=0
 try{
  if(!navigator.storage?.getDirectory)throw Error('浏览器不支持本地文件存储，请升级 iOS/Safari。')
  await cleanup()
  const archive=await inspect(event.data.file)
  const dir=await files();const old=new Map((await allWorks()).map(w=>[w.id,w]));const estimate=await navigator.storage.estimate()
  const unique=new Map<string,Asset>();for(const w of archive.manifest.works)for(const a of assets(w))unique.set(a.sha256,a)
  let required=0;for(const a of unique.values())if(!await exists(a)&&archive.manifest.files[a.path].included)required+=a.size
  if(estimate.quota&&required>estimate.quota-(estimate.usage||0))throw Error('可用浏览器存储空间不足，请删除缓存或选择较小作品包。')
  const report=(title:string)=>postMessage({type:'progress',completed,total:archive.manifest.works.length,processed,bytes:archive.bytes,title})
  const store=async(a:Asset|null):Promise<Asset|null>=>{
   if(!a)return null
   controller.signal.throwIfAborted()
   if(await exists(a))return a
   const spec=archive.manifest.files[a.path]
   if(!spec.included)throw Error('更新包缺少本机尚未导入的文件，请先导入完整包：'+a.path)
   const entry=archive.map.get(PREFIX+a.path)!
   const handle=await dir.getFileHandle(a.sha256,{create:true})
   if(!(handle as any).createSyncAccessHandle)throw Error('当前 Safari 不支持所需的本地写入接口，请升级系统。')
   const writer=await (handle as any).createSyncAccessHandle();let offset=0;const hash=sha256.create();let good=false;let notified=0;let writeError:unknown
   try{
    writer.truncate(0)
    await entry.getData(new WritableStream<Uint8Array>({write(chunk){try{controller.signal.throwIfAborted();if(offset+chunk.length>a.size)throw Error('文件超出声明大小');let written=0;while(written<chunk.length){controller.signal.throwIfAborted();const n=writer.write(chunk.subarray(written),{at:offset+written});if(n>chunk.length-written)throw Error('浏览器无法继续保存文件，可能达到存储或隐私模式限制。请使用普通浏览模式，或分批导出较小作品包。');if(!Number.isInteger(n)||n<=0)throw Error('本地存储无法继续写入，请检查剩余空间');written+=n}offset+=written;processed+=written;hash.update(chunk);if(Date.now()-notified>100){notified=Date.now();postMessage({type:'bytes',processed})}}catch(e){writeError=e;throw e}}}),{signal:controller.signal,checkSignature:true})
    if(offset!==a.size||bytesToHex(hash.digest())!==a.sha256)throw Error('文件校验失败：'+a.path)
    writer.flush();good=true;return a
   }catch(e){throw writeError||e}finally{writer.close();if(!good)await dir.removeEntry(a.sha256).catch(()=>{})}
  }
  try{
   for(const work of archive.manifest.works){
    controller.signal.throwIfAborted();report(work.title)
    const previous=old.get(work.id);const merged=new Map(previous?.tracks.map(t=>[t.id,t])||[])
    let imported=0
    for(const track of work.tracks){
     try{
      const audio=await store(track.audio)
      const existing=merged.get(track.id);const result:Track={...track,audio:audio!}
      for(const lang of ['ja','zh'] as const){try{result[lang]=track[lang]?await store(track[lang]):existing?.[lang]??null}catch(e){if(controller.signal.aborted)throw e;errors.push(String(e));result[lang]=existing?.[lang]??null}}
      merged.set(track.id,result);imported++
     }catch(e){if(controller.signal.aborted||(e as Error).name==='QuotaExceededError')throw e;errors.push(work.title+' / '+track.title+'：'+String(e))}
    }
    if(!imported&&!previous){errors.push(work.title+'：没有可用音轨，未添加作品');continue}
    let cover=previous?.cover||null
    try{cover=work.cover?await store(work.cover):cover}catch(e){if(controller.signal.aborted)throw e;errors.push('封面：'+String(e))}
    await saveWork({...work,cover,tracks:[...merged.values()].sort((a,b)=>a.order-b.order)})
    completed++;report(work.title)
   }
  }finally{await archive.reader.close();await cleanup()}
  postMessage({type:'done',completed,errors})
 }catch(e){
  await cleanup().catch(()=>{})
  postMessage({type:'error',completed,errors,message:controller.signal.aborted?'已取消，已完成的作品已保留，可重新导入继续。':(e as Error).name==='QuotaExceededError'?'存储空间不足；未完成作品没有覆盖旧资料。':(e as Error).name==='UnknownError'?'浏览器无法打开本地存储。请确认可用空间，退出隐私浏览并重开页面；若仍失败，请换用受支持的浏览器。':String(e)})
 }
}
