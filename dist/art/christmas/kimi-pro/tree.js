'use strict';

// Every moving value in the scene is derived from this one musical clock.
const CUES = {
  duration: 19,
  beats: [0.4, 1.06, 1.72, 2.38, 3.04, 3.7, 4.36, 5.02, 5.68, 6.34, 7, 7.66, 8.4, 8.88, 9.36, 9.84, 10.32, 10.8, 11.28, 11.76, 12.24, 12.72, 13.2, 13.68, 14.16, 14.64, 15.12, 15.6, 16.08, 16.56],
  accents: [0.4, 3.04, 5.68, 8.4, 10.32, 12.24, 14.16, 16.08],
  bells: [1.39, 2.71, 4.03, 5.35, 6.67, 7.99, 9.12, 10.08, 11.04, 12, 12.96, 13.92, 14.88, 15.84, 16.8],
  sections: { opening: 0, faster: 8.4, ending: 17.35 }
};

const music = document.querySelector('#music');
const play = document.querySelector('#play');
const playText = document.querySelector('#playText');
const seek = document.querySelector('#seek');
const stage = document.querySelector('#stage');
const canvas = document.querySelector('#scene');
const ctx = canvas.getContext('2d');
const currentTimeLabel = document.querySelector('#currentTime');
const sectionLabel = document.querySelector('#sectionLabel');
const movementText = document.querySelector('#movementText');
const TAU = Math.PI * 2;

let viewWidth = 0;
let viewHeight = 0;
let lastDrawnTime = 0;
let animationFrame = 0;
let activeSection = '';

function randomGenerator(seed) {
  return function () {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let n = Math.imul(seed ^ seed >>> 15, 1 | seed);
    n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n;
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

const random = randomGenerator(241225);
const stars = Array.from({ length: 105 }, (_, i) => ({
  x: random(), y: random() * 0.69, size: 0.35 + random() * 1.25,
  alpha: 0.2 + random() * 0.65, group: i % 4, cross: random() > 0.9
}));
const snow = Array.from({ length: 74 }, (_, i) => ({
  x: random(), y: random(), size: 0.6 + random() * 2.1,
  speed: 4 + random() * 10, phase: random() * TAU,
  alpha: 0.18 + random() * 0.53, front: i % 3 === 0
}));

const ornamentPalette = [
  { light: '#ffd994', base: '#c78b35', dark: '#70431f' },
  { light: '#ffb0a0', base: '#a9383f', dark: '#541e2a' },
  { light: '#d9eee0', base: '#6d9d83', dark: '#28544a' },
  { light: '#fff4d5', base: '#d9c8a1', dark: '#87724e' }
];
const ornaments = [];
for (let row = 0; row < 8; row++) {
  const fy = 0.22 + row * 0.088;
  const available = 0.43 * Math.pow(fy, 0.8);
  const count = 2 + Math.floor(row * 0.65);
  for (let col = 0; col < count; col++) {
    const spread = count === 1 ? 0 : (col / (count - 1) - 0.5) * 1.55;
    ornaments.push({
      nx: spread * available + (random() - 0.5) * 0.025,
      ny: fy + (random() - 0.5) * 0.025,
      size: 0.72 + random() * 0.48,
      color: (row + col * 3) % ornamentPalette.length,
      group: (row * 2 + col) % 4,
      drop: (row + col) % 7 === 0,
      stripe: random() > 0.62
    });
  }
}

function clamp(value, min = 0, max = 1) { return Math.max(min, Math.min(max, value)); }
function smoothstep(a, b, value) {
  const x = clamp((value - a) / (b - a));
  return x * x * (3 - 2 * x);
}
function pulse(time, cue, decay = 5) {
  const age = time - cue;
  return age >= 0 && age < 1.5 ? Math.exp(-age * decay) : 0;
}
function latestCue(time, cues) {
  let index = -1;
  for (let i = 0; i < cues.length; i++) {
    if (cues[i] <= time) index = i;
    else break;
  }
  return index;
}
function circle(x, y, radius) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, radius), 0, TAU);
}
function glow(x, y, radius, inner, outer = 'rgba(255,220,140,0)') {
  if (radius <= 0) return;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  circle(x, y, radius);
  ctx.fill();
}
function roundedRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function musicalState(time) {
  let beat = 0;
  let direction = 0;
  CUES.beats.forEach((cue, index) => {
    const p = pulse(time, cue, 5.8);
    beat = Math.max(beat, p);
    direction += p * (index % 2 ? -1 : 1);
  });
  let accent = 0;
  CUES.accents.forEach(cue => { accent = Math.max(accent, pulse(time, cue, 3.6)); });
  const bellGroups = [0, 0, 0, 0];
  let bell = 0;
  CUES.bells.forEach((cue, index) => {
    const p = pulse(time, cue, 4.2);
    bellGroups[index % 4] = Math.max(bellGroups[index % 4], p);
    bell = Math.max(bell, p);
  });
  const section = time < 8.4 ? 'opening' : time < 17.35 ? 'faster' : 'ending';
  let energy;
  if (section === 'opening') energy = 0.28 + smoothstep(0, 8.4, time) * 0.48;
  else if (section === 'faster') energy = 1;
  else energy = 1 - smoothstep(17.35, 19, time) * 0.62;
  return { beat, direction, accent, bell, bellGroups, section, energy };
}

