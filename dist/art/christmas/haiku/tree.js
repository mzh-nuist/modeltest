// 制作时间表（与 cue-sheet.json 一致；内联以便 file:// 直接打开时也能用）
const CUE = {
  duration: 19,
  beats: [0.4, 1.06, 1.72, 2.38, 3.04, 3.7, 4.36, 5.02, 5.68, 6.34, 7.0, 7.66, 8.4, 8.88, 9.36, 9.84, 10.32, 10.8, 11.28, 11.76, 12.24, 12.72, 13.2, 13.68, 14.16, 14.64, 15.12, 15.6, 16.08, 16.56],
  accents: [0.4, 3.04, 5.68, 8.4, 10.32, 12.24, 14.16, 16.08],
  bells: [1.39, 2.71, 4.03, 5.35, 6.67, 7.99, 9.12, 10.08, 11.04, 12.0, 12.96, 13.92, 14.88, 15.84, 16.8],
  sections: { opening: 0, faster: 8.4, ending: 17.35 }
};

const music = document.querySelector('#music');
const play = document.querySelector('#play');
const seek = document.querySelector('#seek');
const stage = document.querySelector('#stage');
const timeEl = document.querySelector('#time');

const canvas = document.createElement('canvas');
canvas.setAttribute('role', 'img');
canvas.setAttribute('aria-label', '一棵随音乐闪烁的圣诞树');
stage.appendChild(canvas);
const ctx = canvas.getContext('2d');
let W = 1, H = 1, DPR = 1;

function resize() {
  const r = stage.getBoundingClientRect();
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.max(1, r.width);
  H = Math.max(1, r.height);
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  render(music.currentTime || 0);
}
window.addEventListener('resize', resize);

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const easeOut = x => 1 - Math.pow(1 - clamp(x), 3);
const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---- 几何与装饰 ----
function geom() {
  const h = Math.min(H * 0.6, W * 0.78);
  const baseY = H * 0.78;
  return { h, cx: W / 2, baseY, apex: baseY - h };
}

// 三层以上的叠层三角：第 0 层最下，第 3 层最上
function tierBox(g, i) {
  const yb = g.baseY - g.h * 0.2 * i;
  return { yb, yt: yb - g.h * 0.4, hw: g.h * (0.36 - 0.06 * i) };
}

// 36 盏彩灯，位置与点亮时刻由确定性随机数生成
const LIGHT_COLORS = ['#ff4d5a', '#ffd166', '#4cc9f0', '#ffffff', '#ff8fab', '#b8f2e6'];
const LIGHTS = [];
for (let k = 0; k < 36; k++) {
  LIGHTS.push({
    tier: Math.floor(rnd(k * 3 + 1) * 4),
    u: (rnd(k * 3 + 2) * 2 - 1) * 0.8,
    v: 0.12 + rnd(k * 3 + 3) * 0.78,
    color: LIGHT_COLORS[k % LIGHT_COLORS.length],
    on: 0.5 + rnd(k * 5 + 7) * 7.5 // 开头阶段逐个点亮的时刻（秒）
  });
}

