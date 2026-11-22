'use strict';

// Production markers from cue-sheet.json, embedded so the card also works from file://.
const cue = {
  duration: 19,
  beats: [0.4, 1.06, 1.72, 2.38, 3.04, 3.7, 4.36, 5.02, 5.68, 6.34, 7, 7.66, 8.4, 8.88, 9.36, 9.84, 10.32, 10.8, 11.28, 11.76, 12.24, 12.72, 13.2, 13.68, 14.16, 14.64, 15.12, 15.6, 16.08, 16.56],
  accents: [0.4, 3.04, 5.68, 8.4, 10.32, 12.24, 14.16, 16.08],
  bells: [1.39, 2.71, 4.03, 5.35, 6.67, 7.99, 9.12, 10.08, 11.04, 12, 12.96, 13.92, 14.88, 15.84, 16.8],
  sections: { opening: 0, faster: 8.4, ending: 17.35 }
};

const select = selector => document.querySelector(selector);
const music = select('#music');
const play = select('#play');
const seek = select('#seek');
const mute = select('#mute');
const stage = select('#stage');
const canvas = select('#stage canvas');
const pen = canvas.getContext('2d');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const chapters = [
  ['opening', 'I', 'OVERTURE', '序曲 · 松枝初醒'],
  ['faster', 'II', 'ALLEGRO', '快舞 · 满树金铃'],
  ['ending', 'III', 'FINALE', '尾声 · 星光落定']
];
const chapterFields = ['#chapter-no', '#chapter-en', '#chapter-zh'].map(select);

const W = 620, H = 560, X = 310, INSCRIPTION_Y = 535;
const tau = Math.PI * 2;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, mix) => a + (b - a) * mix;
const ease = v => { v = clamp(v); return v * v * (3 - 2 * v); };
const between = (t, a, b) => ease((t - a) / (b - a));
const alpha = (rgb, opacity) => 'rgba(' + rgb + ',' + clamp(opacity) + ')';
const GOLD = '244,199,118', ICE = '151,224,221';

function rng(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const noise = rng(2212);
function path(g, points) {
  g.beginPath();
  points.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
  g.closePath();
}
function disc(g, x, y, r, fill) {
  g.fillStyle = fill;
  g.beginPath(); g.arc(x, y, r, 0, tau); g.fill();
}
function oval(g, x, y, rx, ry, fill) {
  g.fillStyle = fill;
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, tau); g.fill();
}
function line(g, x, y, xx, yy, stroke, width = 1) {
  g.strokeStyle = stroke; g.lineWidth = width;
  g.beginPath(); g.moveTo(x, y); g.lineTo(xx, yy); g.stroke();
}
function glow(g, x, y, radius, rgb, opacity) {
  if (opacity <= .004) return;
  const grad = g.createRadialGradient(x, y, 0, x, y, radius);
  grad.addColorStop(0, alpha(rgb, opacity));
  grad.addColorStop(.28, alpha(rgb, opacity * .53));
  grad.addColorStop(1, alpha(rgb, 0));
  g.fillStyle = grad;
  g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}
function sparkle(g, x, y, r, color, squeeze = .68) {
  path(g, [[x,y-r],[x+r*.17,y-r*.17],[x+r*squeeze,y],[x+r*.17,y+r*.17],
    [x,y+r],[x-r*.17,y+r*.17],[x-r*squeeze,y],[x-r*.17,y-r*.17]]);
  g.fillStyle = color; g.fill();
}

// These analytic envelopes can be evaluated out of order: scrubbing never needs a history buffer.
function pulse(dt, attack, release) {
  if (dt < -attack || dt > release) return 0;
  return dt < 0 ? ease(1 + dt / attack) : 1 - ease(dt / release);
}
const accents = new Set(cue.accents);
function pose(t) {
  const chapter = t >= cue.sections.ending ? 2 : t >= cue.sections.faster ? 1 : 0;
  const quick = between(t, cue.sections.faster - .14, cue.sections.faster + .23) *
    (1 - between(t, cue.sections.ending - .10, cue.sections.ending + .65));
  const finale = between(t, cue.sections.ending - .03, cue.sections.ending + .85);
  let strike = 0, offbeat = 0, tilt = 0, squat = 0;
  cue.accents.forEach((at, i) => {
    const dt = t - at;
    const hit = pulse(dt, .085, .28);
    const rebound = pulse(dt - .243, .118, .21);
    strike = Math.max(strike, hit);
    tilt += (i % 2 ? -1 : 1) * ((.079 + .050 * quick) * hit - .041 * rebound);
    squat += .033 * hit - .016 * rebound;
  });
  cue.beats.forEach((at, i) => {
    if (accents.has(at)) return;
    const hit = pulse(t - at, .045, .165);
    offbeat = Math.max(offbeat, hit);
    tilt += (i % 2 ? -.021 : .021) * (1 + .42 * quick) * hit;
    squat += .012 * hit;
  });
  // Quiet weight shifts between percussion hits use the local interval, not a repeating clock.
  let step = -1;
  for (let i = 0; i < cue.beats.length && cue.beats[i] <= t; i++) step = i;
  if (step >= 0 && step + 1 < cue.beats.length) {
    const p = (t - cue.beats[step]) / (cue.beats[step + 1] - cue.beats[step]);
    tilt += Math.sin(p * Math.PI) * (step % 2 ? -.014 : .014) * (1 + .7 * quick);
  }
  const arrival = pulse(t - cue.sections.ending - .29, .30, 1.18);
  const settle = pulse(t - cue.sections.ending - .43, .43, .89);
  tilt += -.021 * settle;
  const scale = reduced.matches ? .17 : 1;
  return { t, chapter, quick, finale, arrival, strike, offbeat, tilt: tilt * scale, squat: squat * scale,
    lean: (quick * .53 + .47) * scale,
    growth: between(t, .18, 7.89) };
}

