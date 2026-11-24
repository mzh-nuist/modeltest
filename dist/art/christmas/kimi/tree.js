'use strict';

/* =====================================================================
 * 圣诞树的十九秒 —— 由 music.wav 的时间轴驱动的 Canvas 贺卡
 *
 * 时间轴设计（全部来自 cue-sheet.json，内联以便 file:// 下也可用）：
 *  - beats   重拍：整棵树“呼吸式”压缩弹跳 + 灯串亮度波浪
 *  - accents 强拍：树顶星闪光 + 扩散光环 + 更大弹跳
 *  - bells   高音铃声：每声铃点亮一个特定装饰球（带光晕）和一颗灯珠
 *  - sections 段落：
 *      opening 0–8.4    冷色夜空，树枝逐层“点亮”（铺陈感）
 *      faster 8.4–17.35 色彩更暖更饱和，树开始摇摆，雪加速，灯更活跃
 *      ending 17.35–19  氛围转金色，雪变慢，灯光收束成暖余晖
 *
 * 每一帧都是 t = music.currentTime 的纯函数：
 * 暂停即定格，拖动进度条立即画出对应时刻，重播从零开始。
 * t = 0（静音未播）时是一幅完整构图的静态贺卡。
 * ===================================================================== */

const CUE = {
  duration: 19,
  beats: [0.4, 1.06, 1.72, 2.38, 3.04, 3.7, 4.36, 5.02, 5.68, 6.34, 7.0, 7.66,
          8.4, 8.88, 9.36, 9.84, 10.32, 10.8, 11.28, 11.76, 12.24, 12.72, 13.2,
          13.68, 14.16, 14.64, 15.12, 15.6, 16.08, 16.56],
  accents: [0.4, 3.04, 5.68, 8.4, 10.32, 12.24, 14.16, 16.08],
  bells: [1.39, 2.71, 4.03, 5.35, 6.67, 7.99, 9.12, 10.08, 11.04, 12.0, 12.96,
          13.92, 14.88, 15.84, 16.8],
  sections: { opening: 0, faster: 8.4, ending: 17.35 }
};

/* ---------- DOM ---------- */
const music = document.querySelector('#music');
const playBtn = document.querySelector('#play');
const seek = document.querySelector('#seek');
const stage = document.querySelector('#stage');

const canvas = document.createElement('canvas');
canvas.setAttribute('aria-hidden', 'true'); // 语义标签在 #stage 上
stage.appendChild(canvas);
const ctx = canvas.getContext('2d');

/* ---------- 画布尺寸（单位制：x∈[0,1]，y∈[0,4/3]，均以宽度为 1） ---------- */
const ASPECT = 4 / 3;
let W = 0, H = 0;

function resize() {
  const cssW = stage.clientWidth || 320;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.max(1, Math.round(cssW * dpr));
  H = Math.max(1, Math.round(cssW * ASPECT * dpr));
  canvas.width = W;
  canvas.height = H;
  canvas.style.height = (cssW * ASPECT) + 'px';
}
if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
window.addEventListener('resize', resize);
resize();

/* ---------- 小工具 ---------- */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, p) => a + (b - a) * p;
const smoothstep = (a, b, v) => { const p = clamp((v - a) / (b - a), 0, 1); return p * p * (3 - 2 * p); };
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const mixc = (c1, c2, p) => [lerp(c1[0], c2[0], p), lerp(c1[1], c2[1], p), lerp(c1[2], c2[2], p)];
const rgb = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/* 最后一个 <= t 的时刻的下标（二分） */
function lastLE(times, t) {
  let lo = 0, hi = times.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}
/* 最近一次节拍后的指数衰减包络 */
function pulse(times, t, decay) {
  const i = lastLE(times, t);
  if (i < 0) return 0;
  return Math.exp(-(t - times[i]) * decay);
}

/* ---------- 场景几何（单位空间） ---------- */
const GROUND_Y = 1.10;
const TREE = { cx: 0.5, top: 0.18, base: 1.06, half: 0.30 };
const TIERS = 6;
const STAR_POS = { x: TREE.cx, y: TREE.top - 0.015 };

function tierGeom(i) {
  const step = (TREE.base - TREE.top) / TIERS;
  return {
    yTop: TREE.top + i * step * 0.82,
    h: step * 1.9,
    halfW: TREE.half * (0.16 + 0.84 * (i + 0.7) / TIERS)
  };
}
/* opening 段落：第 i 层在开场第 i 个重拍时点亮 */
const tierLightTime = i => CUE.beats[0] + i * 0.66;

