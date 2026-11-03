import test from 'node:test'
import assert from 'node:assert/strict'
import {validateNovelManifest} from '../src/novels'
const valid=()=>({format:'novelforge-library',version:1,languages:'both' as const,works:[{id:'book1',metadata:'works/book1/metadata.json'}],files:{'works/book1/metadata.json':{sha256:'a'.repeat(64),bytes:42}}})
test('accepts desktop novel format',()=>assert.equal(validateNovelManifest(valid()).works.length,1))
test('rejects traversal, invalid hashes and oversized files',()=>{for(const path of ['../private','works/../private','/etc/passwd'])assert.throws(()=>validateNovelManifest({...valid(),files:{[path]:{sha256:'a'.repeat(64),bytes:1}}}));assert.throws(()=>validateNovelManifest({...valid(),files:{'works/book1/data':{sha256:'bad',bytes:1}}}));assert.throws(()=>validateNovelManifest({...valid(),files:{'works/book1/data':{sha256:'a'.repeat(64),bytes:33*1024**2}}}))})
test('rejects duplicate book identities and audio packages',()=>{const m=valid();m.works.push(m.works[0]);assert.throws(()=>validateNovelManifest(m));assert.throws(()=>validateNovelManifest({...valid(),format:'subforge-mobile'}))})