const dust = Array.from({ length: 235 }, () => [
  35 + noise() * 550, 21 + noise() * 508, .23 + noise() ** 2 * 1.1, .08 + noise() * .43, noise()
]);
const stars = [
  [97,139,5],[143,86,4],[204,45,5],[257,101,4],[374,63,4],[433,61,5],
  [489,115,7],[530,204,4],[111,239,7],[139,319,4],[89,379,4],[112,430,5],
  [476,175,4],[494,265,5],[530,355,6],[512,417,4],[200,132,3],[407,127,4],
  [80,281,2],[546,126,2],[552,471,4],[68,481,3]
];
const grain = Array.from({ length: 430 }, () => [noise() * W, noise() * H, .10 + noise() * .55]);
function arch(g, x, y, width, bottom) {
  const spring = y + width * .5;
  g.beginPath();
  g.moveTo(x - width, bottom); g.lineTo(x - width, spring);
  g.bezierCurveTo(x - width, y - 18, x - width * .32, y, x, y);
  g.bezierCurveTo(x + width * .32, y, x + width, y - 18, x + width, spring);
  g.lineTo(x + width, bottom); g.stroke();
}
function background(g, p, width) {
  const { t, quick, finale, growth, arrival, strike, offbeat } = p;
  g.fillStyle = '#0d211e';
  g.fillRect((W - width) / 2, 0, width, H);
  const atmos = g.createRadialGradient(X, 265, 20, X, 272, 339);
  atmos.addColorStop(0, alpha(ICE, .12 + .12 * finale));
  atmos.addColorStop(.63, alpha(ICE, .044 + .026 * finale));
  atmos.addColorStop(1, alpha(ICE, 0));
  g.fillStyle = atmos; g.fillRect(0, 0, W, H);
  glow(g, X + p.tilt * 130, 275, 265, GOLD, .10 + .23 * quick + .12 * strike + .13 * arrival);
  glow(g, X, 113, 182, ICE, .19 * finale);
  for (const [gx, gy, opacity] of grain) {
    g.fillStyle = alpha('212,231,188', opacity * .22);
    g.fillRect(gx, gy, 1, 1);
  }
  g.lineWidth = .65;
  g.strokeStyle = alpha(GOLD, .19 + .08 * growth + .10 * strike);
  arch(g, X, 40, 187, 458);
  g.strokeStyle = alpha(GOLD, .135 + .13 * quick + .07 * finale);
  arch(g, X, 48, 176, 450);
  for (const side of [-1, 1]) {
    const x = X + side * 200;
    line(g, x, 162, x, 466, alpha(GOLD, .125), .65);
    sparkle(g, x, 158, 5.5, alpha(GOLD, .50 + .25 * quick));
    sparkle(g, x, 469, 4.5, alpha(GOLD, .39));
    line(g, x, 158, x + side * 29, 158, alpha(GOLD, .23), .65);
    for (let i = 0; i < 10; i++) {
      const y = 184 + i * 28;
      line(g, x, y, x + side * (i % 3 ? 3.5 : 8), y, alpha(GOLD, .28), .65);
    }
  }
  const cy = 238;
  for (let i = 0; i < 56; i++) {
    const a = i * tau / 56, dx = Math.cos(a), dy = Math.sin(a);
    const r = 128 - (i % 4 === 0 ? 15 : 0);
    line(g, X + dx * r, cy + dy * r, X + dx * 165, cy + dy * 165,
      alpha(GOLD, .105 + .13 * quick + .12 * strike), i % 4 === 0 ? .9 : .55);
  }
  for (const [r, opacity] of [[109, .08], [137,.10], [165,.22], [169,.11]]) {
    g.beginPath(); g.arc(X, cy, r, 0, tau); g.lineWidth = .6;
    g.strokeStyle = alpha(GOLD, opacity + .10 * quick); g.stroke();
  }
  for (const side of [-1, 1]) {
    const a = side === 1 ? -.33 : Math.PI - .33;
    const glint = .03 + .47 * quick + .32 * strike;
    g.strokeStyle = alpha(GOLD, glint); g.lineWidth = .95;
    g.beginPath(); g.arc(X, cy, 171 + strike * 9, a - .31, a + .33); g.stroke();
  }
  for (const [x, y, r, base, idx] of dust) {
    const drift = reduced.matches ? 0 : t * (1.0 + idx * 1.8);
    const sy = 19 + (y - 19 + drift) % 504;
    const sx = x + Math.sin((sy + idx * 280) * .024) * 3;
    disc(g, sx, sy, r, alpha(idx > .37 ? '248,226,181' : '170,219,212', base * (.74 + .22 * growth + .23 * quick)));
  }
  for (const [i, [x, y, r]] of stars.entries()) {
    const flare = (i % 3 === 0 ? strike : offbeat * .25);
    sparkle(g, x, y, r * (1 + .28 * flare), alpha(i % 4 === 0 ? ICE : GOLD, .40 + .35 * flare + .18 * quick));
  }
}


