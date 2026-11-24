const music = document.querySelector('#music');
const play = document.querySelector('#play');
const seek = document.querySelector('#seek');
const stage = document.querySelector('#stage');
const timeEl = document.querySelector('#time');
const secEl = document.querySelector('#section');

// cue-sheet.json 的内嵌副本（file:// 下 fetch 不可靠）；加载成功后会用真实文件覆盖
let CUE = {
  duration: 19,
  beats: [0.4,1.06,1.72,2.38,3.04,3.7,4.36,5.02,5.68,6.34,7.0,7.66,8.4,8.88,9.36,9.84,10.32,10.8,11.28,11.76,12.24,12.72,13.2,13.68,14.16,14.64,15.12,15.6,16.08,16.56],
  accents: [0.4,3.04,5.68,8.4,10.32,12.24,14.16,16.08],
  bells: [1.39,2.71,4.03,5.35,6.67,7.99,9.12,10.08,11.04,12.0,12.96,13.92,14.88,15.84,16.8],
  sections: { opening: 0, faster: 8.4, ending: 17.35 }
};
try { fetch('data:application/json,%7B%0A%20%20%22duration%22%3A%2019%2C%0A%20%20%22beats%22%3A%20%5B%0A%20%20%20%200.4%2C%0A%20%20%20%201.06%2C%0A%20%20%20%201.72%2C%0A%20%20%20%202.38%2C%0A%20%20%20%203.04%2C%0A%20%20%20%203.7%2C%0A%20%20%20%204.36%2C%0A%20%20%20%205.02%2C%0A%20%20%20%205.68%2C%0A%20%20%20%206.34%2C%0A%20%20%20%207.0%2C%0A%20%20%20%207.66%2C%0A%20%20%20%208.4%2C%0A%20%20%20%208.88%2C%0A%20%20%20%209.36%2C%0A%20%20%20%209.84%2C%0A%20%20%20%2010.32%2C%0A%20%20%20%2010.8%2C%0A%20%20%20%2011.28%2C%0A%20%20%20%2011.76%2C%0A%20%20%20%2012.24%2C%0A%20%20%20%2012.72%2C%0A%20%20%20%2013.2%2C%0A%20%20%20%2013.68%2C%0A%20%20%20%2014.16%2C%0A%20%20%20%2014.64%2C%0A%20%20%20%2015.12%2C%0A%20%20%20%2015.6%2C%0A%20%20%20%2016.08%2C%0A%20%20%20%2016.56%0A%20%20%5D%2C%0A%20%20%22accents%22%3A%20%5B%0A%20%20%20%200.4%2C%0A%20%20%20%203.04%2C%0A%20%20%20%205.68%2C%0A%20%20%20%208.4%2C%0A%20%20%20%2010.32%2C%0A%20%20%20%2012.24%2C%0A%20%20%20%2014.16%2C%0A%20%20%20%2016.08%0A%20%20%5D%2C%0A%20%20%22bells%22%3A%20%5B%0A%20%20%20%201.39%2C%0A%20%20%20%202.71%2C%0A%20%20%20%204.03%2C%0A%20%20%20%205.35%2C%0A%20%20%20%206.67%2C%0A%20%20%20%207.99%2C%0A%20%20%20%209.12%2C%0A%20%20%20%2010.08%2C%0A%20%20%20%2011.04%2C%0A%20%20%20%2012.0%2C%0A%20%20%20%2012.96%2C%0A%20%20%20%2013.92%2C%0A%20%20%20%2014.88%2C%0A%20%20%20%2015.84%2C%0A%20%20%20%2016.8%0A%20%20%5D%2C%0A%20%20%22sections%22%3A%20%7B%0A%20%20%20%20%22opening%22%3A%200%2C%0A%20%20%20%20%22faster%22%3A%208.4%2C%0A%20%20%20%20%22ending%22%3A%2017.35%0A%20%20%7D%0A%7D%0A').then(r => r.json()).then(j => { if (j && j.beats) { CUE = j; draw(curTime()); } }).catch(() => {}); } catch (e) {}

const canvas = document.createElement('canvas');
stage.appendChild(canvas);
const ctx = canvas.getContext('2d');
const VW = 100, VH = 130;           // 逻辑坐标
const CX = 50, BASE = 112;           // 树干中心与树根

