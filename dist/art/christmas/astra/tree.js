'use strict';
// All motion is sampled from the recording position, including snow and after-rings.
const cue={"duration":19,"beats":[0.4,1.06,1.72,2.38,3.04,3.7,4.36,5.02,5.68,6.34,7,7.66,8.4,8.88,9.36,9.84,10.32,10.8,11.28,11.76,12.24,12.72,13.2,13.68,14.16,14.64,15.12,15.6,16.08,16.56],"accents":[0.4,3.04,5.68,8.4,10.32,12.24,14.16,16.08],"bells":[1.39,2.71,4.03,5.35,6.67,7.99,9.12,10.08,11.04,12,12.96,13.92,14.88,15.84,16.8],"sections":{"opening":0,"faster":8.4,"ending":17.35}};
const $=s=>document.querySelector(s), canvas=$('#stage canvas'), stage=$('#stage'),
 music=$('#music'),play=$('#play'),seek=$('#seek'),c=canvas.getContext('2d');
const TAU=Math.PI*2,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t,
 smooth=(a,b,x)=>{let u=clamp((x-a)/(b-a));return u*u*(3-2*u)};
function rng(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
function layer(w,h){let el=document.createElement('canvas');el.width=Math.ceil(w);el.height=Math.ceil(h);return el}
function poly(g,pts,fill){g.fillStyle=fill;g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.fill()}
function line(g,x,y,X,Y,color,width=1){g.strokeStyle=color;g.lineWidth=width;g.beginPath();g.moveTo(x,y);g.lineTo(X,Y);g.stroke()}
function dot(g,x,y,r,color){g.fillStyle=color;g.beginPath();g.arc(x,y,r,0,TAU);g.fill()}
function glint(g,x,y,r,col){poly(g,[[x,y-r*1.3],[x+r*.22,y-r*.2],[x+r,y],[x+r*.2,y+r*.22],[x,y+r*1.3],[x-r*.18,y+r*.17],[x-r,y],[x-r*.2,y-r*.2]],col)}
function glow(g,x,y,r,col){let gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,col);gr.addColorStop(1,'rgba(255,185,96,0)');g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2)}
let W,H,D,bg,small,baseX,baseY,scale,sunX,sunY,sunR;
let grain=layer(172,172),gg=grain.getContext('2d'),gr=rng(985);
for(let i=0;i<11000;i++){gg.fillStyle=gr()<.5?'rgba(255,222,182,.11)':'rgba(9,6,19,.15)';gg.fillRect(gr()*172,gr()*172,gr()*1.5+.4,.65)}
function paintLandscape(){
 bg=layer(W*D,H*D);let g=bg.getContext('2d');g.scale(D,D);const r=rng(1225),w=W,h=H;
 let grad=g.createLinearGradient(0,0,w*.6,h);grad.addColorStop(0,'#252437');grad.addColorStop(.45,'#383046');grad.addColorStop(1,'#73505b');g.fillStyle=grad;g.fillRect(0,0,w,h);
 for(let i=0;i<w*h/1900;i++){
 let x=r()*w,y=r()*h*.8,sz=.35+r()*.75;dot(g,x,y,sz,'rgba(255,222,199,'+(.25+r()*.6)+')');
 if(i%18===0)glint(g,x,y,sz*3.5,'#e5bb9d')}
 const sx=sunX,sy=sunY,sr=sunR;
 g.strokeStyle='#e5a68c66';g.lineWidth=.8;g.beginPath();g.arc(sx,sy,sr+5,0,TAU);g.stroke();
 g.save();g.beginPath();g.arc(sx,sy,sr,0,TAU);g.clip();grad=g.createLinearGradient(0,sy-sr,0,sy+sr);grad.addColorStop(0,'#ffcb9f');grad.addColorStop(.48,'#f2a786');grad.addColorStop(1,'#c97875');g.fillStyle=grad;g.fillRect(sx-sr,sy-sr,2*sr,2*sr);
 for(let i=0;i<480;i++){let x=sx+(r()*2-1)*sr,y=sy+(r()*2-1)*sr;line(g,x,y,x+1+r()*11,y,'#a767651e',.7)}
 for(let i=0;i<19;i++){let y=sy+sr*(i*.06-.09);g.fillStyle='rgba(92,55,76,'+(.06+i*.016)+')';g.fillRect(sx-sr,y,sr*2,.7+i*.14)}
 g.restore();
 // Engraved distant ridges, with a second contour offset from the crest.
 function ridge(y,amp,col,seed,steps){let rr=rng(seed),pts=[],ll=rr()*TAU;for(let i=0;i<=steps;i++){let x=i*w/steps,v=x/h;pts.push([x,y+amp*(Math.sin(v*5+ll)*.53+Math.cos(v*10+ll)*.27+Math.sin(v*26)*.08+rr()*.2)])}poly(g,[[0,h],...pts,[w,h]],col);return pts}
 let hills=ridge(h*.68,h*.12,'#796070',238,145);
 for(let i=1;i<hills.length;i++)if(i%15<8)line(g,hills[i-1][0],hills[i-1][1]+2,hills[i][0],hills[i][1]+2,'#ad849080',.8);
 ridge(h*.74,h*.09,'#574958',49,160);
 function forest(y,amp,sz,color,n){let pts=[[0,h]];for(let i=0;i<n;i++){
 let x=(i+r()*.55)*w/n,yy=h*(y+Math.sin(x/h*4.8+.5)*amp+Math.cos(x/h*9)*.012),ht=sz*h*(.25+r()*.95),b=ht*.2;
 pts.push([x-b,yy],[x-b*.62,yy-ht*.32],[x-b*.82,yy-ht*.28],[x-b*.37,yy-ht*.6],[x-b*.53,yy-ht*.55],[x,yy-ht],[x+b*.48,yy-ht*.54],[x+b*.31,yy-ht*.62],[x+b,yy]);}
 poly(g,[...pts,[w,h]],color)}
 forest(.79,.039,.082,'#443b4c',Math.ceil(w/4));
 forest(.843,.035,.125,'#363242',Math.ceil(w/7));
 // A quiet settlement on the far bank.
 function cabin(x,y,s){g.save();g.translate(x,y);g.scale(s,s);poly(g,[[-13,0],[-13,-11],[0,-20],[14,-11],[14,0]],'#8c6067');poly(g,[[-17,-10],[0,-23],[18,-11],[14,-10],[0,-19],[-13,-9]],'#e0bcb0');g.fillStyle='#73545d';g.fillRect(7,-22,3,9);g.fillStyle='#ffe4a3';g.fillRect(-7,-9,4,5);g.fillRect(4,-9,3,5);g.restore()}
 cabin(w*.916,h*.832,h/545);cabin(w*.953,h*.82,h/860);
 let bank=x=>h*(.848+.024*Math.sin(x/h*3.2)+.019*Math.sin(x/h*7.1+.6));
 let pts=[];for(let x=0;x<w+5;x+=4)pts.push([x,bank(x)]);
 poly(g,[[0,h],...pts,[w,h]],'#b196a0');
 for(let i=0;i<Math.ceil(w*.7);i++){let x=r()*w,y=bank(x)+r()*h*.19,len=r()*12+1;line(g,x,y,x+len,y-.2,'#715e782e',.8)}
 ridge(h*.931,h*.039,'#66566a',78,148);
 ridge(h*.979,h*.026,'#443b4b',93,156);
 // Dry-brush tracks and small stands of spruce frame the edge of the print.
 for(let k=0;k<58;k++){let x=r()*w,y=bank(x)+(3+r()*12)*h/410;
 g.strokeStyle=k%3?'#dec6b24f':'#735f773f';g.lineWidth=.7;g.beginPath();g.moveTo(x,y);
 g.quadraticCurveTo(x+8,y-2,x+12+r()*15,y-.8);g.stroke()}
 function spruce(x,y,ht){
 let side=.23*ht;
 line(g,x,y,x,y-ht,'#353541',Math.max(1,ht*.022));
 for(let j=6;j>0;j--){let u=j/6,b=side*u,Y=y-ht+ht*u*.89;
 let p=[[x,Y-(.2+.13*u)*ht],[x+b*.48,Y-ht*.14],[x+b*.39,Y-ht*.16],[x+b,Y-ht*.04],[x+b*.83,Y-ht*.035],[x+b*1.05,Y],[x+b*.26,Y-ht*.034],[x,Y+ht*.025],[x-b*.49,Y-ht*.024],[x-b,Y],[x-b*.91,Y-ht*.044],[x-b*.6,Y-ht*.11]];
 poly(g,p,j%2?'#343542':'#3b3946');line(g,x-b*.07,Y-ht*.12,x-b*.87,Y-ht*.021,'#99808b70',.8)}
 }
 spruce(w*.989,h*.929,h*(small?.126:.184));spruce(w*.973,h*.924,h*.087);
 if(!small){spruce(w*.019,h*.943,h*.16);spruce(w*.033,h*.932,h*.104);spruce(w*.005,h*.95,h*.094)}

 // Vignette keeps the typography quiet without boxing it in.
 grad=g.createLinearGradient(0,0,w*(small?.57:.53),0);grad.addColorStop(0,'rgba(34,30,46,.76)');grad.addColorStop(.67,'rgba(34,30,46,.52)');grad.addColorStop(1,'rgba(34,30,46,0)');g.fillStyle=grad;g.fillRect(0,0,w,h);
 g.fillStyle=g.createPattern(grain,'repeat');g.fillRect(0,0,w,h)
}
function resize(){let rect=stage.getBoundingClientRect();W=rect.width;H=rect.height;if(!W||!H)return;D=Math.min(window.devicePixelRatio||1,2.25);canvas.width=Math.round(W*D);canvas.height=Math.round(H*D);small=matchMedia('(max-width:620px)').matches;baseX=W*(small?.667:.728);baseY=H*(small?.895:.90);scale=Math.min(H*(small?.62:.765)/300,W*(small?.61:.42)/244);sunX=baseX+scale*26;sunY=baseY-scale*181;sunR=scale*(small?107:124);paintLandscape();draw(music.currentTime||0)}

