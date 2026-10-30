import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)])
const assets=walk('dist').filter(p=>!p.endsWith('sw.js')).map(p=>p.replaceAll('\\','/').slice(5))
const version=crypto.createHash('sha256').update(assets.map(p=>fs.readFileSync('dist/'+p)).join('')).digest('hex').slice(0,12)
fs.writeFileSync('dist/sw.js',`const CACHE='subforge-${version}';const BASE=new URL('./',self.location);const FILES=${JSON.stringify(assets)}.map(p=>new URL(p,BASE).href);self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('subforge-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==BASE.origin)return;if(e.request.mode==='navigate'){e.respondWith(caches.open(CACHE).then(c=>c.match(new URL('index.html',BASE).href)).then(r=>r||fetch(e.request)));return}if(FILES.includes(e.request.url))e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});`)