function drawBackground(time, state, cx, baseY, treeHeight) {
  const w = viewWidth;
  const h = viewHeight;
  const faster = state.section === 'faster' ? 1 : 0;
  const ending = smoothstep(17.35, 19, time);

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, faster ? '#102d31' : '#0b2b30');
  sky.addColorStop(0.58, faster ? '#123531' : '#0c302f');
  sky.addColorStop(1, '#071d23');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  glow(cx, baseY - treeHeight * 0.52, treeHeight * (0.83 + state.accent * 0.07),
    `rgba(89,129,84,${0.12 + state.energy * 0.06 + ending * 0.08})`);
  glow(cx, baseY - treeHeight * 0.45, treeHeight * 0.53,
    `rgba(232,179,83,${0.025 + state.accent * 0.09 + ending * 0.08})`);

  // Quiet stars answer the same four high-bell groups as the ornaments.
  stars.forEach(star => {
    const x = star.x * w;
    const y = star.y * h;
    const chime = state.bellGroups[star.group];
    const alpha = clamp(star.alpha * 0.64 + chime * 0.52, 0, 0.95);
    ctx.fillStyle = `rgba(248,232,190,${alpha})`;
    circle(x, y, star.size + chime * 0.65);
    ctx.fill();
    if (star.cross || chime > 0.72) {
      ctx.strokeStyle = `rgba(250,226,165,${alpha * 0.65})`;
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.moveTo(x - star.size * 3.3, y); ctx.lineTo(x + star.size * 3.3, y);
      ctx.moveTo(x, y - star.size * 3.3); ctx.lineTo(x, y + star.size * 3.3);
      ctx.stroke();
    }
  });

  const moonX = w > 650 ? w * 0.145 : w * 0.14;
  const moonY = h * 0.235;
  const moonR = Math.min(w, h) * 0.035;
  glow(moonX, moonY, moonR * 3.7, 'rgba(239,224,174,.10)');
  ctx.fillStyle = '#e9ddb7';
  circle(moonX, moonY, moonR);
  ctx.fill();
  ctx.fillStyle = '#0d2d30';
  circle(moonX + moonR * 0.43, moonY - moonR * 0.18, moonR * 0.91);
  ctx.fill();

  drawOverheadLights(state, w, h);
  drawDistantForest(w, h);

  // Snow dunes hide the forest floor and give the tree a soft stage.
  const drift = ctx.createLinearGradient(0, h * 0.7, 0, h);
  drift.addColorStop(0, '#b6cabe');
  drift.addColorStop(0.45, '#d7dfcf');
  drift.addColorStop(1, '#91ada5');
  ctx.fillStyle = drift;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.79);
  ctx.bezierCurveTo(w * 0.2, h * 0.72, w * 0.32, h * 0.84, w * 0.53, h * 0.79);
  ctx.bezierCurveTo(w * 0.74, h * 0.72, w * 0.85, h * 0.8, w, h * 0.75);
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();

  ctx.fillStyle = 'rgba(244,239,213,.36)';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.86);
  ctx.bezierCurveTo(w * 0.25, h * 0.78, w * 0.56, h * 0.94, w, h * 0.82);
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();

  drawSnow(time, state, false);
}

