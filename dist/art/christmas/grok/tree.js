'use strict';

/* Christmas card driven only by the music clock (cue-sheet.json).
   Accents bow the whole tree, beats bounce it, bells flare one lamp. */

const music = document.querySelector('#music');
const play = document.querySelector('#play');
const seek = document.querySelector('#seek');
const clock = document.querySelector('#clock');
const stage = document.querySelector('#stage');

const DURATION = 19;
const FASTER_AT = 8.4;
const ENDING_AT = 17.35;
const BEATS = [0.4, 1.06, 1.72, 2.38, 3.04, 3.7, 4.36, 5.02, 5.68, 6.34, 7, 7.66, 8.4, 8.88, 9.36, 9.84, 10.32, 10.8, 11.28, 11.76, 12.24, 12.72, 13.2, 13.68, 14.16, 14.64, 15.12, 15.6, 16.08, 16.56];
const ACCENTS = [0.4, 3.04, 5.68, 8.4, 10.32, 12.24, 14.16, 16.08];
const BELLS = [1.39, 2.71, 4.03, 5.35, 6.67, 7.99, 9.12, 10.08, 11.04, 12, 12.96, 13.92, 14.88, 15.84, 16.8];

const LIGHTS = [
  { y: 0.12, x: 0.02 },
  { y: 0.18, x: -0.34 },
  { y: 0.21, x: 0.40 },
  { y: 0.29, x: -0.08 },
  { y: 0.33, x: 0.50 },
  { y: 0.38, x: -0.48 },
  { y: 0.44, x: 0.16 },
  { y: 0.49, x: -0.28 },
  { y: 0.54, x: 0.55 },
  { y: 0.60, x: -0.58 },
  { y: 0.63, x: 0.06 },
  { y: 0.69, x: 0.42 },
  { y: 0.73, x: -0.40 },
  { y: 0.79, x: 0.24 },
  { y: 0.83, x: -0.62 },
  { y: 0.88, x: 0.46 }
];
const BELL_ROUTE = [0, 2, 5, 3, 7, 6, 4, 11, 9, 14, 8, 13, 10, 15, 1];
const JEWELS = [
  [255, 206, 120],
  [255, 122, 132],
  [255, 228, 168],
  [126, 214, 196],
  [255, 156, 188],
  [176, 206, 255],
  [255, 176, 96],
  [255, 214, 140]
];
const ORNAMENTS = [
  { y: 0.22, x: -0.30, r: 0.022, rgb: [176, 48, 54], phase: 0.5 },
  { y: 0.26, x: 0.38, r: 0.018, rgb: [224, 176, 92], phase: 1.8 },
  { y: 0.36, x: -0.46, r: 0.024, rgb: [32, 122, 112], phase: 2.5 },
  { y: 0.40, x: 0.12, r: 0.018, rgb: [236, 220, 190], phase: 0.8 },
  { y: 0.50, x: 0.48, r: 0.026, rgb: [168, 42, 58], phase: 3.0 },
  { y: 0.52, x: -0.18, r: 0.020, rgb: [212, 160, 70], phase: 1.3 },
  { y: 0.62, x: -0.52, r: 0.028, rgb: [112, 36, 52], phase: 2.1 },
  { y: 0.64, x: 0.20, r: 0.020, rgb: [240, 230, 206], phase: 0.2 },
  { y: 0.74, x: 0.50, r: 0.024, rgb: [28, 108, 96], phase: 1.6 },
  { y: 0.76, x: -0.32, r: 0.022, rgb: [186, 54, 60], phase: 2.7 },
  { y: 0.86, x: 0.14, r: 0.023, rgb: [214, 170, 84], phase: 0.7 },
  { y: 0.84, x: -0.56, r: 0.020, rgb: [150, 40, 54], phase: 2.0 }
];
const TIERS = [
  { y0: 0.00, y1: 0.30, w: 0.36, lobes: 4 },
  { y0: 0.18, y1: 0.48, w: 0.52, lobes: 5 },
  { y0: 0.34, y1: 0.66, w: 0.70, lobes: 5 },
  { y0: 0.50, y1: 0.84, w: 0.86, lobes: 6 },
  { y0: 0.66, y1: 1.00, w: 1.02, lobes: 6 }
];

const canvas = document.createElement('canvas');
canvas.setAttribute('aria-hidden', 'true');
stage.appendChild(canvas);
const ctx = canvas.getContext('2d');

let cssW = 0;
let cssH = 0;
let pixelRatio = 1;
let displayTime = 0;
let scrubbing = false;
let holdSeekUntil = 0;
const bellBuf = new Float64Array(LIGHTS.length);

