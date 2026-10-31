// Standalone V2 import and replay. Never evaluate submitted code or render submitted SVG.
export const CHALLENGE_PROTOCOL='challenge-rubric-v2';
export const CHALLENGE_SUITE='zhufeng-challenge-v2';
export const CHALLENGE_CATEGORIES={math:'数学与推理',code:'代码任务',data:'数据分析',instruction:'指令执行',longcontext:'长文与证据',chinese:'中文写作',visual:'SVG 与空间'};
const fail=message=>{throw Error(message)};
const own=(o,k)=>Object.hasOwn(o||{},k);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const num=x=>typeof x==='number'&&Number.isFinite(x);
const str=(x,label,max=800000)=>{if(typeof x!=='string'||x.length>max)fail(label+' 必须是有界字符串');return x};
const arr=(x,label,max=10000)=>{if(!Array.isArray(x)||x.length>max)fail(label+' 数组无效');return x};
const allowed=(x,fields,label)=>{if(!obj(x))fail(label+' 必须是对象');for(const k of Object.keys(x))if(!fields.includes(k))fail(label+' 含不允许公开的字段：'+k)};
const safeURL=x=>{try{const u=new URL(x);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password}catch{return false}};
const safeID=x=>typeof x==='string'&&/^[a-zA-Z0-9_.-]{1,120}$/.test(x);

