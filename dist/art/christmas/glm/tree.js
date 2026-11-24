'use strict';
/* ============================================================
   圣诞树的十九秒 —— 以 music.currentTime 为唯一时钟
   画面是时间 t 的纯函数：
     · 暂停 → 每帧画同一时刻，自然定格
     · 拖动 #seek → currentTime 变，下一帧立即画出那一刻
     · 播放结束 → 从零重播
   重拍 accents → 整棵树的摇摆/弹跳/自下而上的光波
   铃声 bells   → 逐盏点亮枝头灯饰 + 扩散光环
   段落 sections → 背景、雪势、树的能量整体切换
   ============================================================ */

const music = document.querySelector('#music');
const playBtn = document.querySelector('#play');
const seek = document.querySelector('#seek');
const stage = document.querySelector('#stage');
const cv = document.querySelector('#scene');
const timeOut = document.querySelector('#time');
const ctx = cv.getContext('2d');
const DUR = 19;

/* ---- 音乐时间轴（来自 cue-sheet.json）---- */
const CUE = {
  beats: [0.4, 1.06, 1.72, 2.38, 3.04, 3.7, 4.36, 5.02, 5.68, 6.34, 7.0, 7.66,
          8.4, 8.88, 9.36, 9.84, 10.32, 10.8, 11.28, 11.76, 12.24, 12.72,
          13.2, 13.68, 14.16, 14.64, 15.12, 15.6, 16.08, 16.56],
  accents: [0.4, 3.04, 5.68, 8.4, 10.32, 12.24, 14.16, 16.08],
  bells: [1.39, 2.71, 4.03, 5.35, 6.67, 7.99, 9.12, 10.08, 11.04, 12.0,
          12.96, 13.92, 14.88, 15.84, 16.8],
  faster: 8.4,
  ending: 17.35,
};

/* ---- 小工具 ---- */
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, m) => a + (b - a) * m;
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const TAU = Math.PI * 2;