// 工具
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = k => k * k * (3 - 2 * k);
const frac = x => x - Math.floor(x);
function hash(n) { return frac(Math.sin(n * 127.1 + 311.7) * 43758.5453); }
function lastIdx(arr, t) { let lo = -1; for (let i = 0; i < arr.length; i++) { if (arr[i] <= t) lo = i; else break; } return lo; }
// 距离上一个事件的时间，没有则 Infinity
function since(arr, t) { const i = lastIdx(arr, t); return i < 0 ? Infinity : t - arr[i]; }
function until(arr, t) { const i = lastIdx(arr, t); return i + 1 < arr.length ? arr[i + 1] - t : Infinity; }

// 铃声对应的 15 颗彩球位置（dx 相对树中心，y）
const BALLS = [[-18,98],[16,90],[-8,76],[20,72],[-13,64],[9,58],[-10,50],[10,44],
  [-22,102],[24,100],[0,86],[-14,82],[-4,36],[3,30],[0,26]];
const BALL_COL = ['#ff4d5e','#ffd24a','#5ec8ff','#ff9ad5','#7dff9a','#ff8a3d','#b79cff','#ff4d5e',
  '#ffd24a','#5ec8ff','#ff9ad5','#7dff9a','#ff8a3d','#b79cff','#fff2b0'];
const TIERS = [{ top: 22, bot: 56, w: 22 }, { top: 40, bot: 80, w: 31 }, { top: 60, bot: 106, w: 41 }];

// 灯串：沿三层树面的弧线
const BULBS = [];
TIERS.forEach((T, ti) => {
  const n = [9, 12, 15][ti];
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n;
    const yy = T.top + (T.bot - T.top) * (0.72 + 0.0) ;
    const hw = T.w * (yy - T.top) / (T.bot - T.top) * 0.92;
    const x = CX - hw + 2 * hw * u;
    const y = yy + Math.sin(u * Math.PI) * 5 - 2;
    BULBS.push({ x, y, ti, k, order: BULBS.length });
  }
});
const BULB_COL = ['#fff0b8', '#ff6b6b', '#7fd8ff', '#9dff9d'];

// ---------- 时间轴派生量 ----------
function sectionInfo(t) {
  const S = CUE.sections;
  if (t >= S.ending) return { id: 2, name: '尾声 · 星光收束，圣诞快乐', t0: S.ending };
  if (t >= S.faster) return { id: 1, name: '加速段 · 重拍摇树，铃声点灯', t0: S.faster };
  return { id: 0, name: '序曲 · 灯一盏一盏亮起', t0: 0 };
}
// 0→1 在某个分界点附近平滑过渡
function stepAt(t, t0, dur = 0.7) { return smooth(clamp((t - t0) / dur)); }

const BG = [
  { top: [10, 24, 31], bot: [26, 56, 66] },
  { top: [28, 18, 66], bot: [78, 36, 104] },
  { top: [38, 16, 34], bot: [128, 66, 56] }
];
function mixRGB(a, b, k) { return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; }
const rgb = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
function bgColors(t) {
  const S = CUE.sections;
  const k1 = stepAt(t, S.faster - 0.1, 0.8), k2 = stepAt(t, S.ending - 0.1, 0.9);
  const top = mixRGB(mixRGB(BG[0].top, BG[1].top, k1), BG[2].top, k2);
  const bot = mixRGB(mixRGB(BG[0].bot, BG[1].bot, k1), BG[2].bot, k2);
  return [top, bot];
}

// 雪的累积位移：开场慢，加速段快，尾声缓
function snowDist(t) {
  const S = CUE.sections;
  return 5 * Math.min(t, S.faster) + 14 * clamp(t - S.faster, 0, S.ending - S.faster) + 4 * Math.max(0, t - S.ending);
}