/* 装饰球（确定性伪随机分布在中下层枝沿） */
const ORN_COLORS = ['#e84a5f', '#ffb84d', '#4dd0e1', '#c084fc', '#ff7d9c', '#7ee08a'];
const ornaments = [];
for (let i = 1; i < TIERS; i++) {
  const g = tierGeom(i);
  const n = 3 + (i % 2) + Math.floor(i / 2);
  for (let k = 0; k < n; k++) {
    const fx = (k + 0.5 + (hash(i * 31 + k * 7) - 0.5) * 0.5) / n;
    ornaments.push({
      x: TREE.cx + (fx * 2 - 1) * g.halfW * 0.82,
      y: g.yTop + g.h + 0.012 + hash(k * 13 + i * 5) * 0.02,
      r: 0.013 + hash(i * 3 + k * 11) * 0.008,
      color: ORN_COLORS[(i * 2 + k) % ORN_COLORS.length],
      tier: i,
      seed: hash(i * 17 + k * 23)
    });
  }
}
/* 第 b 声铃 → 点亮的装饰球（错开映射，分布均匀） */
const bellToOrnament = b => (b * 7 + 2) % ornaments.length;

/* 灯串：绕树螺旋 */
const LIGHT_COLORS = [[255, 209, 102], [255, 93, 115], [105, 240, 174], [124, 196, 255]];
const NB = 52;
const bulbs = [];
for (let k = 0; k < NB; k++) {
  const v = k / (NB - 1);
  bulbs.push({
    v,
    x: TREE.cx + Math.sin(v * Math.PI * 2 * 3.2 + 0.6) * TREE.half * (0.10 + 0.90 * Math.pow(v, 0.95)) * 0.88,
    y: TREE.top + 0.055 + v * (TREE.base - TREE.top - 0.10),
    tier: Math.min(TIERS - 1, Math.floor(v * TIERS)),
    color: LIGHT_COLORS[k % 4],
    phase: hash(k * 3.7)
  });
}
const bellToBulb = b => (b * 5 + 1) % NB;

/* 星星、雪花（确定性） */
const stars = [];
for (let i = 0; i < 46; i++) {
  stars.push({ x: hash(i * 2.1), y: hash(i * 5.3) * 0.72, r: 0.0015 + hash(i * 9.1) * 0.0026,
               sp: 1 + hash(i * 4.7) * 2.5, ph: hash(i * 8.9) * 6.28 });
}
const flakes = [];
for (let i = 0; i < 70; i++) {
  flakes.push({ x: hash(i * 1.7), y0: hash(i * 6.1), r: 0.0022 + hash(i * 3.3) * 0.0042,
                drift: hash(i * 7.7) * 6.28, spd: 0.55 + hash(i * 2.9) * 0.9 });
}

/* ---------- 段落参数 ---------- */
function sectionParams(t) {
  const faster = smoothstep(CUE.sections.faster, CUE.sections.faster + 0.6, t);
  const ending = smoothstep(CUE.sections.ending, CUE.duration, t);
  return {
    faster,
    ending,
    energy: (0.55 + 0.45 * faster) * (1 - 0.55 * ending), // 动作幅度
    warmth: 0.25 * faster + 0.75 * ending,                 // 色温：冷 → 金
    snowSpeed: (0.030 + 0.034 * faster) * (1 - 0.55 * ending),
    sway: faster * (1 - ending)
  };
}

