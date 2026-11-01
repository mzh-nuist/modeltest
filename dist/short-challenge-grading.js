// Rubric v2 fixes answer extraction and accepts both pair representations.
// The frozen v1 scorer remains available to reproduce the initial pilot.
import {gradeShort as gradeV1,gearFeasible,minimumGearCuts} from './short-challenge-engine.js?v=20261101-short1';
function extractObject(text){
  const pieces=[];let start=-1,depth=0,quoted=false,escape=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];if(start<0){if(c==='{'){start=i;depth=1;quoted=false;escape=false;}continue;}
    if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue;}
    if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){pieces.push(text.slice(start,i+1));start=-1;}
  }
  if(start>=0||pieces.length!==1)return null;
  try{
    const keys=[...pieces[0].matchAll(/"((?:\\.|[^"\\])*)"\s*:/g)].map(m=>JSON.parse('"'+m[1]+'"'));
    if(new Set(keys).size!==keys.length)return null;
    return {value:JSON.parse(pieces[0]),plain:pieces[0]===text};
  }catch{return null;}
}
function pairKey(pair){
  const s=Array.isArray(pair)&&pair.length===2&&pair.every(x=>typeof x==='string'&&x.length===1)?pair.join(''):pair;
  return typeof s==='string'&&/^[A-E]{2}$/.test(s)&&s[0]!==s[1]?[...s].sort().join(''):null;
}
export function gradeShort(task,example,output,status='success'){
  const old=gradeV1(task,example,output,status),text=typeof output==='string'?output.trim():'';
  if(status!=='success'||text.length>32768)return old;
  if(task.id==='boss-sokoban'){
    const candidates=text.split(/\r?\n/).map(x=>x.trim()).map(x=>/^[UDLR]+$/.test(x)?x:(/^\*\*([UDLR]+)\*\*$/.exec(x)||/^__([UDLR]+)__$/.exec(x)||/^`([UDLR]+)`$/.exec(x))?.[1]).filter(Boolean);
    if(candidates.length!==1)return {...old,content:0,total:old.format+old.delivery,passed:false,answer:null,evidence:{moves:null,steps:null,limit:example.moveLimit,illegalAt:null,solved:false,withinLimit:true}};
    const checked=gradeV1(task,example,candidates[0],status);
    return {...checked,format:old.format,delivery:old.delivery,total:checked.content+old.format+old.delivery};
  }
  if(task.id!=='gear-scam')return old;
  const parsed=extractObject(text),obj=parsed?.value;
  if(!obj||typeof obj!=='object'||Array.isArray(obj))return {...old,content:0,format:0,total:old.delivery,passed:false,answer:null,evidence:{reason:'没有唯一可解析的JSON对象'}};
  const expected=gearFeasible(example.vertices,example.edges),original=example.edges.map(pairKey),cut=Array.isArray(obj.cut)?obj.cut.map(pairKey):null;
  const unique=cut&&cut.every(Boolean)&&new Set(cut).size===cut.length&&cut.every(x=>original.includes(x));
  const minimum=minimumGearCuts(example).minimum,valid=Boolean(unique&&cut.length===minimum&&gearFeasible(example.vertices,original.filter(x=>!cut.includes(x))));
  const feasibilityCorrect=typeof obj.can==='boolean'&&obj.can===expected;
  const content=(feasibilityCorrect?20:0)+(valid?60:0);
  const shape=Array.isArray(obj.cut)&&obj.cut.every(x=>typeof x==='string'||Array.isArray(x)&&x.length===2&&x.every(y=>typeof y==='string'));
  const format=parsed.plain&&Object.keys(obj).sort().join(',')==='can,cut'&&typeof obj.can==='boolean'&&shape?10:0;
  // Canonical form is only for the authored replay; the original output is retained.
  return {content,format,delivery:old.delivery,total:content+format+old.delivery,passed:content===80,
    evidence:{expectedCan:expected,minimumCuts:minimum,proposedCuts:obj.cut??null,validRepair:valid,feasibilityCorrect},
    answer:{...obj,cut:cut?.every(Boolean)?cut:obj.cut}};
}