function drawOverheadLights(state, w, h) {
  const startX = -w * 0.02;
  const endX = w * 1.02;
  const startY = h * 0.09;
  const controlY = h * 0.245;
  ctx.strokeStyle = 'rgba(21,50,43,.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.quadraticCurveTo(w * 0.5, controlY, endX, startY * 0.85);
  ctx.stroke();
  const count = w < 500 ? 13 : 21;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.35) / count;
    const mt = 1 - t;
    const x = mt * mt * startX + 2 * mt * t * w * 0.5 + t * t * endX;
    const y = mt * mt * startY + 2 * mt * t * controlY + t * t * startY * 0.85;
    const group = i % 4;
    const p = state.bellGroups[group];
    const length = 7 + (i % 3) * 2;
    ctx.strokeStyle = 'rgba(35,63,48,.9)';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + length); ctx.stroke();
    if (p > 0.04) glow(x, y + length + 2, 13 + p * 9, `rgba(255,211,116,${p * 0.35})`);
    ctx.fillStyle = p > 0.08 ? `rgba(255,224,151,${0.72 + p * 0.28})` : 'rgba(210,177,105,.72)';
    circle(x, y + length + 2, 2.1 + p * 0.7);
    ctx.fill();
  }
}

function drawDistantForest(w, h) {
  const trees = [
    [0.025, .24, .71], [.085, .18, .74], [.155, .24, .75], [.235, .16, .76],
    [.31, .12, .77], [.71, .13, .76], [.78, .22, .75], [.86, .17, .73], [.94, .27, .73], [1.01, .2, .75]
  ];
  trees.forEach(([nx, size, ground], index) => {
    const x = nx * w;
    const height = size * h;
    const base = ground * h;
    const half = height * 0.21;
    ctx.fillStyle = index % 2 ? 'rgba(8,43,39,.68)' : 'rgba(11,52,44,.72)';
    ctx.beginPath();
    ctx.moveTo(x, base - height);
    for (let level = 0; level < 5; level++) {
      const ly = base - height + height * (0.18 + level * 0.16);
      const lw = half * (0.35 + level * 0.18);
      ctx.lineTo(x - lw * 0.55, ly - height * 0.07);
      ctx.lineTo(x - lw, ly + height * 0.12);
      ctx.lineTo(x - lw * 0.25, ly + height * 0.08);
    }
    ctx.lineTo(x - half * 0.1, base);
    ctx.lineTo(x + half * 0.1, base);
    for (let level = 4; level >= 0; level--) {
      const ly = base - height + height * (0.18 + level * 0.16);
      const lw = half * (0.35 + level * 0.18);
      ctx.lineTo(x + lw * 0.25, ly + height * 0.08);
      ctx.lineTo(x + lw, ly + height * 0.12);
      ctx.lineTo(x + lw * 0.55, ly - height * 0.07);
    }
    ctx.closePath(); ctx.fill();
  });
}

function drawSnow(time, state, front) {
  const speedScale = state.section === 'faster' ? 1.55 : state.section === 'ending' ? 0.55 : 0.85;
  snow.forEach(flake => {
    if (flake.front !== front) return;
    const y = ((flake.y * viewHeight + time * flake.speed * speedScale) % (viewHeight * 0.91)) - 5;
    const x = flake.x * viewWidth + Math.sin(time * 0.55 + flake.phase) * (5 + flake.size * 2);
    ctx.fillStyle = `rgba(241,241,218,${flake.alpha * (front ? 0.75 : 0.55)})`;
    circle(x, y, flake.size * (front ? 1.15 : 0.72));
    ctx.fill();
  });
}