function drawBackground(t, pulse) {
  const [top, bot] = bgColors(t);
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, rgb(top)); g.addColorStop(1, rgb(bot));
  ctx.fillStyle = g; ctx.fillRect(-400, -400, 900, 900);

  // 远处星点（随重拍轻微闪动）
  for (let i = 0; i < 46; i++) {
    const x = hash(i + 1) * 240 - 70, y = hash(i + 91) * 80 - 10;
    const tw = 0.45 + 0.55 * Math.sin(t * (1 + hash(i) * 2) + i * 3) ** 2;
    ctx.globalAlpha = (0.25 + 0.5 * tw) * (1 + 0.5 * pulse > 1 ? 1 : 1 + 0.5 * pulse);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, 0.5 + hash(i + 7) * 0.6, 0.5 + hash(i + 7) * 0.6);
  }
  ctx.globalAlpha = 1;

  // 远山
  ctx.fillStyle = 'rgba(255,255,255,.07)';
  ctx.beginPath(); ctx.moveTo(-400, 116); ctx.lineTo(-20, 112);
  ctx.bezierCurveTo(10, 86, 24, 96, 40, 104);
  ctx.bezierCurveTo(60, 90, 84, 88, 120, 112); ctx.lineTo(500, 116); ctx.closePath(); ctx.fill();
}

function drawSnow(t) {
  const D = snowDist(t);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 80; i++) {
    const sp = 0.6 + hash(i + 3) * 0.8;
    const y = frac((hash(i + 11) * VH + D * sp) / (VH + 10)) * (VH + 10) - 5;
    const x = hash(i + 31) * 240 - 70 + Math.sin(D * 0.12 * sp + i) * 2.2;
    const r = 0.25 + hash(i + 51) * 0.55;
    ctx.globalAlpha = 0.35 + hash(i + 71) * 0.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawGround(t) {
  const g = ctx.createLinearGradient(0, 108, 0, VH);
  g.addColorStop(0, '#f4f8ff'); g.addColorStop(1, '#b9c9e0');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(-400, 116);
  ctx.lineTo(-20, 116);
  ctx.bezierCurveTo(10, 108, 30, 112, 50, 111);
  ctx.bezierCurveTo(70, 110, 90, 107, 120, 115);
  ctx.lineTo(500, 115); ctx.lineTo(500, 400); ctx.lineTo(-400, 400); ctx.closePath(); ctx.fill();
}

// ---------- 树身 ----------
function tierPath(T, grow) {
  const hw = T.w * grow, cx = CX;
  ctx.beginPath();
  ctx.moveTo(cx, T.top);
  ctx.quadraticCurveTo(cx - hw * 0.35, T.top + (T.bot - T.top) * 0.55, cx - hw, T.bot);
  const n = 4, step = hw * 2 / n;
  for (let i = 0; i < n; i++) {
    const x0 = cx - hw + i * step;
    ctx.quadraticCurveTo(x0 + step / 2, T.bot + 4.5, x0 + step, T.bot);
  }
  ctx.quadraticCurveTo(cx + hw * 0.35, T.top + (T.bot - T.top) * 0.55, cx, T.top);
  ctx.closePath();
}

function drawTrunk() {
  const g = ctx.createLinearGradient(CX - 5, 0, CX + 5, 0);
  g.addColorStop(0, '#4a2a16'); g.addColorStop(0.5, '#7a4824'); g.addColorStop(1, '#3d2210');
  ctx.fillStyle = g;
  ctx.fillRect(CX - 5, 100, 10, 14);
}

function drawTiers(t, glow) {
  for (let i = 2; i >= 0; i--) {
    const T = TIERS[i];
    const g = ctx.createLinearGradient(CX - T.w, 0, CX + T.w, 0);
    g.addColorStop(0, '#0d4a2c'); g.addColorStop(0.45, '#1f8a4c'); g.addColorStop(0.62, '#2aa65e'); g.addColorStop(1, '#0a3a24');
    tierPath(T, 1);
    ctx.fillStyle = g; ctx.fill();
    // 针叶纹理
    ctx.save(); tierPath(T, 1); ctx.clip();
    ctx.strokeStyle = 'rgba(0,40,20,.35)'; ctx.lineWidth = 0.5;
    for (let k = 0; k < 9; k++) {
      const yy = T.top + (T.bot - T.top) * (k + 1) / 10;
      const hw = T.w * (yy - T.top) / (T.bot - T.top);
      ctx.beginPath(); ctx.moveTo(CX - hw, yy + 2); ctx.quadraticCurveTo(CX, yy - 3, CX + hw, yy + 2); ctx.stroke();
    }
    // 暖光从灯串渗入树面
    const rg = ctx.createRadialGradient(CX, (T.top + T.bot) / 2, 2, CX, (T.top + T.bot) / 2, T.w * 1.1);
    rg.addColorStop(0, `rgba(255,220,130,${0.28 * glow})`); rg.addColorStop(1, 'rgba(255,220,130,0)');
    ctx.fillStyle = rg; ctx.fillRect(CX - T.w, T.top, T.w * 2, T.bot - T.top + 6);
    ctx.restore();
    // 积雪边
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    ctx.beginPath();
    const hw = T.w, n = 4, step = hw * 2 / n;
    ctx.moveTo(CX - hw, T.bot);
    for (let k = 0; k < n; k++) {
      const x0 = CX - hw + k * step;
      ctx.quadraticCurveTo(x0 + step / 2, T.bot + 4.5, x0 + step, T.bot);
    }
    ctx.stroke();
  }
}

function drawGarland(t) {
  // 金色丝带，跨越三层
  ctx.strokeStyle = '#f0c24a'; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
  TIERS.forEach(T => {
    const yy = T.top + (T.bot - T.top) * 0.72;
    const hw = T.w * 0.72 * 0.92;
    ctx.beginPath();
    ctx.moveTo(CX - hw, yy - 2);
    ctx.quadraticCurveTo(CX, yy + 12, CX + hw, yy - 2);
    ctx.stroke();
  });
}

function bulbPos(b) {
  const T = TIERS[b.ti], n = [9, 12, 15][b.ti];
  const u = (b.k + 0.5) / n;
  const yy = T.top + (T.bot - T.top) * 0.72;
  const hw = T.w * 0.72 * 0.92;
  const x = CX - hw + 2 * hw * u;
  const y = (yy - 2) + Math.sin(u * Math.PI) * 6.2 + (0);
  return [x, y];
}

function glowDot(x, y, r, col, a) {
  if (a <= 0.01) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
  g.addColorStop(0, col); g.addColorStop(0.35, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = clamp(a) * 0.5; ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, 6.2832); ctx.fill();
  ctx.globalAlpha = clamp(a);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, 6.2832); ctx.fill();
  ctx.fillStyle = col; ctx.globalAlpha = clamp(a) * 0.9;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  ctx.globalAlpha = 1;
}