const tiers = [
  [137,27,39,-4], [173,49,50,3], [212,68,53,-3], [252,89,59,4],
  [294,113,61,-4], [336,132,65,3], [380,151,70,-5], [424,165,74,4]
];
const tierOrigin = [194, 83];
const deepNeedles = ['#103a30','#174639','#1d5141','#296451','#296958','#327761'];
const litNeedles = ['#256253','#2b725e','#367b64','#448971','#559680','#74ad90'];

function makeTier([y, width, height, bias], index) {
  const random = rng(2039 + index * 1087);
  const layer = document.createElement('canvas');
  const size = 1.75;
  layer.width = 388 * size;
  layer.height = 134 * size;
  const g = layer.getContext('2d');
  g.scale(size, size);
  g.translate(...tierOrigin);
  const w = width, h = height;
  const shade = g.createLinearGradient(0, -h, 0, 30);
  shade.addColorStop(0, '#357261'); shade.addColorStop(.43, '#245848');
  shade.addColorStop(.73, '#153e34'); shade.addColorStop(1, '#082720');
  g.beginPath();
  g.moveTo(0, -h);
  g.bezierCurveTo(w * .19, -h * .50, w * .69, -10, w * .99, 15 + bias);
  g.quadraticCurveTo(w * 1.01, 25 + bias, w * .70, 19 + bias);
  g.quadraticCurveTo(w * .61, 31, w * .28, 22);
  g.quadraticCurveTo(0, 39, -w * .33, 22);
  g.quadraticCurveTo(-w * .55, 28, -w * .69, 19 - bias);
  g.quadraticCurveTo(-w * 1.05, 27 - bias, -w * .99, 16 - bias);
  g.bezierCurveTo(-w * .72, -9, -w * .25, -h * .39, 0, -h);
  g.closePath();
  g.fillStyle = shade; g.fill();
  const sheen = g.createRadialGradient(-w * .12, -h * .25, 0, 0, -h * .07, w * .72 + 8);
  sheen.addColorStop(0, 'rgba(91,164,130,.23)'); sheen.addColorStop(1, 'rgba(91,164,130,0)');
  g.fillStyle = sheen; g.fill();
  g.lineCap = 'round';

  function frond(x0, y0, x1, y1, bright, species, breadth) {
    const vx = x1 - x0, vy = y1 - y0;
    const length = Math.hypot(vx, vy);
    const ux = vx / length, uy = vy / length;
    const nx = -uy, ny = ux;
    const crook = (random() - .46) * Math.min(length * .3, 19);
    const point = t => [x0 + vx * t + nx * Math.sin(t * Math.PI) * crook,
      y0 + vy * t + ny * Math.sin(t * Math.PI) * crook];
    const palette = bright ? litNeedles : deepNeedles;
    // Each feather is a twig with paired needles, not a filled brush stamp.
    const mid = point(.5);
    g.strokeStyle = palette[1]; g.globalAlpha = .85;
    g.lineWidth = breadth * .15 + .45;
    g.beginPath(); g.moveTo(x0,y0); g.quadraticCurveTo(mid[0] * 2 - (x0+x1)/2, mid[1] * 2 - (y0+y1)/2, x1,y1); g.stroke();
    const needles = Math.ceil(length / 2.1);
    for (let j = 0; j < needles; j++) {
      const q = (j + .6) / needles;
      const [x, y] = point(q);
      const span = (.35 + .65 * Math.sin(Math.PI * q ** .85)) * (1.09 - .71 * q);
      for (const side of [-1, 1]) {
        const s = breadth * span * (.65 + random() * .75);
        const f = s * (.35 + random() * .85) + 1;
        const cross = side * s * (side * ny > 0 ? .75 : 1);
        const xx = x + nx * cross + ux * f, yy = y + ny * cross + uy * f;
        const tint = Math.min(5, Math.floor(random() * 4.9 + (q > .61 ? .8 : 0)));
        g.strokeStyle = palette[tint];
        g.globalAlpha = .47 + random() * .47;
        g.lineWidth = .40 + random() * .48 + species * .13;
        g.beginPath(); g.moveTo(x,y);
        g.quadraticCurveTo(lerp(x,xx,.59) + ux * .8, lerp(y,yy,.59) + uy * .8, xx,yy);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  }
  for (const side of [-1,1]) {
    for (let j = 0; j < 10; j++) {
      const q = (j + .8) / 10, x0 = side * w * q * .25;
      const x1 = side * w * (.21 + .81 * q) * (.89 + random() * .16);
      const y0 = -h * (.80 - q * .48) + random() * 6;
      const y1 = lerp(-h * .42, 20 + bias * side, q) + (random() - .33) * 10;
      const lit = (j + index + (side > 0 ? 2 : 0)) % 4 !== 1;
      frond(x0, y0, x1, y1, lit, .3, 5 + random() * (3.3 + w * .015));
      if (w > 35) {
        frond(lerp(x0,x1,.34), lerp(y0,y1,.34), x1 * (.72 + random() * .23), y1 + 7 + random()*6,
          j % 4 === 1, 0, 4 + random() * 4);
      }
    }
  }
  for (let j = 0; j < 8; j++) {
    const q = (j - 3.5) / 4;
    const yy = 15 + 9 * (1 - Math.abs(q)) + random() * 6;
    frond(w * q * .18, -h * (.39 + random() * .22), w * q * (.48 + random() * .27), yy,
      j % 3 !== 2, .6, 5 + random() * (2.8 + w * .014));
  }
  return { layer, y, width: layer.width / size, height: layer.height / size };
}
const foliage = tiers.map(makeTier);

function driftAt(y, p) {
  const h = clamp((465 - y) / 357);
  return Math.sin(y * .053 + p.t * 5) * h * p.lean * (1.8 * p.offbeat + 6.6 * p.strike);
}
function trunk(g) {
  const bark = g.createLinearGradient(-17, 0, 20, 0);
  bark.addColorStop(0, '#33261d'); bark.addColorStop(.4, '#785440'); bark.addColorStop(.68, '#54382a'); bark.addColorStop(1, '#2b2821');
  path(g,[[-19,465],[-15,402],[10,401],[17,465],[12,473],[-12,473]]);
  g.fillStyle = bark; g.fill();
  for (let i = 0; i < 8; i++) {
    const x = i * 3.4 - 13;
    line(g, x, 428 - i % 3 * 7, x - (i % 4 - 1.5) * .7, 469 - i%3,
      i % 3 ? '#37282298' : '#c78b5c77', i % 3 ? .7 : 1);
  }
}
function floor(g, p) {
  const f = g.createRadialGradient(X, 489, 8, X, 489, 247);
  f.addColorStop(0, alpha(ICE,.23 + .21 * p.finale));
  f.addColorStop(.6, alpha(ICE,.065 + .04 * p.finale));
  f.addColorStop(1, alpha(ICE,0));
  g.save();
  g.translate(0, 489); g.scale(1, .19); g.translate(0,-489);
  g.fillStyle = f; g.fillRect(45, 190, 530, 598);
  g.restore();
  oval(g, X, 483, 146, 15.5, '#050f0e74');
  for (let i = 0; i < 10; i++) {
    const x = X + (i % 2 ? 1 : -1) * (66 + i * 14);
    const y = 477 + i % 4 * 8 + i % 3 * 3;
    line(g, x - 28 - i % 3 * 5, y, x + 19, y, alpha(ICE, .12 + .09 * p.finale), .5);
  }
  for (let i = 0; i < 60; i++) {
    const [x, y, r, o] = dust[i];
    disc(g, X + (x - X) * .78, 467 + y * .077, r * .84, alpha(ICE,o * .58));
  }
}
const wraps = {
  red: ['#a6434f', '#722c3a', '#ca6271', '#edba80', '#f5dc9a'],
  ivory: ['#d6af73', '#977249', '#f4d391', '#853846', '#aa4b55'],
  pine: ['#4a8375', '#2b554d', '#81aa91', '#c09a61', '#eac68d']
};
function present(g, x, y, w, h, palette, variant) {
  const [front, right, top, ribbon, fold] = palette;
  const z = w * .24, q = z * .55;
  g.save(); g.translate(x, y);
  oval(g, w * .59, q - 1, w * .73, Math.max(3,w * .12), '#071410a8');
  path(g,[[0,0],[w,q],[w,q-h],[0,-h]]);
  g.fillStyle = front; g.fill();
  path(g,[[w,q],[w+z,q-z*.65],[w+z,q-z*.65-h],[w,q-h]]);
  g.fillStyle = right; g.fill();
  path(g,[[0,-h],[z,-h-z*.65],[w+z,-h+q-z*.65],[w,-h+q]]);
  g.fillStyle = top; g.fill();
  // Printed gift wrap grain, diamonds and pinstripes.
  g.save();
  path(g,[[0,0],[w,q],[w,q-h],[0,-h]]); g.clip();
  for (let i = 0; i <= 8; i++) {
    const xx = i * w / 8;
    if (variant % 2) {
      for (let j = 0; j < 4; j++) sparkle(g, xx + j%2 * 2, xx * q / w - h + (j+.55)*h/4, 1.25, '#fce5ae87');
    } else {
      line(g, xx, -h - 1, xx, q+1, '#ffe3a366', .55);
    }
  }
  g.restore();
  const b = w * .44, r = w * .13, by = -h + b * q / w;
  path(g,[[b,b*q/w],[b+r,(b+r)*q/w],[b+r,by],[b,by]]);
  g.fillStyle = ribbon; g.fill();
  path(g,[[b,by],[b+z,by-z*.65],[b+r+z,by+r*q/w-z*.65],[b+r,by+r*q/w]]);
  g.fillStyle = fold; g.fill();
  line(g,0,-h,w,-h+q,'#fae3ad8c',.65);
  line(g,w,-h+q,w+z,-h+q-z*.65,'#fae3ad68',.65);
  const bx = b + r * .5 + z * .48, yy = by - z * .30;
  g.lineWidth = Math.max(1.4, w*.052); g.strokeStyle = ribbon; g.lineCap = 'round';
  g.beginPath(); g.moveTo(bx,yy);
  g.bezierCurveTo(bx-w*.43,yy-w*.09,bx-w*.19,yy-w*.39,bx,yy);
  g.bezierCurveTo(bx+w*.18,yy-w*.38,bx+w*.43,yy-w*.18,bx,yy);
  g.quadraticCurveTo(bx+w*.12,yy+w*.04,bx+w*.14,yy+w*.10);
  g.moveTo(bx,yy); g.quadraticCurveTo(bx-w*.11,yy+w*.025,bx-w*.08,yy+w*.13); g.stroke();
  disc(g,bx,yy,Math.max(1.5,w*.036),fold);
  g.restore();
}


const garlands = [
  [[-17,145],[-9,162],[14,171],[27,154]],
  [[-40,182],[-26,209],[25,222],[47,181]],
  [[-60,218],[-38,251],[31,264],[63,222]],
  [[-81,255],[-53,285],[32,315],[87,265]],
  [[-105,291],[-71,333],[48,355],[109,305]],
  [[-128,339],[-89,381],[61,393],[131,345]],
  [[-143,385],[-97,430],[64,442],[145,399]],
  [[-144,430],[-93,449],[69,460],[140,434]]
].map((curve, row) => Array.from({length: 14 + row * 5}, (_, i) => {
  const q = i / (13 + row * 5), s = 1 - q;
  return [0, 1].map(axis => curve[0][axis] * s ** 3 + 3 * curve[1][axis] * s*s*q +
    3 * curve[2][axis] * s*q*q + curve[3][axis] * q ** 3);
}));

const ornamentColors = [
  ['#ffe3bb','#dc8082','#b74153','#571626','#ffbeb0'],
  ['#fff2bc','#ecbd70','#b17734','#674520','#ffe4a6'],
  ['#fff5d9','#e2d5ad','#ab9367','#645847','#faf1ca'],
  ['#dbf5de','#84baae','#368078','#194840','#b5dcca']
];
const baubles = [
  [-4,132,4.5,1], [14,153,5.3,0], [-25,172,5.5,0], [26,178,6,2],
  [-8,191,6.7,1], [36,197,5,1], [-47,214,6.4,2], [14,219,7.5,0],
  [-24,239,5.7,3], [49,237,7.3,1], [-65,255,7,0], [-2,254,5.4,2],
  [40,271,7.5,0], [-46,284,8,0], [13,286,5.7,1], [83,284,6,3],
  [-90,303,7.2,1], [-12,309,8.4,2], [61,312,7.5,0], [-62,329,6.5,3],
  [10,330,8.9,0], [106,332,8.4,2], [-112,351,8.9,0], [-31,354,7.1,1],
  [65,352,6.1,1], [-78,376,8.3,2], [25,373,8.1,3], [118,384,9,0],
  [-130,401,7.1,1], [-27,404,10,0], [77,403,8.4,1], [-90,430,9.2,0],
  [16,433,9.2,2], [133,435,7.5,1], [64,431,5.8,0], [-150,433,5.5,3]
];
// The bell melody travels from bough to bough; each bell has its own anchor.
const melody = [31,25,18,13,9,3,7,22,30,12,26,16,33,29,1];
const bellShards = Array.from({length: 9}, (_, i) => [i * tau / 9 + noise() * .28, 11 + noise() * 24, .8 + noise() * 2]);

function drawGarlands(g, p) {
  for (const [row, strand] of garlands.entries()) {
    const bent = strand.map(([x,y]) => [x + driftAt(y,p), y]);
    g.beginPath();
    bent.forEach(([x,y], i) => i ? g.lineTo(x,y) : g.moveTo(x,y));
    g.lineWidth = 2.1; g.strokeStyle = '#0b251f8c'; g.stroke();
    g.lineWidth = .72;
    g.strokeStyle = alpha('238,191,104', .57 + .15 * p.quick + .14 * p.strike); g.stroke();
    for (const [i, [x,y]] of bent.entries()) {
      const bulb = i % 4 === (row + 1) % 4 || (i === 0 && row > 2);
      if (!bulb) {
        disc(g, x, y, .66, '#eaca88b0'); continue;
      }
      const gain = .33 + .23 * p.growth + .27 * p.quick + .19 * p.finale + .17 * p.strike;
      const flutter = (i % 3 === 0 ? p.offbeat * .13 : 0);
      const power = gain + flutter;
      const bright = (row % 3 !== 1 || i % 2 === 0);
      glow(g, x, y, 6.4 + power * 2.7, bright ? GOLD : '246,152,107', power * .58);
      disc(g,x,y,1.22 + power * .41,alpha(bright ? '255,222,156' : '255,164,126', .82 + power * .21));
      disc(g,x-.19,y-.28,.55,'#fff4cc');
    }
  }
}

function drawBauble(g,x,y,r,ink,motif,intensity) {
  const [light, mid, base, dark, tint] = ink;
  if (intensity > .01) glow(g, x, y, r * (2.2 + .8 * intensity), GOLD, .88 * intensity);
  oval(g, x + r * .23, y + 1.9, r * 1.17, r * 1.05, '#061a16a0');
  line(g,x,y-r*1.8,x,y-r+.75,'#ecd49c9e',.7);
  const bulb = g.createRadialGradient(x-r*.34,y-r*.37,r*.045,x,y,r*1.05);
  bulb.addColorStop(0,light); bulb.addColorStop(.24,mid); bulb.addColorStop(.62,base);
  bulb.addColorStop(.88,dark); bulb.addColorStop(1,base);
  disc(g,x,y,r,bulb);
  g.fillStyle = '#c69b5d'; g.fillRect(x - r*.28, y-r-1.7, r*.56, 2.5);
  g.fillStyle = '#ffe2a2'; g.fillRect(x - r*.21, y-r-1.8, r*.20, 2.05);
  g.save(); g.translate(x,y);
  g.strokeStyle = tint + '90'; g.lineWidth = .62;
  g.beginPath(); g.ellipse(0, 0, r * .69, r * .81, -.32, .35, 1.63); g.stroke();
  if (motif && r > 6.7) {
    g.beginPath();
    g.moveTo(-r*.9,r*.18); g.bezierCurveTo(-r*.27,r*.80,r*.48,-r*.33,r*.94,.13*r);
    g.moveTo(-r*.79,r*.47); g.bezierCurveTo(-r*.23,r*.91,r*.50,-r*.09,r*.89,r*.38);
    g.strokeStyle = '#f7da9d96'; g.stroke();
    for (let j=0;j<3;j++) disc(g,(j-1)*r*.46,r*(.36-.21*j),.52,'#ffe8b8b0');
  }
  g.restore();
  oval(g,x-r*.33,y-r*.35,r*.20,r*.115,'#fff5d2ba');
  if (intensity > .01) {
    disc(g,x,y,r*.98,alpha('255,222,142',intensity*.57));
    sparkle(g,x-r*.27,y-r*.38,4 + 10 * intensity,alpha('255,248,210',intensity));
  }
}

function drawBells(g,p) {
  for (const [i, mark] of cue.bells.entries()) {
    const dt = p.t - mark;
    const aura = pulse(dt, .027, .43);
    if (aura <= .001) continue;
    const [ox,y,r] = baubles[melody[i]];
    const x = ox + driftAt(y,p);
    const lift = clamp(dt / .41);
    const travel = reduced.matches ? .16 : lift;
    const color = alpha('255,235,175',aura*.82);
    g.strokeStyle = alpha(GOLD, aura * .60); g.lineWidth = .67;
    g.beginPath(); g.arc(x,y,r + 4 + travel * 32, -.48, 5.16); g.stroke();
    for (let k = 0; k < bellShards.length; k++) {
      const [angle, extent, size] = bellShards[k];
      const d = r + 7 + extent * travel;
      const bx = x + Math.cos(angle + i*.61) * d, by = y + Math.sin(angle + i*.61) * d - travel * 12;
      if (k % 3 === 0) sparkle(g,bx,by,size * (1 + aura*.7),color);
      else disc(g,bx,by,size*.45,color);
    }
  }
}

function topper(g,p) {
  const y = 88, x = driftAt(101,p);
  const shimmer = .40 + p.growth*.16 + p.quick*.17 + p.strike*.29 + p.arrival*.29;
  g.save(); g.translate(x,y);
  glow(g,0,0,59,GOLD,shimmer);
  glow(g,0,0,38,ICE,p.finale*.45);
  if (p.finale > .004) {
    g.strokeStyle = alpha(ICE, p.finale*.39 + p.arrival*.23);
    g.lineWidth = .62;
    g.beginPath();
    g.arc(0,0,30 + 13*p.finale, -.8, 1.82);
    g.moveTo(-(30 + 13*p.finale),0);
    g.arc(0,0,30 + 13*p.finale, Math.PI, Math.PI + 1.66);
    g.stroke();
  }
  line(g,0,14,0,33,'#f2d38b',1.7);
  line(g,-31,0,31,0,alpha(GOLD,shimmer*.69),.56);
  line(g,0,-37,0,20,alpha(GOLD,shimmer*.80),.56);
  const colors = ['#ffefb8','#deac59','#f6d88c','#a56e35','#fff2bd','#c39246','#f5d27f','#d29b4d'];
  const rim = [];
  for (let i = 0; i < 16; i++) {
    const angle = -Math.PI / 2 + i * tau / 16;
    const radius = i % 2 ? 6.4 : i % 4 === 0 ? (i % 8 === 0 ? 23 : 20) : 12.5;
    rim.push([Math.cos(angle)*radius,Math.sin(angle)*radius]);
  }
  for (let i=0; i<rim.length; i++) {
    path(g,[[0,0],rim[i],rim[(i+1)%16]]);
    g.fillStyle = colors[(Math.floor(i / 2) + (i % 2 ? 3 : 0)) % 8]; g.fill();
  }
  path(g,rim); g.strokeStyle = '#f8dea2'; g.lineWidth = .7; g.stroke();
  sparkle(g,0,0,6 + 2*p.arrival,'#fff9d8',.81);
  for (let i=0; i<6; i++) {
    const a = i*tau/6+.33;
    const radius = 28 + i%2 * 9 + (p.strike*.8 + p.arrival) * 8;
    sparkle(g,Math.cos(a)*radius,Math.sin(a)*radius,1.7 + i%3*1.25,
      alpha(GOLD,.48 + p.strike*.23 + p.arrival*.25));
  }
  g.restore();
}

function streamers(g,p) {
  if (p.quick < .006 && p.arrival < .006) return;
  for (const side of [-1,1]) {
    const s = side === -1 ? 1 : -1;
    g.save(); g.translate(X,268); g.scale(side,1);
    const a = .11 + p.strike*.33 + p.offbeat*.12;
    const roll = p.lean * (p.strike * 9 - p.offbeat * 7);
    g.beginPath(); g.moveTo(126,-66 + roll);
    g.bezierCurveTo(208,-27 + roll,192,26,152,58);
    g.bezierCurveTo(122,86,151,110,184,116 + roll);
    g.strokeStyle = alpha(GOLD,a * p.quick); g.lineWidth = 1.15; g.stroke();
    g.beginPath(); g.moveTo(144,46 + roll);
    g.bezierCurveTo(181,32,201,2,166,-36 + roll);
    g.strokeStyle = alpha(GOLD,a * .65 * p.quick); g.lineWidth = .75; g.stroke();
    sparkle(g,183+s*roll,116+roll,3+4*p.strike,alpha(GOLD,(.5+.4*p.strike)*p.quick));
    g.beginPath(); g.arc(0,-38,176 + 15 * (1 - p.arrival),-.66,-.20);
    g.strokeStyle = alpha(ICE,.47 * p.arrival); g.lineWidth = .9; g.stroke();
    g.restore();
  }
}

function drawTree(g,p) {
  g.save();
  g.translate(X,467);
  g.rotate(p.tilt);
  g.scale(1 + p.squat * .83,1 - p.squat);
  g.translate(0,-467);
  trunk(g);
  for (let i = foliage.length - 1; i >= 0; i--) {
    const tier = foliage[i];
    g.drawImage(tier.layer, driftAt(tier.y,p)-tierOrigin[0], tier.y-tierOrigin[1], tier.width, tier.height);
  }
  drawGarlands(g,p);
  baubles.forEach(([base,y,r,c], i) => {
    const x = base + driftAt(y,p);
    let strength = 0;
    for (let k = 0; k < melody.length; k++) {
      const dt = p.t - cue.bells[k];
      if (melody[k] === i) strength = Math.max(strength,pulse(dt,.024,.34));
      else if ((melody[k] + 1) % baubles.length === i) strength = Math.max(strength,.29 * pulse(dt-.103,.025,.24));
    }
    drawBauble(g,x,y,r,ornamentColors[c],i % 4 !== 1,strength);
  });
  drawBells(g,p);
  topper(g,p);
  g.restore();
}


let view = null;
function draw(p) {
  if (!pen || !view) return;
  const { pixelRatio, width, height, scale } = view;
  pen.setTransform(pixelRatio,0,0,pixelRatio,0,0);
  pen.fillStyle = '#0d211e'; pen.fillRect(0,0,width,height);
  pen.translate((width - W*scale)/2,(height - H*scale)/2);
  pen.scale(scale,scale);
  background(pen,p,width/scale);
  streamers(pen,p);
  floor(pen,p);
  // Two smaller parcels sit behind the skirt; the large ones frame the trunk.
  present(pen,191,466,40,27,wraps.pine,1);
  present(pen,390,470,42,27,wraps.ivory,1);
  drawTree(pen,p);
  present(pen,166,485,57,31,wraps.red,0);
  present(pen,223,490,35,22,wraps.ivory,1);
  present(pen,407,488,52,31,wraps.pine,0);
  present(pen,382,492,32,18,wraps.red,1);
  for (const side of [-1,1]) {
    const x = X + side * 109;
    const bright = .43 + .33 * p.finale + .16 * p.arrival;
    line(pen,x+side*7,INSCRIPTION_Y,x+side*33,INSCRIPTION_Y,alpha(GOLD,bright*.65),.65);
    sparkle(pen,x,INSCRIPTION_Y,3.2 + p.arrival,alpha(GOLD,bright));
  }
}

let duration = cue.duration;
let pendingSeek = null;
let frame = 0;
let chapter = -1;
const elapsed = select('#elapsed');
const durationLabel = select('#duration');
const playLabel = select('#play-label');
const status = select('#audio-status');
const time = () => clamp(pendingSeek ?? (music.currentTime || 0),0,duration);
const finished = () => time() >= duration - .006;
const isPlaying = () => !music.paused && !music.ended;
function formatTime(seconds) {
  const whole = Math.floor(seconds);
  return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2,'0');
}
function paint() {
  const t = time(), p = pose(t);
  if (p.chapter !== chapter) {
    chapter = p.chapter;
    const [id, ...labels] = chapters[chapter];
    stage.dataset.section = id;
    chapterFields.forEach((field,i) => { field.textContent = labels[i]; });
  }
  const stamp = formatTime(finished() ? Math.round(duration) : t);
  if (elapsed.textContent !== stamp) elapsed.textContent = stamp;
  seek.value = t;
  seek.style.setProperty('--played',(t / duration * 100) + '%');
  const spoken = t.toFixed(1) + ' 秒，共 ' + Math.round(duration) + ' 秒';
  if (seek.getAttribute('aria-valuetext') !== spoken) seek.setAttribute('aria-valuetext',spoken);
  draw(p);
}
function updateButton() {
  const state = isPlaying() ? 'playing' : finished() ? 'ended' : 'paused';
  const label = state === 'playing' ? '暂停' : state === 'ended' ? '重播' : '播放';
  play.dataset.state = state;
  playLabel.textContent = label;
  play.setAttribute('aria-label',label);
}
function step() {
  frame = 0;
  paint();
  if (isPlaying()) frame = requestAnimationFrame(step);
}
function playbackChanged() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  updateButton();
  step();
}
function applySeek() {
  if (pendingSeek === null || music.readyState < 1) return;
  // currentTime is set synchronously; we keep the requested frame while the audio seeks.
  try {
    music.currentTime = pendingSeek;
    if (!music.seeking) pendingSeek = null;
  } catch {
    status.textContent = '暂时无法跳转，请稍后重试。';
    status.hidden = false;
    pendingSeek = null;
  }
}
function jump(to) {
  pendingSeek = clamp(to,0,duration);
  applySeek();
  paint();
  updateButton();
}

