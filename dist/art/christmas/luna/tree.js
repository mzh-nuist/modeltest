(() => {
  const canvas = document.querySelector('#tree');
  const ctx = canvas.getContext('2d');
  const music = document.querySelector('#music');
  const play = document.querySelector('#play');
  const seek = document.querySelector('#seek');
  const clock = document.querySelector('#clock');
  const DURATION = 19;
  // Beat map and musical phrases from cue-sheet.json. Rendering is a pure
  // function of the playhead, so pause and seeking always show the right pose.
  const beats = [0.4,1.06,1.72,2.38,3.04,3.7,4.36,5.02,5.68,6.34,7,7.66,8.4,8.88,9.36,9.84,10.32,10.8,11.28,11.76,12.24,12.72,13.2,13.68,14.16,14.64,15.12,15.6,16.08,16.56];
  const accents = [0.4,3.04,5.68,8.4,10.32,12.24,14.16,16.08];
  const bells = [1.39,2.71,4.03,5.35,6.67,7.99,9.12,10.08,11.04,12,12.96,13.92,14.88,15.84,16.8];
  const W=800,H=640;
  let width=0,height=0,dpr=1, frame=0;

  function resize() {
    const r=canvas.getBoundingClientRect();
    dpr=Math.min(window.devicePixelRatio||1,2);
    width=r.width; height=r.height;
    canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr);
    draw();
  }
  function pulseAt(list,t,decay) {
    let sum=0;
    for(const beat of list) { const age=t-beat; if(age>=0 && age<decay) sum=Math.max(sum,Math.exp(-age/(decay*.34))); }
    return sum;
  }
  function fmt(t) { const s=Math.floor(Math.max(0,t)); return '00:'+String(s).padStart(2,'0'); }
  function path(points) {
    ctx.beginPath(); ctx.moveTo(points[0][0],points[0][1]);
    for(let i=1;i<points.length;i++) ctx.lineTo(points[i][0],points[i][1]);
    ctx.closePath();
  }
  function star(x,y,r,inner,rotation=0) {
    ctx.beginPath();
    for(let i=0;i<10;i++) { const a=rotation-Math.PI/2+i*Math.PI/5, rr=i%2?r*inner:r; const px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr; i?ctx.lineTo(px,py):ctx.moveTo(px,py); }
    ctx.closePath();
  }
  function draw() {
    if(!width || !height) return;
    const t=Math.max(0,Math.min(DURATION, Number(music.currentTime)||0));
    const opening=Math.max(0,Math.min(1,t/2.8));
    const faster=t>=8.4 && t<17.35;
    const ending=t>=17.35;
    const beat=pulseAt(beats,t,faster?.36:.56);
    const accent=pulseAt(accents,t,.78);
    const bell=pulseAt(bells,t,.30);
    const scale=Math.min(width/W,height/H), ox=(width-W*scale)/2, oy=(height-H*scale)/2;
    ctx.setTransform(dpr*scale,0,0,dpr*scale,dpr*ox,dpr*oy);
    // Midnight-to-dawn palette shifts at each cue-sheet section.
    const bg=ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,ending?'#142c34':faster?'#0c2b30':'#0a2026');
    bg.addColorStop(.66,'#10292a'); bg.addColorStop(1,'#1c3530');
    ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
    const halo=ctx.createRadialGradient(400,286,18,400,300,330);
    halo.addColorStop(0,ending?'#e3b96624':faster?'#89e5bd1d':'#d6cf8b18'); halo.addColorStop(1,'#08191d00');
    ctx.fillStyle=halo; ctx.fillRect(0,0,W,H);
    // Fine, time-addressable snow; no autonomous animation loop.
    for(let i=0;i<58;i++) {
      const seed=i*127.1+19.7, x=((seed*17.31 + Math.sin(t*.75+i)*12)%W+W)%W;
      const y=((seed*31.73 + t*(12+(i%5)*3))%550+550)%550;
      const r=.7+(i%4)*.36, alpha=.18+(i%5)*.08;
      ctx.fillStyle='rgba(232,239,218,'+alpha+')'; ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }
    // distant fir silhouettes and snow bank
    for(let i=0;i<7;i++) {
      const x=40+i*118, h=80+(i*37)%75, y=486;
      ctx.fillStyle=i%2?'#183632':'#1b3c35';
      path([[x,y-h],[x-h*.39,y-h*.39],[x-h*.22,y-h*.4],[x-h*.48,y-h*.05],[x-h*.22,y-h*.1],[x,y],[x+h*.24,y-h*.1],[x+h*.47,y-h*.04],[x+h*.2,y-h*.4],[x+h*.4,y-h*.38]]);
      ctx.fill();
    }
    ctx.fillStyle='#d4e1c51b';ctx.beginPath();ctx.ellipse(400,552,365,70,0,Math.PI,Math.PI*2);ctx.fill();
    ctx.fillStyle='#d4e1c50d';ctx.beginPath();ctx.ellipse(400,574,410,68,0,Math.PI,Math.PI*2);ctx.fill();
    // soft cast shadow
    ctx.fillStyle='#030d0d80';ctx.beginPath();ctx.ellipse(401,552,138+beat*8,18,0,0,Math.PI*2);ctx.fill();
    ctx.save();
    const sway=Math.sin(t*1.9)* (faster?3.4:1.6) + Math.sin(t*4.7)*accent*1.2;
    ctx.translate(400+sway,0);
    ctx.scale(1+beat*.012+accent*.015,1-beat*.008);
    // carved dark green body and layered boughs
    const trunk=ctx.createLinearGradient(-22,0,22,0); trunk.addColorStop(0,'#573d27');trunk.addColorStop(.48,'#a17943');trunk.addColorStop(1,'#493421');
    ctx.fillStyle=trunk;ctx.fillRect(-20,492,40,62);
    const body=ctx.createLinearGradient(-150,0,150,0);body.addColorStop(0,'#12382e');body.addColorStop(.48,'#236344');body.addColorStop(1,'#0b3029');
    ctx.fillStyle=body;path([[0,76],[-42,148],[-26,145],[-90,234],[-66,227],[-137,331],[-105,321],[-177,432],[-142,418],[-211,518],[-135,510],[0,527],[143,510],[213,518],[142,418],[178,432],[107,321],[139,331],[68,227],[92,234],[27,145],[43,148]]);ctx.fill();
    // scalloped branch tiers with fine warm edges
    const tiers=[
      {y:150,w:39,d:19},{y:232,w:88,d:24},{y:326,w:137,d:27},{y:425,w:177,d:30},{y:518,w:211,d:34}
    ];
    tiers.forEach((b,i)=>{
      const g=ctx.createLinearGradient(-b.w,0,b.w,0);g.addColorStop(0,'#174a35');g.addColorStop(.5,i%2?'#347b4d':'#2c7046');g.addColorStop(1,'#103b30');
      ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(0,b.y-78);ctx.bezierCurveTo(-b.w*.35,b.y-45,-b.w*.76,b.y-25,-b.w,b.y);
      ctx.quadraticCurveTo(-b.w*.65,b.y-7,-b.w*.48,b.y-10);ctx.quadraticCurveTo(-b.w*.25,b.y+7,0,b.y+b.d);
      ctx.quadraticCurveTo(b.w*.28,b.y+7,b.w*.5,b.y-10);ctx.quadraticCurveTo(b.w*.7,b.y-5,b.w,b.y);
      ctx.bezierCurveTo(b.w*.74,b.y-28,b.w*.32,b.y-46,0,b.y-78);ctx.closePath();ctx.fill();
      ctx.strokeStyle='rgba(187,216,137,'+(.12+i*.018)+')';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-b.w*.83,b.y-2);ctx.quadraticCurveTo(0,b.y+b.d+2,b.w*.83,b.y-2);ctx.stroke();
    });
    // star aura & faceted topper
    const starY=76;
    ctx.save();ctx.shadowColor=ending?'#ffdc8e':'#ffe495';ctx.shadowBlur=27+accent*25+bell*8;
    const sg=ctx.createRadialGradient(0,starY,1,0,starY,36);sg.addColorStop(0,'#fff9d9');sg.addColorStop(.23,ending?'#ffd77b':'#fff1b1');sg.addColorStop(1,'#efbd5500');
    ctx.fillStyle=sg;ctx.beginPath();ctx.arc(0,starY,38,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.save();ctx.translate(0,starY);ctx.rotate(Math.sin(t*2)*.035+beat*.04);star(0,0,25, .46);
    const st=ctx.createLinearGradient(-14,-20,13,20);st.addColorStop(0,'#fff7ca');st.addColorStop(.48,'#f7d579');st.addColorStop(1,'#c88c39');ctx.fillStyle=st;ctx.fill();ctx.strokeStyle='#fff3c4';ctx.lineWidth=1.2;ctx.stroke();ctx.restore();
    // light strings, each point glows in response to nearby melodic bell cues
    const lightPoints=[];
    for(let row=0;row<7;row++) {
      const y=155+row*54, fraction=row/6, max=30+fraction*155, count=5+row*2;
      for(let j=0;j<count;j++) {
        const u=count===1?.5:j/(count-1), x=(u*2-1)*max;
        const yy=y+Math.sin(u*Math.PI*2+row*.8)*8;
        lightPoints.push({x,y:yy,row,j});
      }
    }
    ctx.lineCap='round';
    for(let i=0;i<lightPoints.length;i++) {
      const p=lightPoints[i], nearest=Math.round(i/Math.max(1,lightPoints.length-1)*(bells.length-1));
      const local=pulseAt([bells[nearest]],t,.34), colorIndex=(p.row*2+p.j)%4;
      const colors=['#ffe39a','#8be4c1','#f78580','#b7a8ff'];
      const color=ending?'#ffd783':colors[colorIndex];
      const glow=(.25+local*.75+beat*.12)*(opening*.8+.2);
      if(i<lightPoints.length-1 && i%3!==2) {
        const q=lightPoints[i+1]; if(q.row===p.row) {ctx.strokeStyle='rgba(233,190,99,.25)';ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.quadraticCurveTo((p.x+q.x)/2,p.y+4,q.x,q.y);ctx.stroke();}
      }
      ctx.save();ctx.globalAlpha=glow;ctx.shadowColor=color;ctx.shadowBlur=5+local*19+bell*4;
      ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,2.2+local*2.3+accent*.35,0,Math.PI*2);ctx.fill();ctx.restore();
      // tiny metallic sockets
      ctx.fillStyle='#e6d197';ctx.globalAlpha=.65;ctx.beginPath();ctx.arc(p.x,p.y-3.1,1,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    }
    // pendants / larger ornaments, swaying together on strong downbeats
    const ornaments=[
      [-20,192,'#d9544e'],[24,215,'#e6bd62'],[-55,270,'#7fc8a4'],[55,286,'#d94e49'],
      [-94,349,'#e6bd62'],[-31,363,'#c65350'],[39,377,'#84d2b0'],[105,366,'#e7c66d'],
      [-139,441,'#d9544e'],[-76,456,'#e7c36c'],[-9,467,'#81c9a2'],[67,450,'#d85651'],[144,440,'#e9c66c']
    ];
    ornaments.forEach((o,i)=>{
      const [x,y,c]=o, swing=Math.sin(t*2.5+i)*2.2+accent*2.5;
      ctx.save();ctx.translate(x,y);ctx.rotate(swing*.012);
      ctx.strokeStyle='#d7bb72';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(0,-4);ctx.stroke();
      const rg=ctx.createRadialGradient(-3,-4,1,0,0,11);rg.addColorStop(0,'#fff1c9');rg.addColorStop(.22,c);rg.addColorStop(1,'#18362c');
      ctx.fillStyle=rg;ctx.shadowColor=c;ctx.shadowBlur=3+beat*5;ctx.beginPath();ctx.arc(0,4,7.5,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#f2d68eaa';ctx.lineWidth=.8;ctx.stroke();ctx.restore();
    });
    ctx.restore();
    // floating bell glints rise briefly from melody accents
    for(let i=0;i<bells.length;i++) { const age=t-bells[i]; if(age>=0&&age<.48) {
      const x=260+(i*97)%280, y=260+Math.sin(i*4)*100-age*29;
      ctx.globalAlpha=(1-age/.48)*.8;ctx.fillStyle='#ffe9ad';ctx.shadowColor='#ffe9ad';ctx.shadowBlur=12;
      star(x,y,3+bell*1.4,.45,t*2);ctx.fill();ctx.shadowBlur=0;
    }}
    ctx.globalAlpha=1;
    // phrase markers make the three sections perceptibly distinct
    if(t<8.4) {
      ctx.fillStyle='#e2d5ab';ctx.globalAlpha=.58+.25*Math.sin(t*2);
      ctx.font='italic 19px Georgia';ctx.textAlign='center';ctx.fillText('softly, the lights awaken',400,615);
    } else if(!ending) {
      ctx.fillStyle='#f4d487';ctx.globalAlpha=.78;
      ctx.font='italic 19px Georgia';ctx.textAlign='center';ctx.fillText('and the whole night dances',400,615);
    } else {
      ctx.fillStyle='#ffdfa0';ctx.globalAlpha=.7+(Math.sin(t*8)*.08);
      ctx.font='italic 19px Georgia';ctx.textAlign='center';ctx.fillText('goodnight, little stars',400,615);
    }
    ctx.globalAlpha=1;ctx.shadowBlur=0;
  }
  function animate() { draw(); if(!music.paused&&!music.ended) frame=requestAnimationFrame(animate); else frame=0; }
  function syncControls() {
    const t=Math.max(0,Math.min(DURATION,Number(music.currentTime)||0));
    if(document.activeElement!==seek) seek.value=t;
    seek.style.setProperty('--progress',(t/DURATION*100)+'%');
    clock.textContent=fmt(t)+' / 00:19';
    const playing=!music.paused&&!music.ended;
    play.classList.toggle('is-playing',playing);
    play.setAttribute('aria-label',playing?'暂停音乐':'从头播放音乐');
    play.querySelector('.play-icon').textContent=playing?'Ⅱ':'▶';
    play.querySelector('.play-label').textContent=playing?'暂停':'播放';
    draw();
  }
  play.addEventListener('click',()=>{
    if(music.paused) {
      if(music.ended || music.currentTime>=DURATION-.02) music.currentTime=0;
      music.play().catch(()=>{});
    } else music.pause();
  });
  seek.addEventListener('input',()=>{
    const value=Math.max(0,Math.min(DURATION,Number(seek.value)||0));
    music.currentTime=value; syncControls();
  });
  music.addEventListener('timeupdate',syncControls);
  music.addEventListener('seeked',syncControls);
  music.addEventListener('play',()=>{syncControls();if(!frame)frame=requestAnimationFrame(animate);});
  music.addEventListener('pause',()=>{if(frame){cancelAnimationFrame(frame);frame=0;}syncControls();});
  music.addEventListener('ended',()=>{music.currentTime=DURATION;syncControls();});
  window.addEventListener('resize',resize);
  resize();syncControls();
})();