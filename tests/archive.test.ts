import test from 'node:test'
import assert from 'node:assert/strict'
import {BlobWriter,TextReader,ZipWriter} from '@zip.js/zip.js'
import {inspect,CheckedBlobReader} from '../src/archive'

async function packageFile(){
 const writer=new ZipWriter(new BlobWriter(),{useWebWorkers:false,compressionMethod:0})
 await writer.add('SubForge-Mobile-Library/manifest.json',new TextReader(JSON.stringify({format:'subforge-mobile',version:1,mode:'full',works:[],work_count:0,files:{}})))
 return new File([await writer.close()],'library.zip')
}
test('valid ZIP remains readable',async()=>{
 const result=await inspect(await packageFile());assert.equal(result.manifest.work_count,0);await result.reader.close()
})
test('truncated ZIP reports selected byte count and local download guidance',async()=>{
 const file=await packageFile();const truncated=new File([file.slice(0,file.size-30)],'library.zip')
 await assert.rejects(inspect(truncated),e=>e instanceof Error&&e.message.includes('结尾目录')&&e.message.includes(truncated.size.toLocaleString('en-US'))&&e.message.includes('我的 iPhone'))
})
test('empty input reports actionable ZIP error',async()=>{
 await assert.rejects(inspect(new File([],'empty.zip')),/ZIP.*结尾目录/)
})
test('short file read is rejected before ZIP parsing',async()=>{
 const reader=new CheckedBlobReader(new Blob(['abc']))
 await assert.rejects(reader.readUint8Array(0,5),/完整读取/)
})
