import test from 'node:test'
import assert from 'node:assert/strict'
import {parseSrt,currentCue,readableSubtitle} from '../src/subtitles'
import {safePath,validateManifest} from '../src/model'
test('SRT accepts BOM, CRLF, multiline and never exposes next cue',()=>{const cues=parseSrt('\ufeff1\r\n00:00:01,000 --> 00:00:02,000\r\n你好\r\n世界\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\n后续剧情');assert.equal(currentCue(cues,.5),'');assert.equal(currentCue(cues,1.5),'你好\n世界');assert.equal(currentCue(cues,2),'');assert.equal(currentCue(cues,2.9),'');assert.equal(currentCue(cues,3),'后续剧情')})
test('bilingual lookup uses time rather than pairing wrong indices',()=>{const ja=parseSrt('1\n00:00:01,000 --> 00:00:02,000\n日文一\n\n2\n00:00:03,000 --> 00:00:04,000\n日文二');const zh=parseSrt('2\n00:00:03,000 --> 00:00:04,000\n中文二');assert.equal(currentCue(ja,1.5),'日文一');assert.equal(currentCue(zh,1.5),'');assert.equal(currentCue(zh,3.5),'中文二')})
test('reject unsafe archive paths and unsupported versions',()=>{for(const p of ['../x','a/../b','C:/data','/root','a\\b','a//b','a/./b'])assert.equal(safePath(p),false);assert.equal(safePath('works/作品/tracks/01.ja.srt'),true);assert.throws(()=>validateManifest({format:'subforge-mobile',version:2,works:[],files:{}}))})
test('old imported subtitles collapse extreme kana loops without changing timing',()=>{
 const raw='1\n00:00:01,000 --> 00:00:04,000\n'+ 'あ'.repeat(2000)+'\n\n2\n00:00:05,000 --> 00:00:06,000\n次の台詞'
 const cues=parseSrt(raw)
 assert.deepEqual(cues.map(({start,end})=>({start,end})),[{start:1,end:4},{start:5,end:6}])
 assert.equal(currentCue(cues,2),'あああ…\n〔异常重复已收起〕')
 assert.equal(currentCue(cues,4.5),'');assert.equal(currentCue(cues,5.5),'次の台詞')
 assert.ok(raw.includes('あ'.repeat(2000)))
})
test('whitespace-separated and short-unit kana loops are collapsed',()=>{
 for(const text of ['う '.repeat(60),'あ\n'.repeat(30),'あう'.repeat(40),'うぅ、'+ 'う'.repeat(100)]){
  const clean=readableSubtitle(text);assert.ok(clean.length<100);assert.match(clean,/异常重复已收起/)
 }
})
test('normal dialogue, brief vocalizations and repeated full sentences remain intact',()=>{
 for(const text of ['あああ、うう、ありがとう。','ううううう','こんにちは。'.repeat(20),'はい、はい、そうです。','这是正常的中文字幕。'])assert.equal(readableSubtitle(text),text)
})