/* ---------- 各图层绘制（单位空间） ---------- */
function drawSky(t, P) {
  const top = mixc([7, 20, 38], [38, 20, 46], P.warmth);
  const bot = mixc([16, 48, 58], [92, 50, 52], P.warmth);
  const g = ctx.createLinearGradient(0, 0, 0, ASPECT);
  g.addColorStop(0, rgb(top));
  g.addColorStop(1, rgb(bot));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1, ASPECT);

  // 结尾的地平线金色辉光
  if (P.ending > 0.01) {
    const hg = ctx.createRadialGradient(0.5, GROUND_Y + 0.1, 0.02, 0.5, GROUND_Y + 0.1, 0.75);
    hg.addColorStop(0, `rgba(255,190,90,${0.38 * P.ending})`);
    hg.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, 1, ASPECT);
  }

  // 星星
  for (const s of stars) {
    const a = (0.25 + 0.75 * Math.abs(Math.sin(t * s.sp + s.ph))) * (1 - 0.5 * P.warmth);
    ctx.fillStyle = `rgba(235,242,255,${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, 6.2832);
    ctx.fill();
  }

  // 月亮（左上，柔和光晕）
  const mg = ctx.createRadialGradient(0.16, 0.13, 0.01, 0.16, 0.13, 0.16);
  mg.addColorStop(0, 'rgba(240,240,220,0.9)');
  mg.addColorStop(0.28, 'rgba(240,240,220,0.55)');
  mg.addColorStop(1, 'rgba(240,240,220,0)');
  ctx.fillStyle = mg;
  ctx.beginPath(); ctx.arc(0.16, 0.13, 0.16, 0, 6.2832); ctx.fill();
  ctx.fillStyle = '#f2eedd';
  ctx.beginPath(); ctx.arc(0.16, 0.13, 0.045, 0, 6.2832); ctx.fill();
}

function drawGround(t, P) {
  const snow = mixc([216, 230, 242], [242, 230, 214], P.warmth * 0.7);
  ctx.fillStyle = rgb(snow);
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y + 0.03);
  ctx.quadraticCurveTo(0.25, GROUND_Y - 0.035, 0.5, GROUND_Y + 0.005);
  ctx.quadraticCurveTo(0.78, GROUND_Y + 0.05, 1, GROUND_Y - 0.01);
  ctx.lineTo(1, ASPECT);
  ctx.lineTo(0, ASPECT);
  ctx.closePath();
  ctx.fill();

  // 树影
  ctx.fillStyle = 'rgba(10,25,35,0.25)';
  ctx.beginPath();
  ctx.ellipse(TREE.cx, GROUND_Y + 0.035, 0.24, 0.028, 0, 0, 6.2832);
  ctx.fill();
}

function drawPresent(x, y, w, h, box, ribbon, beatP) {
  const b = 1 + 0.05 * beatP;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(b, 1 / b);
  ctx.fillStyle = box;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-w / 2, -h, w, h, 0.008);
  else ctx.rect(-w / 2, -h, w, h);
  ctx.fill();
  ctx.fillStyle = ribbon;
  ctx.fillRect(-w * 0.08, -h, w * 0.16, h);
  ctx.fillRect(-w / 2, -h * 0.62, w, h * 0.2);
  // 蝴蝶结
  ctx.beginPath();
  ctx.ellipse(-w * 0.1, -h - 0.008, w * 0.11, h * 0.22, -0.5, 0, 6.2832);
  ctx.ellipse(w * 0.1, -h - 0.008, w * 0.11, h * 0.22, 0.5, 0, 6.2832);
  ctx.fill();
  ctx.restore();
}

function drawTier(g, lit) {
  const cDark = mixc([11, 34, 32], [14, 74, 48], lit);
  const cLite = mixc([19, 54, 48], [36, 122, 76], lit);
  const grad = ctx.createLinearGradient(0, g.yTop, 0, g.yTop + g.h * 1.25);
  grad.addColorStop(0, rgb(cLite));
  grad.addColorStop(1, rgb(cDark));
  ctx.fillStyle = grad;
  const steps = 7;
  ctx.beginPath();
  ctx.moveTo(TREE.cx, g.yTop);
  ctx.lineTo(TREE.cx - g.halfW, g.yTop + g.h * 0.96);
  for (let s = 0; s < steps; s++) {
    const x0 = TREE.cx - g.halfW + (2 * g.halfW * s) / steps;
    const x1 = TREE.cx - g.halfW + (2 * g.halfW * (s + 1)) / steps;
    ctx.quadraticCurveTo((x0 + x1) / 2, g.yTop + g.h * 1.3, x1, g.yTop + g.h * 0.94);
  }
  ctx.lineTo(TREE.cx, g.yTop);
  ctx.closePath();
  ctx.fill();
}

function drawStar(x, y, r, glow) {
  const gg = ctx.createRadialGradient(x, y, r * 0.1, x, y, r * (3 + 2 * glow));
  gg.addColorStop(0, `rgba(255,230,150,${0.55 + 0.4 * glow})`);
  gg.addColorStop(1, 'rgba(255,230,150,0)');
  ctx.fillStyle = gg;
  ctx.beginPath(); ctx.arc(x, y, r * (3 + 2 * glow), 0, 6.2832); ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.42;
    const px = x + Math.cos(ang) * rr, py = y + Math.sin(ang) * rr;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  const sg = ctx.createLinearGradient(x, y - r, x, y + r);
  sg.addColorStop(0, '#fff3c4');
  sg.addColorStop(1, '#f5b942');
  ctx.fillStyle = sg;
  ctx.fill();
}

/* ---------- 主渲染：t 的纯函数 ---------- */
function render(t) {
  const P = sectionParams(t);
  const beatP = pulse(CUE.beats, t, 4.2) * P.energy;       // 重拍：整树动作
  const accentP = pulse(CUE.accents, t, 3.0);              // 强拍：树顶星
  const dimEnd = 1 - 0.35 * P.ending;                      // 结尾灯光收束

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.setTransform(W, 0, 0, W, 0, 0); // 单位空间

  drawSky(t, P);
  drawGround(t, P);
  drawPresent(0.30, GROUND_Y + 0.02, 0.10, 0.075, '#b23446', '#ffd166', beatP);
  drawPresent(0.685, GROUND_Y + 0.03, 0.085, 0.06, '#2a7f8f', '#ffe9b8', beatP);

  /* --- 整棵树：重拍压缩弹跳 + 中段摇摆 --- */
  const sy = 1 - 0.05 * beatP;
  const sx = 1 + 0.032 * beatP;
  const rot = 0.014 * Math.sin(t * 3.4) * P.sway;
  ctx.save();
  ctx.translate(TREE.cx, GROUND_Y);
  ctx.rotate(rot);
  ctx.scale(sx, sy);
  ctx.translate(-TREE.cx, -GROUND_Y);

  // 树干
  ctx.fillStyle = '#5a3b28';
  ctx.fillRect(TREE.cx - 0.026, TREE.base - 0.02, 0.052, GROUND_Y - TREE.base + 0.045);

  // 枝叶（opening 逐层点亮）
  const tierLit = [];
  for (let i = TIERS - 1; i >= 0; i--) {
    // 0.35 的亮度地板：t=0 未播放时树已完整可见，重拍到来时再逐层增亮
    const lit = 0.35 + 0.65 * smoothstep(tierLightTime(i), tierLightTime(i) + 0.3, t);
    tierLit[i] = lit;
    drawTier(tierGeom(i), 0.3 + 0.7 * lit);
  }

  // 灯串：亮度 = 该层点亮程度 × (基础 + 重拍波浪 + 中段闪烁)，铃声令一颗灯珠闪白
  for (let k = 0; k < NB; k++) {
    const b = bulbs[k];
    const lit = tierLit[b.tier];
    const wave = 0.5 + 0.5 * Math.sin(b.v * 7 - t * (4 + 5 * P.faster));
    let bright = (0.30 + 0.45 * beatP * (0.5 + 0.5 * wave) + 0.25 * P.faster * wave) * dimEnd;
    let col = b.color, rad = 0.011;
    for (let bl = 0; bl < CUE.bells.length; bl++) {
      if (bellToBulb(bl) === k) {
        const f = Math.exp(-Math.max(0, t - CUE.bells[bl]) * 7) * (t >= CUE.bells[bl] ? 1 : 0);
        if (f > 0.02) { bright = Math.min(1.6, bright + f * 1.2); col = [255, 255, 255]; rad += 0.006 * f; }
      }
    }
    const a = clamp((0.18 + 0.82 * bright) * (0.15 + 0.85 * lit), 0, 1);
    const glowR = rad * (2.5 + 3 * bright);
    const gg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, glowR);
    gg.addColorStop(0, rgba(col, 0.85 * a));
    gg.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(b.x, b.y, glowR, 0, 6.2832); ctx.fill();
    ctx.fillStyle = rgba(mixc(col, [255, 255, 255], 0.45), a);
    ctx.beginPath(); ctx.arc(b.x, b.y, rad * 0.62, 0, 6.2832); ctx.fill();
  }

  // 装饰球：随重拍微闪；对应铃声响起时大放光芒
  for (let oi = 0; oi < ornaments.length; oi++) {
    const o = ornaments[oi];
    const lit = tierLit[o.tier];
    let flash = 0;
    for (let bl = 0; bl < CUE.bells.length; bl++) {
      if (bellToOrnament(bl) === oi && t >= CUE.bells[bl]) {
        flash = Math.max(flash, Math.exp(-(t - CUE.bells[bl]) * 6));
      }
    }
    const tw = 0.5 + 0.5 * Math.sin(t * 2 + o.seed * 12);
    const bodyA = (0.45 + 0.55 * lit) * (1 - 0.2 * P.ending);
    if (flash > 0.02) {
      const fr = o.r * (5 + 7 * flash);
      const fg = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, fr);
      fg.addColorStop(0, `rgba(255,255,240,${0.85 * flash})`);
      fg.addColorStop(1, 'rgba(255,255,240,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(o.x, o.y, fr, 0, 6.2832); ctx.fill();
    }
    const og = ctx.createRadialGradient(o.x - o.r * 0.35, o.y - o.r * 0.4, o.r * 0.1, o.x, o.y, o.r);
    og.addColorStop(0, rgba([255, 255, 255], bodyA * (0.7 + 0.3 * tw + flash)));
    og.addColorStop(0.35, o.color);
    og.addColorStop(1, 'rgba(30,20,30,0.9)');
    ctx.globalAlpha = clamp(bodyA + flash, 0, 1);
    ctx.fillStyle = og;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r * (1 + 0.5 * flash + 0.08 * beatP), 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
    // 球顶挂扣
    ctx.fillStyle = '#d9c49a';
    ctx.fillRect(o.x - o.r * 0.18, o.y - o.r * 1.28, o.r * 0.36, o.r * 0.34);
  }
  ctx.restore();

  /* --- 树顶星：强拍脉冲发光（不随树压缩，保持在顶点） --- */
  const starR = 0.046 * (1 + 0.35 * accentP + 0.15 * P.ending);
  drawStar(STAR_POS.x, STAR_POS.y, starR, clamp(accentP + 0.4 * P.ending, 0, 1.4));

  // 强拍扩散光环
  const ai = lastLE(CUE.accents, t);
  if (ai >= 0) {
    const dt = t - CUE.accents[ai];
    if (dt < 0.9) {
      const p = dt / 0.9;
      ctx.strokeStyle = `rgba(255,225,150,${(0.55 * (1 - p)).toFixed(3)})`;
      ctx.lineWidth = 0.004 * (1 - p * 0.5);
      ctx.beginPath();
      ctx.arc(STAR_POS.x, STAR_POS.y, 0.05 + p * 0.45, 0, 6.2832);
      ctx.stroke();
    }
  }

  /* --- 雪花（速度随段落变化） --- */
  for (const f of flakes) {
    const y = ((f.y0 + t * P.snowSpeed * f.spd) % 1.25) * 1.05;
    const x = (f.x + 0.03 * Math.sin(t * 1.3 + f.drift) + 1) % 1;
    ctx.fillStyle = `rgba(240,246,255,${0.35 + 0.45 * hash(f.drift)})`;
    ctx.beginPath(); ctx.arc(x, y, f.r, 0, 6.2832); ctx.fill();
  }

  /* --- 像素空间：祝福语 + 暗角 --- */
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const glow = 0.35 + 0.65 * Math.max(P.ending, 0.55 * accentP);
  ctx.font = `700 ${Math.round(W * 0.052)}px Georgia, "Songti SC", "STSong", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = `rgba(255,205,110,${glow})`;
  ctx.shadowBlur = W * 0.03 * glow;
  ctx.fillStyle = '#ffe9b8';
  ctx.fillText('圣诞快乐 · Merry Christmas', W / 2, W * 1.235);
  ctx.shadowBlur = 0;

  const vg = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.5, H * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,10,0.34)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

