// Trusted, author-created illustration. This module never renders model output.
export const PELICAN_PERIOD=2;
const tau=Math.PI*2;
const rounded=n=>Math.round(n*1000)/1000;
const point=(x,y)=>({x:rounded(x),y:rounded(y)});
const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function knee(hip,foot){
 const dx=foot.x-hip.x,dy=foot.y-hip.y,d=length(hip,foot),h=Math.sqrt(Math.max(0,10000-d*d/4));
 return point((hip.x+foot.x)/2+dy/d*h,(hip.y+foot.y)/2-dx/d*h);
}
export function pelicanPose(seconds,broken=false){
 const value=Number(seconds),time=(((Number.isFinite(value)?value:0)%2)+2)%2,angle=time/2*tau,crank=point(405,435);
 const pedals=[0,Math.PI].map(offset=>point(crank.x+42*Math.cos(angle+offset),crank.y+42*Math.sin(angle+offset)));
 const feet=broken?[point(447,435),point(363,435)]:pedals.map(p=>({...p}));
 const hips=[point(367,306),point(383,308)];
 return {time,angle:rounded(angle*180/Math.PI),crank,pedals,feet,hips,knees:hips.map((hip,i)=>knee(hip,feet[i])),body:point(355,275),roadOffset:rounded(time/2*160)};
}
export function pelicanPlayer(){
 const spokes=Array.from({length:8},(_,i)=>{const a=i*tau/8;return `<line x1="0" y1="0" x2="${rounded(95*Math.cos(a))}" y2="${rounded(95*Math.sin(a))}"/>`;}).join('');
 return `<section class="pelican-player" data-pelican-player aria-label="出题方动态示意播放器">
  <div class="pelican-player-heading"><strong>出题方示意 · 非模型答卷</strong><span>2 秒一圈</span></div>
  <div class="pelican-modes" role="group" aria-label="切换示意类型"><button type="button" data-pelican-mode="linked" aria-pressed="true">联动示意</button><button type="button" data-pelican-mode="broken" aria-pressed="false">错误示例</button></div>
  <svg class="pelican-scene" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600" role="img" aria-label="出题方绘制的鹈鹕踩踏示意，使用下方控件播放或逐帧观察">
   <rect width="800" height="600" fill="#edf6fb"/><circle cx="690" cy="95" r="33" fill="#ffdf85"/>
   <path d="M0 515 Q180 475 350 515 T800 505 V600 H0Z" fill="#d7e6cf"/><path d="M0 552H800" stroke="#a0b79a" stroke-width="4"/>
   <g data-part="road" stroke="#b4c6ac" stroke-width="6">${[-160,0,160,320,480,640,800,960].map(x=>`<path d="M${x} 575h70"/>`).join('')}</g>
   <g fill="#fff" stroke="#263c4d" stroke-width="6"><circle cx="230" cy="440" r="100"/><circle cx="600" cy="440" r="100"/></g>
   <g stroke="#b1c2cd" stroke-width="3"><g transform="translate(230 440)"><g data-part="rear-wheel">${spokes}</g></g><g transform="translate(600 440)"><g data-part="front-wheel">${spokes}</g></g></g>
   <g fill="none" stroke="#258c91" stroke-width="10" stroke-linejoin="round"><path d="M230 440L367 330L405 435Z M367 330L550 330L405 435 M550 330L600 440"/><path d="M367 330L359 309 M550 330L541 286L576 277" stroke="#263c4d" stroke-width="7"/></g>
   <path d="M330 326H394" stroke="#263c4d" stroke-width="12" stroke-linecap="round"/>
   <path data-part="back-leg" d="M383 308L430 350L363 435" fill="none" stroke="#ce8737" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
   <ellipse cx="355" cy="275" rx="85" ry="53" fill="#fffaf0" stroke="#455f70" stroke-width="3"/>
   <path d="M390 256Q389 220 420 191Q442 177 452 195L442 249Q440 271 414 277" fill="#fffaf0" stroke="#455f70" stroke-width="3"/>
   <ellipse cx="437" cy="185" rx="32" ry="29" fill="#fffaf0" stroke="#455f70" stroke-width="3"/>
   <path d="M458 183L552 201L460 210Q455 200 458 183Z" fill="#f5b449" stroke="#b47830" stroke-width="3"/>
   <circle cx="444" cy="178" r="4" fill="#263c4d"/>
   <path d="M302 274Q355 244 400 280L541 286" fill="none" stroke="#455f70" stroke-width="11" stroke-linecap="round"/>
   <path d="M305 276Q357 251 402 280L541 286" fill="none" stroke="#e6ebe9" stroke-width="7" stroke-linecap="round"/>
   <path d="M338 290Q379 275 405 292L541 289" fill="none" stroke="#fffaf0" stroke-width="9" stroke-linecap="round"/>
   <path data-part="front-leg" d="M367 306L450 350L447 435" fill="none" stroke="#efa441" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
   <g stroke="#263c4d" stroke-width="6"><line data-part="crank" x1="363" y1="435" x2="447" y2="435"/><circle cx="405" cy="435" r="8" fill="#263c4d"/></g>
   <g fill="#263c4d"><rect data-part="pedal-0" x="432" y="435" width="30" height="7" rx="3"/><rect data-part="pedal-1" x="348" y="435" width="30" height="7" rx="3"/></g>
   <g fill="none" stroke="#efa441" stroke-width="10" stroke-linecap="round"><path data-part="foot-0" d="M433 431h28"/><path data-part="foot-1" d="M349 431h28"/></g>
   <g data-part="error-rings" fill="none" stroke="#c43b49" stroke-width="3" stroke-dasharray="5 4" visibility="hidden"><circle data-part="error-foot" r="23"/><circle data-part="error-pedal" r="23"/></g>
  </svg>
  <p class="pelican-mode-note" data-pelican-note>观察两脚是否跟住踏板、腿是否连续弯伸。</p>
  <div class="pelican-controls"><button type="button" data-pelican-action="toggle" aria-pressed="false">播放</button><button type="button" data-pelican-action="step">下一帧</button><button type="button" data-pelican-action="reset">重播</button><label>速度<select data-pelican-speed aria-label="播放速度"><option value="1">正常</option><option value="0.25">慢放 0.25×</option></select></label></div>
  <label class="pelican-timeline">动画时间 <output data-pelican-clock>0.00 / 2.00 秒</output><input type="range" min="0" max="2000" value="0" step="1" data-pelican-time aria-label="动画时间"/></label>
 </section>`;
}
export function bindPelicanPlayer(main){
 const view=main.ownerDocument?.defaultView;
 if(!view?.MutationObserver||!main.querySelector)return;
 let active=null;
 function draw(s){
  const p=pelicanPose(s.time,s.mode==='broken'),root=s.root,set=(part,attrs)=>{const el=root.querySelector(`[data-part="${part}"]`);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));};
  for(const [i,side] of ['front','back'].entries()){
   const a=p.hips[i],b=p.knees[i],c=p.feet[i],pedal=p.pedals[i];
   set(side+'-leg',{d:`M${a.x} ${a.y}L${b.x} ${b.y}L${c.x} ${c.y}`});set('foot-'+i,{d:`M${c.x-14} ${c.y-4}h28`});set('pedal-'+i,{x:pedal.x-15,y:pedal.y});
  }
  set('crank',{x1:p.pedals[1].x,y1:p.pedals[1].y,x2:p.pedals[0].x,y2:p.pedals[0].y});
  for(const side of ['front','rear'])set(side+'-wheel',{transform:`rotate(${p.angle})`});
  set('road',{transform:`translate(${-p.roadOffset} 0)`});
  set('error-rings',{visibility:s.mode==='broken'?'visible':'hidden'});set('error-foot',{cx:p.feet[0].x,cy:p.feet[0].y});set('error-pedal',{cx:p.pedals[0].x,cy:p.pedals[0].y});
  root.dataset.playing=String(s.playing);root.dataset.seconds=p.time.toFixed(4);root.dataset.mode=s.mode;root.dataset.speed=String(s.speed);
  root.querySelector('[data-pelican-clock]').textContent=p.time.toFixed(2)+' / 2.00 秒';
  root.querySelector('[data-pelican-time]').value=String(Math.round(p.time*1000));
  const toggle=root.querySelector('[data-pelican-action="toggle"]');toggle.textContent=s.playing?'暂停':'播放';toggle.setAttribute('aria-pressed',String(s.playing));
  for(const b of root.querySelectorAll('[data-pelican-mode]'))b.setAttribute('aria-pressed',String(b.dataset.pelicanMode===s.mode));
  root.querySelector('[data-pelican-note]').textContent=s.mode==='broken'?'出题方错误示例：踏板在转，脚留在原地。红圈对照脚与踏板的位置。':'联动示意：观察两脚是否跟住踏板、腿是否连续弯伸。此演示不作模型评分。';
 }
 function tick(now){
  const s=active;if(!s||!s.root.isConnected)return;
  if(s.playing&&s.last!==null)s.time=(s.time+Math.min((now-s.last)/1000,.1)*s.speed)%2;
  s.last=now;draw(s);if(s.playing)s.raf=view.requestAnimationFrame(tick);else s.raf=null;
 }
 function start(s){s.last=null;if(s.raf===null)s.raf=view.requestAnimationFrame(tick);}
 function scan(){
  const root=main.querySelector('[data-pelican-player]');if(root===active?.root)return;
  if(active?.raf!==null&&active?.raf!==undefined)view.cancelAnimationFrame(active.raf);
  active=root?{root,time:0,mode:'linked',speed:1,playing:!view.matchMedia('(prefers-reduced-motion: reduce)').matches,last:null,raf:null}:null;
  if(active){draw(active);if(active.playing)start(active);}
 }
 new view.MutationObserver(scan).observe(main,{childList:true});scan();
 main.addEventListener('click',ev=>{
  const b=ev.target.closest('[data-pelican-action],[data-pelican-mode],[data-pelican-evidence],[data-pelican-score-jump]');if(!b||!main.contains(b))return;if(b.hasAttribute('data-pelican-score-jump')){const target=main.querySelector('[data-score-summary]');target?.scrollIntoView({block:'start',behavior:'instant'});target?.focus({preventScroll:true});return;}scan();const s=active;if(!s)return;
  if(b.hasAttribute('data-pelican-evidence')){s.mode='broken';s.time=.5;s.playing=false;s.root.scrollIntoView({block:'center',behavior:'instant'});}
  else if(b.dataset.pelicanMode){if(!['linked','broken'].includes(b.dataset.pelicanMode))return;s.mode=b.dataset.pelicanMode;s.time=0;}
  else if(b.dataset.pelicanAction==='toggle')s.playing=!s.playing;
  else if(b.dataset.pelicanAction==='step'){s.playing=false;s.time=(s.time+2/12)%2;}
  else if(b.dataset.pelicanAction==='reset'){s.time=0;s.playing=true;}
  draw(s);if(s.playing)start(s);
 });
 main.addEventListener('change',ev=>{if(!active||!ev.target.matches('[data-pelican-speed]'))return;const speed=Number(ev.target.value);if([1,.25].includes(speed)){active.speed=speed;active.last=null;draw(active);}});
 main.addEventListener('input',ev=>{if(!active||!ev.target.matches('[data-pelican-time]'))return;active.time=Math.min(1999,Math.max(0,Number(ev.target.value)||0))/1000;active.playing=false;draw(active);});
}