function lightXY(g, L) {
  const b = tierBox(g, L.tier);
  const y = b.yt + L.v * (b.yb - b.yt);
  const half = b.hw * (y - b.yt) / (b.yb - b.yt);
  return { x: g.cx + L.u * half * 0.85, y };
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${clamp(a)})`;
}

function drawBase(g) {
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.ellipse(g.cx, g.baseY + g.h * 0.14, g.h * 0.72, g.h * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5b3a29';
  ctx.fillRect(g.cx - g.h * 0.05, g.baseY - g.h * 0.02, g.h * 0.1, g.h * 0.16);
}

function drawGifts(g) {
  const y = g.baseY + g.h * 0.14;
  const boxes = [[-0.56, 0.16, 0.12, '#d6336c'], [-0.38, 0.11, 0.08, '#ffd166'], [0.5, 0.18, 0.13, '#4cc9f0']];
  for (const [dx, wd, ht, col] of boxes) {
    const w = wd * g.h, hh = ht * g.h, x = g.cx + dx * g.h - w / 2;
    ctx.fillStyle = col;
    ctx.fillRect(x, y - hh, w, hh);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x + w / 2 - w * 0.04, y - hh, w * 0.08, hh);
    ctx.fillRect(x, y - hh * 0.62, w, hh * 0.08);
  }
}

function drawTiers(g) {
  for (let i = 3; i >= 0; i--) {
    const b = tierBox(g, i);
    const grad = ctx.createLinearGradient(0, b.yt, 0, b.yb);
    grad.addColorStop(0, '#3bb273');
    grad.addColorStop(1, '#0e5536');
    ctx.beginPath();
    ctx.moveTo(g.cx, b.yt);
    ctx.lineTo(g.cx + b.hw, b.yb);
    ctx.quadraticCurveTo(g.cx, b.yb + g.h * 0.1, g.cx - b.hw, b.yb);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,255,210,0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawGarland(g, lit) {
  ctx.beginPath();
  for (let s = 0; s <= 1.0001; s += 0.01) {
    const y = g.apex + g.h * 0.04 + s * g.h * 0.94;
    const env = 0.36 * (y - g.apex) * 0.88;
    const x = g.cx + Math.sin(s * Math.PI * 6) * env;
    if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = `rgba(255,217,137,${0.5 + 0.35 * lit})`;
  ctx.lineWidth = Math.max(1.5, g.h * 0.008);
  ctx.stroke();
}

function drawLight(x, y, r, color, glow) {
  if (glow > 0.02) {
    const R = r * (3 + 4 * glow);
    const gr = ctx.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, hexA(color, 0.85 * glow));
    gr.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = hexA(color, 0.35 + 0.65 * glow);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawStar(x, y, R, glow) {
  const gr = ctx.createRadialGradient(x, y, 0, x, y, R * (2 + 3 * glow));
  gr.addColorStop(0, `rgba(255,217,137,${0.5 * glow + 0.2})`);
  gr.addColorStop(1, 'rgba(255,217,137,0)');
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.arc(x, y, R * (2 + 3 * glow), 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? R * 0.45 : R;
    const a = -Math.PI / 2 + k * Math.PI / 5;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffd989';
  ctx.fill();
}

// 雪花：位置只由音乐时间 t 决定；后半段（快板）下落加快
function drawSnow(t) {
  const phase = 0.035 * t + 0.05 * Math.max(0, Math.min(t, CUE.sections.ending) - CUE.sections.faster);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 70; i++) {
    const x = rnd(i * 2 + 1) * W;
    const y = ((rnd(i * 2 + 2) + phase * (0.6 + rnd(i) * 0.8)) % 1) * H;
    ctx.globalAlpha = 0.3 + 0.5 * rnd(i + 300);
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + rnd(i + 900) * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---- 时间轴状态：所有量都是音乐时间 t 的纯函数 ----
function beatState(t) {
  let bi = -1;
  for (let i = 0; i < CUE.beats.length; i++) { if (CUE.beats[i] <= t) bi = i; else break; }
  if (bi < 0) return { bi, pulse: 0, x: 0, dir: 0 };
  const bt = CUE.beats[bi];
  const interval = (CUE.beats[bi + 1] ?? bt + 0.5) - bt;
  const dt = t - bt;
  return { bi, pulse: Math.exp(-dt * 6), x: clamp(dt / interval), dir: bi % 2 ? 1 : -1 };
}

function accentPulse(t) {
  let ad = Infinity;
  for (const a of CUE.accents) if (a <= t) ad = Math.min(ad, t - a);
  return isFinite(ad) ? Math.exp(-ad * 3.5) : 0;
}

function sectionIndex(t) {
  return t < CUE.sections.faster ? 0 : t < CUE.sections.ending ? 1 : 2;
}

function drawSparkle(x, y, a, color, h) {
  ctx.strokeStyle = hexA(color, a * 0.9);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let r = 0; r < 4; r++) {
    const ang = r * Math.PI / 2 + 0.4;
    const len = h * 0.03 * (0.5 + a);
    ctx.moveTo(x + Math.cos(ang) * len * 0.3, y + Math.sin(ang) * len * 0.3);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
  }
  ctx.stroke();
}

function render(rawT) {
  const t = clamp(rawT, 0, CUE.duration);
  const g = geom();
  const bs = beatState(t);
  const acc = accentPulse(t);
  const sec = sectionIndex(t);
  const amp = [0.035, 0.065, 0.02][sec];
  const settle = t >= CUE.sections.ending ? 1 - clamp((t - CUE.sections.ending) / 1.65) : 1;
  const sway = bs.bi >= 0 ? bs.dir * amp * Math.sin(Math.PI * bs.x) * settle : 0;
  const grow = t < 4.5 ? 0.92 + 0.08 * easeOut(t / 4.5) : 1;

  // 段落切换的光环：在 8.4s 与 17.35s 从星顶向外扩散
  let sp = 0;
  for (const s of [CUE.sections.faster, CUE.sections.ending]) if (t >= s) sp = Math.max(sp, Math.exp(-(t - s) * 2.5));

  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createRadialGradient(g.cx, g.apex + g.h * 0.4, 0, g.cx, g.apex + g.h * 0.4, Math.max(W, H) * 0.7);
  bg.addColorStop(0, `rgba(70,130,130,${0.22 + 0.12 * acc + 0.25 * sp})`);
  bg.addColorStop(1, 'rgba(19,37,44,0)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  if (sp > 0.02) {
    ctx.strokeStyle = `rgba(255,217,137,${0.6 * sp})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(g.cx, g.apex, (1 - sp) * Math.max(W, H) * 0.6, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawSnow(t);

  // 整棵树：随重拍呼吸，随强拍跳动，按段落摆动
  const scale = grow * (1 + 0.012 * bs.pulse + 0.02 * acc);
  ctx.save();
  ctx.translate(g.cx, g.baseY);
  ctx.rotate(sway);
  ctx.scale(scale, scale);
  ctx.translate(-g.cx, -g.baseY);

  drawBase(g);
  drawTiers(g);
  drawGarland(g, bs.pulse);

  // 灯饰：开头逐个点亮；每拍一半灯闪烁；高音铃声点亮对应的一盏并迸出闪光
  const flashes = new Array(LIGHTS.length).fill(0);
  for (let j = 0; j < CUE.bells.length; j++) {
    const bt = CUE.bells[j];
    if (t >= bt) {
      const L = (j * 11 + 3) % LIGHTS.length;
      flashes[L] = Math.max(flashes[L], Math.exp(-(t - bt) * 4.5));
    }
  }
  const h = g.h;
  for (let k = 0; k < LIGHTS.length; k++) {
    const L = LIGHTS[k];
    const lit = clamp((t - L.on) / 0.5);
    const twinkle = bs.pulse * (((k + bs.bi) & 1) ? 0.35 : 1);
    const glow = lit * (0.2 + 0.35 * twinkle + 0.2 * acc) + flashes[k] * 0.9;
    const p = lightXY(g, L);
    drawLight(p.x, p.y, Math.max(2, h * 0.011), L.color, Math.min(1, glow));
    if (flashes[k] > 0.15) drawSparkle(p.x, p.y, flashes[k], L.color, h);
  }

  drawStar(g.cx, g.apex - h * 0.03, h * 0.055, 0.4 + 0.3 * bs.pulse + 0.3 * acc + 0.5 * clamp((t - CUE.sections.ending) / 1.65));
  drawGifts(g);
  ctx.restore();
}

