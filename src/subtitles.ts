export type Cue={start:number;end:number;text:string}
// Display-only cleanup also covers subtitles imported before ASR loop protection existed.
// Keep ordinary Japanese words, brief stutters and all cue timestamps unchanged.
export function readableSubtitle(text:string):string{
 const kana='\\u3041-\\u3096\\u30a1-\\u30faー'
 const runs=new RegExp('(['+kana+'])(?:[\\t \\n]*\\1){11,}','g')
 const loops=new RegExp('(['+kana+']{2,4}?)(?:[\\t \\n]*\\1){7,}','g')
 const cleaned=text.replace(runs,(_,unit:string)=>unit.repeat(3)+'…').replace(loops,(_,unit:string)=>unit.repeat(2)+'…')
 return cleaned===text?text:cleaned+'\n〔异常重复已收起〕'
}
export function parseSrt(text:string):Cue[]{
 const time=(s:string)=>{const p=s.replace(',','.').split(':').map(Number);return p[0]*3600+p[1]*60+p[2]}
 const result:Cue[]=[]
 for(const block of text.replace(/^\uFEFF/,'').replace(/\r/g,'').trim().split(/\n\s*\n/)){
  const lines=block.split('\n');const i=lines.findIndex(l=>l.includes('-->'));if(i<0)continue
  const m=lines[i].match(/(\d+:\d{2}:\d{2}[,.]\d+)\s*-->\s*(\d+:\d{2}:\d{2}[,.]\d+)/);if(!m)continue
  const start=time(m[1]),end=time(m[2]);if(!Number.isFinite(start)||end<=start)continue
  result.push({start,end,text:readableSubtitle(lines.slice(i+1).join('\n').replace(/<[^>]*>/g,''))})
 }
 return result.sort((a,b)=>a.start-b.start)
}
// Independent time lookup, never zip the two languages by array index or show a future cue.
export function currentCue(cues:Cue[],time:number):string{
 let lo=0,hi=cues.length
 while(lo<hi){const mid=(lo+hi)>>1;if(cues[mid].start<=time)lo=mid+1;else hi=mid}
 return lo>0&&time<cues[lo-1].end?cues[lo-1].text:''
}
