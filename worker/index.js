// No raw visitor IDs, IP addresses, emails or complete referrer URLs are stored.
const assets=/*__ASSET_MAP__*/{};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const routes=new Set(['checkup','checkup/play','checkup/results','checkup/works','checkup/repairs','checkup/compare','checkup/purpose','checkup/reasoning','checkup/edit','checkup/memory','checkup/honesty','checkup/visual','checkup/receipt','checkup/zebra','checkup/efforts','checkup/history','checkup/how','checkup/contact',...['deepseek-v41-flash','kimi-k31-pro','kimi-k3','glm53-flash','minimax-m31-flash','claude-sonnet55','claude-haiku55','gpt6-luna','gemini38-flash','mistral-large4'].map(id=>'checkup/model/'+id)]);
export const localDay=stamp=>new Date(new Date(stamp).getTime()+8*3600000).toISOString().slice(0,10);
export function validateTrafficEvent(body){
  if(!body||Object.keys(body).sort().join(',')!=='device,eventId,kind,route,source,visitorId'||!['pageview','qa'].includes(body.kind)||!uuid.test(body.eventId)||!uuid.test(body.visitorId)||!routes.has(body.route)||!['mobile','tablet','desktop'].includes(body.device)||!['direct','internal','x.com','google','bing','other'].includes(body.source))return false;
  return true;
}
const resultRows=r=>r?.results||[];
async function traffic(request,env){
  if(!env.DB)return json({state:'unavailable',message:'访问统计数据库尚未连接'},503);
  const url=new URL(request.url);
  if(request.method==='POST'){
    if(request.headers.get('origin')!==url.origin||request.headers.get('content-type')?.split(';')[0]!=='application/json')return json({error:'origin_or_type'},403);
    if(request.headers.get('DNT')==='1'||request.headers.get('Sec-GPC')==='1'||/bot|spider|crawler|headless|preview/i.test(request.headers.get('user-agent')||''))return new Response(null,{status:204});
    if(Number(request.headers.get('content-length'))>2048)return json({error:'too_large'},413);
    const reader=request.body?.getReader(),chunks=[];let size=0;if(!reader)return json({error:'invalid_json'},400);while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();return json({error:'too_large'},413);}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}const raw=new TextDecoder().decode(bytes);
    let body;try{body=JSON.parse(raw);}catch{return json({error:'invalid_json'},400);}
    if(!validateTrafficEvent(body))return json({error:'invalid_event'},400);
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('zhufeng-traffic-v1:'+body.visitorId));
    const hash=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
    const now=new Date(),stamp=now.toISOString(),day=localDay(now);
    const recent=await env.DB.prepare('SELECT COUNT(*) AS n FROM traffic_events WHERE visitor_hash = ? AND occurred_at >= ?').bind(hash,new Date(now.getTime()-60000).toISOString()).first();
    if(recent.n>=30)return json({error:'rate_limited'},429);
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO traffic_events (event_id,visitor_hash,occurred_at,local_day,route,source,device,is_test) VALUES (?,?,?,?,?,?,?,?)').bind(body.eventId,hash,stamp,day,body.route,body.source,body.device,body.kind==='qa'?1:0),
      env.DB.prepare('DELETE FROM traffic_events WHERE occurred_at < ?').bind(new Date(now.getTime()-90*86400000).toISOString())
    ]);
    return new Response(null,{status:204});
  }
  if(request.method!=='GET')return json({error:'method'},405);
  const days=Number(url.searchParams.get('days')||30);if(![7,30].includes(days))return json({error:'range'},400);
  await env.DB.prepare('DELETE FROM traffic_events WHERE occurred_at < ?').bind(new Date(Date.now()-90*86400000).toISOString()).run();
  const today=localDay(new Date()),since=localDay(new Date(Date.now()-(days-1)*86400000));
  const queries=[
    ['SELECT COUNT(*) AS pv, COUNT(DISTINCT visitor_hash) AS uv FROM traffic_events WHERE is_test = 0 AND local_day >= ?',since],
    ['SELECT COUNT(*) AS pv, COUNT(DISTINCT visitor_hash) AS uv FROM traffic_events WHERE is_test = 0 AND local_day = ?',today],
    ['SELECT local_day AS day, COUNT(*) AS pv, COUNT(DISTINCT visitor_hash) AS uv FROM traffic_events WHERE is_test = 0 AND local_day >= ? GROUP BY local_day ORDER BY local_day',since],
    ['SELECT route AS label, COUNT(*) AS count FROM traffic_events WHERE is_test = 0 AND local_day >= ? GROUP BY route ORDER BY count DESC LIMIT 10',since],
    ['SELECT source AS label, COUNT(*) AS count FROM traffic_events WHERE is_test = 0 AND local_day >= ? GROUP BY source ORDER BY count DESC',since],
    ['SELECT device AS label, COUNT(*) AS count FROM traffic_events WHERE is_test = 0 AND local_day >= ? GROUP BY device ORDER BY count DESC',since],
    ['SELECT MIN(local_day) AS day FROM traffic_events WHERE is_test = 0']
  ];
  const values=await env.DB.batch(queries.map(([sql,...args])=>env.DB.prepare(sql).bind(...args)));
  return json({schemaVersion:'traffic-summary-v1',state:env.LOCAL_PREVIEW?'preview':'live',timezone:'UTC+8',days,since,through:today,generatedAt:new Date().toISOString(),startedOn:resultRows(values[6])[0]?.day||null,total:resultRows(values[0])[0],today:resultRows(values[1])[0],daily:resultRows(values[2]),pages:resultRows(values[3]),sources:resultRows(values[4]),devices:resultRows(values[5]),scope:'当前站点访问；是否公开及受众范围以站点分享设置为准。',limitations:'UV为浏览器标识去重估算，不代表真实人数；无存储、拦截、机器人和重复访问会影响统计。最多保留90天。'});
}
export default {async fetch(request,env){
  const url=new URL(request.url);
  try{if(url.pathname==='/api/traffic')return await traffic(request,env);}catch{return json({state:'unavailable',message:'统计暂不可用，请稍后重试'},503);}
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  const path=url.pathname==='/'?'/index.html':url.pathname,item=assets[path];
  if(!item){
    if(!env.ASSETS)return new Response('Not found',{status:404});
    const response=await env.ASSETS.fetch(request);
    const headers=new Headers(response.headers);
    headers.set('cache-control','no-cache');
    headers.set('x-content-type-options','nosniff');
    headers.set('referrer-policy','strict-origin-when-cross-origin');
    return new Response(request.method==='HEAD'?null:response.body,{status:response.status,statusText:response.statusText,headers});
  }
  const bytes=Uint8Array.from(atob(item.data),x=>x.charCodeAt(0));
  return new Response(request.method==='HEAD'?null:bytes,{headers:{'content-type':item.type,'cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin'}});
}};