play.addEventListener('click', async () => {
  if (isPlaying()) {
    music.pause();
    playbackChanged();
    return;
  }
  status.hidden = true;
  if (music.ended || finished()) jump(0);
  try {
    await music.play();
  } catch (error) {
    if (error.name !== 'AbortError') {
      status.textContent = '音乐未能播放，请再试一次。';
      status.hidden = false;
    }
    playbackChanged();
  }
});
seek.addEventListener('input', () => jump(Number(seek.value)));
seek.addEventListener('keydown', event => {
  const nudge = event.shiftKey ? 1 : .25;
  let target;
  switch (event.key) {
    case 'ArrowLeft': case 'ArrowDown': target = time() - nudge; break;
    case 'ArrowRight': case 'ArrowUp': target = time() + nudge; break;
    case 'PageDown': target = time() - duration / 10; break;
    case 'PageUp': target = time() + duration / 10; break;
    case 'Home': target = 0; break;
    case 'End': target = duration; break;
    default: return;
  }
  event.preventDefault();
  jump(target);
});
mute.addEventListener('click', () => { music.muted = !music.muted; });
music.addEventListener('volumechange', () => {
  mute.setAttribute('aria-pressed',String(music.muted));
  mute.setAttribute('aria-label',music.muted ? '取消静音' : '静音');
});