// JSON.parse alone silently accepts repeated keys. This bounded parser does not.
function parseJSONMeta(text){
 str(text,'JSON',15000000);let i=0;const integerPaths=new Set();
 const ws=()=>{while(/[\x20\t\r\n]/.test(text[i]||'\0'))i++};
 function string(){const start=i++;while(i<text.length){const c=text[i++];if(c==='"'){let s;try{s=JSON.parse(text.slice(start,i))}catch{fail('JSON 字符串无效')}return s}if(c==='\\')i++}fail('JSON 字符串未结束')}
 function value(depth=0,path=[]){if(depth>40)fail('JSON 嵌套过深');ws();const c=text[i];if(c==='"')return string();if(c==='{'||c==='['){i++;const object=c==='{' ,out=object?{}:[],seen=new Set();ws();if(text[i]===(object?'}':']')){i++;return out}while(i<text.length){if(object){ws();if(text[i]!=='"')fail('JSON 对象键无效');const key=string();if(seen.has(key))fail('JSON 包含重复键：'+key);if(['__proto__','constructor','prototype'].includes(key))fail('JSON 不安全键');seen.add(key);ws();if(text[i++]!==':')fail('JSON 缺少冒号');out[key]=value(depth+1,[...path,key])}else out.push(value(depth+1,[...path,out.length]));ws();if(text[i]===(object?'}':']')){i++;return out}if(text[i++]!==',')fail('JSON 缺少逗号')}fail('JSON 容器未结束')}
  for(const [s,v]of [['true',true],['false',false],['null',null]])if(text.startsWith(s,i)){i+=s.length;return v}
  const m=text.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);if(!m)fail('JSON 值无效');i+=m[0].length;const n=Number(m[0]);if(!Number.isFinite(n))fail('JSON 不允许非有限数字');if(Number.isInteger(n)&&!Number.isSafeInteger(n))fail('超出安全整数范围，请使用十进制或分数字符串');if(!/[.eE]/.test(m[0])){integerPaths.add(JSON.stringify(path))}return n;
 }
 const out=value();ws();if(i!==text.length)fail('JSON 尾部含额外内容');guard(out);return {value:out,integerPaths};
}
export const parseChallengeJSON=text=>parseJSONMeta(text).value;
function guard(x,depth=0){if(depth>40)fail('对象嵌套过深');if(typeof x==='number'&&(!Number.isFinite(x)||Number.isInteger(x)&&!Number.isSafeInteger(x)))fail('非有限或超出安全精度的数字');if(x&&typeof x==='object')for(const[k,v]of Object.entries(x)){const name=k.toLowerCase().replace(/[^a-z]/g,'');if(['apikey','authorization','accesstoken','refreshtoken','password','secret','cookie','cookies','credentials','credential','headers','proto','constructor','prototype'].includes(name))fail('包含凭据或不安全字段');guard(v,depth+1)}}
const pathValue=(raw,path)=>{let actual=raw;for(const key of path){if(typeof key==='number'){if(!Array.isArray(actual)||key>=actual.length)return {found:false}}else if(!obj(actual)||!own(actual,key))return {found:false};actual=actual[key]}return {found:true,value:actual}};
const validPath=path=>Array.isArray(path)&&path.length<=30&&path.every(k=>typeof k==='string'||Number.isInteger(k)&&k>=0);
// Compensated summation keeps many fractional rubric weights aligned with Python math.fsum.
function scoreSum(values){const partials=[];for(let x of values){let i=0;for(let y of partials){if(Math.abs(x)<Math.abs(y))[x,y]=[y,x];const hi=x+y,lo=y-(hi-x);if(lo)partials[i++]=lo;x=hi}partials.length=i;partials.push(x)}return partials.reduce((sum,x)=>sum+x,0)}
function gcd(a,b){a=a<0n?-a:a;while(b){const r=a%b;a=b;b=r}return a||1n}
function frac(x){
 if(typeof x==='boolean'||x===null||!['string','number'].includes(typeof x))throw Error('not numeric');const s=String(x);if(s.length>200||s!==s.trim())throw Error('number too long or whitespace');
 if(s.includes('/')){const parts=s.split('/');if(parts.length!==2||!parts.every(x=>/^[+-]?\d+$/.test(x.trim())))throw Error('invalid fraction');const a=BigInt(parts[0].trim()),b=BigInt(parts[1].trim());if(!b)throw Error('zero denominator');const d=gcd(a,b<0n?-b:b);return b<0n?[-a/d,-b/d]:[a/d,b/d]}
 const m=s.match(/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/);if(!m)throw Error('invalid decimal');const decimals=m[3]??m[4]??'',explicitExponent=Number(m[5]||0),exponent=explicitExponent-decimals.length;if(!Number.isSafeInteger(exponent)||Math.abs(explicitExponent)>1000)throw Error('exponent range');let a=BigInt((m[2]||'0')+decimals)*(m[1]==='-'?-1n:1n),b=1n;if(exponent>=0)a*=10n**BigInt(exponent);else b=10n**BigInt(-exponent);const d=gcd(a,b);a/=d;b/=d;if((a<0n?-a:a).toString(2).length>4096||b.toString(2).length>4096)throw Error('number limit');return[a,b];
}
function numericEqual(a,b,at=0,rt=0){try{const[x,y]=frac(a),[u,v]=frac(b),[aa,ab]=frac(at),[ra,rb]=frac(rt),delta=x*v-u*y,abs=delta<0n?-delta:delta;return abs*ab<=aa*y*v||abs*rb<=ra*(u<0n?-u:u)*y}catch{return false}}
function equal(a,b){if(typeof a!==typeof b)return false;if(typeof a==='number')return numericEqual(a,b);if(Array.isArray(b))return Array.isArray(a)&&a.length===b.length&&a.every((v,i)=>equal(v,b[i]));if(obj(b))return obj(a)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(k=>own(a,k)&&equal(a[k],b[k]));return a===b}
function sameSet(a,b){if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;const remaining=[...b];for(const item of a){const i=remaining.findIndex(x=>equal(item,x));if(i<0)return false;remaining.splice(i,1)}return true}