// ---- 播放控制 ----
let raf = 0;
let scrubTo = null; // 拖动中：以滑块位置为准，直到 seeked 完成

function syncUI(t) {
  seek.value = t;
  seek.setAttribute('aria-valuetext', `${t.toFixed(2)} 秒`);
  timeEl.textContent = `${t.toFixed(2)} / ${CUE.duration.toFixed(2)}`;
}

function frame() {
  const t = scrubTo ?? music.currentTime;
  render(t);
  syncUI(t);
  raf = music.paused ? 0 : requestAnimationFrame(frame);
}

music.addEventListener('play', () => {
  play.textContent = '暂停';
  if (!raf) raf = requestAnimationFrame(frame);
});
music.addEventListener('pause', () => {
  play.textContent = '播放';
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  frame();
});
music.addEventListener('ended', () => {
  play.textContent = '重播';
  scrubTo = null;
  render(CUE.duration);
  syncUI(CUE.duration);
});
music.addEventListener('seeked', () => { scrubTo = null; });

play.addEventListener('click', () => {
  if (music.ended) music.currentTime = 0; // 重播从零开始
  if (music.paused) music.play().catch(() => {});
  else music.pause();
});

seek.addEventListener('input', () => {
  const t = clamp(Number(seek.value), 0, CUE.duration);
  scrubTo = t;
  music.currentTime = t;
  render(t);
  syncUI(t);
});

resize();
syncUI(0);
