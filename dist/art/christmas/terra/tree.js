/* All movement is evaluated from the audio clock, including when seeking. */
const music = document.querySelector('#music');
const play = document.querySelector('#play');
const seek = document.querySelector('#seek');
const elapsed = document.querySelector('#elapsed');
const duration = document.querySelector('#duration');
const chapter = document.querySelector('#chapter');
const canvas = document.querySelector('#scene');
const c = canvas.getContext('2d');
const beats = [0.4,1.06,1.72,2.38,3.04,3.7,4.36,5.02,5.68,6.34,7,7.66,8.4,8.88,9.36,9.84,10.32,10.8,11.28,11.76,12.24,12.72,13.2,13.68,14.16,14.64,15.12,15.6,16.08,16.56];
const accents = [0.4,3.04,5.68,8.4,10.32,12.24,14.16,16.08];
const bells = [1.39,2.71,4.03,5.35,6.67,7.99,9.12,10.08,11.04,12,12.96,13.92,14.88,15.84,16.8];
const W=900,H=720;
function rand(n){const x=Math.sin(n*127.1+31.7)*43758.5453;return x-Math.floor(x)}
function pulse(list,t,decay){let v=0;for(const b of list){const d=t-b;if(d>=0&&d<decay*7)v=Math.max(v,Math.exp(-d/decay));}return v}
function glow(x,y,r,color,alpha=1){c.save();c.globalAlpha=alpha;const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.restore()}
function star(x,y,r,points=5,inner=.45){c.beginPath();for(let i=0;i<points*2;i++){const a=-Math.PI/2+i*Math.PI/points,rr=i%2?r*inner:r;c.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr)}c.closePath()}
function line(x1,y1,x2,y2,color,width=1){c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke()}
function background(t,beat,bell){
 const bg=c.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#102c29');bg.addColorStop(.65,'#1b3d34');bg.addColorStop(1,'#28483d');c.fillStyle=bg;c.fillRect(0,0,W,H);
 glow(450,305,380,'rgba(207,178,105,.15)');glow(710,100,170,'rgba(196,218,185,.08)');
 // Engraved frame
 c.strokeStyle='rgba(222,200,144,.28)';c.lineWidth=1;c.strokeRect(16,16,W-32,H-32);c.strokeStyle='rgba(222,200,144,.12)';c.strokeRect(22,22,W-44,H-44);
 // Quiet winter sky, each fleck moves only with the soundtrack.
 for(let i=0;i<95;i++){let x=35+rand(i+10)*830,y=35+rand(i+200)*550;y=(y+t*(2+rand(i+80)*3))%580+20;let a=.18+rand(i+400)*.5;c.fillStyle='rgba(235,230,197,'+a+')';c.beginPath();c.arc(x,y,rand(i+500)*1.5+.4,0,7);c.fill()}
 // Distant pines
 for(let j=0;j<9;j++){let x=32+j*108, h=70+rand(j+44)*85, y=566;c.fillStyle='rgba(5,31,27,.32)';c.beginPath();c.moveTo(x,y-h);c.lineTo(x-49,y);c.lineTo(x+49,y);c.closePath();c.fill()}
 c.fillStyle='#d3d9c2';c.beginPath();c.moveTo(0,590);c.quadraticCurveTo(180,551,350,590);c.quadraticCurveTo(590,550,900,583);c.lineTo(900,720);c.lineTo(0,720);c.fill();
 const snow=c.createLinearGradient(0,570,0,720);snow.addColorStop(0,'#c9d5bd');snow.addColorStop(1,'#e6e4ce');c.fillStyle=snow;c.beginPath();c.moveTo(0,625);c.quadraticCurveTo(220,581,427,612);c.quadraticCurveTo(650,575,900,616);c.lineTo(900,720);c.lineTo(0,720);c.fill();
 c.fillStyle='rgba(54,92,74,.17)';c.beginPath();c.ellipse(456,620,250,25,0,0,7);c.fill();
 // A few little stars, brightened by bells.
 for(let i=0;i<10;i++){let x=80+rand(i+20)*740,y=85+rand(i+99)*360;if(x>280&&x<620)continue;c.save();c.globalAlpha=.35+bell*.4;c.fillStyle='#f5e7b5';star(x,y,3+rand(i)*3,4,.18);c.fill();c.restore()}
}
function gift(x,y,w,h,color,ribbon){
 c.save();c.translate(x,y);c.fillStyle='rgba(21,53,39,.18)';c.beginPath();c.ellipse(w/2,h+5,w*.65,8,0,0,7);c.fill();c.fillStyle=color;c.fillRect(0,0,w,h);c.fillStyle='rgba(0,0,0,.12)';c.fillRect(0,0,w,7);c.fillStyle=ribbon;c.fillRect(w*.43,0,w*.14,h);c.fillRect(-3,-5,w+6,9);c.strokeStyle=ribbon;c.lineWidth=4;c.beginPath();c.moveTo(w/2,-5);c.bezierCurveTo(w*.05,-27,w*.16,-34,w/2,-8);c.bezierCurveTo(w*.84,-34,w*.95,-27,w/2,-5);c.stroke();c.restore()
}
function drawTree(t,beat,accent,bell){
 // Pivot at the foot: downbeats move the whole tree, bells remain local.
 const ending=t>=17.35?Math.max(0,1-(t-17.35)/1.65):1;
 const sway=(Math.sin(t*(t<8.4?1.6:2.7))*.018+Math.sin(t*3.1)*.006+accent*.018)*ending;
 c.save();c.translate(450,600);c.rotate(sway);c.scale(1+beat*.012,1-beat*.013);
 c.fillStyle='#70503a';c.fillRect(-22,-78,44,81);c.fillStyle='#967451';c.fillRect(-10,-71,8,67);
 // Tier silhouettes and individually drawn fir needles.
 const tiers=[{top:-510,base:-335,w:92},{top:-445,base:-260,w:133},{top:-370,base:-180,w:174},{top:-290,base:-90,w:211},{top:-205,base:-22,w:245}];
 tiers.forEach((q,k)=>{
  const grad=c.createLinearGradient(-q.w,q.top,q.w,q.base);grad.addColorStop(0,'#174638');grad.addColorStop(.5,k%2?'#28664b':'#245b43');grad.addColorStop(1,'#103b30');c.fillStyle=grad;
  c.beginPath();c.moveTo(0,q.top);c.bezierCurveTo(-q.w*.19,q.top+65,-q.w*.64,q.base-56,-q.w,q.base-5);
  for(let j=0;j<8;j++){let x=-q.w+j*q.w*2/8;c.quadraticCurveTo(x+q.w/8,q.base+12+(j%2)*8,x+q.w/4,q.base-4)}
  c.bezierCurveTo(q.w*.65,q.base-60,q.w*.2,q.top+65,0,q.top);c.fill();
  c.strokeStyle='rgba(122,171,123,.25)';c.lineWidth=1.2;
  for(let i=0;i<34;i++){let yy=q.top+35+rand(i+k*77)*(q.base-q.top-35);let fraction=(yy-q.top)/(q.base-q.top);let side=i%2?1:-1;let x=side*rand(i+20+k*83)*q.w*fraction*.91;c.beginPath();c.moveTo(x,yy);c.lineTo(x+side*(7+rand(i+4)*12),yy+6);c.stroke()}
 });
 // Fine draped garlands.
 const garlands=[[-383,65],[-306,105],[-225,150],[-145,190]];
 garlands.forEach(([y,w],i)=>{c.beginPath();c.moveTo(-w,y);c.quadraticCurveTo(0,y+62,w,y);c.strokeStyle='rgba(230,196,119,.75)';c.lineWidth=2;c.stroke();for(let j=0;j<13;j++){let u=j/12,x=-w+2*w*u,yy=y+124*u*(1-u);c.fillStyle=j%2?'#f3dd9b':'#c28c53';c.beginPath();c.arc(x,yy,2,0,7);c.fill()}});
 // Baubles: stable positions, with small reflected highlights.
 const baubles=[[-30,-415,9,'#cf735a'],[42,-377,10,'#e4bd74'],[-70,-339,11,'#c65b4c'],[76,-300,11,'#c36350'],[-24,-290,9,'#ebc67d'],[-115,-255,11,'#dfb773'],[30,-238,12,'#bf584b'],[125,-221,10,'#e7c780'],[-76,-193,12,'#d2775f'],[76,-165,13,'#c7594e'],[-156,-136,10,'#d8ad69'],[-21,-132,11,'#e0b96e'],[153,-101,12,'#bd574c'],[-111,-75,12,'#e5bc76'],[28,-67,13,'#c5604e']];
 baubles.forEach(([x,y,r,col])=>{line(x,y-r-5,x,y-r,'#d9bc80');const g=c.createRadialGradient(x-r*.35,y-r*.4,1,x,y,r);g.addColorStop(0,'#fff0c6');g.addColorStop(.22,col);g.addColorStop(1,'#713e34');c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,7);c.fill();c.fillStyle='rgba(255,245,210,.7)';c.beginPath();c.arc(x-r*.3,y-r*.35,2,0,7);c.fill()});
 // The high bell notes travel through different groups of lights.
 for(let i=0;i<38;i++){let row=Math.floor(i/8),y=-392+row*77+rand(i+31)*26,spread=45+row*38,x=(rand(i+88)*2-1)*spread;let recent=0;for(let b=0;b<bells.length;b++){let d=t-bells[b];if(d>=0&&d<1.2&&i%5===b%5)recent=Math.max(recent,Math.exp(-d/.32))}let strength=.32+recent*.68;glow(x,y,10+recent*20,'rgba(255,216,125,.8)',strength);c.fillStyle=recent>.1?'#fff5c9':'#e8c67e';c.beginPath();c.arc(x,y,2.3+recent*1.7,0,7);c.fill()}
 // Crown
 glow(0,-518,48+accent*18,'rgba(255,215,127,.55)',.8);c.fillStyle='#f6dda0';star(0,-519,22,5,.43);c.fill();c.fillStyle='#fff5ce';star(0,-519,11,5,.43);c.fill();
 c.restore();
}
function draw(t){
 const beat=pulse(beats,t,.18),accent=pulse(accents,t,.34),bell=pulse(bells,t,.3);
 background(t,beat,bell);drawTree(t,beat,accent,bell);
 gift(250,584,72,55,'#a84e42','#d8bd80');gift(307,606,55,40,'#cfad77','#e9ddbb');gift(548,600,78,48,'#b85849','#e7cf92');gift(620,610,51,37,'#d8be87','#8c5548');
 // Foreground glints respond to accented downbeats.
 if(accent>.02){glow(450,573,170,'rgba(255,222,143,.12)',accent)}
 chapter.textContent=t>=17.35?'尾声 · 星光落定':t>=8.4?'舞曲 · 灯火欢腾':'序曲 · 雪夜初醒';
}
function format(t){return '0:'+String(Math.floor(t||0)).padStart(2,'0')}
function sync(){const t=Number.isFinite(music.currentTime)?music.currentTime:0;seek.value=t;elapsed.textContent=format(t);draw(t)}
function updateButton(){const paused=music.paused;play.querySelector('.play-icon').textContent=paused?'▶':'Ⅱ';play.querySelector('.play-icon').style.marginLeft=paused?'3px':'0';play.setAttribute('aria-label',paused?(music.ended?'重新播放音乐':'播放音乐'):'暂停音乐')}
play.addEventListener('click',async()=>{if(music.paused){if(music.ended||music.currentTime>=music.duration){music.currentTime=0;sync()}try{await music.play()}catch(e){updateButton()}}else music.pause()});
seek.addEventListener('input',()=>{music.currentTime=Number(seek.value);sync()});
music.addEventListener('loadedmetadata',()=>{if(Number.isFinite(music.duration)){seek.max=music.duration;duration.textContent=format(music.duration)}sync()});
music.addEventListener('play',updateButton);music.addEventListener('pause',()=>{updateButton();sync()});music.addEventListener('ended',()=>{updateButton();sync()});music.addEventListener('seeked',sync);music.addEventListener('timeupdate',sync);
function frame(){if(!music.paused)sync();requestAnimationFrame(frame)}
draw(0);updateButton();requestAnimationFrame(frame);