export function validateChallengeGrader(g){
 allowed(g,['version','kind','format','checks','constraints','criteria'],'评分器');if(g.version!==CHALLENGE_PROTOCOL||!['json','manual','code'].includes(g.kind)||!['json_only','text','svg_only','code_only'].includes(g.format))fail('评分器协议错误');
 if(g.kind==='json'&&g.format!=='json_only'||g.kind==='code'&&g.format!=='code_only'||g.kind==='manual'&&!['json_only','text','svg_only'].includes(g.format))fail('题型与输出格式矛盾');
 for(const k of ['checks','constraints','criteria'])arr(g[k],k,100);
 if(g.kind==='json'&&(!g.checks.length||g.criteria.length)||g.kind!=='json'&&(!g.criteria.length||g.checks.length))fail('题型与评分项矛盾');
 const ids=new Set();for(const c of [...g.checks,...g.criteria]){if(!safeID(c.id)||ids.has(c.id))fail('评分项 ID 重复或无效');ids.add(c.id);str(c.label,'评分标签');if(!num(c.points)||c.points<0.000001||c.points>100)fail('评分权重无效')}
 if(Math.abs([...g.checks,...g.criteria].reduce((n,c)=>n+c.points,0)-100)>1e-8)fail('内容分值必须合计 100');if(g.kind==='json'&&!g.checks.some(c=>c.critical)||g.kind!=='json'&&!g.criteria.some(c=>c.criticalLevel>0))fail('需要至少一项核心条件');
 for(const c of g.checks){allowed(c,['id','label','path','op','expected','points','critical','absTolerance','relTolerance'],'检查项');if(!validPath(c.path)||!['equals','number','set'].includes(c.op)||typeof c.critical!=='boolean'||!own(c,'expected'))fail('自动检查项无效');for(const k of ['absTolerance','relTolerance'])if(own(c,k)&&(!num(c[k])||c[k]<0))fail('容差无效');if(c.op==='number')try{frac(c.expected)}catch{fail('数值参考无效')}if(c.op==='set'&&!Array.isArray(c.expected))fail('集合参考必须是数组')}
 for(const c of g.criteria){allowed(c,['id','label','points','anchors','criticalLevel'],'人工标准');if(arr(c.anchors,'五档锚点',5).length!==5||c.anchors.some(x=>typeof x!=='string'||!x.trim()))fail('人工标准需要五档具体锚点');if(c.criticalLevel!==null&&(!Number.isInteger(c.criticalLevel)||c.criticalLevel<0||c.criticalLevel>4))fail('人工门槛无效')}
 const names=new Set(['output-shape']);for(const c of g.constraints){allowed(c,['id','label','type','required','text','count','min','max','keys','exact','path','valueType','index'],'约束');if(!safeID(c.id)||names.has(c.id)||typeof c.required!=='boolean')fail('约束 ID 或必要性无效');names.add(c.id);str(c.label,'约束标签');if(!['forbidden','contains','occurrences','characters','paragraphs','no_fence','json_keys','json_type','json_length','paragraph_characters','lines'].includes(c.type))fail('不支持的约束');if(['forbidden','contains','occurrences'].includes(c.type)&&(!str(c.text,'约束文本').length))fail('约束文本不能为空');if(c.type==='occurrences'&&(!Number.isInteger(c.count)||c.count<0))fail('计数无效');if(['characters','paragraphs','lines','json_length','paragraph_characters'].includes(c.type)&&(!Number.isInteger(c.min)||!Number.isInteger(c.max)||c.min<0||c.max<c.min))fail('长度区间无效');if(['json_keys','json_type','json_length'].includes(c.type)&&(g.format!=='json_only'||!validPath(c.path||[])))fail('JSON约束需对应格式和合法字段路径');if(c.type==='paragraph_characters'&&(!Number.isInteger(c.index)||c.index<0))fail('段落索引无效');if(c.type==='json_keys'&&(!Array.isArray(c.keys)||c.keys.some(k=>typeof k!=='string')||new Set(c.keys).size!==c.keys.length||typeof c.exact!=='boolean'))fail('JSON 键约束无效');if(c.type==='json_type'&&(!validPath(c.path||[])||!['string','number','integer','boolean','null','array','object'].includes(c.valueType)))fail('JSON 类型约束无效')}
 return structuredClone(g);
}

