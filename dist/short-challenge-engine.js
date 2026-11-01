// Pure deterministic checks. Model output is data, never executable code.
export function parseBoard(rows){
  const floor=new Set(),goals=new Set(),boxes=new Set();let player=null,players=0;
  if(!Array.isArray(rows)||!rows.length||rows.length>20||rows.some(r=>typeof r!=='string'||r.length!==rows[0].length||r.length>20||/[^#PB.\-]/.test(r)))throw Error('Invalid board');
  rows.forEach((row,r)=>[...row].forEach((c,x)=>{const k=`${r},${x}`;if(c!=='#')floor.add(k);if(c==='.')goals.add(k);if(c==='B')boxes.add(k);if(c==='P'){player=k;players++;}}));
  if(players!==1||!boxes.size||boxes.size!==goals.size)throw Error('Invalid board objects');
  return {floor,goals,boxes,player};
}
const shift=(key,dr,dc)=>{const [r,c]=key.split(',').map(Number);return `${r+dr},${c+dc}`;};
export function simulateBoss(example,moves){
  const b=parseBoard(example.board),frames=[{player:b.player,boxes:[...b.boxes]}];let illegalAt=null;
  if(typeof moves!=='string'||moves.length>256||/[^UDLR]/.test(moves))return {frames,illegalAt:0,solved:false,withinLimit:false};
  for(const [i,m] of [...moves].entries()){
    const [dr,dc]={U:[-1,0],D:[1,0],L:[0,-1],R:[0,1]}[m],next=shift(b.player,dr,dc);
    if(!b.floor.has(next)){illegalAt=i+1;break;}
    if(b.boxes.has(next)){const beyond=shift(next,dr,dc);if(!b.floor.has(beyond)||b.boxes.has(beyond)){illegalAt=i+1;break;}b.boxes.delete(next);b.boxes.add(beyond);}
    b.player=next;frames.push({player:b.player,boxes:[...b.boxes]});
  }
  return {frames,illegalAt,solved:illegalAt===null&&[...b.goals].every(g=>b.boxes.has(g)),withinLimit:moves.length<=example.moveLimit};
}
export function gearFeasible(vertices,edges){
  const colors=new Map([[vertices[0],0]]),queue=[vertices[0]];
  while(queue.length){const v=queue.shift();for(const [a,b] of edges){const n=a===v?b:b===v?a:null;if(n===null)continue;if(colors.has(n)){if(colors.get(n)===colors.get(v))return false;}else{colors.set(n,1-colors.get(v));queue.push(n);}}}
  return colors.size===vertices.length;
}
const edgeKey=s=>typeof s==='string'&&/^[A-E]{2}$/.test(s)&&s[0]!==s[1]?[...s].sort().join(''):null;
export function minimumGearCuts(example){
  const edges=example.edges.map(edgeKey);let min=Infinity,solutions=[];
  for(let mask=0;mask<2**edges.length;mask++){
    const cut=edges.filter((_,i)=>mask&(1<<i));if(cut.length>min)continue;
    if(gearFeasible(example.vertices,edges.filter((_,i)=>!(mask&(1<<i))))){if(cut.length<min){min=cut.length;solutions=[];}solutions.push(cut);}
  }
  return {minimum:min,solutions};
}
function jsonAnswer(text){
  try{
  const fenced=/^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(text),source=fenced?fenced[1]:text;
  // The expected object has only top-level fields and an array of strings.
  const keys=[...source.matchAll(/"((?:\\.|[^"\\])*)"\s*:/g)].map(m=>JSON.parse('"'+m[1]+'"'));
  if(new Set(keys).size!==keys.length)return null;
  return {value:JSON.parse(source),plain:!fenced};
  }catch{return null;}
}
export function gradeShort(task,example,output,status='success'){
  const text=typeof output==='string'?output.trim():'',delivery=status==='success'&&text?10:0;
  let content=0,format=0,evidence={},answer=null;
  if(text.length>32768||status!=='success')return {content,format,delivery,total:delivery,passed:false,evidence:{reason:status!=='success'?'未完整交付':'正文超出核验大小限制'},answer};
  if(task.id==='boss-sokoban'){
    const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(s=>/^[UDLR]+$/.test(s));
    answer=lines.length===1?lines[0]:null;format=/^[UDLR]+$/.test(text)?10:0;
    const sim=simulateBoss(example,answer||'');content=answer&&sim.solved&&sim.withinLimit&&sim.illegalAt===null?80:0;
    evidence={moves:answer,steps:answer?.length??null,limit:example.moveLimit,illegalAt:sim.illegalAt,solved:sim.solved,withinLimit:sim.withinLimit};
  }else if(task.id==='gear-scam'){
    const parsed=jsonAnswer(text),obj=parsed?.value;
    if(obj&&typeof obj==='object'&&!Array.isArray(obj)){
      answer=obj;const can=gearFeasible(example.vertices,example.edges),cut=Array.isArray(obj.cut)?obj.cut.map(edgeKey):null;
      const original=example.edges.map(edgeKey),unique=cut&&cut.every(Boolean)&&new Set(cut).size===cut.length&&cut.every(e=>original.includes(e));
      const minimum=minimumGearCuts(example).minimum,valid=Boolean(unique&&cut.length===minimum&&gearFeasible(example.vertices,original.filter(e=>!cut.includes(e))));
      content=(typeof obj.can==='boolean'&&obj.can===can?20:0)+(valid?60:0);
      format=parsed.plain&&Object.keys(obj).sort().join(',')==='can,cut'&&typeof obj.can==='boolean'&&Array.isArray(obj.cut)&&obj.cut.every(x=>typeof x==='string')?10:0;
      evidence={expectedCan:can,minimumCuts:minimum,proposedCuts:obj.cut??null,validRepair:valid,feasibilityCorrect:obj.can===can};
    }else evidence={reason:'没有唯一可解析的JSON对象'};
  }else throw Error('Unknown short challenge');
  return {content,format,delivery,total:content+format+delivery,passed:content===80,evidence,answer};
}