/* 指数衰减包络：t 时刻距最近一次触发的衰减强度 */
function env(t, times, tau) {
  let e = 0;
  for (let i = 0; i < times.length; i++) {
    const dt = t - times[i];
    if (dt >= 0 && dt < tau * 5) {
      const v = Math.exp(-dt / tau);
      if (v > e) e = v;
    }
  }
  return e;
}
function rgb(c, a = 1) {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}
function dark(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16 & 255) * f | 0},${(n >> 8 & 255) * f | 0},${(n & 255) * f | 0})`;
}
/* 确定性随机：画面完全可复现 */
function mulberry32(s) {
  return function () {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261124);

/* ---- 静态布景（种子固定，位置稳定）---- */
const STARS = Array.from({ length: 70 }, () => ({
  x: rnd(), y: rnd() * 0.62, r: 0.5 + rnd() * 1.2, ph: rnd() * TAU, f: 0.5 + rnd() * 1.6,
}));
const FLAKES = Array.from({ length: 120 }, () => ({
  x: rnd(), y: rnd(), r: 0.9 + rnd() * 2.3, s: 26 + rnd() * 52,
  ph: rnd() * TAU, amp: 8 + rnd() * 26, f: 0.4 + rnd() * 0.8, front: rnd() < 0.35,
}));
const SPK = Array.from({ length: 42 }, () => ({ x: rnd(), y: rnd(), ph: rnd() * TAU, f: 1 + rnd() * 2 }));
const ORNS = Array.from({ length: 12 }, () => ({
  t: (rnd() * 6) | 0, fy: 0.3 + rnd() * 0.55, fx: rnd() * 2 - 1,
  r: 3.4 + rnd() * 2.8, c: ['#e33b3b', '#ffb400', '#2f7fd6', '#c43090', '#7a3be0', '#ff6a2a'][(rnd() * 6) | 0],
}));
const GIFTS = [
  { x: -0.17, w: 0.055, h: 0.05, c: '#d64545', r: '#ffd75e' },
  { x: 0.155, w: 0.05, h: 0.042, c: '#3ba99c', r: '#f4f9ff' },
  { x: 0.015, w: 0.04, h: 0.036, c: '#e0a63c', r: '#7c3030' },
];
const LIGHT_COLORS = ['#ff5b5b', '#ffd75e', '#5bc8ff', '#8affa9', '#ff8ad8', '#ffb35e'];

/* ---- 三段落的画面参数（边界处 0.7s 平滑过渡）---- */
const SEC = {
  opening: { top: [8, 20, 44],   bot: [24, 52, 88],   glow: [64, 120, 190],  sway: 0.020, swaySpd: 1.2, snowA: 0.65, light: 0.55, beat: 0.12, star: 0.75 },
  faster:  { top: [27, 12, 56],  bot: [66, 22, 76],   glow: [150, 70, 170],  sway: 0.050, swaySpd: 2.8, snowA: 1.0,  light: 0.70, beat: 0.20, star: 0.85 },
  ending:  { top: [10, 20, 38],  bot: [54, 36, 54],   glow: [190, 120, 90],  sway: 0.006, swaySpd: 1.1, snowA: 0.45, light: 0.95, beat: 0.08, star: 1.0 },
};
function mixP(a, b, m) {
  const o = {};
  for (const k in a) {
    const va = a[k], vb = b[k];
    o[k] = Array.isArray(va) ? va.map((v, i) => lerp(v, vb[i], m)) : lerp(va, vb, m);
  }
  return o;
}
function sectionParams(t) {
  const m1 = smooth((t - (CUE.faster - 0.35)) / 0.7);
  const m2 = smooth((t - (CUE.ending - 0.35)) / 0.7);
  return mixP(mixP(SEC.opening, SEC.faster, m1), SEC.ending, m2);
}
function labelInfo(t) {
  const text = t < CUE.faster ? '壹 · 序曲' : t < CUE.ending ? '贰 · 加速' : '叁 · 尾声';
  let a = 1;
  for (const b of [CUE.faster, CUE.ending]) a = Math.min(a, clamp(Math.abs(t - b) / 0.5, 0, 1));
  return { text, alpha: a };
}

/* ============================================================
   渲染一帧：render(t)
   ============================================================ */
function render(t) {
  const W = stage.clientWidth, H = stage.clientHeight;
  if (!W || !H) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const bw = Math.round(W * dpr), bh = Math.round(H * dpr);
  if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const p = sectionParams(t);
  const kick = env(t, CUE.accents, 0.32);   // 重拍能量
  const beat = env(t, CUE.beats, 0.16);     // 每拍小幅脉动
  let lastA = -1;
  for (const a of CUE.accents) if (a <= t && a > lastA) lastA = a;

  /* --- 夜空 --- */
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, rgb(p.top));
  bg.addColorStop(1, rgb(p.bot));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  for (const s of STARS) {
    const tw = 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(t * s.f + s.ph));
    ctx.globalAlpha = tw;
    ctx.fillStyle = '#dfeaff';
    ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* 月亮 */
  const mx = W * 0.84, my = H * 0.14, mr = H * 0.045;
  const mg = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 3.4);
  mg.addColorStop(0, 'rgba(245,240,215,0.35)');
  mg.addColorStop(1, 'rgba(245,240,215,0)');
  ctx.fillStyle = mg;
  ctx.fillRect(mx - mr * 3.4, my - mr * 3.4, mr * 6.8, mr * 6.8);
  ctx.fillStyle = '#f5f0dc';
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();

  /* 树后方氛围光（随段落变色） */
  const cx = W * 0.5, groundY = H * 0.9, baseY = H * 0.855, topY = H * 0.155;
  const ag = ctx.createRadialGradient(cx, H * 0.45, 0, cx, H * 0.45, W * 0.55);
  ag.addColorStop(0, rgb(p.glow, 0.20));
  ag.addColorStop(1, rgb(p.glow, 0));
  ctx.fillStyle = ag;
  ctx.fillRect(0, 0, W, H);

  /* 背景层雪 */
  drawSnow(false, 0.55 * p.snowA, t);

  /* --- 雪地 --- */
  const gg = ctx.createLinearGradient(0, groundY - H * 0.03, 0, H);
  gg.addColorStop(0, '#e9f1fb');
  gg.addColorStop(1, '#a8bcd4');
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.quadraticCurveTo(W * 0.22, groundY - H * 0.012, W * 0.5, groundY - H * 0.006);
  ctx.quadraticCurveTo(W * 0.8, groundY, W, H * 0.885);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
  /* 树在雪上的倒影光 */
  const rg = ctx.createRadialGradient(cx, groundY + H * 0.012, 0, cx, groundY + H * 0.012, W * 0.24);
  rg.addColorStop(0, rgb(p.glow, 0.22));
  rg.addColorStop(1, rgb(p.glow, 0));
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.ellipse(cx, groundY + H * 0.012, W * 0.24, H * 0.05, 0, 0, TAU);
  ctx.fill();
  /* 雪地闪光 */
  for (const s of SPK) {
    const a = 0.25 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.f + s.ph));
    ctx.fillStyle = `rgba(255,255,255,${a * 0.8})`;
    ctx.fillRect(s.x * W, groundY + s.y * (H - groundY) * 0.85, 1.6, 1.6);
  }
  /* 树下的礼物 */
  for (const g of GIFTS) {
    const gw = g.w * W, gh = g.h * H, gx = cx + g.x * W, gy = groundY + H * 0.012;
    ctx.fillStyle = g.c;
    ctx.fillRect(gx - gw / 2, gy - gh, gw, gh);
    ctx.fillStyle = g.r;
    ctx.fillRect(gx - gw * 0.09, gy - gh, gw * 0.18, gh);
    ctx.fillRect(gx - gw / 2, gy - gh * 0.62, gw, gh * 0.16);
  }

  /* --- 树干（不随树跳动）--- */
  const trW = Math.max(10, W * 0.034);
  ctx.fillStyle = '#5c3f2a';
  ctx.fillRect(cx - trW / 2, baseY - 4, trW, H * 0.075);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(cx + trW * 0.08, baseY - 4, trW * 0.42, H * 0.075);

  /* --- 树：以根部为轴的摇摆 / 弹跳 / 压扁拉伸 --- */
  let sway = p.sway * Math.sin(t * p.swaySpd);
  if (lastA >= 0) {
    const dt = t - lastA;
    sway += p.sway * 2.4 * Math.exp(-dt / 0.3) * Math.sin(dt * 16); // 重拍后的回弹晃动
  }
  const hop = beat * 2.5 + kick * 1.6;   // 每拍轻轻上跳
  const sq = kick * 0.045;               // 重拍压扁再弹开

  const treeH = baseY - topY;
  const maxHalf = Math.min(W * 0.30, H * 0.36);
  const tiers = [];
  for (let i = 0; i < 6; i++) {
    const y0 = topY + treeH * (i / 6);
    const y1 = topY + treeH * Math.min((i + 1.5) / 6, 1);
    tiers.push({ y0, y1, half: maxHalf * ((y1 - topY) / treeH) });
  }

  ctx.save();
  ctx.translate(cx, baseY);
  ctx.rotate(sway);
  ctx.scale(1 + sq, 1 - sq * 0.6);
  ctx.translate(-cx, -baseY);
  ctx.translate(0, -hop);

  /* 枝叶（锯齿边的层叠三角） */
  for (const tr of tiers) {
    const dip = Math.max(3, tr.half * 0.06);
    const tg = ctx.createLinearGradient(0, tr.y0, 0, tr.y1);
    tg.addColorStop(0, '#2e7d4f');
    tg.addColorStop(1, '#123c27');
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(cx, tr.y0);
    ctx.lineTo(cx + tr.half, tr.y1);
    const n = 8;
    for (let j = n - 1; j >= 0; j--) {
      ctx.lineTo(cx - tr.half + (j / n) * 2 * tr.half, tr.y1 - (j % 2 ? dip : 0));
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,255,200,0.16)'; // 左缘受光
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, tr.y0); ctx.lineTo(cx - tr.half, tr.y1); ctx.stroke();
    ctx.strokeStyle = 'rgba(235,246,255,0.35)'; // 枝上积雪
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx + tr.half, tr.y1);
    for (let j = n - 1; j >= 0; j--) {
      ctx.lineTo(cx - tr.half + (j / n) * 2 * tr.half, tr.y1 - (j % 2 ? dip : 0));
    }
    ctx.stroke();
  }

  /* 重拍：暖光自下而上扫过整棵树 */
  const bandY = lastA >= 0 ? lerp(baseY, topY, clamp((t - lastA) / 0.8, 0, 1)) : -1e4;
  if (kick > 0.02) {
    const kg = ctx.createRadialGradient(cx, topY + treeH * 0.5, 0, cx, topY + treeH * 0.5, treeH * 0.7);
    kg.addColorStop(0, `rgba(255,240,200,${0.16 * kick})`);
    kg.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = kg;
    ctx.fillRect(cx - maxHalf * 1.2, topY, maxHalf * 2.4, treeH);
  }

  /* 彩球 */
  for (const o of ORNS) {
    const tr = tiers[o.t];
    const y = lerp(tr.y0, tr.y1, o.fy);
    const x = cx + o.fx * tr.half * o.fy * 0.7;
    const r = o.r * (H / 500);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x, y - r - 6); ctx.stroke();
    const og = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.15, x, y, r);
    og.addColorStop(0, '#ffffff');
    og.addColorStop(0.4, o.c);
    og.addColorStop(1, dark(o.c, 0.45));
    ctx.fillStyle = og;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }

  /* --- 灯饰：底数亮度 + 每拍脉动 + 重拍光波 + 铃声逐盏点亮 --- */
  const lights = [];
  tiers.forEach((tr, i) => {
    const n = 5 + i;
    for (let j = 0; j < n; j++) {
      const fx = (j + 0.5) / n;
      lights.push({
        x: cx + (fx * 2 - 1) * tr.half * 0.9,
        y: tr.y1 - Math.max(3, tr.half * 0.06) - 3,
        r: Math.max(2.1, H * 0.006),
        c: LIGHT_COLORS[(i + j) % LIGHT_COLORS.length],
      });
    }
  });
  const nL = lights.length;
  lights.forEach((L, i) => {
    let bell = 0;
    for (let k = 0; k < CUE.bells.length; k++) {
      const dt = t - CUE.bells[k];
      if (dt >= 0 && dt < 1.1) {
        const d = Math.abs(i - (k % nL));
        const w = Math.exp(-dt / 0.35) * (d === 0 ? 1 : d === 1 ? 0.35 : 0);
        if (w > bell) bell = w;
      }
    }
    const wave = kick * Math.exp(-((L.y - bandY) ** 2) / 3200); // σ≈40px 的光波带
    const lum = clamp(p.light + p.beat * beat * 1.6 + bell + wave, 0, 1.8);
    const g = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r * 5);
    g.addColorStop(0, hexA(L.c, 0.5 * Math.min(1, lum)));
    g.addColorStop(1, hexA(L.c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(L.x - L.r * 5, L.y - L.r * 5, L.r * 10, L.r * 10);
    ctx.fillStyle = hexA(L.c, 0.35 + 0.65 * Math.min(1, lum));
    ctx.beginPath(); ctx.arc(L.x, L.y, L.r, 0, TAU); ctx.fill();
    if (lum > 0.9) {
      ctx.fillStyle = `rgba(255,255,244,${Math.min(1, (lum - 0.9) * 1.6)})`;
      ctx.beginPath(); ctx.arc(L.x, L.y, L.r * 0.55, 0, TAU); ctx.fill();
    }
  });

  /* 铃声扩散光环（从被点亮的灯珠荡开） */
  for (let k = 0; k < CUE.bells.length; k++) {
    const dt = t - CUE.bells[k];
    if (dt >= 0 && dt < 0.9) {
      const L = lights[k % nL];
      ctx.strokeStyle = `rgba(255,242,205,${(1 - dt / 0.9) * 0.55})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(L.x, L.y, L.r + dt * W * 0.14, 0, TAU);
      ctx.stroke();
    }
  }

  /* --- 顶星 --- */
  const sR = H * 0.038 * (1 + 0.35 * kick + 0.12 * beat);
  const sx = cx, sy = topY - sR * 0.5;
  const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sR * 4);
  sg.addColorStop(0, `rgba(255,224,130,${0.5 * p.star + 0.35 * kick})`);
  sg.addColorStop(1, 'rgba(255,224,130,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(sx - sR * 4, sy - sR * 4, sR * 8, sR * 8);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(Math.sin(t * 1.3) * 0.15);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? sR * 0.45 : sR;
    const a = -Math.PI / 2 + i * Math.PI / 5;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffdf7e';
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(0, 0, sR * 0.22, 0, TAU); ctx.fill();
  ctx.restore();

  ctx.restore(); // 树的变换结束

  /* 前景层雪 */
  drawSnow(true, 0.9 * p.snowA, t);

  /* 暗角 */
  const v = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.3, W / 2, H * 0.5, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(4,8,18,0.5)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);

  /* 重拍全屏微闪 */
  if (kick > 0.02) {
    ctx.fillStyle = `rgba(255,240,214,${0.07 * kick})`;
    ctx.fillRect(0, 0, W, H);
  }

  /* 段落标签 + 顶部进度线 */
  const lb = labelInfo(t);
  ctx.font = `600 ${Math.max(13, Math.round(H * 0.042))}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = `rgba(255,236,190,${0.95 * lb.alpha})`;
  ctx.fillText(lb.text, 14, 10);
  ctx.fillStyle = 'rgba(255,215,94,0.9)';
  ctx.fillRect(0, 0, W * (t / DUR), 3);
}

/* 雪：y 由 t 决定 → 暂停即停雪，拖动即到那一刻的雪 */
function drawSnow(front, alpha, t) {
  const W = stage.clientWidth, H = stage.clientHeight;
  for (const f of FLAKES) {
    if (f.front !== front) continue;
    const yy = ((f.y * H) + f.s * t) % (H + 16) - 8;
    const xx = (((f.x * W) + Math.sin(t * f.f + f.ph) * f.amp) % W + W) % W;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(xx, yy, f.r * (front ? 1.25 : 1), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ============================================================
   播放控制
   ============================================================ */
let lastSeekTouch = 0;
seek.addEventListener('input', () => {
  lastSeekTouch = performance.now();
  music.currentTime = Number(seek.value) || 0;
});
playBtn.addEventListener('click', () => {
  if (music.paused) {
    if (music.ended || music.currentTime >= DUR - 0.05) music.currentTime = 0; // 重播从零开始
    music.play();
  } else {
    music.pause();
  }
});

let btnState = '';
function syncUI() {
  const atEnd = music.currentTime >= DUR - 0.05;
  const st = music.paused ? (atEnd ? 'replay' : 'play') : 'playing';
  if (st !== btnState) {
    btnState = st;
    playBtn.textContent = st === 'playing' ? '暂停' : st === 'replay' ? '重播' : '播放';
  }
  if (performance.now() - lastSeekTouch > 300) seek.value = music.currentTime;
  timeOut.textContent = `${music.currentTime.toFixed(1)} / ${DUR.toFixed(1)} s`;
}

/* 主循环：始终渲染 music.currentTime —— 暂停即定格，拖动即重绘 */
function frame() {
  syncUI();
  render(music.currentTime);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