export function staticSVGShape(text){
 if(/<!DOCTYPE|<!ENTITY/i.test(text))return false;
 const tags=new Set(['svg','g','path','circle','ellipse','rect','line','polyline','polygon','text','tspan','defs','linearGradient','radialGradient','stop','clipPath','mask','title','desc','use']);
 const attributes=attrs=>attrs.every(([key,value])=>{const name=key.split(':').at(-1).toLowerCase();return !name.startsWith('on')&&!['src','style'].includes(name)&&(name!=='href'||/^#[A-Za-z_][\w:.-]*$/.test(value))&&(!value.toLowerCase().includes('url(')||/^url\(#[A-Za-z_][\w:.-]*\)$/.test(value))&&!/javascript:|data:/i.test(value)});
 if(typeof DOMParser!=='undefined'){const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror')||doc.documentElement?.localName!=='svg')return false;return[...doc.querySelectorAll('*')].every(el=>(!el.namespaceURI||el.namespaceURI==='http://www.w3.org/2000/svg')&&tags.has(el.localName)&&attributes([...el.attributes].map(a=>[a.name,a.value])))}
 // Node test path: a bounded XML subset parser, with no entity expansion or execution.
 try{let i=0,root=false,closed=false;const stack=[];const decode=s=>{if(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/.test(s))throw Error('entity');return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g,(_,key)=>key[0]==='#'?String.fromCodePoint(key[1]==='x'?parseInt(key.slice(2),16):Number(key.slice(1))):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[key])};
  while(i<text.length){if(text.startsWith('<!--',i)){const end=text.indexOf('-->',i+4);if(end<0||text.slice(i+4,end).includes('--'))return false;i=end+3;continue}if(text.startsWith('<?xml',i)&&!root){const end=text.indexOf('?>',i);if(end<0)return false;i=end+2;continue}if(text.startsWith('<![CDATA[',i)&&stack.length){const end=text.indexOf(']]>',i);if(end<0)return false;i=end+3;continue}if(text[i]!=='<'){const end=text.indexOf('<',i),chunk=text.slice(i,end<0?text.length:end);decode(chunk);if(!stack.length&&chunk.trim())return false;i=end<0?text.length:end;continue}
   let end=i+1,quote=null;for(;end<text.length;end++){const c=text[end];if(quote){if(c===quote)quote=null}else if(c==='"'||c==="'")quote=c;else if(c==='>')break}if(end>=text.length)return false;const token=text.slice(i+1,end);i=end+1;if(token.startsWith('/')){const name=token.slice(1).trim();if(!stack.length||stack.pop().name!==name)return false;if(!stack.length)closed=true;continue}if(closed)return false;const m=token.match(/^([A-Za-z_][\w:.-]*)([\s\S]*?)\/?$/);if(!m||!tags.has(m[1].split(':').at(-1)))return false;if(!root){if(m[1].split(':').at(-1)!=='svg')return false;root=true}let rest=m[2],attrs=[],seen=new Set();while(rest.trim()){const a=rest.match(/^\s+([A-Za-z_][\w:.-]*)\s*=\s*(["'])([\s\S]*?)\2/);if(!a||a[3].includes('<')||seen.has(a[1]))return false;seen.add(a[1]);attrs.push([a[1],decode(a[3])]);rest=rest.slice(a[0].length)}if(!attributes(attrs))return false;const namespaces={...(stack.at(-1)?.namespaces||{xml:'http://www.w3.org/XML/1998/namespace'})};for(const[k,v]of attrs){if(k==='xmlns')namespaces['']=v;else if(k.startsWith('xmlns:'))namespaces[k.slice(6)]=v}const prefix=m[1].includes(':')?m[1].split(':')[0]:'';if(prefix&&!Object.hasOwn(namespaces,prefix))return false;const ns=namespaces[prefix]||'';if(ns&&ns!=='http://www.w3.org/2000/svg')return false;for(const[k]of attrs)if(k.includes(':')&&!k.startsWith('xmlns:')&&!Object.hasOwn(namespaces,k.split(':')[0]))return false;const self=/\/$/.test(token);if(!self)stack.push({name:m[1],namespaces});else if(!stack.length)closed=true;
  }return root&&closed&&!stack.length;
 }catch{return false}
}
function formatShape(text,format){
 if(format==='json_only'){try{parseChallengeJSON(text);return true}catch{return false}}
 if(format==='text')return !!text.trim();
 if(format==='code_only')return !!text.trim()&&!text.includes('```');
 if(format==='svg_only')return !!text.trim()&&staticSVGShape(text);
 return false;
}
export function replayChallenge(output,g,taskId,review=null,requestStatus='success'){
 validateChallengeGrader(g);str(output,'回答');
 const base={protocolId:CHALLENGE_PROTOCOL,taskId,status:'not_applicable',contentState:'not_applicable',contentScore:null,formatPassed:false,strictPassed:false,checks:[],constraints:[]};
 if(requestStatus!=='success')return base;
 const text=output.trim();let raw,parsed=false,original,originalParsed=false,integerPaths=new Set();const fenced=text.match(/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/);try{const meta=parseJSONMeta(text);original=meta.value;integerPaths=meta.integerPaths;originalParsed=true}catch{}try{raw=parseChallengeJSON(fenced?fenced[1].trim():text);parsed=true}catch{}
 const constraints=[{id:'output-shape',label:{json_only:'整份回答为严格 JSON',text:'非空正文',svg_only:'独立静态 SVG，无外部或活动内容',code_only:'仅代码正文，无 Markdown 围栏'}[g.format],passed:formatShape(output,g.format),required:true}];
 for(const c of g.constraints){let ok=false;const lines=output.trim()?output.trim().split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/):[];const hit=pathValue(original,c.path||[]);
  if(c.type==='contains')ok=output.includes(c.text);if(c.type==='forbidden')ok=!output.includes(c.text);if(c.type==='occurrences')ok=output.split(c.text).length-1===c.count;
  if(c.type==='no_fence')ok=!output.includes('```');
  if(c.type==='characters'){const n=[...output.replace(/[\r\n]/g,'')].length;ok=c.min<=n&&n<=c.max}
  if(c.type==='lines')ok=c.min<=lines.length&&lines.length<=c.max;
  if(c.type==='paragraphs'){const n=text?text.split(/\n\s*\n/).length:0;ok=c.min<=n&&n<=c.max}
  if(c.type==='paragraph_characters'){const paragraphs=text?text.split(/\n\s*\n/):[];if(c.index<paragraphs.length){const n=[...paragraphs[c.index].trim().replace(/[\r\n]/g,'')].length;ok=c.min<=n&&n<=c.max}}
  if(c.type==='json_keys')ok=originalParsed&&hit.found&&obj(hit.value)&&c.keys.every(k=>own(hit.value,k))&&(!c.exact||Object.keys(hit.value).length===c.keys.length);
  if(c.type==='json_length')ok=originalParsed&&hit.found&&Array.isArray(hit.value)&&c.min<=hit.value.length&&hit.value.length<=c.max;
  if(c.type==='json_type'){const v=hit.value;ok=originalParsed&&hit.found&&({null:v===null,array:Array.isArray(v),object:obj(v),integer:integerPaths.has(JSON.stringify(c.path||[])),number:num(v),string:typeof v==='string',boolean:typeof v==='boolean'})[c.valueType]}
  constraints.push({id:c.id,label:c.label,passed:!!ok,required:c.required});
 }
 const formatPassed=constraints.filter(c=>c.required).every(c=>c.passed);Object.assign(base,{constraints,formatPassed});
 if(g.kind==='code')return {...base,status:'blocked',contentState:'blocked',strictPassed:null};
 if(g.kind==='manual'){
  if(!review)return {...base,status:'pending',contentState:'pending',strictPassed:null};
  allowed(review,['reviewer','reviewedAt','items','synthetic'],'人工评审');if(!str(review.reviewer,'评审者',100).trim()||!str(review.reviewedAt,'评审时间',100)||!Number.isFinite(Date.parse(review.reviewedAt))||!/(?:Z|[+-]\d{2}:?\d{2})$/.test(review.reviewedAt))fail('评审身份与时区无效');if(own(review,'synthetic')&&typeof review.synthetic!=='boolean')fail('合成评审标记无效');
  const items=arr(review.items,'评审细项',100);if(items.length!==g.criteria.length||new Set(items.map(x=>x.id)).size!==items.length)fail('评审细项不完整或重复');
  const checks=g.criteria.map(c=>{const r=items.find(x=>x.id===c.id);if(!r)fail('评审缺项');allowed(r,['id','level','evidence'],'评审细项');if(!Number.isInteger(r.level)||r.level<0||r.level>4||!str(r.evidence,'扣分证据',4000).trim())fail('评审级别或证据无效');return{id:c.id,label:c.label,points:c.points,earned:c.points*r.level/4,passed:c.criticalLevel===null?r.level===4:r.level>=c.criticalLevel,critical:c.criticalLevel!==null}});
  const strictPassed=formatPassed&&checks.filter(c=>c.critical).every(c=>c.passed);return {...base,status:strictPassed?'passed':'failed',contentState:'scored',contentScore:scoreSum(checks.map(c=>c.earned)),strictPassed,checks,review:structuredClone(review)};
 }
 if(!parsed)return {...base,status:'failed',contentState:'unscorable',strictPassed:false};
 const checks=g.checks.map(c=>{const hit=pathValue(raw,c.path),passed=hit.found&&(c.op==='number'?numericEqual(hit.value,c.expected,c.absTolerance||0,c.relTolerance||0):c.op==='set'?sameSet(hit.value,c.expected):equal(hit.value,c.expected));return{id:c.id,label:c.label,points:c.points,earned:passed?c.points:0,passed,critical:c.critical}});
 const strictPassed=formatPassed&&checks.filter(c=>c.critical).every(c=>c.passed);return{...base,status:strictPassed?'passed':'failed',contentState:'scored',contentScore:scoreSum(checks.map(c=>c.earned)),strictPassed,checks};
}

export function validateChallengeCatalog(input){
 guard(input);allowed(input,['schemaVersion','suiteId','protocolId','meta','counts','tasks'],'挑战目录');if(input.schemaVersion!=='challenge-public-v2'||input.suiteId!==CHALLENGE_SUITE||input.protocolId!==CHALLENGE_PROTOCOL)fail('挑战目录版本不匹配');
 allowed(input.meta,['title','description','updatedAt','kind','realApiCalls','calibrationState'],'目录信息');for(const k of ['title','description','updatedAt'])str(input.meta[k],k);if(input.meta.kind!=='catalog'||input.meta.realApiCalls!==0||input.meta.calibrationState!=='uncalibrated')fail('目录不能冒充实测或已校准');
 const tasks=arr(input.tasks,'任务',10000),ids=new Set(),categories=Object.fromEntries(Object.keys(CHALLENGE_CATEGORIES).map(k=>[k,0]));let development=0;
 for(const t of tasks){const common=['id','title','category','familyId','pool','difficulty','status','source','rubric','verification'];allowed(t,t.pool==='development'?[...common,'prompt','reference','grader','assets','messages']:common,'公开任务');if(!safeID(t.id)||ids.has(t.id)||!safeID(t.familyId))fail('任务 ID 无效或重复');ids.add(t.id);str(t.title,'题名');if(!own(CHALLENGE_CATEGORIES,t.category)||!['development','sealed'].includes(t.pool)||!['candidate-medium','candidate-hard','candidate-frontier'].includes(t.difficulty)||t.status!=='uncalibrated')fail('任务分类或状态无效');categories[t.category]=(categories[t.category]||0)+1;
  allowed(t.source,['name','url','note'],'来源');str(t.source.name,'来源名称');str(t.source.note,'来源说明');if(t.source.url!==null&&!safeURL(t.source.url))fail('来源链接无效');arr(t.rubric,'评分规则',100).forEach(x=>str(x,'规则'));
  allowed(t.verification,['method','notes','independentCheck'],'核验说明');str(t.verification.method,'核验方法');str(t.verification.notes,'核验说明');if(typeof t.verification.independentCheck!=='boolean')fail('独立核验标记无效');
  if(t.pool==='development'){development++;str(t.prompt,'完整题面');str(t.reference,'参考答案');validateChallengeGrader(t.grader);if(t.assets){for(const a of arr(t.assets,'附件',30)){allowed(a,['path','content'],'附件');str(a.path,'附件路径',200);if(!a.path||a.path.includes('..')||a.path.startsWith('/')||a.path.includes('\\')||a.path.includes(':'))fail('附件路径不安全');str(a.content,'附件内容')}}if(t.messages)for(const m of arr(t.messages,'对话',100)){allowed(m,['role','content'],'对话消息');if(!['system','user','assistant'].includes(m.role))fail('消息角色无效');str(m.content,'消息文本')}}
 }
 allowed(input.counts,['total','development','sealed','byCategory'],'数量');if(input.counts.total!==tasks.length||input.counts.development!==development||input.counts.sealed!==tasks.length-development||!equal(input.counts.byCategory,categories))fail('目录数量与任务不符');return structuredClone(input);
}

const semanticAssessment=a=>({protocolId:a.protocolId,taskId:a.taskId,status:a.status,contentState:a.contentState,contentScore:a.contentScore,formatPassed:a.formatPassed,strictPassed:a.strictPassed,checks:a.checks.map(c=>({id:c.id,points:c.points,earned:c.earned,passed:c.passed,critical:c.critical})),constraints:a.constraints.map(c=>({id:c.id,passed:c.passed,required:c.required})),...(a.review?{review:a.review}:{})});
export function validateChallengeReport(input,catalog){
 guard(input);allowed(input,['schemaVersion','suiteId','protocolId','dataKind','externalApiCalls','generatedAt','summary','results'],'离线报告');if(input.schemaVersion!=='challenge-offline-v2'||input.suiteId!==CHALLENGE_SUITE||input.protocolId!==CHALLENGE_PROTOCOL||input.dataKind!=='demo'||input.externalApiCalls!==0)fail('仅接受零 API 的 V2 离线验收报告');str(input.generatedAt,'生成时间');if(!obj(input.summary))fail('验收摘要无效');
 const map=new Map(catalog.tasks.map(t=>[t.id,t])),names=new Set(),results=[];
 for(const r of arr(input.results,'夹具结果',20000)){
  allowed(r,['taskId','fixtureName','output','assessment','expected','passed','requestStatus'],'夹具记录');const t=map.get(r.taskId);if(!t||t.pool!=='development')fail('公开报告不能含封存题或未知题的回答');str(r.fixtureName,'夹具名称',300);const key=r.taskId+'\0'+r.fixtureName;if(names.has(key))fail('重复夹具结果');names.add(key);str(r.output,'回答');
  const a=r.assessment;allowed(a,['protocolId','taskId','status','contentState','contentScore','formatPassed','strictPassed','checks','constraints','review','reason'],'评分结果');arr(a.checks,'评分细项',100);arr(a.constraints,'约束结果',100);for(const c of a.checks)allowed(c,['id','label','points','earned','passed','critical'],'得分细项');for(const c of a.constraints)allowed(c,['id','label','passed','required'],'约束结果');
  const requestStatus=r.requestStatus||'success';if(!['success','error','timeout','skipped','truncated','unsupported','infrastructure_error'].includes(requestStatus))fail('请求状态无效');
  if(a.review&&(t.grader.kind!=='manual'||requestStatus!=='success'||a.review.synthetic!==true))fail('离线夹具评审必须明确标为合成');const replay=replayChallenge(r.output,t.grader,t.id,a.review||null,requestStatus);if(!equal(semanticAssessment(a),semanticAssessment(replay)))fail('评分与回答重算不一致：'+r.taskId+'/'+r.fixtureName);
  allowed(r.expected,['contentScore','formatPassed','strictPassed','contentState'],'夹具预期');if(Object.keys(r.expected).length!==4)fail('夹具预期需要完整四项');const passed=Object.entries(r.expected).every(([k,v])=>k==='contentScore'&&num(replay[k])&&num(v)?Math.abs(replay[k]-v)<=1e-8:equal(replay[k],v));if(typeof r.passed!=='boolean'||r.passed!==passed)fail('夹具验收状态与重算不一致：'+r.taskId+'/'+r.fixtureName);
  results.push({...structuredClone(r),assessment:{...replay,reason:typeof a.reason==='string'?a.reason:'按公开规则在浏览器重算。'}});
 }
 const summaryKeys=['tasksChecked','fixturesChecked','passed','failed','developmentTasks','sealedTasks','automaticTasks','manualTasks','codeTasks','publicFixtures','sealedFixtures'];allowed(input.summary,summaryKeys,'验收摘要');const summary={};for(const k of summaryKeys){const v=input.summary[k];if(!Number.isSafeInteger(v)||v<0)fail('摘要需要完整非负整数计数');summary[k]=v}if(summary.publicFixtures!==results.length||summary.tasksChecked!==summary.developmentTasks+summary.sealedTasks||summary.tasksChecked!==summary.automaticTasks+summary.manualTasks+summary.codeTasks||summary.fixturesChecked!==summary.passed+summary.failed||summary.fixturesChecked!==summary.publicFixtures+summary.sealedFixtures||summary.developmentTasks!==catalog.counts.development||summary.passed<results.filter(r=>r.passed).length||summary.failed<results.filter(r=>!r.passed).length)fail('验收汇总与公开覆盖矛盾');
 return{schemaVersion:'challenge-offline-v2',suiteId:CHALLENGE_SUITE,protocolId:CHALLENGE_PROTOCOL,dataKind:'demo',externalApiCalls:0,generatedAt:input.generatedAt,summary,results};
}

export function filterChallengeTasks(catalog,{category='all',pool='all',query=''}={}){const q=query.trim().toLowerCase();return catalog.tasks.filter(t=>(category==='all'||t.category===category)&&(pool==='all'||t.pool===pool)&&(!q||`${t.id} ${t.title} ${t.familyId}`.toLowerCase().includes(q)))}

export function validateChallengeResponses(input,catalog){
 guard(input);allowed(input,['schemaVersion','suiteId','protocolId','dataKind','generatedAt','sourceLabel','results'],'本地答卷');if(input.schemaVersion!=='challenge-results-v2'||input.suiteId!==CHALLENGE_SUITE||input.protocolId!==CHALLENGE_PROTOCOL||input.dataKind!=='imported')fail('本地答卷版本或来源类型无效');str(input.generatedAt,'生成时间');str(input.sourceLabel,'来源标记');const map=new Map(catalog.tasks.map(t=>[t.id,t])),ids=new Set(),results=[];
 for(const r of arr(input.results,'答卷',20000)){allowed(r,['id','taskId','output','requestStatus','assessment'],'答卷记录');if(!safeID(r.id)||ids.has(r.id))fail('答卷 ID 无效或重复');ids.add(r.id);const t=map.get(r.taskId);if(!t||t.pool!=='development')fail('本地公开答卷不能含封存或未知题目');str(r.output,'回答');if(!['success','error','timeout','skipped','truncated','unsupported','infrastructure_error'].includes(r.requestStatus))fail('请求状态无效');const a=r.assessment;allowed(a,['protocolId','taskId','status','contentState','contentScore','formatPassed','strictPassed','checks','constraints','review','reason'],'评分结果');arr(a.checks,'评分细项',100);arr(a.constraints,'约束结果',100);for(const c of a.checks)allowed(c,['id','label','points','earned','passed','critical'],'得分细项');for(const c of a.constraints)allowed(c,['id','label','passed','required'],'约束结果');if(a.review&&(t.grader.kind!=='manual'||r.requestStatus!=='success'))fail('这类答卷不能附人工评审');const replay=replayChallenge(r.output,t.grader,t.id,a.review||null,r.requestStatus);if(!equal(semanticAssessment(a),semanticAssessment(replay)))fail('答卷评分与重新计算不一致');results.push({...structuredClone(r),assessment:{...replay,reason:typeof a.reason==='string'?a.reason:'浏览器按公开规则重算。'}})}
 return {schemaVersion:'challenge-results-v2',suiteId:CHALLENGE_SUITE,protocolId:CHALLENGE_PROTOCOL,dataKind:'imported',generatedAt:input.generatedAt,sourceLabel:input.sourceLabel,results};
}