// 灯串：开场每个重拍点亮 3 盏；加速段按重拍奇偶交替；尾声全亮并缓缓呼吸
function drawBulbs(t, bi) {
  const S = CUE.sections, N = BULBS.length;
  const par = Math.max(bi, 0) % 2;
  for (let j = 0; j < N; j++) {
    const b = BULBS[N - 1 - j];              // 自下而上点亮
    const [x, y] = bulbPos(b);
    const onT = CUE.beats[Math.min(Math.floor(j / 3), CUE.beats.length - 1)];
    const lit = t >= onT;
    const col = BULB_COL[(b.k + b.ti) % 4];
    let a = 0.16;                             // 未亮：暗淡灯泡
    if (lit) {
      a = 0.55;
      const sinceOn = t - onT;
      a += 0.45 * Math.exp(-sinceOn * 5);     // 刚亮起时的闪光
    }
    if (t >= S.faster && lit) {
      const mine = ((b.k + b.ti) % 2) === par;
      const bs = since(CUE.beats, t);
      a = mine ? 0.7 + 0.3 * Math.exp(-bs * 6) : 0.28;
      if (t >= S.ending) a = 0.75 + 0.2 * Math.sin(t * 2.2 + b.k);
    }
    if (t >= S.ending) {
      const k = stepAt(t, S.ending, 0.6);
      a = lerp(a, 0.75 + 0.2 * Math.sin(t * 2.2 + b.k), k);
    }
    glowDot(x, y, 1.15, col, a);
  }
}