// Print the foliage plate once. Nine engraved fans of fir, each built out of individual sprays.
const S=3, treePlate=layer(284*S,332*S), ink=treePlate.getContext('2d'), rr=rng(82119);
ink.scale(S,S);ink.translate(142,16);
poly(ink,[[-7,300],[-4,230],[6,229],[8,300]],'#634743');
for(let i=0;i<8;i++)line(ink,-5+rr()*11,296,-4+rr()*10,277,'#bd82624d',.85);
const greens=['#54816c','#769b80','#40735f','#90ac88','#2b6457','#648d72','#477e68'];
for(let j=8;j>=0;j--){
 const z=(j+1)/9,wide=3+115*Math.pow(z,1.02),bottom=1+278*z,top=j===0?0:bottom-26-z*53,depth=bottom-top;
 let pts=[[0,top-2]];for(let k=1;k<=7;k++){let v=k/7;pts.push([wide*(v-.075),top+depth*(v*.81+.09)],[wide*v,top+depth*(v*.77+.075)])}
 for(let k=0;k<=36;k++){let a=(18-k)/18,xx=wide*a;pts.push([xx,bottom-9*a*a+3*Math.cos(k*2.5)+rr()*1.6],[xx-1.4,bottom-9*a*a-2])}
 for(let k=7;k>=1;k--){let v=k/7;pts.push([-wide*v,top+depth*(v*.79+.066)],[-wide*(v-.08),top+depth*(v*.8+.07)])}
 poly(ink,pts,j%2?'#214c43':'#1e473f');
 // Tapered branchlets arch down and curl up at the ends.
 for(let side of [-1,1]){let count=8+Math.floor(z*9);for(let k=count;k>=0;k--){
 let u=(k+.35)/(count+.55),ex=side*wide*u,ey=bottom-9*u*u+rr()*4-2,
 bx=side*u*wide*.16,by=top+depth*(.19+.16*rr()),midX=ex*(.53+.07*rr()),midY=ey-depth*(.07+.12*rr()),lift=4*u;
 const point=t=>{let n=1-t;return [n*n*bx+2*n*t*midX+t*t*ex,n*n*by+2*n*t*(midY+lift)+t*t*ey]};
 let p=point(0),shade=greens[(k+j)%greens.length];for(let m=1;m<=21;m++){let t=m/21,q=point(t),l=(2.8+z*5.2)*(1-.4*t)*(.7+rr()*.65);
 line(ink,p[0],p[1],q[0],q[1],shade,.52+z*.32);
 let col=greens[Math.floor(rr()*greens.length)],dx=side*l*(.4+u*.58);
 line(ink,q[0],q[1],q[0]+dx,q[1]-l*(.2+u*.54),col,.65+.3*z);
 line(ink,q[0],q[1],q[0]-side*l*(.72-u*.18),q[1]+l*(.8+u*.1),col,.7+.31*z);
 if(m%4===0)line(ink,q[0],q[1],q[0]+side*l*1.3,q[1]+l*.25,'#a2b99399',.66);p=q
 }
 }}
 // Snow left in little irregular ink flecks along the outer boughs.
 for(let k=0;k<wide*.62;k++){let u=rr()*2-1;let x=u*wide,y=top+depth*(.3+.54*Math.abs(u))+(rr()-.5)*4;line(ink,x,y,x+1+rr()*3.6,y-.2-rr(),'rgba(214,222,180,'+(.26+rr()*.47)+')',.7+rr()*.5)}
}
const bulbs=[], ornaments=[],r2=rng(3124);
function ribbonPoint(j,u){let y0=43+j*47,w0=(y0*.403+2),w1=(y0+17)*.403;return [mix(-w0,w1,u),y0+17*u+13*Math.sin(Math.PI*u)]}
function strokePath(g,points,color,width){g.strokeStyle=color;g.lineWidth=width;g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.stroke()}
for(let j=0;j<5;j++){
 let a=[];for(let i=0;i<=70;i++)a.push(ribbonPoint(j,i/70));
 // A twisted satin ribbon, copper on its face and garnet in shadow.
 for(let i=1;i<a.length;i++){let wave=Math.sin(i*.115+j*.9);let w=(2.3+j*.43)*(1+.49*wave);
 let [x,y]=a[i-1],[X,Y]=a[i];poly(ink,[[x-.15,y],[X+.15,Y],[X+.2,Y+w],[x-.15,y+w]],wave>-.48?'#c47162':'#914f4b')}
 strokePath(ink,a,'#fac7a0',.83);
 let n=5+j*2;for(let k=0;k<n;k++){let [x,y]=ribbonPoint(j,(k+.25)/n);bulbs.push({x,y:y+3.9,group:(k+j*2)%7,phi:r2()*6})}
}
for(let j=0;j<6;j++){
 let n=2+Math.round(j*1.25);for(let k=0;k<n;k++){let y=29+j*43+r2()*14,u=(k+.25+r2()*.45)/n,x=(2*u-1)*y*.396;
 ornaments.push({x,y,r:2.8+r2()*2.1+j*.14,kind:(k+j*2)%5,phi:r2()*TAU,group:(k*2+j)%7})}
}
const snowR=rng(519),snow=Array.from({length:108},()=>({x:snowR(),y:snowR(),r:.42+snowR()*1.08,s:snowR(),a:snowR()}));
function star(g,x,y,r){let pts=[];for(let i=0;i<10;i++){let a=i*Math.PI/5-Math.PI/2,rr=i%2?r*.44:r;pts.push([x+Math.cos(a)*rr,y+Math.sin(a)*rr])}
 for(let i=0;i<10;i++)poly(g,[[x,y],pts[i],pts[(i+1)%10]],['#fff0ac','#d7954f','#ffe6a2','#dca45c','#ffe3a0','#e3a15e','#fff1b8','#dd9b58','#fff3ba','#e2ad64'][i]);
 strokePath(g,[...pts,pts[0]],'#ffdd9c',.65)}