function drawAccentWave(time, state, cx, cy, treeHeight) {
  const index = latestCue(time, CUES.accents);
  if (index < 0) return;
  const age = time - CUES.accents[index];
  if (age < 0 || age > 1.25) return;
  const alpha = (1 - age / 1.25) * 0.32;
  ctx.save();
  ctx.strokeStyle = `rgba(245,211,132,${alpha})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, treeHeight * (0.19 + age * 0.35), treeHeight * (0.28 + age * 0.39), 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawBranch(y, spread, depth, layer, beat) {
  const bottom = [
    [-1, .65], [-.91, .74], [-.97, .88], [-.75, .80], [-.72, .99],
    [-.5, .87], [-.39, 1.06], [-.18, .93], [0, 1.055]
  ];
  const gradient = ctx.createLinearGradient(-spread, y, spread, y + depth);
  gradient.addColorStop(0, layer % 2 ? '#0b362e' : '#0d3b31');
  gradient.addColorStop(0.46, layer % 2 ? '#245a40' : '#20533b');
  gradient.addColorStop(0.7, '#174733');
  gradient.addColorStop(1, '#092f2a');
  ctx.fillStyle = gradient;
  if (beat > 0.2) {
    ctx.shadowColor = `rgba(116,170,102,${beat * 0.25})`;
    ctx.shadowBlur = beat * 8;
  }
  ctx.beginPath();
  ctx.moveTo(0, y - depth * 0.15);
  ctx.bezierCurveTo(-spread * 0.25, y + depth * 0.04, -spread * 0.65, y + depth * 0.31, -spread, y + depth * 0.65);
  bottom.forEach(([x, yy]) => ctx.lineTo(x * spread, y + yy * depth));
  for (let i = bottom.length - 2; i >= 0; i--) {
    ctx.lineTo(-bottom[i][0] * spread, y + bottom[i][1] * depth);
  }
  ctx.bezierCurveTo(spread * 0.65, y + depth * 0.31, spread * 0.25, y + depth * 0.04, 0, y - depth * 0.15);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = 'rgba(105,145,92,.19)';
  ctx.lineWidth = Math.max(0.55, depth * 0.009);
  for (let side = -1; side <= 1; side += 2) {
    for (let twig = 0; twig < 7; twig++) {
      const f = 0.13 + twig * 0.105;
      const sx = side * spread * f;
      const sy = y + depth * (0.18 + f * 0.41);
      ctx.beginPath();
      ctx.moveTo(sx * 0.64, sy - depth * 0.1);
      ctx.quadraticCurveTo(sx, sy, side * spread * (f + 0.12), sy + depth * 0.16);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + side * spread * 0.045, sy - depth * 0.075);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(4,35,29,.32)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-spread * 0.72, y + depth * 0.98);
  ctx.quadraticCurveTo(0, y + depth * 1.17, spread * 0.72, y + depth * 0.98);
  ctx.stroke();
}

function drawBranchSnow(treeWidth, treeHeight) {
  ctx.fillStyle = 'rgba(218,226,202,.58)';
  const patches = [
    [-1, .35, .18], [1, .48, .21], [-1, .62, .25], [1, .75, .20], [-1, .84, .18]
  ];
  patches.forEach(([side, fy, width]) => {
    const y = -treeHeight + fy * treeHeight;
    const x = side * treeWidth * (0.1 + fy * 0.2);
    const length = treeWidth * width;
    ctx.beginPath();
    ctx.moveTo(x - side * length * 0.5, y);
    ctx.quadraticCurveTo(x, y - treeHeight * 0.018, x + side * length * 0.5, y + treeHeight * 0.01);
    ctx.quadraticCurveTo(x + side * length * 0.14, y + treeHeight * 0.034, x - side * length * 0.5, y);
    ctx.fill();
  });
}

function drawOrnament(ornament, index, treeWidth, treeHeight, state, time) {
  const x = ornament.nx * treeWidth;
  const y = -treeHeight + ornament.ny * treeHeight;
  const unit = treeHeight / 390;
  const radius = (5.2 + ornament.size * 2.2) * unit;
  const p = state.bellGroups[ornament.group];
  const color = ornamentPalette[ornament.color];

  ctx.strokeStyle = 'rgba(208,186,119,.55)';
  ctx.lineWidth = 0.75;
  ctx.beginPath(); ctx.moveTo(x, y - radius * 1.9); ctx.lineTo(x, y - radius * 0.75); ctx.stroke();
  if (p > 0.025) glow(x, y, radius * (3.4 + p * 2.5), `rgba(255,220,142,${p * 0.32})`);

  ctx.save();
  ctx.translate(x, y);
  if (ornament.drop) ctx.scale(0.83, 1.25);
  const body = ctx.createRadialGradient(-radius * 0.35, -radius * 0.42, radius * 0.06, 0, 0, radius * 1.15);
  body.addColorStop(0, color.light);
  body.addColorStop(0.36, color.base);
  body.addColorStop(1, color.dark);
  ctx.fillStyle = body;
  circle(0, 0, radius * (1 + p * 0.055));
  ctx.fill();
  ctx.strokeStyle = `rgba(255,231,174,${0.18 + p * 0.58})`;
  ctx.lineWidth = 0.7;
  ctx.stroke();
  if (ornament.stripe) {
    ctx.strokeStyle = 'rgba(255,231,174,.52)';
    ctx.lineWidth = Math.max(0.7, radius * 0.13);
    ctx.beginPath(); ctx.arc(0, 0, radius * 0.78, 0.18, Math.PI - 0.18); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,230,.68)';
  circle(-radius * 0.32, -radius * 0.36, radius * 0.14);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#bda66c';
  roundedRect(x - radius * 0.27, y - radius * 1.12, radius * 0.54, radius * 0.3, 1);
  ctx.fill();
}

function drawBellRipple(time, treeWidth, treeHeight) {
  const bellIndex = latestCue(time, CUES.bells);
  if (bellIndex < 0) return;
  const age = time - CUES.bells[bellIndex];
  if (age > 1.05) return;
  const group = bellIndex % 4;
  const candidates = ornaments.filter(item => item.group === group);
  const target = candidates[Math.floor(bellIndex / 4) % candidates.length];
  const x = target.nx * treeWidth;
  const y = -treeHeight + target.ny * treeHeight;
  const unit = treeHeight / 390;
  const alpha = 1 - age / 1.05;
  ctx.strokeStyle = `rgba(255,230,166,${alpha * 0.72})`;
  ctx.lineWidth = 1;
  circle(x, y, (12 + age * 33) * unit);
  ctx.stroke();
  for (let ray = 0; ray < 4; ray++) {
    const angle = ray * Math.PI / 2 + Math.PI / 4;
    const inner = (13 + age * 18) * unit;
    const outer = inner + 6 * unit * alpha;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
    ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
    ctx.stroke();
  }
}

function drawGarlands(treeWidth, treeHeight, state) {
  const unit = treeHeight / 390;
  for (let row = 0; row < 5; row++) {
    const fy = 0.29 + row * 0.125;
    const y = -treeHeight + fy * treeHeight;
    const half = treeWidth * 0.43 * Math.pow(fy, 0.8) * 0.96;
    const sag = treeHeight * (0.042 + row * 0.002);
    ctx.strokeStyle = 'rgba(211,177,99,.62)';
    ctx.lineWidth = Math.max(0.65, unit);
    ctx.beginPath();
    ctx.moveTo(-half, y);
    ctx.quadraticCurveTo(0, y + sag * 2, half, y);
    ctx.stroke();
    const bulbs = 11 + row * 2;
    for (let j = 0; j <= bulbs; j++) {
      const t = j / bulbs;
      const mt = 1 - t;
      const x = -half * mt + half * t;
      const by = mt * mt * y + 2 * mt * t * (y + sag * 2) + t * t * y;
      const group = (j + row) % 4;
      const p = state.bellGroups[group];
      if (p > 0.05) glow(x, by, (7 + p * 8) * unit, `rgba(255,218,133,${p * 0.38})`);
      ctx.fillStyle = `rgba(255,${Math.round(205 + p * 35)},${Math.round(132 + p * 65)},${0.68 + p * 0.32})`;
      circle(x, by, (1.35 + p * 0.8) * unit);
      ctx.fill();
    }
  }
}

function drawTopStar(x, y, radius, state, time) {
  const ending = smoothstep(17.35, 19, time);
  const brightness = 0.24 + state.accent * 0.65 + state.bell * 0.25 + ending * 0.5;
  glow(x, y, radius * (3.7 + brightness * 2), `rgba(255,215,122,${0.13 + brightness * 0.24})`);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  if (state.accent > 0.12) {
    ctx.strokeStyle = `rgba(255,225,154,${state.accent * 0.52})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const angle = i * TAU / 8;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * radius * 1.35, Math.sin(angle) * radius * 1.35);
      ctx.lineTo(Math.cos(angle) * radius * (1.8 + state.accent * 0.9), Math.sin(angle) * radius * (1.8 + state.accent * 0.9));
      ctx.stroke();
    }
  }
  const gold = ctx.createRadialGradient(-radius * 0.2, -radius * 0.25, 0, 0, 0, radius);
  gold.addColorStop(0, '#fff4c9');
  gold.addColorStop(0.45, '#f4ce73');
  gold.addColorStop(1, '#b7772f');
  ctx.fillStyle = gold;
  ctx.strokeStyle = '#ffe6a2';
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? radius * 0.43 : radius * (1 + state.beat * 0.055);
    const angle = i * Math.PI / 5;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#fff3c5';
  circle(x - radius * 0.13, y - radius * 0.2, radius * 0.1);
  ctx.fill();
}