function fract(n) { return n - Math.floor(n); }
function rand(i, salt) {
  return fract(Math.sin(i * 127.1 + salt * 311.7) * 43758.5453123);
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpRgb(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
function mix3(a, b, c, w) {
  return [
    a[0] * w.o + b[0] * w.f + c[0] * w.e,
    a[1] * w.o + b[1] * w.f + c[1] * w.e,
    a[2] * w.o + b[2] * w.f + c[2] * w.e
  ];
}
function rgba(rgb, a) {
  return 'rgba(' + (rgb[0] | 0) + ',' + (rgb[1] | 0) + ',' + (rgb[2] | 0) + ',' + a + ')';
}
function wrap(v, m) { return ((v % m) + m) % m; }

function lastIndex(times, t) {
  let lo = 0;
  let hi = times.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t + 1e-4) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

const BACK_SNOW = Array.from({ length: 70 }, (_, i) => ({
  x: rand(i, 1),
  y: rand(i, 2),
  r: 0.55 + rand(i, 3) * 1.45,
  s: 0.32 + rand(i, 4) * 0.85,
  a: 0.22 + rand(i, 5) * 0.38,
  drift: rand(i, 6) * Math.PI * 2
}));
const FRONT_SNOW = Array.from({ length: 18 }, (_, i) => ({
  x: rand(i, 8),
  y: rand(i, 9),
  r: 2.1 + rand(i, 10) * 2.8,
  s: 0.45 + rand(i, 11) * 0.7,
  a: 0.62 + rand(i, 12) * 0.32,
  drift: rand(i, 13) * Math.PI * 2,
  spin: rand(i, 14) * Math.PI
}));
const SKY_STARS = Array.from({ length: 46 }, (_, i) => ({
  x: rand(i, 15),
  y: 0.02 + rand(i, 16) * 0.42,
  r: 0.55 + rand(i, 17) * 1.25,
  phase: rand(i, 18) * 6.28
}));

function sectionWeights(t) {
  if (t >= ENDING_AT) {
    const u = clamp01((t - ENDING_AT) / 0.5);
    const e = 0.48 + 0.52 * u;
    return { o: 0, f: 1 - e, e: e };
  }
  if (t >= FASTER_AT) {
    const u = clamp01((t - FASTER_AT) / 0.38);
    const f = 0.55 + 0.45 * u;
    return { o: 1 - f, f: f, e: 0 };
  }
  return { o: 1, f: 0, e: 0 };
}

function motionAmp(t) {
  if (t < FASTER_AT) return 0.72 + 0.36 * (t / FASTER_AT);
  if (t < ENDING_AT) return 1.55;
  return 1.55 * (1 - clamp01((t - ENDING_AT) / 0.32));
}

function beatEnv(t) {
  const i = lastIndex(BEATS, t);
  if (i < 0) return { mag: 0, signed: 0 };
  const dt = t - BEATS[i];
  const fast = t >= FASTER_AT && t < ENDING_AT;
  const hold = 0.05;
  const tau = fast ? 0.11 : 0.17;
  if (dt <= hold) return { mag: 1, signed: 1 };
  const u = dt - hold;
  const mag = Math.exp(-u / tau);
  const signed = mag * Math.cos(u * (fast ? 18 : 13));
  return { mag: mag, signed: signed };
}

function accentEnv(t) {
  const i = lastIndex(ACCENTS, t);
  if (i < 0) return { env: 0, dir: 1, index: -1, dt: 0 };
  const dt = t - ACCENTS[i];
  const fast = t >= FASTER_AT && t < ENDING_AT;
  const hold = 0.07;
  const tau = fast ? 0.30 : 0.38;
  const env = dt <= hold ? 1 : Math.exp(-(dt - hold) / tau);
  return { env: env, dir: (i % 2 === 0) ? 1 : -1, index: i, dt: dt };
}

function poseAt(t) {
  const amp = motionAmp(t);
  const beat = beatEnv(t);
  const accent = accentEnv(t);
  return {
    amp: amp,
    angle: accent.dir * 0.175 * accent.env * amp,
    slide: accent.dir * accent.env * amp,
    impact: Math.max(0, beat.signed) * (0.85 + accent.env) * amp,
    lift: Math.max(0, -beat.signed) * amp,
    beat: beat.mag,
    accent: accent.env,
    accentDir: accent.dir,
    accentIndex: accent.index,
    accentDt: accent.dt
  };
}

function fillBells(t) {
  bellBuf.fill(0);
  const i = lastIndex(BELLS, t);
  if (i < 0) return bellBuf;
  const fade = t >= ENDING_AT ? 1 - clamp01((t - ENDING_AT) / 0.4) : 1;
  for (let k = i; k >= Math.max(0, i - 2); k--) {
    const dt = t - BELLS[k];
    const primary = k === i;
    const tau = primary ? 0.32 : 0.48;
    const env = (dt <= 0.045 ? 1 : Math.exp(-(dt - 0.045) / tau)) * fade;
    const idx = BELL_ROUTE[k % BELL_ROUTE.length];
    const gain = primary ? 1 : 0.42;
    bellBuf[idx] = Math.max(bellBuf[idx], env * gain);
    if (idx > 0) bellBuf[idx - 1] = Math.max(bellBuf[idx - 1], env * gain * 0.22);
    if (idx + 1 < bellBuf.length) bellBuf[idx + 1] = Math.max(bellBuf[idx + 1], env * gain * 0.22);
  }
  return bellBuf;
}

function kindle(i, t) {
  if (t >= FASTER_AT) return 1;
  const onset = (i / LIGHTS.length) * (FASTER_AT - 0.15);
  if (t <= onset) return 0.38;
  return 0.38 + 0.62 * clamp01((t - onset) / 0.42);
}

function snowClock(t) {
  const a = Math.min(t, FASTER_AT);
  const b = Math.max(0, Math.min(t, ENDING_AT) - FASTER_AT);
  const c = Math.max(0, t - ENDING_AT);
  return a * 1 + b * 1.95 + c * 0.28;
}

function starSpin(t) {
  let angle = 0;
  for (let i = 0; i < ACCENTS.length; i++) {
    if (t < ACCENTS[i]) break;
    const u = 1 - Math.exp(-(t - ACCENTS[i]) / 0.28);
    angle += ((i % 2 === 0) ? 1 : -1) * 0.22 * u;
  }
  return angle;
}

function layoutOf(w, h) {
  const cx = w * 0.5;
  const top = h * 0.1;
  const pivotY = h * 0.8;
  const potH = Math.min(h * 0.068, w * 0.11, 58);
  const foliageBottom = pivotY - potH * 0.82;
  const treeH = Math.max(40, foliageBottom - top);
  const halfW = Math.max(36, Math.min(w * 0.32, treeH * 0.46));
  return { w: w, h: h, cx: cx, top: top, pivotY: pivotY, potH: potH, foliageBottom: foliageBottom, treeH: treeH, halfW: halfW };
}

function pointOnTree(L, yFrac, xFrac) {
  const y = L.top + L.treeH * yFrac;
  const silhouette = 0.14 + 0.9 * Math.pow(Math.max(0.001, yFrac), 0.82);
  return { x: L.cx + L.halfW * silhouette * xFrac, y: y };
}

function quadPoint(p0, c, p1, u) {
  const k = 1 - u;
  return [
    k * k * p0[0] + 2 * k * u * c[0] + u * u * p1[0],
    k * k * p0[1] + 2 * k * u * c[1] + u * u * p1[1]
  ];
}

function palette(w) {
  return {
    skyTop: mix3([7, 17, 28], [24, 12, 46], [24, 18, 40], w),
    skyMid: mix3([16, 46, 66], [72, 26, 86], [78, 48, 58], w),
    skyHor: mix3([28, 74, 88], [96, 40, 78], [186, 112, 68], w),
    snow: mix3([226, 240, 238], [236, 226, 236], [248, 236, 220], w),
    snowDeep: mix3([168, 198, 198], [176, 160, 180], [206, 176, 150], w),
    hill: mix3([12, 36, 44], [28, 18, 48], [48, 32, 40], w),
    hillFar: mix3([10, 28, 38], [20, 14, 40], [36, 26, 38], w),
    glow: mix3([255, 214, 150], [255, 170, 190], [255, 196, 130], w),
    green: mix3([48, 128, 84], [64, 158, 102], [44, 110, 72], w)
  };
}

function drawSky(L, pal, wgt, t, pose) {
  const g = ctx.createLinearGradient(0, 0, 0, L.h);
  g.addColorStop(0, rgba(pal.skyTop, 1));
  g.addColorStop(0.55, rgba(pal.skyMid, 1));
  g.addColorStop(1, rgba(pal.skyHor, 1));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L.w, L.h);

  const beatGlow = 0.35 + 0.65 * Math.max(pose.beat, pose.accent);
  for (let i = 0; i < SKY_STARS.length; i++) {
    const s = SKY_STARS[i];
    const tw = 0.45 + 0.55 * beatGlow * (0.65 + 0.35 * Math.sin(s.phase + pose.accentIndex));
    ctx.fillStyle = 'rgba(255, 248, 236,' + (0.35 + s.r * 0.12) * tw + ')';
    ctx.beginPath();
    ctx.arc(s.x * L.w, s.y * L.h, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const moonX = L.w * 0.84;
  const moonY = L.h * 0.14;
  const moonR = Math.min(L.w, L.h) * 0.045;
  const moonTint = lerpRgb([244, 232, 206], [255, 214, 170], wgt.e);
  const halo = ctx.createRadialGradient(moonX, moonY, moonR * 0.2, moonX, moonY, moonR * 3.4);
  halo.addColorStop(0, rgba(moonTint, 0.9));
  halo.addColorStop(0.45, rgba(moonTint, 0.22));
  halo.addColorStop(1, rgba(moonTint, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR * 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(moonTint, 1);
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(210, 196, 170, 0.35)';
  ctx.beginPath();
  ctx.arc(moonX - moonR * 0.25, moonY - moonR * 0.1, moonR * 0.22, 0, Math.PI * 2);
  ctx.fill();

  if (wgt.f > 0.02) drawAurora(L, t, wgt.f);
  drawShootingStar(L, t);
}

function drawAurora(L, t, amount) {
  ctx.save();
  ctx.globalAlpha = 0.55 * amount;
  for (let band = 0; band < 3; band++) {
    const yBase = L.h * (0.16 + band * 0.055);
    ctx.beginPath();
    ctx.moveTo(0, yBase);
    for (let x = 0; x <= L.w; x += 14) {
      const y = yBase
        + Math.sin(x * 0.008 + t * 0.65 + band) * (16 + band * 4)
        + Math.sin(x * 0.021 - t * 0.4 + band) * 7;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(L.w, yBase + L.h * 0.22);
    ctx.lineTo(0, yBase + L.h * 0.22);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, yBase - 10, 0, yBase + L.h * 0.2);
    const col = band === 1 ? 'rgba(210, 80, 150, 0.32)' : 'rgba(70, 200, 170, 0.28)';
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.restore();
}

function drawShootingStar(L, t) {
  const dt = t - FASTER_AT;
  if (dt < 0 || dt > 0.55) return;
  const u = dt / 0.55;
  const x = L.w * (0.78 - u * 0.42);
  const y = L.h * (0.1 + u * 0.16);
  const tail = 1 - u;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 244, 220,' + tail + ')';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + L.w * 0.08, y - L.h * 0.03);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 252, 240,' + tail + ')';
  ctx.beginPath();
  ctx.arc(x, y, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHills(L, pal) {
  ctx.fillStyle = rgba(pal.hillFar, 1);
  ctx.beginPath();
  ctx.moveTo(0, L.h);
  ctx.lineTo(0, L.h * 0.72);
  for (let x = 0; x <= L.w; x += 10) {
    const y = L.h * 0.72 - Math.sin(x * 0.007) * L.h * 0.03 - Math.sin(x * 0.015 + 1.2) * L.h * 0.012;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(L.w, L.h);
  ctx.fill();

  ctx.fillStyle = rgba(pal.hill, 1);
  ctx.beginPath();
  ctx.moveTo(0, L.h);
  ctx.lineTo(0, L.h * 0.8);
  for (let x = 0; x <= L.w; x += 10) {
    const y = L.h * 0.8 - Math.sin(x * 0.009 + 0.6) * L.h * 0.028 - Math.sin(x * 0.02) * 6;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(L.w, L.h);
  ctx.fill();
}

function drawDistantTree(x, baseY, height, sway, pal, t) {
  ctx.save();
  ctx.translate(x, baseY);
  ctx.rotate(sway);
  ctx.fillStyle = rgba(lerpRgb(pal.hill, [8, 40, 34], 0.55), 1);
  ctx.beginPath();
  ctx.moveTo(0, -height);
  ctx.lineTo(height * 0.42, 0);
  ctx.lineTo(-height * 0.42, 0);
  ctx.fill();
  ctx.fillStyle = rgba(lerpRgb([14, 70, 52], pal.green, 0.35), 1);
  ctx.beginPath();
  ctx.moveTo(0, -height * 0.78);
  ctx.lineTo(height * 0.28, -height * 0.32);
  ctx.lineTo(-height * 0.28, -height * 0.32);
  ctx.fill();
  if (t >= FASTER_AT) {
    const a = t >= ENDING_AT ? 0.45 : 0.75;
    ctx.fillStyle = 'rgba(255, 214, 140,' + a + ')';
    ctx.beginPath();
    ctx.arc(0, -height * 0.62, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawSnowLayer(flakes, L, t, front) {
  const clock = snowClock(t);
  const span = L.h + 36;
  for (let i = 0; i < flakes.length; i++) {
    const f = flakes[i];
    const y = wrap(f.y * span + clock * (16 + f.s * 28), span) - 18;
    const x = wrap(f.x * L.w + Math.sin(t * 0.65 + f.drift) * (front ? 18 : 10), L.w);
    if (front) {
      drawFlake(x, y, f.r, f.spin + t * 0.35 + f.drift, f.a);
    } else {
      ctx.fillStyle = 'rgba(244, 250, 252,' + f.a + ')';
      ctx.beginPath();
      ctx.arc(x, y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawFlake(x, y, r, rot, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.strokeStyle = 'rgba(255,255,255,' + alpha + ')';
  ctx.lineWidth = Math.max(0.7, r * 0.16);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    const b = a + 0.45;
    ctx.moveTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
    ctx.lineTo(Math.cos(b) * r * 0.28, Math.sin(b) * r * 0.28);
  }
  ctx.stroke();
  ctx.restore();
}

function drawGround(L, pal, pose) {
  const g = ctx.createLinearGradient(0, L.h * 0.78, 0, L.h);
  g.addColorStop(0, rgba(pal.snow, 1));
  g.addColorStop(1, rgba(pal.snowDeep, 1));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, L.h * 0.86);
  ctx.quadraticCurveTo(L.w * 0.5, L.h * 0.74, L.w, L.h * 0.86);
  ctx.lineTo(L.w, L.h);
  ctx.lineTo(0, L.h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(L.cx, L.pivotY + L.h * 0.012, L.halfW * 1.15, L.h * 0.028, 0, 0, Math.PI * 2);
  ctx.fill();

  const glow = ctx.createRadialGradient(L.cx, L.pivotY, 8, L.cx, L.pivotY, L.halfW * 1.3);
  glow.addColorStop(0, rgba(pal.glow, 0.18 + pose.accent * 0.28));
  glow.addColorStop(1, rgba(pal.glow, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(L.cx, L.pivotY + 4, L.halfW * 1.3, L.h * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  const shift = Math.sin(pose.angle) * L.halfW * 0.45;
  ctx.fillStyle = 'rgba(6, 18, 22, 0.28)';
  ctx.beginPath();
  ctx.ellipse(L.cx + shift, L.pivotY + 2, L.halfW * 0.72, Math.max(6, L.h * 0.02), 0, 0, Math.PI * 2);
  ctx.fill();

  if (pose.accentIndex >= 0 && pose.accentDt < 0.95) {
    const r = 18 + pose.accentDt * L.halfW * 1.15;
    ctx.beginPath();
    ctx.ellipse(L.cx, L.pivotY + 2, r, r * 0.26, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 228, 180,' + (1 - pose.accentDt / 0.95) * 0.45 + ')';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawTree(L, pal, t, wgt, pose, bells) {
  const originY = L.pivotY;
  ctx.save();
  ctx.translate(L.cx, originY);
  ctx.rotate(pose.angle);
  ctx.translate(pose.slide * L.halfW * 0.045, pose.impact * L.treeH * 0.012 - pose.lift * L.treeH * 0.02);
  const squash = pose.impact * 0.042;
  ctx.scale(1 + squash * 0.45, 1 - squash);
  ctx.translate(-L.cx, -originY);

  const halo = ctx.createRadialGradient(L.cx, L.top + L.treeH * 0.55, 10, L.cx, L.top + L.treeH * 0.5, L.halfW * 1.15);
  halo.addColorStop(0, rgba(pal.glow, 0.16 + pose.accent * 0.28 + pose.beat * 0.06));
  halo.addColorStop(1, rgba(pal.glow, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(L.cx, L.top + L.treeH * 0.55, L.halfW * 1.15, 0, Math.PI * 2);
  ctx.fill();

  drawPot(L, pal);
  drawTrunk(L);

  ctx.beginPath();
  ctx.moveTo(L.cx, L.top + L.treeH * 0.02);
  ctx.lineTo(L.cx + L.halfW * 0.72, L.foliageBottom);
  ctx.lineTo(L.cx - L.halfW * 0.72, L.foliageBottom);
  ctx.closePath();
  ctx.fillStyle = rgba(lerpRgb(pal.green, [8, 40, 30], 0.45), 1);
  ctx.fill();

  for (let i = 0; i < TIERS.length; i++) drawTier(L, pal, i);

  drawRibbons(L, pose);
  drawGarlands(L, t, pose);
  drawOrnaments(L, pose);
  drawCanes(L, pose);
  drawLights(L, t, wgt, pose, bells);

  const ending = wgt.e;
  const starR = Math.max(11, L.treeH * 0.052) * (1 + pose.accent * 0.16 * pose.amp + ending * 0.08);
  drawStar(L.cx, L.top + 2, starR, starSpin(t), 0.82 + pose.accent * 0.35 + ending * 0.25, pal);

  if (pose.accentIndex >= 0 && pose.accentDt < 0.7) {
    drawSparks(L.cx, L.top + L.treeH * 0.48, pose, t >= FASTER_AT && t < ENDING_AT);
  }

  ctx.restore();
}

function drawPot(L, pal) {
  const w = L.halfW * 0.62;
  const h = L.potH;
  const y = L.pivotY - h;
  ctx.beginPath();
  ctx.moveTo(L.cx - w * 0.42, y + h * 0.18);
  ctx.lineTo(L.cx + w * 0.42, y + h * 0.18);
  ctx.lineTo(L.cx + w * 0.52, y + h);
  ctx.lineTo(L.cx - w * 0.52, y + h);
  ctx.closePath();
  const g = ctx.createLinearGradient(L.cx - w, y, L.cx + w, y);
  g.addColorStop(0, '#5c1e2a');
  g.addColorStop(0.48, '#8d3140');
  g.addColorStop(1, '#4a1822');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = '#e6c98a';
  roundRect(L.cx - w * 0.5, y, w, h * 0.2, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(L.cx - w * 0.36, y + h * 0.36, w * 0.08, h * 0.5);
}

function drawTrunk(L) {
  const w = Math.max(8, L.halfW * 0.12);
  const y = L.foliageBottom - L.treeH * 0.04;
  const h = L.pivotY - y - L.potH * 0.25;
  const g = ctx.createLinearGradient(L.cx - w, y, L.cx + w, y);
  g.addColorStop(0, '#5a3822');
  g.addColorStop(0.5, '#8a5a34');
  g.addColorStop(1, '#3e2616');
  ctx.fillStyle = g;
  roundRect(L.cx - w / 2, y, w, Math.max(8, h), 3);
  ctx.fill();
}

function traceTier(cx, yTop, yBot, half, scallops) {
  ctx.beginPath();
  ctx.moveTo(cx, yTop);
  ctx.quadraticCurveTo(cx + half * 0.58, yTop + (yBot - yTop) * 0.42, cx + half, yBot);
  for (let i = 0; i < scallops; i++) {
    const x0 = cx + half - (half * 2) * (i / scallops);
    const x1 = cx + half - (half * 2) * ((i + 1) / scallops);
    const dip = (yBot - yTop) * (i % 2 === 0 ? 0.2 : 0.11);
    ctx.quadraticCurveTo((x0 + x1) / 2, yBot + dip, x1, yBot);
  }
  ctx.quadraticCurveTo(cx - half * 0.58, yTop + (yBot - yTop) * 0.42, cx, yTop);
  ctx.closePath();
}

function drawTier(L, pal, index) {
  const tier = TIERS[index];
  const yTop = L.top + L.treeH * tier.y0;
  const yBot = L.top + L.treeH * tier.y1;
  const half = L.halfW * tier.w;
  const shade = 1 - index * 0.07;
  const mid = pal.green.map((v) => v * shade);
  const light = [Math.min(255, mid[0] * 1.42 + 26), Math.min(255, mid[1] * 1.28 + 34), Math.min(255, mid[2] * 1.18 + 22)];
  const dark = [mid[0] * 0.4, mid[1] * 0.46, mid[2] * 0.38];

  ctx.save();
  ctx.translate(0, 3);
  traceTier(L.cx, yTop, yBot, half, tier.lobes);
  ctx.fillStyle = 'rgba(4, 24, 16, 0.22)';
  ctx.fill();
  ctx.restore();

  traceTier(L.cx, yTop, yBot, half, tier.lobes);
  const g = ctx.createLinearGradient(L.cx, yTop, L.cx, yBot + (yBot - yTop) * 0.2);
  g.addColorStop(0, rgba(light, 1));
  g.addColorStop(0.42, rgba(mid, 1));
  g.addColorStop(1, rgba(dark, 1));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  traceTier(L.cx, yTop, yBot, half, tier.lobes);
  ctx.clip();
  const hg = ctx.createLinearGradient(L.cx - half, yTop, L.cx + half * 0.15, yBot);
  hg.addColorStop(0, 'rgba(230, 255, 240, 0.22)');
  hg.addColorStop(0.5, 'rgba(230, 255, 240, 0)');
  ctx.fillStyle = hg;
  ctx.fillRect(L.cx - half - 4, yTop, half * 2, yBot - yTop);
  ctx.restore();
  ctx.strokeStyle = 'rgba(6, 32, 22, 0.32)';
  ctx.lineWidth = 1;
  traceTier(L.cx, yTop, yBot, half, tier.lobes);
  ctx.stroke();

  ctx.fillStyle = 'rgba(242, 252, 249, 0.92)';
  for (let side = -1; side <= 1; side += 2) {
    const p0 = [L.cx, yTop];
    const c = [L.cx + side * half * 0.58, yTop + (yBot - yTop) * 0.42];
    const p1 = [L.cx + side * half, yBot];
    for (let s = 1; s <= 4; s++) {
      const pt = quadPoint(p0, c, p1, s / 5);
      const size = Math.max(3.2, half * 0.042) * (0.65 + s * 0.1);
      ctx.beginPath();
      ctx.ellipse(pt[0], pt[1] - size * 0.15, size * 1.15, size * 0.48, side * -0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (index >= 2) {
    for (let i = 0; i < tier.lobes; i += 2) {
      const x0 = L.cx + half - (half * 2) * (i / tier.lobes);
      const x1 = L.cx + half - (half * 2) * ((i + 1) / tier.lobes);
      const x = (x0 + x1) / 2;
      const len = 7 + (i % 3) * 4;
      const y = yBot + (yBot - yTop) * 0.16;
      const ice = ctx.createLinearGradient(x, y, x, y + len);
      ice.addColorStop(0, 'rgba(255,255,255,0.8)');
      ice.addColorStop(1, 'rgba(180, 216, 226, 0)');
      ctx.fillStyle = ice;
      ctx.beginPath();
      ctx.moveTo(x - 2.2, y);
      ctx.lineTo(x + 2.2, y);
      ctx.lineTo(x, y + len);
      ctx.fill();
    }
  }
}

function drawRibbons(L, pose) {
  const rows = [0.34, 0.52, 0.7, 0.88];
  ctx.lineCap = 'round';
  for (let i = 0; i < rows.length; i++) {
    const yFrac = rows[i];
    const left = pointOnTree(L, yFrac, -0.78);
    const right = pointOnTree(L, yFrac, 0.78);
    const flutter = pose.accentDir * pose.accent * (8 + i * 2);
    const sag = L.treeH * (0.035 + i * 0.004);
    const cpx = (left.x + right.x) / 2 + flutter;
    const cpy = (left.y + right.y) / 2 + sag;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.quadraticCurveTo(cpx, cpy, right.x, right.y);
    ctx.strokeStyle = i % 2 === 0 ? '#8d2c3a' : '#a33b32';
    ctx.lineWidth = Math.max(3, L.treeH * 0.012);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 220, 160, 0.7)';
    ctx.lineWidth = Math.max(1, L.treeH * 0.0035);
    ctx.stroke();
  }
}

function drawGarlands(L, t, pose) {
  const rows = [0.3, 0.48, 0.66, 0.84];
  const pop = 0.45 + 0.55 * Math.max(pose.beat, pose.accent * 0.85);
  for (let r = 0; r < rows.length; r++) {
    const yFrac = rows[r];
    const level = garlandLevel(yFrac, t);
    const left = pointOnTree(L, yFrac - 0.02, -0.7);
    const right = pointOnTree(L, yFrac - 0.02, 0.7);
    const sag = L.treeH * 0.03;
    const count = 16;
    for (let i = 0; i <= count; i++) {
      const u = i / count;
      const x = lerp(left.x, right.x, u);
      const y = lerp(left.y, right.y, u) + Math.sin(u * Math.PI) * sag;
      const bead = (i % 4 === 0) ? [176, 48, 54] : [232, 196, 120];
      ctx.fillStyle = rgba(bead, (0.35 + 0.65 * pop) * level);
      ctx.beginPath();
      ctx.arc(x, y, i % 4 === 0 ? 2.5 : 2.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function garlandLevel(yFrac, t) {
  if (t >= FASTER_AT) return 1;
  const onset = yFrac * 7.4;
  if (t < onset) return 0.42;
  return 0.42 + 0.58 * clamp01((t - onset) / 0.45);
}

function drawOrnaments(L, pose) {
  for (let i = 0; i < ORNAMENTS.length; i++) {
    const o = ORNAMENTS[i];
    const p = pointOnTree(L, o.y, o.x);
    const radius = L.treeH * o.r;
    const swing = Math.sin(o.phase) * (0.32 * pose.beat + 0.2 * pose.accent);
    drawBauble(p.x, p.y, radius, o.rgb, swing, pose);
  }
}

function drawBauble(x, y, r, rgb, swing, pose) {
  ctx.save();
  ctx.translate(x, y - r - 8);
  ctx.rotate(swing);
  ctx.strokeStyle = 'rgba(230, 204, 150, 0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 8);
  ctx.stroke();
  ctx.fillStyle = '#e7d09a';
  ctx.fillRect(-r * 0.22, 6, r * 0.44, r * 0.32);
  const g = ctx.createRadialGradient(-r * 0.35, 8 + r * 0.35, r * 0.08, 0, 8 + r, r);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.2, rgba(lerpRgb(rgb, [255, 255, 255], 0.4), 1));
  g.addColorStop(0.58, rgba(rgb, 1));
  g.addColorStop(1, rgba(lerpRgb(rgb, [20, 8, 10], 0.55), 1));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 8 + r, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,' + (0.55 + pose.beat * 0.35) + ')';
  ctx.beginPath();
  ctx.ellipse(-r * 0.32, 8 + r * 0.55, r * 0.16, r * 0.28, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCanes(L, pose) {
  drawCane(pointOnTree(L, 0.57, 0.42), L.treeH * 0.05, pose.beat * 0.35);
  drawCane(pointOnTree(L, 0.78, -0.36), L.treeH * 0.046, -pose.beat * 0.3);
}

function drawCane(p, s, swing) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(-0.35 + swing);
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(3, s * 0.28);
  ctx.strokeStyle = '#f4f1ea';
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.48, Math.PI, 0);
  ctx.lineTo(s * 0.48, s * 1.15);
  ctx.stroke();
  ctx.strokeStyle = '#b4333a';
  ctx.setLineDash([s * 0.16, s * 0.14]);
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.48, Math.PI, 0);
  ctx.lineTo(s * 0.48, s * 1.15);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawLights(L, t, wgt, pose, bells) {
  const endingSettle = t >= ENDING_AT ? clamp01((t - ENDING_AT) / 0.45) : 0;
  for (let i = 0; i < LIGHTS.length; i++) {
    const lamp = LIGHTS[i];
    const p = pointOnTree(L, lamp.y, lamp.x);
    const base = kindle(i, t);
    let flare = bells[i];
    flare *= 1 - endingSettle;
    let brightness = Math.min(1, base * 0.7 + flare);
    brightness = lerp(brightness, 0.9, endingSettle);
    const gold = [255, 216, 154];
    const jewel = JEWELS[i % JEWELS.length];
    const amber = [255, 196, 122];
    let color = lerpRgb(gold, jewel, wgt.f * 0.9);
    color = lerpRgb(color, amber, wgt.e);
    if (flare > 0.35) color = lerpRgb(color, [255, 252, 244], clamp01((flare - 0.35) / 0.65));
    const radius = (1.7 + brightness * 2.1) * (1 + flare * 1.6);
    const haloR = radius * (3.2 + flare * 4.5);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, haloR);
    g.addColorStop(0, rgba(color, 0.2 + brightness * 0.75));
    g.addColorStop(0.35, rgba(color, 0.18 + flare * 0.4));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, haloR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(lerpRgb(color, [255, 255, 255], 0.35 + flare * 0.6), 0.85);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (flare > 0.4) {
      ctx.strokeStyle = 'rgba(255,255,255,' + flare + ')';
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.moveTo(p.x - radius * 2.4, p.y);
      ctx.lineTo(p.x + radius * 2.4, p.y);
      ctx.moveTo(p.x, p.y - radius * 2.4);
      ctx.lineTo(p.x, p.y + radius * 2.4);
      ctx.stroke();
    }
  }
}

function drawStar(x, y, r, spin, glow, pal) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  const halo = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 3.3);
  halo.addColorStop(0, rgba(pal.glow, 0.9 * glow));
  halo.addColorStop(0.35, rgba(pal.glow, 0.28 * glow));
  halo.addColorStop(1, rgba(pal.glow, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, r * 3.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba([255, 236, 190], 0.8 * glow);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const len = r * (i % 2 === 0 ? 2.25 : 1.45);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.lineTo(Math.cos(a + 0.16) * r * 0.28, Math.sin(a + 0.16) * r * 0.28);
    ctx.lineTo(Math.cos(a - 0.16) * r * 0.28, Math.sin(a - 0.16) * r * 0.28);
    ctx.closePath();
    ctx.fill();
  }
  starPath(r, r * 0.42, 5);
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, '#fff6d8');
  g.addColorStop(0.45, '#f0c56a');
  g.addColorStop(1, '#c8882e');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 248, 220, 0.8)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(-r * 0.12, -r * 0.12, r * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function starPath(outer, inner, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawSparks(x, y, pose, big) {
  const n = big ? 18 : 8;
  const reach = (big ? 130 : 58) * Math.min(1, pose.accentDt / 0.55);
  for (let k = 0; k < n; k++) {
    const ang = (k / n) * Math.PI * 2 + pose.accentIndex * 0.65;
    const dist = 10 + reach * (0.55 + (k % 3) * 0.18);
    const px = x + Math.cos(ang) * dist;
    const py = y + Math.sin(ang) * dist * 0.62 - pose.accentDt * 26;
    ctx.fillStyle = 'rgba(255, 240, 210,' + pose.accent * (big ? 0.9 : 0.65) + ')';
    ctx.beginPath();
    ctx.arc(px, py, big ? 2.3 : 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGifts(L) {
  const h = Math.min(L.h * 0.078, 52);
  const potHalf = L.halfW * 0.28;
  drawGift(L.cx - potHalf - h * 1.15, L.pivotY - h * 0.92, h * 1.2, h * 0.92, '#8d2d3a', '#f0d392');
  drawGift(L.cx + potHalf - h * 0.15, L.pivotY - h * 0.8, h * 1.05, h * 0.8, '#1e6b52', '#f4efe2');
  drawGift(L.cx - h * 0.42, L.pivotY - h * 0.62, h * 0.9, h * 0.62, '#f3e6cf', '#a33b3b');
}

function drawGift(x, y, w, h, paper, ribbon) {
  ctx.fillStyle = 'rgba(8, 16, 18, 0.2)';
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h + 3, w * 0.42, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = paper;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(x, y, w * 0.16, h);
  ctx.fillStyle = ribbon;
  ctx.fillRect(x + w * 0.42, y, w * 0.16, h);
  ctx.fillRect(x, y + h * 0.4, w, h * 0.14);
  ctx.beginPath();
  ctx.ellipse(x + w * 0.34, y + 1, w * 0.16, h * 0.14, -0.5, 0, Math.PI * 2);
  ctx.ellipse(x + w * 0.66, y + 1, w * 0.16, h * 0.14, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(x + w * 0.5, y + 1, Math.max(1.5, w * 0.05), 0, Math.PI * 2);
  ctx.fill();
}

function drawGreeting(L, t) {
  if (t < ENDING_AT) return;
  const u = clamp01((t - ENDING_AT) / 0.6);
  const alpha = 0.72 + 0.28 * (u * u * (3 - 2 * u));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#f8e7c4';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = Math.min(L.w * 0.078, L.h * 0.052, 42);
  const family = '"KaiTi", "STKaiti", "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.font = '600 ' + size + 'px ' + family;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0.22em';
  while (size > 14 && ctx.measureText('圣诞快乐').width > L.w * 0.72) {
    size -= 1;
    ctx.font = '600 ' + size + 'px ' + family;
  }
  const y = L.h * 0.935;
  const textW = ctx.measureText('圣诞快乐').width;
  ctx.fillStyle = 'rgba(24, 14, 16, 0.5)';
  roundRect(L.cx - textW / 2 - size * 0.7, y - size * 0.78, textW + size * 1.4, size * 1.55, size * 0.45);
  ctx.fill();
  ctx.fillStyle = '#f8e7c4';
  ctx.fillText('圣诞快乐', L.cx, y);
  ctx.restore();
}

function drawVignette(L, wgt) {
  const v = ctx.createRadialGradient(L.cx, L.h * 0.42, L.h * 0.32, L.cx, L.h * 0.46, L.h * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, L.w, L.h);
  if (wgt.e > 0) {
    ctx.fillStyle = 'rgba(255, 186, 110,' + (0.1 * wgt.e) + ')';
    ctx.fillRect(0, 0, L.w, L.h);
  }
}

function drawFrame(L, wgt) {
  const edge = lerpRgb([214, 176, 106], [232, 150, 150], wgt.f);
  const warm = lerpRgb(edge, [236, 196, 130], wgt.e);
  ctx.strokeStyle = rgba(warm, 0.7);
  ctx.lineWidth = 2;
  roundRect(8, 8, L.w - 16, L.h - 16, 16);
  ctx.stroke();
}

function roundRect(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function paint(t) {
  if (cssW < 2 || cssH < 2) return;
  const time = Math.max(0, t);
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.clearRect(0, 0, cssW, cssH);

  const L = layoutOf(cssW, cssH);
  const wgt = sectionWeights(time);
  const pose = poseAt(time);
  const bells = fillBells(time);
  const pal = palette(wgt);

  drawSky(L, pal, wgt, time, pose);
  drawHills(L, pal);
  drawDistantTree(L.w * 0.14, L.h * 0.78, L.h * 0.16, pose.angle * 0.55, pal, time);
  drawDistantTree(L.w * 0.88, L.h * 0.8, L.h * 0.13, pose.angle * 0.4, pal, time);
  drawSnowLayer(BACK_SNOW, L, time, false);
  drawGround(L, pal, pose);
  drawTree(L, pal, time, wgt, pose, bells);
  drawGifts(L);
  drawSnowLayer(FRONT_SNOW, L, time, true);
  drawVignette(L, wgt);
  drawGreeting(L, time);
  drawFrame(L, wgt);
}

function resize() {
  const rect = stage.getBoundingClientRect();
  cssW = Math.max(1, rect.width);
  cssH = Math.max(1, rect.height);
  pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(cssW * pixelRatio);
  canvas.height = Math.round(cssH * pixelRatio);
}

function updateClock(t) {
  const shown = (Math.round(t * 100) / 100).toFixed(2);
  clock.textContent = shown;
  seek.setAttribute('aria-valuenow', shown);
  seek.setAttribute('aria-valuetext', shown + '秒');
}

function endCheck() {
  const dur = Number.isFinite(music.duration) ? music.duration : DURATION;
  return Math.min(DURATION, dur);
}

function applySeekFromControl() {
  const t = Math.min(DURATION, Math.max(0, Number(seek.value) || 0));
  displayTime = t;
  holdSeekUntil = performance.now() + 280;
  const dur = Number.isFinite(music.duration) ? music.duration : DURATION;
  try { music.currentTime = Math.min(t, Math.max(0, dur - 0.001)); } catch (err) { /* not seekable yet */ }
  updateClock(t);
  paint(t);
}

function setPlayLabel(playing) {
  play.textContent = playing ? '暂停' : '播放';
  play.setAttribute('aria-pressed', playing ? 'true' : 'false');
}

play.addEventListener('click', () => {
  if (!music.paused) {
    music.pause();
    return;
  }
  const limit = endCheck();
  if (music.ended || displayTime >= limit - 0.05) {
    displayTime = 0;
    seek.value = '0';
    try { music.currentTime = 0; } catch (err) { /* ignore */ }
    updateClock(0);
    paint(0);
  }
  const pending = music.play();
  if (pending && typeof pending.catch === 'function') pending.catch(() => setPlayLabel(false));
});

music.addEventListener('play', () => setPlayLabel(true));
music.addEventListener('pause', () => setPlayLabel(false));
music.addEventListener('ended', () => {
  const end = endCheck();
  displayTime = end;
  seek.value = end.toFixed(2);
  setPlayLabel(false);
  updateClock(end);
  paint(displayTime);
});
music.addEventListener('loadedmetadata', () => {
  if (displayTime > 0) {
    try { music.currentTime = Math.min(displayTime, Math.max(0, music.duration - 0.001)); } catch (err) { /* ignore */ }
  }
});

seek.addEventListener('pointerdown', () => { scrubbing = true; });
window.addEventListener('pointerup', () => { scrubbing = false; });
window.addEventListener('pointercancel', () => { scrubbing = false; });
seek.addEventListener('input', applySeekFromControl);
seek.addEventListener('change', applySeekFromControl);
seek.addEventListener('keyup', () => { scrubbing = false; });

function tick(now) {
  const holding = now < holdSeekUntil;
  if (!scrubbing && !holding && !music.paused && !music.ended) {
    displayTime = Math.max(0, music.currentTime || 0);
    if (Math.abs(Number(seek.value) - displayTime) > 0.004) {
      seek.value = displayTime.toFixed(2);
    }
  }
  updateClock(displayTime);
  paint(displayTime);
  requestAnimationFrame(tick);
}

function boot() {
  resize();
  paint(0);
  updateClock(0);
}
boot();
window.addEventListener('resize', () => { resize(); paint(displayTime); });
if (typeof ResizeObserver === 'function') {
  const observer = new ResizeObserver(() => { resize(); paint(displayTime); });
  observer.observe(stage);
}
requestAnimationFrame(tick);

music.loop = false;