function ringBell(g,r){poly(g,[[-r*.9,r*.48],[-r*.62,r*.02],[-r*.48,-r*.57],[-r*.2,-r*.93],[r*.25,-r*.93],[r*.56,-r*.55],[r*.66,r*.02],[r*.94,r*.48]],'#efba72');line(g,-r*.9,r*.55,r*.91,r*.55,'#ffe4a6',1.1);dot(g,.1,r*.79,r*.2,'#dc9464');line(g,-r*.31,-r*.5,-r*.47,r*.02,'#fff1b2',.8)}
function bauble(g,o,t,twist,light){g.save();g.translate(o.x,o.y-5);g.rotate(twist*(.65+o.r*.08)+light*.19*Math.sin(o.phi+t*16));
 line(g,0,-1,0,4.1,'#cab884',.64);g.translate(0,4.3+o.r*.7);let r=o.r;
 if(o.kind===3){g.rotate(-.13);ringBell(g,r*1.08)}
 else if(o.kind===4){glint(g,0,0,r*1.14,'#ffe0a4');dot(g,0,-.5,1,'#fff4cc')}
 else{let pal=[['#b95948','#f5b19a'],['#d6b381','#fff1ce'],['#ce7663','#ffd1aa']][o.kind];
 dot(g,.2,.5,r+.3,'#283f39');dot(g,0,0,r,pal[0]);g.save();g.beginPath();g.arc(0,0,r,0,TAU);g.clip();
 if(o.kind===2){for(let k=-1;k<=1;k++)line(g,-r,k*4+1,r,k*4-3,'#f9d5a6',1.55)}
 else{g.strokeStyle=o.kind===0?'#793c3b':'#a38462';g.lineWidth=r*.24;g.beginPath();g.arc(0,0,r*.82,-.2,2,false);g.stroke()}
 g.restore();dot(g,-r*.33,-r*.37,r*.2,pal[1]);g.fillStyle='#e8c28e';g.fillRect(-r*.35,-r-1.1,r*.7,1.8)}
 if(light>.01){glow(g,0,0,(8+light*9), 'rgba(255,191,102,'+light*.7+')');glint(g,r*.45,-r*.4,light*7,'#fff1bb')}
 g.restore()}