/* ---------- 播放控制 ---------- */
function setPlayUI() {
  const playing = !music.paused && !music.ended;
  playBtn.textContent = playing ? '暂停' : (music.ended ? '重播' : '播放');
  playBtn.setAttribute('aria-pressed', String(playing));
}

playBtn.addEventListener('click', () => {
  if (music.paused || music.ended) {
    if (music.ended || music.currentTime >= CUE.duration - 0.05) music.currentTime = 0; // 重播从零
    music.play();
  } else {
    music.pause(); // 暂停：rAF 继续以 currentTime 渲染 → 定格在当前画面
  }
});

seek.addEventListener('input', () => {
  music.currentTime = Number(seek.value); // 拖动：下一帧即以新时间渲染
});

music.addEventListener('play', setPlayUI);
music.addEventListener('pause', setPlayUI);
music.addEventListener('ended', setPlayUI);
music.addEventListener('loadedmetadata', () => { seek.max = music.duration || CUE.duration; });

/* ---------- 主循环：永远渲染 music.currentTime 对应的画面 ---------- */
function frame() {
  const t = clamp(music.currentTime, 0, CUE.duration);
  if (!music.paused && document.activeElement !== seek) seek.value = t;
  render(t);
  requestAnimationFrame(frame);
}
render(0); // 未播放时的完整静态构图
requestAnimationFrame(frame);