function syncDuration() {
  if (!Number.isFinite(music.duration) || music.duration <= 0) return;
  duration = music.duration;
  seek.max = String(duration);
  durationLabel.textContent = formatTime(Math.round(duration));
  seek.closest('.scrubber').style.setProperty('--faster',(cue.sections.faster / duration * 100) + '%');
  seek.closest('.scrubber').style.setProperty('--ending',(cue.sections.ending / duration * 100) + '%');
}
music.addEventListener('durationchange',syncDuration);
music.addEventListener('loadedmetadata',() => {
  syncDuration();
  if (pendingSeek !== null) {
    pendingSeek = clamp(pendingSeek,0,duration);
    applySeek();
  }
  playbackChanged();
});
music.addEventListener('seeked', () => { pendingSeek = null; playbackChanged(); });
music.addEventListener('seeking', paint);
music.addEventListener('timeupdate', () => { if (!isPlaying()) paint(); });
music.addEventListener('play', playbackChanged);
music.addEventListener('pause', playbackChanged);
music.addEventListener('ended', playbackChanged);
music.addEventListener('error', () => {
  status.textContent = '找不到音乐文件，仍可以拖动进度预览贺卡。';
  status.hidden = false;
  playbackChanged();
});

function resize() {
  const {width,height} = stage.getBoundingClientRect();
  if (width <= 0 || height <= 0) return;
  const pixelRatio = Math.min(devicePixelRatio || 1,2);
  const scale = Math.min(width / (width < 485 ? 568 : 609),height / 550);
  canvas.width = Math.ceil(width * pixelRatio);
  canvas.height = Math.ceil(height * pixelRatio);
  view = {width,height,pixelRatio,scale};
  stage.style.setProperty('--inscription-top', (height/2 + (INSCRIPTION_Y - H/2)*scale) + 'px');
  paint();
}
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(stage);
window.addEventListener('resize', resize);
reduced.addEventListener('change', paint);
syncDuration();
resize();