function latest(list,t){let i=list.length-1;while(i>=0&&list[i]>t)i--;return i}

// A melodic answer moves between specific ornaments rather than flashing the whole string.
const solos=cue.bells.map((_,k)=>{
 let yt=[164,111,205,78,153,63,194,121,221,103,159,68,190,126,57][k],xt=(k%2?1:-1)*yt*.21;
 return ornaments.reduce((a,b)=>Math.hypot(b.x-xt,b.y-yt)<Math.hypot(a.x-xt,a.y-yt)?b:a)
});
function draw(t){
 if(!bg)return;
 const i=latest(cue.beats,t),ai=latest(cue.accents,t),fast=smooth(8.38,8.67,t)*(1-smooth(16.8,17.7,t)),end=smooth(17.35,18.7,t);
 let beat=0,sway=0,lift=0,punch=0;
 for(let k=Math.max(0,i-2);k<=i;k++){let dt=t-cue.beats[k],rate=k>=12?1.23:1,phase=dt*rate,accent=cue.accents.includes(cue.beats[k]);
 let bounce=Math.exp(-phase*5.9)*Math.sin(phase*13.6);
 sway+=(k%2?-1:1)*bounce*(accent?.162:.089)*(1+.23*fast);
 lift+=bounce*(accent?9:4.1);
 beat+=Math.exp(-phase*5.4)*(1-Math.exp(-phase*50));punch+=bounce*(accent?1.23:.62)
 }
 const dAcc=ai<0?99:t-cue.accents[ai],accentGlow=Math.exp(-dAcc*3.8),bi=latest(cue.bells,t);
 const lights=Array(7).fill(0);for(let k=Math.max(0,bi-1);k<=bi;k++){let dt=t-cue.bells[k];lights[(k*3)%7]=Math.exp(-dt*4.25)}
 c.setTransform(D,0,0,D,0,0);c.clearRect(0,0,W,H);c.drawImage(bg,0,0,W,H);
 if(fast>.01||end>.01){c.fillStyle='rgba(235,123,86,'+(.13*fast)+')';c.fillRect(0,0,W,H);
 if(end){c.fillStyle='rgba(45,46,90,'+(end*.22)+')';c.fillRect(0,0,W,H)}}
 // Four shooting-star flourishes answer the four fast downbeats.
 if(fast && dAcc<1.28){
 let u=clamp(dAcc/1.28),v=smooth(0,.16,u)*(1-smooth(.7,1,u))*fast;
 let meteor=q=>[sunX+sunR*(q*2.4-1.58),sunY-sunR*(.67+.64*q+.12*Math.sin(q*3.1))];
 let p=meteor(u);c.globalAlpha=v*.82;
 for(let j=0;j<12;j++){let a=meteor(u-j*.013),b=meteor(u-(j+1)*.013);line(c,...a,...b,'rgba(255,219,171,'+(1-j/12)+')',scale*(1.2-j*.065))}
 glint(c,...p,3.8*scale,'#fff0c2');c.globalAlpha=1}
 // The sun doubles as the record: a quiet groove in the prelude, rhythmic rays in the allegro.
 c.save();c.translate(sunX,sunY);
 for(let n=0;n<60;n++){let a=n*TAU/60-Math.PI/2,v=clamp(.15+.85*Math.cos(n*.57-t*3.5));
 let r=sunR+8*scale,len=(n%5===0?4:1.6)+fast*(3+7*v)+accentGlow*(n%3===0?4:1);
 line(c,Math.cos(a)*r,Math.sin(a)*r,Math.cos(a)*(r+len*scale),Math.sin(a)*(r+len*scale),'rgba(255,203,161,'+(.26+fast*.22+end*.12)+')',Math.max(.65,scale*.8))}
 c.restore();
 // Snowfall is integrated in audio time, not animation frames.
 let snowClock=t*.66+Math.max(0,Math.min(t,17.35)-8.4)*.63-Math.max(t-17.35,0)*.46;
 for(let n=0;n<snow.length;n++){let p=snow[n],xx=((p.x+snowClock*(.003+p.s*.002)+Math.sin(p.a*13+t*.6)*.005)%1+1)%1*W,
 yy=((p.y+snowClock*(.013+p.s*.023))%1)*(H*.95);
 c.globalAlpha=(small||xx>W*.45?.68:.32)*(.4+.6*p.s);dot(c,xx,yy,p.r*(small?.8:1),'#fff0d9')}
 c.globalAlpha=1;
 // Contact shadow and grounded trunk; the entire crown springs about the root.
 c.save();c.translate(baseX,baseY);c.scale(scale,scale);
 c.fillStyle='#53465288';c.beginPath();c.ellipse(4,1,70+beat*2.5,4.3,0,0,TAU);c.fill();
 for(let n=0;n<14;n++){let x=(n-7)*9;line(c,x,3+Math.sin(n)*2,x+5+n%4,3+Math.sin(n)*2,'#eddebd66',.8)}
 const finale=Math.sin(clamp((t-17.35)/1.65)*Math.PI);
 c.rotate(sway+finale*.05);c.scale(1+punch*.058,1-punch*.058+finale*.018);
 c.translate(0,-300-lift*.32);c.drawImage(treePlate,-142,-16,284,332);
 for(let b of bulbs){let wave=(1+Math.cos(t*(fast?5.7:2.8)-b.y*.039+b.phi))*.5,L=lights[b.group];
 let entry=smooth(0,7.8,t)*1.32-(1-b.y/300);let brightness=.29+.26*smooth(-.08,.23,entry)+.16*wave+.2*fast+.45*L+.3*end+.09*accentGlow;
 glow(c,b.x,b.y,4.2+3*brightness+9*L,'rgba(255,179,81,'+clamp(brightness*.62)+')');
 dot(c,b.x,b.y,1.35+L, '#ffe8ab');
 if(L>.07||end>.01){glint(c,b.x,b.y,1.9+L*6+end*1.45,'#fff2c4')}
 }
 let solo=solos[bi],bellAge=bi<0?99:t-cue.bells[bi],ping=Math.exp(-bellAge*3.7);
 for(let o of ornaments)bauble(c,o,t,-sway*2.9+.07*beat*Math.sin(o.phi)+(o===solo?.63*ping*Math.sin(bellAge*19):0),Math.max(lights[o.group]*.72,o===solo?ping:0));
 // Four rising sparks emerge from a different bell cluster on each chime.
 if(bi>=0){let dt=t-cue.bells[bi],life=clamp(1-dt/.72);if(life){let o=solo;
 c.strokeStyle='rgba(255,228,171,'+(life*.85)+')';c.lineWidth=.9*life+.3;
 c.beginPath();c.arc(o.x,o.y+2,4+dt*24,0,TAU);c.stroke();
 c.globalAlpha=life;for(let k=0;k<5;k++){let a=k*1.43+bi;
 glint(c,o.x+Math.cos(a)*(5+dt*22),o.y+Math.sin(a)*(4+dt*15)-dt*18,1.2+life*1.8,'#ffedb3')}
 c.globalAlpha=1}}
 line(c,0,5,0,-11,'#d6ad68',1.6);
 glow(c,0,-9,24+accentGlow*9+end*15,'rgba(255,203,112,'+(.39+.19*accentGlow+.12*end)+')');
 c.save();c.translate(0,-10);c.rotate(-sway*.7);
 for(let j=0;j<10;j++){let a=TAU*j/10-Math.PI/2,rad=17+(j%2?0:2);line(c,Math.cos(a)*rad,Math.sin(a)*rad,Math.cos(a)*(rad+2.2+accentGlow*5+end*4),Math.sin(a)*(rad+2.2+accentGlow*5+end*4),'#ffe1a690',.85)}
 star(c,0,0,14.5+accentGlow*1.6+end*1.1);c.restore();c.restore();
 // The coda leaves a constellation suspended around the resting crown.
 if(end>0){for(let j=0;j<11;j++){let a=Math.PI*1.11+j*.236,rad=sunR*(1.16+.13*Math.sin(j*12));c.globalAlpha=end*(.6+.4*Math.sin(j+t));glint(c,sunX+Math.cos(a)*rad,sunY+Math.sin(a)*rad,(j%3+2.4)*scale,'#ffe1b6')}c.globalAlpha=1}
}

