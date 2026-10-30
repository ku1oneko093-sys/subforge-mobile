import test from 'node:test'
import assert from 'node:assert/strict'
import {parseSrt,currentCue} from '../src/subtitles'
import {safePath,validateManifest} from '../src/model'
test('SRT accepts BOM, CRLF, multiline and never exposes next cue',()=>{const cues=parseSrt('\ufeff1\r\n00:00:01,000 --> 00:00:02,000\r\n你好\r\n世界\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\n后续剧情');assert.equal(currentCue(cues,.5),'');assert.equal(currentCue(cues,1.5),'你好\n世界');assert.equal(currentCue(cues,2),'');assert.equal(currentCue(cues,2.9),'');assert.equal(currentCue(cues,3),'后续剧情')})
test('bilingual lookup uses time rather than pairing wrong indices',()=>{const ja=parseSrt('1\n00:00:01,000 --> 00:00:02,000\n日文一\n\n2\n00:00:03,000 --> 00:00:04,000\n日文二');const zh=parseSrt('2\n00:00:03,000 --> 00:00:04,000\n中文二');assert.equal(currentCue(ja,1.5),'日文一');assert.equal(currentCue(zh,1.5),'');assert.equal(currentCue(zh,3.5),'中文二')})
test('reject unsafe archive paths and unsupported versions',()=>{for(const p of ['../x','a/../b','C:/data','/root','a\\b','a//b','a/./b'])assert.equal(safePath(p),false);assert.equal(safePath('works/作品/tracks/01.ja.srt'),true);assert.throws(()=>validateManifest({format:'subforge-mobile',version:2,works:[],files:{}}))})