// 彩球：每个铃声点亮对应的一颗，之后保持余辉，并摆动
function drawBalls(t) {
  for (let i = 0; i < BALLS.length; i++) {
    const bt = CUE.bells[i];
    const [dx, y] = BALLS[i];
    const x = CX + dx;
    const s = bt === undefined ? Infinity : t - bt;
    const on = s >= 0;
    const f = on ? Math.exp(-s * 4.2) : 0;
    const sw = on ? Math.sin(s * 11) * Math.exp(-s * 2.2) * 0.35 : 0;
    const R = 2.5 + 0.8 * f;
    const bx = x + sw * 3, by = y + 3 + Math.abs(sw) * 0.3;
    // 吊线
    ctx.strokeStyle = 'rgba(255,240,200,.6)'; ctx.lineWidth = 0.25;
    ctx.beginPath(); ctx.moveTo(x, y - 1); ctx.lineTo(bx, by - R); ctx.stroke();
    const col = BALL_COL[i];
    if (on) {
      glowDot(bx, by, R * 1.9, col, 0.25 + 0.75 * f);
      // 扩散光环
      ctx.strokeStyle = col; ctx.globalAlpha = 0.8 * f; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.arc(bx, by, R + s * 16, 0, 6.2832); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const g = ctx.createRadialGradient(bx - R * 0.35, by - R * 0.4, 0.3, bx, by, R);
    g.addColorStop(0, '#fff'); g.addColorStop(0.25, col); g.addColorStop(1, '#2b1330');
    ctx.globalAlpha = on ? 1 : 0.45;
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, R, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#e8b64a'; ctx.fillRect(bx - 0.8, by - R - 0.9, 1.6, 1);
    // 十字星芒
    if (on && f > 0.08) {
      ctx.strokeStyle = '#fff'; ctx.globalAlpha = f; ctx.lineWidth = 0.35;
      const L = 3 + 6 * f;
      ctx.beginPath(); ctx.moveTo(bx - L, by); ctx.lineTo(bx + L, by); ctx.moveTo(bx, by - L); ctx.lineTo(bx, by + L); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

// ---------- 星、光束、礼物、冲击波 ----------
function starPath(cx, cy, R, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function drawStar(t, ap, pulse) {
  const S = CUE.sections;
  const end = stepAt(t, S.ending, 0.6);
  const k = 1 + 0.28 * ap + 0.08 * pulse + 0.25 * end;
  const cy = 18;
  const g = ctx.createRadialGradient(CX, cy, 0, CX, cy, 20 * k);
  const ga = 0.3 + 0.45 * ap + 0.3 * end;
  g.addColorStop(0, `rgba(255,236,150,${clamp(ga)})`); g.addColorStop(1, 'rgba(255,236,150,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(CX, cy, 20 * k, 0, 6.2832); ctx.fill();
  starPath(CX, cy, 6.5 * k, 2.9 * k);
  const sg = ctx.createLinearGradient(CX, cy - 7, CX, cy + 6);
  sg.addColorStop(0, '#fff6c2'); sg.addColorStop(1, '#f2b632');
  ctx.fillStyle = sg; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.4; ctx.stroke();
}

function drawRays(t, bi) {
  const S = CUE.sections;
  const k = stepAt(t, S.faster, 0.8) * (1 - stepAt(t, S.ending, 0.6));
  if (k <= 0.01) return;
  const ph = bi < 0 ? 0 : bi * 0.22 + clamp((t - CUE.beats[bi]) / 0.48) * 0.22;
  const bs = since(CUE.beats, t);
  ctx.save(); ctx.translate(CX, 18);
  for (let i = 0; i < 12; i++) {
    const a = ph + i * Math.PI / 6;
    ctx.save(); ctx.rotate(a);
    const L = 110;
    const g = ctx.createLinearGradient(0, 0, L, 0);
    const al = (0.07 + 0.12 * Math.exp(-bs * 6)) * k * (i % 2 ? 0.7 : 1);
    g.addColorStop(0, `rgba(255,230,160,${al})`); g.addColorStop(1, 'rgba(255,230,160,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L, -5); ctx.lineTo(L, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawPresents(t, bi, pulse, ap) {
  const S = CUE.sections;
  const fast = t >= S.faster;
  const defs = [
    { x: CX - 27, w: 11, h: 8, c: '#d62f45', r: '#ffe08a', ph: 0 },
    { x: CX + 17, w: 10, h: 11, c: '#2d7fd0', r: '#ffe08a', ph: 1 },
    { x: CX + 7, w: 7, h: 6, c: '#e8b64a', r: '#d62f45', ph: 0 },
    { x: CX - 14, w: 7, h: 5, c: '#7c4cc4', r: '#fff1b0', ph: 1 }
  ];
  defs.forEach((d, i) => {
    let hop = 0;
    if (fast) { if ((bi + d.ph) % 2 === 0) hop = 3.2 * pulse; else hop = 0.8 * pulse; }
    else hop = 2.4 * ap * (i % 2 ? 0.6 : 1);
    const y = 114 - d.h - hop;
    ctx.fillStyle = d.c; ctx.fillRect(d.x, y, d.w, d.h);
    ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.fillRect(d.x + d.w * 0.62, y, d.w * 0.38, d.h);
    ctx.fillStyle = d.r; ctx.fillRect(d.x + d.w / 2 - 0.7, y, 1.4, d.h); ctx.fillRect(d.x, y + d.h / 2 - 0.6, d.w, 1.2);
    ctx.beginPath(); ctx.ellipse(d.x + d.w / 2 - 1.5, y - 0.8, 1.6, 1, -0.4, 0, 6.2832);
    ctx.ellipse(d.x + d.w / 2 + 1.5, y - 0.8, 1.6, 1, 0.4, 0, 6.2832); ctx.fill();
  });
}

function drawShock(t) {
  const S = CUE.sections;
  [S.faster, S.ending].forEach((tb, n) => {
    const s = t - tb;
    if (s < 0 || s > 1.3) return;
    const k = s / 1.3;
    ctx.strokeStyle = n ? '#ffd9a0' : '#c9a8ff';
    ctx.globalAlpha = (1 - k) * 0.9; ctx.lineWidth = 2.2 * (1 - k) + 0.3;
    ctx.beginPath(); ctx.arc(CX, 70, 8 + k * 110, 0, 6.2832); ctx.stroke();
    ctx.globalAlpha = (1 - k) * 0.5; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(CX, 70, 4 + k * 80, 0, 6.2832); ctx.stroke();
    ctx.globalAlpha = 1;
  });
}

function drawFireworks(t) {
  const S = CUE.sections, s = t - S.ending;
  if (s < 0 || s > 2) return;
  const cols = ['#ffe08a', '#ff8fa3', '#9be7ff', '#b8ff9a'];
  for (let i = 0; i < 36; i++) {
    const a = i / 36 * 6.2832 + hash(i) * 0.3;
    const sp = 22 + hash(i + 5) * 26;
    const r = sp * (1 - Math.exp(-s * 2.6));
    const x = CX + Math.cos(a) * r, y = 18 + Math.sin(a) * r + s * s * 6;
    ctx.globalAlpha = clamp(1 - s / 1.9);
    ctx.fillStyle = cols[i % 4];
    ctx.beginPath(); ctx.arc(x, y, 0.8 + hash(i + 9) * 0.5, 0, 6.2832); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawGreeting(t) {
  const k = stepAt(t, CUE.sections.ending + 0.2, 0.9);
  if (k <= 0) return;
  ctx.globalAlpha = k; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '700 6.6px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif';
  ctx.fillStyle = '#b3162d'; ctx.fillText('圣诞快乐', CX, 121.5 + (1 - k) * 3);
  ctx.font = 'italic 3.2px Georgia, serif'; ctx.fillStyle = '#4a5a78';
  ctx.fillText('Merry Christmas', CX, 126.8);
  ctx.globalAlpha = 1;
}

// ---------- 主绘制：画面完全是时间 t 的函数 ----------
let W = 0, H = 0, DPR = 1;
function resize() {
  const r = stage.getBoundingClientRect();
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  draw(curTime());
}

function curTime() {
  const t = music.currentTime || 0;
  return clamp(t, 0, CUE.duration);
}

function draw(t) {
  if (!W) return;
  const beats = CUE.beats;
  const bi = lastIdx(beats, t);
  const bs = since(beats, t);
  const pulse = Number.isFinite(bs) ? Math.exp(-bs * 7) : 0;
  const as = since(CUE.accents, t);
  const ap = Number.isFinite(as) ? Math.exp(-as * 4.5) : 0;
  const S = CUE.sections, sec = sectionInfo(t);

  const sc = Math.min(W / (VW + 6), H / VH);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.translate(W / 2 - VW * sc / 2, H / 2 - VH * sc / 2 + 0);
  ctx.scale(sc, sc);

  drawBackground(t, pulse);
  // 尾声暖色光晕
  const ek = stepAt(t, S.ending, 0.9);
  if (ek > 0) {
    const g = ctx.createRadialGradient(CX, 66, 5, CX, 66, 90);
    g.addColorStop(0, `rgba(255,200,120,${0.35 * ek})`); g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g; ctx.fillRect(-400, -400, 900, 900);
  }
  drawRays(t, bi);
  drawSnow(t);
  drawGround(t);

  // 整棵树随重拍摇摆/挤压
  let A = [0.02, 0.04, 0.03][sec.id];
  if (t >= S.ending) A *= 1 - stepAt(t, S.ending, CUE.duration - S.ending);
  let ang = 0;
  if (bi >= 0) {
    const per = bi + 1 < beats.length ? beats[bi + 1] - beats[bi] : 0.48;
    const ph = clamp((t - beats[bi]) / per);
    ang = A * (bi % 2 ? 1 : -1) * Math.cos(Math.PI * ph);
  }
  const amp = 0.012 * (1 + sec.id * 0.9);
  const sy = 1 + amp * 1.4 * pulse + 0.035 * ap;
  const sx = 1 - amp * pulse - 0.015 * ap;
  ctx.save();
  ctx.translate(CX, BASE); ctx.rotate(ang); ctx.scale(sx, sy); ctx.translate(-CX, -BASE);
  // 暖光强度：随点亮进度提升
  const glow = clamp(0.25 + 0.6 * clamp(t / S.faster) + 0.3 * pulse) + ek * 0.3;
  drawTrunk();
  drawTiers(t, glow);
  drawGarland(t);
  drawBulbs(t, bi);
  drawBalls(t);
  drawStar(t, ap, pulse);
  ctx.restore();

  drawPresents(t, bi, pulse, ap);
  drawFireworks(t);
  drawShock(t);
  drawGreeting(t);

  // 重拍闪白 + 段落切换闪光
  const flash = 0.05 * ap * (sec.id + 1) + 0.28 * Math.max(Math.exp(-(t - S.faster) * 6) * (t >= S.faster ? 1 : 0), Math.exp(-(t - S.ending) * 5) * (t >= S.ending ? 1 : 0));
  if (flash > 0.004) { ctx.fillStyle = `rgba(255,244,214,${flash})`; ctx.fillRect(-400, -400, 900, 900); }

  // UI
  timeEl.textContent = t.toFixed(1) + ' / ' + CUE.duration.toFixed(1);
  if (secEl.textContent !== sec.name) secEl.textContent = sec.name;
}

// ---------- 控制 ----------
let dragging = false;
function syncUI() {
  const ended = music.ended || curTime() >= CUE.duration - 0.02;
  const label = !music.paused && !music.ended ? '暂停' : (ended ? '重播' : '播放');
  if (play.textContent !== label) { play.textContent = label; play.setAttribute('aria-label', label); }
}
function frame() {
  const t = curTime();
  if (!dragging) seek.value = t;
  draw(t); syncUI();
  requestAnimationFrame(frame);
}

play.addEventListener('click', () => {
  if (music.paused || music.ended) {
    if (music.ended || curTime() >= CUE.duration - 0.05) music.currentTime = 0;
    const p = music.play(); if (p && p.catch) p.catch(() => {});
  } else music.pause();
  syncUI();
});
function onSeek() {
  const v = clamp(Number(seek.value), 0, CUE.duration);
  try { music.currentTime = v; } catch (e) {}
  draw(v); syncUI();            // 拖动后立即绘制该时刻
}
seek.addEventListener('input', onSeek);
seek.addEventListener('change', () => { dragging = false; onSeek(); });
seek.addEventListener('pointerdown', () => { dragging = true; });
seek.addEventListener('pointerup', () => { dragging = false; });
['timeupdate', 'seeked', 'play', 'pause', 'ended', 'loadedmetadata'].forEach(ev =>
  music.addEventListener(ev, () => { if (!dragging) seek.value = curTime(); draw(curTime()); syncUI(); }));
window.addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

resize();
requestAnimationFrame(frame);