const moves=[...document.querySelectorAll('[data-to]')],led=$('#status'),glyph=$('#playGlyph'),now=$('#now');
let frame=0,section=-1;
function sync(t=music.currentTime||0){
 t=clamp(t,0,cue.duration);draw(t);seek.value=t;seek.style.setProperty('--p',(t/cue.duration*100)+'%');now.textContent='00:'+String(Math.floor(t+.0001)).padStart(2,'0');
 let index=t>=cue.sections.ending?2:t>=cue.sections.faster?1:0;
 if(index!==section){moves.forEach((m,j)=>{m.classList.toggle('active',index===j);m.setAttribute('aria-current',index===j?'true':'false')});section=index}
}
function loop(){cancelAnimationFrame(frame);sync();if(!music.paused&&!music.ended)frame=requestAnimationFrame(loop)}
function state(){
 let on=!music.paused&&!music.ended;glyph.setAttribute('d',on?'M6 5h4.5v14H6zM14 5h4.5v14H14z':'M7 4.5 20 12 7 19.5z');
 play.setAttribute('aria-label',on?'Pause':music.ended?'Replay':'Play');led.textContent=on?'ON AIR':music.ended?'END OF SIDE':music.currentTime>0?'PAUSED':'READY TO PLAY';
}
function jump(v){music.currentTime=v;sync(v);state()}
function run(){music.play().catch(()=>{state();led.textContent='PLAYBACK UNAVAILABLE'})}
play.addEventListener('click',()=>{if(music.paused||music.ended){if(music.ended||music.currentTime>=cue.duration)jump(0);run()}else music.pause()});
$('#replay').addEventListener('click',()=>{jump(0);run()});
$('#mute').addEventListener('click',()=>music.muted=!music.muted);
music.addEventListener('volumechange',()=>{$('#volIcon').setAttribute('href',music.muted?'#silent':'#speaker');$('#mute').setAttribute('aria-label',music.muted?'Unmute':'Mute');$('#mute').title=music.muted?'Unmute':'Mute';$('#mute').setAttribute('aria-pressed',String(music.muted))});
seek.addEventListener('input',()=>jump(Number(seek.value)));
moves.forEach(b=>b.addEventListener('click',()=>jump(Number(b.dataset.to))));
for(const e of ['play','playing','pause','ended','loadedmetadata','seeked'])music.addEventListener(e,()=>{state();loop()});
music.addEventListener('timeupdate',()=>{if(music.paused)sync()});
window.addEventListener('resize',resize);resize();sync();
