import {BlobReader,ZipReader,type FileEntry} from '@zip.js/zip.js'
import {PREFIX,safePath,validateManifest,type Manifest} from './model'
export class CheckedBlobReader extends BlobReader {
 override async readUint8Array(offset:number,length:number){
  const data=await super.readUint8Array(offset,length)
  if(data.byteLength!==length)throw Error('手机未能完整读取所选文件。请先在“文件”中将 ZIP 下载到“我的 iPhone”，再重新选择。')
  return data
 }
}
function archiveError(error:unknown,file:File){
 const message=error instanceof Error?error.message:String(error)
 if(/End of central directory not found|File format is not recognized/i.test(message)){
  const size=file.size.toLocaleString('en-US')+' 字节（'+(file.size/1024**3).toFixed(2)+' GiB）'
  return Error('无法读取 ZIP 的结尾目录。手机所选文件大小：'+size+'。可能是文件未传完整、尚未下载到本机，或浏览器无法读取此文件。请与电脑上的 ZIP 字节数核对，先保存到“我的 iPhone”，不要解压，再重新选择。超大包请在电脑版仅选一部较小作品重新导出测试。')
 }
 return error
}
export async function inspect(file:File){
 const reader=new ZipReader(new CheckedBlobReader(file),{useWebWorkers:false,checkSignature:true})
 try{
  const map=new Map<string,FileEntry>()
  let count=0
  for await(const e of reader.getEntriesGenerator()){
   if(++count>100000)throw Error('归档文件数量过多')
   const path=e.directory?e.filename.replace(/\/$/,''):e.filename
   if(!safePath(path)||e.encrypted)throw Error('ZIP 包含危险路径或加密文件')
   if(map.has(e.filename))throw Error('ZIP 中存在重复路径')
   if(!e.directory)map.set(e.filename,e)
  }
  const entry=map.get(PREFIX+'manifest.json');if(!entry||entry.uncompressedSize>8*1024**2)throw Error('缺少 manifest.json 或索引过大')
  let text='';let read=0;const decoder=new TextDecoder('utf-8',{fatal:true})
  await entry.getData(new WritableStream<Uint8Array>({write(chunk){read+=chunk.length;if(read>8*1024**2)throw Error('索引解压后超过大小上限');text+=decoder.decode(chunk,{stream:true})}}))
  text+=decoder.decode()
  const manifest=validateManifest(JSON.parse(text))
  let bytes=0
  for(const [path,a] of Object.entries(manifest.files)){
   if(!safePath(path))throw Error('索引中包含非法路径')
   if(a.included){const e=map.get(PREFIX+path);if(!e||e.uncompressedSize!==a.size)throw Error('文件大小与索引不一致：'+path);bytes+=a.size;if(!Number.isSafeInteger(bytes)||bytes>500*1024**3)throw Error('作品包解压大小超出保护上限')}
  }
  return {reader,map,manifest,bytes}
 }catch(e){await reader.close();throw archiveError(e,file)}
}