function drawTree(time, state, cx, baseY, treeHeight, treeWidth) {
  // Ground response is separate from the dancing tree, anchoring it in the snow.
  ctx.fillStyle = `rgba(13,48,42,${0.24 - state.beat * 0.05})`;
  ctx.beginPath();
  ctx.ellipse(cx, baseY + 7, treeWidth * (0.54 - state.beat * 0.025), treeHeight * 0.045, 0, 0, TAU);
  ctx.fill();
  if (state.beat > 0.04) {
    ctx.strokeStyle = `rgba(240,215,151,${state.beat * 0.28})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, baseY + 4, treeWidth * (0.4 + (1 - state.beat) * 0.15), treeHeight * 0.027, 0, 0, TAU);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(cx, baseY - state.beat * (5 + state.energy * 8) - state.accent * 3);
  ctx.rotate(state.direction * (0.014 + state.energy * 0.024));
  ctx.scale(1 + state.beat * 0.011, 1 + state.beat * 0.014);

  const trunk = ctx.createLinearGradient(-treeWidth * 0.04, 0, treeWidth * 0.04, 0);
  trunk.addColorStop(0, '#49372a'); trunk.addColorStop(.5, '#886445'); trunk.addColorStop(1, '#3c3028');
  ctx.fillStyle = trunk;
  ctx.beginPath();
  ctx.moveTo(-treeWidth * .035, 1); ctx.lineTo(-treeWidth * .025, -treeHeight * .17);
  ctx.lineTo(treeWidth * .026, -treeHeight * .17); ctx.lineTo(treeWidth * .04, 1); ctx.closePath(); ctx.fill();

  for (let layer = 10; layer >= 0; layer--) {
    const y = -treeHeight + layer * treeHeight * 0.075 + treeHeight * 0.04;
    const spread = treeWidth * (0.075 + layer * 0.042);
    const depth = treeHeight * (0.19 - layer * 0.002);
    drawBranch(y, spread, depth, layer, state.beat);
  }
  drawBranchSnow(treeWidth, treeHeight);

  ornaments.forEach((ornament, index) => drawOrnament(ornament, index, treeWidth, treeHeight, state, time));
  drawGarlands(treeWidth, treeHeight, state);
  drawBellRipple(time, treeWidth, treeHeight);
  drawTopStar(0, -treeHeight - treeHeight * 0.018, treeHeight * 0.057, state, time);
  ctx.restore();
}

function drawPresent(x, y, width, height, color, ribbon, tilt, pattern) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.fillStyle = 'rgba(21,50,43,.16)';
  ctx.beginPath(); ctx.ellipse(0, 3, width * .63, height * .13, 0, 0, TAU); ctx.fill();
  const paper = ctx.createLinearGradient(-width / 2, 0, width / 2, 0);
  paper.addColorStop(0, color); paper.addColorStop(.5, color); paper.addColorStop(1, '#263e35');
  ctx.fillStyle = paper;
  roundedRect(-width / 2, -height, width, height, 2.5); ctx.fill();
  if (pattern) {
    ctx.save();
    roundedRect(-width / 2, -height, width, height, 2.5); ctx.clip();
    ctx.strokeStyle = 'rgba(255,239,199,.17)'; ctx.lineWidth = 1;
    for (let line = -width; line < width; line += 8) {
      ctx.beginPath(); ctx.moveTo(line, 0); ctx.lineTo(line + height, -height); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.fillStyle = ribbon;
  ctx.fillRect(-width * 0.07, -height, width * 0.14, height);
  ctx.fillRect(-width / 2, -height * 0.7, width, Math.max(2, height * .09));
  ctx.fillStyle = ribbon;
  roundedRect(-width * .55, -height - 5, width * 1.1, 7, 2); ctx.fill();
  ctx.strokeStyle = ribbon;
  ctx.lineWidth = Math.max(2.2, width * .055);
  ctx.beginPath();
  ctx.moveTo(0, -height - 4);
  ctx.bezierCurveTo(-width * .42, -height - width * .36, -width * .38, -height + 1, 0, -height - 3);
  ctx.bezierCurveTo(width * .42, -height - width * .36, width * .38, -height + 1, 0, -height - 3);
  ctx.stroke();
  ctx.restore();
}

function drawGifts(cx, baseY, treeHeight, treeWidth) {
  const s = treeHeight / 390;
  drawPresent(cx - treeWidth * .48, baseY + 5, 48 * s, 35 * s, '#81353a', '#d5b66e', -0.06, true);
  drawPresent(cx - treeWidth * .24, baseY + 10, 42 * s, 29 * s, '#315f50', '#d9c088', 0.045, false);
  drawPresent(cx + treeWidth * .43, baseY + 6, 52 * s, 39 * s, '#a05243', '#e3c680', 0.055, true);
  drawPresent(cx + treeWidth * .25, baseY + 10, 34 * s, 27 * s, '#d0b477', '#874047', -0.04, false);
}

function drawEndingLight(time, cx, baseY, treeHeight) {
  if (time < 17.35) return;
  const amount = smoothstep(17.35, 19, time);
  glow(cx, baseY - treeHeight * .48, treeHeight * .6, `rgba(255,215,138,${amount * .08})`);
  ctx.fillStyle = `rgba(255,239,194,${amount * .5})`;
  for (let i = 0; i < 9; i++) {
    const angle = i * 2.4;
    const radius = treeHeight * (.17 + (i % 4) * .07);
    const x = cx + Math.cos(angle) * radius;
    const y = baseY - treeHeight * .52 + Math.sin(angle) * radius * 1.15;
    circle(x, y, 0.7 + amount * .8); ctx.fill();
  }
}

function drawScene(rawTime) {
  const time = clamp(Number.isFinite(rawTime) ? rawTime : 0, 0, CUES.duration);
  lastDrawnTime = time;
  if (!viewWidth || !viewHeight) return;
  ctx.clearRect(0, 0, viewWidth, viewHeight);
  const state = musicalState(time);
  const treeHeight = Math.min(viewHeight * 0.72, viewWidth * 0.88);
  const treeWidth = treeHeight * 0.68;
  const cx = viewWidth > 650 ? viewWidth * 0.55 : viewWidth * 0.52;
  const baseY = viewHeight * 0.875;

  drawBackground(time, state, cx, baseY, treeHeight);
  drawAccentWave(time, state, cx, baseY - treeHeight * .48, treeHeight);
  drawTree(time, state, cx, baseY, treeHeight, treeWidth);
  drawGifts(cx, baseY, treeHeight, treeWidth);
  drawEndingLight(time, cx, baseY, treeHeight);
  drawSnow(time, state, true);

  const vignette = ctx.createRadialGradient(viewWidth * .5, viewHeight * .46, viewHeight * .2, viewWidth * .5, viewHeight * .46, viewWidth * .72);
  vignette.addColorStop(0, 'rgba(2,15,18,0)');
  vignette.addColorStop(1, 'rgba(2,15,18,.24)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, viewWidth, viewHeight);
}

function formatTime(time) {
  const seconds = Math.max(0, Math.floor(time));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function updateInterface(time) {
  const progress = clamp(time / CUES.duration) * 100;
  seek.value = String(time);
  seek.style.setProperty('--progress', `${progress}%`);
  seek.setAttribute('aria-valuetext', `${time.toFixed(1)} 秒，共 19 秒`);
  currentTimeLabel.textContent = formatTime(time);
  const section = time < 8.4 ? 'opening' : time < 17.35 ? 'faster' : 'ending';
  if (section !== activeSection) {
    activeSection = section;
    stage.dataset.section = section;
    if (section === 'opening') {
      sectionLabel.textContent = '序章 · 初雪';
      movementText.textContent = '灯序缓缓亮起';
    } else if (section === 'faster') {
      sectionLabel.textContent = '间奏 · 铃舞';
      movementText.textContent = '踏着密拍，旋起星光';
    } else {
      sectionLabel.textContent = '尾声 · 长明';
      movementText.textContent = '愿此刻温暖长明';
    }
  }
}

function render(time) {
  const safeTime = clamp(Number.isFinite(time) ? time : 0, 0, CUES.duration);
  drawScene(safeTime);
  updateInterface(safeTime);
}

function animationTick() {
  animationFrame = 0;
  render(music.currentTime);
  if (!music.paused && !music.ended) animationFrame = requestAnimationFrame(animationTick);
}
function beginFrames() {
  if (!animationFrame) animationFrame = requestAnimationFrame(animationTick);
}
function updatePlayButton() {
  const playing = !music.paused && !music.ended;
  play.classList.toggle('is-playing', playing);
  playText.textContent = playing ? '暂停' : music.ended ? '重播' : '播放';
  play.setAttribute('aria-label', playing ? '暂停音乐' : music.ended ? '从零重播音乐' : '播放音乐');
}

play.addEventListener('click', async () => {
  if (!music.paused && !music.ended) {
    music.pause();
    return;
  }
  if (music.ended || music.currentTime >= CUES.duration - 0.015) {
    music.currentTime = 0;
    render(0);
  }
  try {
    await music.play();
  } catch (error) {
    updatePlayButton();
  }
});

seek.addEventListener('input', () => {
  const time = Number(seek.value);
  try { music.currentTime = time; } catch (error) { /* Metadata may not be ready; the requested frame still renders. */ }
  render(time);
  if (!music.paused && !music.ended) beginFrames();
});

music.addEventListener('play', () => { updatePlayButton(); beginFrames(); });
music.addEventListener('playing', () => { updatePlayButton(); beginFrames(); });
music.addEventListener('pause', () => {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  render(music.currentTime);
  updatePlayButton();
});
music.addEventListener('ended', () => {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  render(CUES.duration);
  updatePlayButton();
});
music.addEventListener('timeupdate', () => { if (music.paused) render(music.currentTime); });
music.addEventListener('seeked', () => render(music.currentTime));
music.addEventListener('loadedmetadata', () => render(music.currentTime));

function resizeCanvas() {
  const bounds = stage.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  viewWidth = Math.max(1, bounds.width);
  viewHeight = Math.max(1, bounds.height);
  canvas.width = Math.round(viewWidth * ratio);
  canvas.height = Math.round(viewHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  render(music.currentTime || lastDrawnTime);
}

if ('ResizeObserver' in window) new ResizeObserver(resizeCanvas).observe(stage);
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
updatePlayButton();
