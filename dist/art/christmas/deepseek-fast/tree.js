(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   *  The score. Everything visual is a pure function of this timeline.
   * ------------------------------------------------------------------ */
  const DURATION = 19;
  const BEATS = [
    0.4, 1.06, 1.72, 2.38, 3.04, 3.7, 4.36, 5.02, 5.68, 6.34,
    7.0, 7.66, 8.4, 8.88, 9.36, 9.84, 10.32, 10.8, 11.28, 11.76,
    12.24, 12.72, 13.2, 13.68, 14.16, 14.64, 15.12, 15.6, 16.08, 16.56
  ];
  const ACCENTS = [0.4, 3.04, 5.68, 8.4, 10.32, 12.24, 14.16, 16.08];
  const BELLS = [
    1.39, 2.71, 4.03, 5.35, 6.67, 7.99, 9.12, 10.08,
    11.04, 12.0, 12.96, 13.92, 14.88, 15.84, 16.8
  ];
  const FAST_AT = 8.4;
  const END_AT = 17.35;
  const BEAT_IS_ACCENT = BEATS.map((b) => ACCENTS.indexOf(b) >= 0);
  const BELL_S = BELLS.map((_, i) => 0.10 + 0.84 * ((i + 0.5) / BELLS.length));

  /* ------------------------------------------------------------------ *
   *  DOM
   * ------------------------------------------------------------------ */
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');
  const music = document.getElementById('music');
  const playBtn = document.getElementById('play');
  const playIcon = document.getElementById('playIcon');
  const seek = document.getElementById('seek');
  const timeNow = document.getElementById('timeNow');
  const timeTotal = document.getElementById('timeTotal');
  const phaseNum = document.getElementById('phaseNum');
  const phaseName = document.getElementById('phaseName');
  const beatText = document.getElementById('beatText');
  const beatDot = document.getElementById('beatDot');

  const ICON_PLAY = 'M8.2 5.4v13.2L19 12z';
  const ICON_PAUSE = 'M7.4 5h3.3v14H7.4zM13.3 5h3.3v14h-3.3z';

  /* ------------------------------------------------------------------ *
   *  Small maths helpers
   * ------------------------------------------------------------------ */
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => {
    const k = clamp((x - a) / (b - a), 0, 1);
    return k * k * (3 - 2 * k);
  };
  const rgba = (c, a) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
  const mix = (c1, c2, t) => [
    lerp(c1[0], c2[0], t),
    lerp(c1[1], c2[1], t),
    lerp(c1[2], c2[2], t)
  ];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------------ *
   *  Palette
   * ------------------------------------------------------------------ */
  const COL = {
    gold: [255, 205, 126],
    warm: [255, 231, 180],
    rose: [255, 146, 176],
    ice: [152, 236, 255],
    mint: [174, 255, 212],
    white: [255, 252, 244],
    ember: [255, 164, 96]
  };

  /* ------------------------------------------------------------------ *
   *  State
   * ------------------------------------------------------------------ */
  const view = {
    W: 0, H: 0, dpr: 1,
    cx: 0, groundY: 0, safeTop: 0, treeH: 0, baseW: 0
  };

  let tree = null;
  let stars = [];
  let snow = [];
  let bgPines = [];
  let gifts = [];
  let groundSpecks = [];
  let sprites = {};

  const clock = { t: 0, at: 0, running: false };
  let playing = false;
  let needsDraw = true;
  let seekLockUntil = 0;
  let scrubbing = false;
  const uiCache = { phase: '', beat: '' };

  /* ------------------------------------------------------------------ *
   *  Musical envelopes — all deterministic, no accumulated state
   * ------------------------------------------------------------------ */
  function recentEnv(times, t, decay, life) {
    let sum = 0;
    for (let i = 0; i < times.length; i++) {
      const d = t - times[i];
      if (d >= 0 && d < life) sum += Math.exp(-d * decay);
    }
    return sum;
  }

  const beatPulse = (t) => recentEnv(BEATS, t, 8.5, 2.6);
  const accentPulse = (t) => recentEnv(ACCENTS, t, 2.9, 4.5);

  function lastBeatIndex(t) {
    let idx = -1;
    for (let i = 0; i < BEATS.length; i++) {
      if (BEATS[i] <= t + 0.0001) idx = i;
    }
    return idx;
  }

  function swayWave(t) {
    let v = 0;
    for (let i = 0; i < BEATS.length; i++) {
      const d = t - BEATS[i];
      if (d >= 0 && d < 3.2) {
        v += Math.sin(d * 9.6) * Math.exp(-d * 2.9) * (BEAT_IS_ACCENT[i] ? 1.7 : 0.75);
      }
    }
    return v;
  }

  function bellBloom(s, t) {
    let v = 0;
    for (let i = 0; i < BELLS.length; i++) {
      const d = t - BELLS[i];
      if (d >= 0 && d < 1.7) {
        const ds = (s - BELL_S[i]) / 0.052;
        v += Math.exp(-d * 2.1) * Math.exp(-0.5 * ds * ds);
      }
    }
    return v;
  }

  function activeBells(t) {
    const out = [];
    for (let i = 0; i < BELLS.length; i++) {
      const age = t - BELLS[i];
      if (age >= 0 && age < 1.6) out.push({ i, age });
    }
    return out;
  }

  function sections(t) {
    const fast = smooth(8.25, 9.05, t) * (1 - smooth(17.2, 17.72, t));
    const end = smooth(17.3, 18.45, t);
    const intro = 0.62 + 0.38 * smooth(0.05, 2.7, t);
    return { fast, end, intro };
  }

  /* ------------------------------------------------------------------ *
   *  Playback clock (smooth 60fps clock, softly corrected by the audio)
   * ------------------------------------------------------------------ */
  function audioDuration() {
    const d = music.duration;
    return Number.isFinite(d) && d > 0.2 ? d : DURATION;
  }

  function syncClock(t) {
    clock.t = clamp(t, 0, audioDuration());
    clock.at = performance.now();
  }

  function nowTime() {
    if (!clock.running) return clock.t;
    const t = clock.t + (performance.now() - clock.at) / 1000;
    return Math.min(t, audioDuration());
  }

  function correctClock() {
    if (!clock.running || music.paused) return;
    if (performance.now() < seekLockUntil) return;
    const expected = clock.t + (performance.now() - clock.at) / 1000;
    const drift = music.currentTime - expected;
    if (Math.abs(drift) > 0.5) {
      syncClock(music.currentTime);
    } else if (Math.abs(drift) > 0.03) {
      clock.t = expected + drift * 0.14;
      clock.at = performance.now();
    }
  }

  function setTime(t) {
    const d = audioDuration();
    const target = clamp(t, 0, d);
    seekLockUntil = performance.now() + 420;
    try {
      music.currentTime = target;
    } catch (err) { /* ignore unseekable states */ }
    clock.t = target;
    clock.at = performance.now();
    needsDraw = true;
    drawScene(target);
    updateUI(target);
  }

  function togglePlay() {
    if (music.paused) {
      if (music.ended || clock.t >= audioDuration() - 0.04) {
        try { music.currentTime = 0; } catch (err) { /* ignore */ }
        clock.t = 0;
        clock.at = performance.now();
      }
      const p = music.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => { needsDraw = true; });
      }
      needsDraw = true;
    } else {
      music.pause();
    }
  }

  function setPlayButton(isPlaying, isEnded) {
    playBtn.classList.toggle('is-playing', isPlaying);
    playIcon.setAttribute('d', isPlaying ? ICON_PAUSE : ICON_PLAY);
    playBtn.setAttribute('aria-label', isPlaying ? '暂停' : isEnded ? '重播' : '播放');
  }

  /* ------------------------------------------------------------------ *
   *  Interface readout
   * ------------------------------------------------------------------ */
  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function updateUI(t) {
    const total = audioDuration();
    const clamped = clamp(t, 0, total);
    if (!scrubbing) seek.value = clamped.toFixed(2);
    seek.style.setProperty('--p', (total > 0 ? (clamped / total) * 100 : 0).toFixed(2) + '%');
    seek.setAttribute('aria-valuetext', `${clamped.toFixed(1)} 秒，共 ${total.toFixed(1)} 秒`);
    timeNow.textContent = formatTime(clamped);
    timeTotal.textContent = formatTime(total);

    let key;
    if (clamped < FAST_AT) {
      key = 'opening';
      if (uiCache.phase !== key) {
        uiCache.phase = key;
        phaseNum.textContent = 'I';
        phaseName.textContent = '序章 · 初雪';
        stage.dataset.phase = key;
      }
    } else if (clamped < END_AT) {
      key = 'faster';
      if (uiCache.phase !== key) {
        uiCache.phase = key;
        phaseNum.textContent = 'II';
        phaseName.textContent = '中章 · 流光';
        stage.dataset.phase = key;
      }
    } else {
      key = 'ending';
      if (uiCache.phase !== key) {
        uiCache.phase = key;
        phaseNum.textContent = 'III';
        phaseName.textContent = '终章 · 余温';
        stage.dataset.phase = key;
      }
    }

    let text;
    if (clamped < BEATS[0]) {
      text = '等待第一拍';
    } else if (clamped >= END_AT) {
      text = '余音 · 渐弱';
    } else {
      const idx = lastBeatIndex(clamped);
      const bpm = clamped >= FAST_AT ? 125 : 91;
      text = `第 ${String(Math.max(1, idx + 1)).padStart(2, '0')} 拍 · ${bpm} BPM`;
    }
    if (text !== uiCache.beat) {
      uiCache.beat = text;
      beatText.textContent = text;
    }

    const p = Math.min(1, beatPulse(clamped));
    beatDot.style.opacity = (0.3 + p * 0.7).toFixed(2);
    beatDot.style.transform = `scale(${(0.85 + p * 1.1).toFixed(2)})`;
  }

  /* ------------------------------------------------------------------ *
   *  Sprites (soft additive glows)
   * ------------------------------------------------------------------ */
  function makeGlow(c) {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 64;
    const g = cv.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    const core = mix(c, [255, 255, 255], 0.72);
    grad.addColorStop(0, rgba(core, 1));
    grad.addColorStop(0.18, rgba(c, 0.9));
    grad.addColorStop(0.44, rgba(c, 0.26));
    grad.addColorStop(0.74, rgba(c, 0.055));
    grad.addColorStop(1, rgba(c, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return cv;
  }

  function initSprites() {
    sprites = {};
    Object.keys(COL).forEach((key) => { sprites[key] = makeGlow(COL[key]); });
  }

  function paintGlow(key, x, y, size, alpha) {
    const img = sprites[key];
    if (!img || size <= 0 || alpha <= 0.004) return;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(img, x - size * 0.5, y - size * 0.5, size, size);
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ *
   *  Layout / scene construction
   * ------------------------------------------------------------------ */
  function resize(force) {
    const rect = stage.getBoundingClientRect();
    const W = Math.max(1, Math.round(rect.width));
    const H = Math.max(1, Math.round(rect.height));
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    if (!force && W === view.W && H === view.H && dpr === view.dpr) return;

    view.W = W;
    view.H = H;
    view.dpr = dpr;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    measure();
    buildScene();
    const t = nowTime();
    drawScene(t);
    updateUI(t);
    needsDraw = true;
  }

  function measure() {
    const srect = stage.getBoundingClientRect();
    const hud = document.querySelector('.hud');
    const player = document.querySelector('.player');
    const hr = hud.getBoundingClientRect();
    const pr = player.getBoundingClientRect();

    const pad = Math.max(10, view.H * 0.018);
    const safeTop = Math.max(70, hr.bottom - srect.top + pad);
    const playerTop = pr.top - srect.top;
    const groundY = Math.max(safeTop + 150, playerTop - pad);
    const avail = Math.max(120, groundY - safeTop);
    const treeH = Math.min(avail * 0.985, view.W * 1.32);

    view.safeTop = safeTop;
    view.groundY = groundY;
    view.treeH = treeH;
    view.baseW = treeH * 0.30;
    view.cx = view.W * 0.5;
  }

  function buildScene() {
    buildStars();
    buildSnow();
    buildGroundSpecks();
    buildBgPines();
    buildTree();
    buildGifts();
  }

  function buildStars() {
    stars = [];
    const rnd = mulberry32(1337);
    const count = view.W < 520 ? 90 : 150;
    for (let i = 0; i < count; i++) {
      stars.push({
        x: rnd() * view.W,
        y: Math.pow(rnd(), 1.5) * view.H * 0.72,
        r: 0.35 + Math.pow(rnd(), 2) * 1.5,
        ph: rnd() * TAU,
        sp: 0.4 + rnd() * 1.7,
        a: 0.25 + rnd() * 0.75,
        big: i % 17 === 0
      });
    }
  }

  function buildSnow() {
    snow = [];
    const rnd = mulberry32(4242);
    const count = view.W < 520 ? 82 : 132;
    for (let i = 0; i < count; i++) {
      snow.push({
        x: rnd(),
        y: rnd(),
        r: 0.6 + Math.pow(rnd(), 1.6) * 2.6,
        sp: 0.5 + rnd() * 1.1,
        ph: rnd() * TAU,
        sway: 6 + rnd() * 26,
        a: 0.24 + rnd() * 0.66,
        front: rnd() < 0.4
      });
    }
  }

  function buildGroundSpecks() {
    groundSpecks = [];
    const rnd = mulberry32(777);
    for (let i = 0; i < 80; i++) {
      groundSpecks.push({
        x: rnd(),
        y: rnd(),
        r: 0.4 + rnd() * 1.3,
        a: 0.05 + rnd() * 0.12
      });
    }
  }

  function buildBgPines() {
    bgPines = [];
    if (view.W < 660) {
      bgPines.push({ x: view.W * 0.045, h: view.treeH * 0.20, y: view.groundY + view.H * 0.015, a: 0.48 });
      bgPines.push({ x: view.W * 0.955, h: view.treeH * 0.26, y: view.groundY + view.H * 0.015, a: 0.52 });
      return;
    }
    const specs = [
      { fx: 0.045, h: 0.42, a: 0.54 },
      { fx: 0.115, h: 0.30, a: 0.42 },
      { fx: 0.175, h: 0.22, a: 0.34 },
      { fx: 0.955, h: 0.46, a: 0.54 },
      { fx: 0.885, h: 0.32, a: 0.43 },
      { fx: 0.82, h: 0.24, a: 0.34 }
    ];
    specs.forEach((s) => {
      bgPines.push({
        x: view.W * s.fx,
        h: view.treeH * s.h,
        y: view.groundY + view.H * 0.015,
        a: s.a
      });
    });
  }

  /* ------------------------------------------------------------------ *
   *  The tree
   * ------------------------------------------------------------------ */
  function buildTree() {
    const th = view.treeH;
    const CH = th * 0.85;
    const baseW = view.baseW;
    const N = 12;
    const tiers = [];
    const rnd = mulberry32(20261224);

    function topEdgePath(R, bottomY, h, seed) {
      const top = bottomY - h;
      const tipY = bottomY - h * 0.10;
      const xTop = R * 0.02 * Math.sin(seed * 3.1);
      const p = new Path2D();
      p.moveTo(-R * 0.985, tipY);
      p.bezierCurveTo(-R * 0.72, top + h * 0.68, -R * 0.34, top + h * 0.30, xTop, top);
      p.bezierCurveTo(R * 0.34, top + h * 0.30, R * 0.72, top + h * 0.68, R * 0.985, tipY);
      return p;
    }

    function tierPath(R, bottomY, h, seed) {
      const top = bottomY - h;
      const tipY = bottomY - h * 0.10;
      const xTop = R * 0.02 * Math.sin(seed * 3.1);
      const p = new Path2D();
      const teeth = 6;

      p.moveTo(xTop, top);
      p.bezierCurveTo(-R * 0.34, top + h * 0.30, -R * 0.72, top + h * 0.68, -R * 0.985, tipY);
      p.lineTo(-R * 1.015, tipY + h * 0.06);

      let prevX = -R * 1.015;
      for (let k = 0; k < teeth; k++) {
        const f1 = 1 - (k + 0.42) / teeth;
        const f2 = 1 - (k + 0.82) / teeth;
        const wob = 0.5 + 0.5 * Math.sin(seed * 4.7 + k * 2.3);
        const tx = -R * f1;
        const ty = bottomY + h * (0.05 + 0.06 * wob);
        const vx = -R * f2;
        const vy = bottomY - h * 0.03;
        p.quadraticCurveTo(prevX + (tx - prevX) * 0.35, ty - h * 0.035, tx, ty);
        p.quadraticCurveTo((tx + vx) * 0.5, ty + h * 0.03, vx, vy);
        prevX = vx;
      }
      p.quadraticCurveTo(-R * 0.05, bottomY + h * 0.03, 0, bottomY + h * 0.012);

      let prev = 0;
      for (let k = teeth - 1; k >= 0; k--) {
        const f1 = 1 - (k + 0.42) / teeth;
        const f2 = 1 - (k + 0.82) / teeth;
        const wob = 0.5 + 0.5 * Math.sin(seed * 4.7 + k * 2.3);
        const vx = R * f2;
        const vy = bottomY - h * 0.03;
        const tx = R * f1;
        const ty = bottomY + h * (0.05 + 0.06 * wob);
        p.quadraticCurveTo((prev + vx) * 0.5, vy + h * 0.03, vx, vy);
        p.quadraticCurveTo(vx + (tx - vx) * 0.4, ty - h * 0.035, tx, ty);
        prev = tx;
      }
      p.lineTo(R * 1.015, tipY + h * 0.06);
      p.lineTo(R * 0.985, tipY);
      p.bezierCurveTo(R * 0.72, top + h * 0.68, R * 0.34, top + h * 0.30, xTop, top);
      p.closePath();
      return p;
    }

    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const bottomY = -CH * (0.08 + 0.84 * u);
      const h = CH * (0.23 - 0.115 * u);
      const R = baseW * Math.pow(1 - u, 0.94) * (0.96 + 0.04 * Math.sin(i * 1.9 + 0.6)) + baseW * 0.013;
      const seed = i * 1.37 + 0.4;
      const path = tierPath(R, bottomY, h, seed);
      const topEdge = topEdgePath(R, bottomY, h, seed);

      const texture = new Path2D();
      for (let k = 0; k < 5; k++) {
        const f = ((k + 0.7) / 5) * 0.9;
        const yy = bottomY - h * (0.045 + 0.05 * k);
        texture.moveTo(0, yy + h * 0.05);
        texture.quadraticCurveTo(-R * f * 0.55, yy - h * 0.05, -R * f, bottomY + h * 0.01);
        texture.moveTo(0, yy + h * 0.05);
        texture.quadraticCurveTo(R * f * 0.55, yy - h * 0.05, R * f, bottomY + h * 0.01);
      }

      const specks = [];
      for (let k = 0; k < 6; k++) {
        const side = rnd() < 0.5 ? -1 : 1;
        specks.push({
          x: side * R * (0.70 + rnd() * 0.27),
          y: bottomY - h * (0.045 + rnd() * 0.10),
          r: Math.max(0.35, th * 0.0012 * (0.6 + rnd()))
        });
      }

      const lights = [];
      for (let k = 0; k < 5; k++) {
        const f = (k / 4) * 1.6 - 0.8;
        lights.push({
          x: f * R * 0.90 + (rnd() - 0.5) * R * 0.10,
          y: bottomY - h * (0.07 + 0.10 * Math.abs(f) + (rnd() - 0.5) * 0.03),
          ph: seed * 1.7 + k * 1.9
        });
      }

      const shade = 0.10 + 0.90 * u;
      const base = mix([12, 42, 32], [42, 88, 64], shade);
      const cMid = mix(base, [58, 112, 80], 0.18);
      tiers.push({
        u, R, bottomY, h,
        pivotY: bottomY - h * 0.48,
        path, topEdge, texture, specks, lights,
        cTop: mix(base, [112, 172, 126], 0.24),
        cMid,
        cBright: mix(cMid, [96, 152, 106], 0.22),
        cBottom: mix(base, [3, 14, 11], 0.26)
      });
    }

    const ornaments = [];
    const ornColors = [
      [198, 64, 74], [226, 178, 105], [58, 137, 130],
      [236, 228, 208], [126, 88, 146], [190, 110, 92]
    ];
    for (let i = 0; i < 13; i++) {
      const ti = 2 + Math.floor(rnd() * 8);
      const tier = tiers[ti];
      const side = rnd() < 0.5 ? -1 : 1;
      const spread = 0.18 + rnd() * 0.56;
      ornaments.push({
        x: side * tier.R * spread,
        y: tier.bottomY - tier.h * (0.09 + rnd() * 0.17),
        len: tier.h * (0.10 + rnd() * 0.16) + th * 0.005,
        r: th * (0.0068 + rnd() * 0.0038),
        tierIndex: ti,
        color: ornColors[i % ornColors.length],
        ph: rnd() * TAU
      });
    }

    const bulbs = [];
    const NB = 44;
    for (let k = 0; k < NB; k++) {
      const s = (k + 0.7) / NB;
      const ang = s * TAU * 2.45 + 0.75;
      const R = baseW * Math.pow(s, 0.94) * 1.005 + th * 0.002;
      const depth = Math.cos(ang);
      const colName = k % 9 === 0 ? 'rose' : k % 7 === 0 ? 'ice' : k % 3 === 0 ? 'warm' : 'gold';
      bulbs.push({
        x: Math.sin(ang) * R,
        y: -CH * (0.985 - 0.955 * s) + depth * th * 0.006,
        s,
        depth,
        colName,
        ph: k * 2.37,
        big: k % 6 === 0
      });
    }

    const bw = baseW * 1.02;
    const backing = new Path2D();
    backing.moveTo(0, -CH);
    backing.bezierCurveTo(-bw * 0.10, -CH * 0.82, -bw * 0.55, -CH * 0.35, -bw, -CH * 0.055);
    backing.quadraticCurveTo(0, -CH * 0.005, bw, -CH * 0.055);
    backing.bezierCurveTo(bw * 0.55, -CH * 0.35, bw * 0.10, -CH * 0.82, 0, -CH);
    backing.closePath();

    tree = {
      CH,
      baseW,
      backing,
      tiers,
      ornaments,
      bulbs,
      frontBulbs: bulbs.filter((b) => b.depth >= 0),
      backBulbs: bulbs.filter((b) => b.depth < 0),
      starY: -th * 0.925,
      starR: th * 0.046
    };
  }

  function buildGifts() {
    const th = view.treeH;
    gifts = [
      { x: -th * 0.205, w: th * 0.105, h: th * 0.078, color: [152, 44, 56], ribbon: [244, 206, 142], tilt: -0.05 },
      { x: th * 0.175, w: th * 0.095, h: th * 0.095, color: [33, 88, 96], ribbon: [238, 192, 150], tilt: 0.04 },
      { x: th * 0.305, w: th * 0.070, h: th * 0.060, color: [94, 70, 130], ribbon: [252, 222, 168], tilt: 0.07 },
      { x: -th * 0.325, w: th * 0.062, h: th * 0.052, color: [48, 92, 76], ribbon: [242, 206, 150], tilt: -0.06 }
    ];
  }

  /* ------------------------------------------------------------------ *
   *  Drawing — sky & landscape
   * ------------------------------------------------------------------ */
  function drawSky(t, env) {
    const W = view.W;
    const H = view.H;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#03070e');
    g.addColorStop(0.42, '#071725');
    g.addColorStop(0.68, '#0a2430');
    g.addColorStop(0.84, '#0e3033');
    g.addColorStop(1, '#081821');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const hg = ctx.createRadialGradient(
      W * 0.5, view.groundY - H * 0.1, 0,
      W * 0.5, view.groundY - H * 0.1, Math.max(W, H) * 0.62
    );
    hg.addColorStop(0, `rgba(58,122,110,${0.16 - env.fast * 0.03})`);
    hg.addColorStop(0.55, 'rgba(30,72,74,0.07)');
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, W, H);
  }

  function drawAurora(t, env) {
    const W = view.W;
    const H = view.H;
    const colors = [
      mix([46, 196, 182], [255, 128, 170], env.fast * 0.55),
      mix([126, 108, 255], [255, 186, 120], env.fast * 0.35),
      mix([84, 220, 190], [150, 120, 255], 0.3 + env.fast * 0.4)
    ];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      const baseY = H * (0.10 + k * 0.055) + Math.sin(t * 0.22 + k * 1.7) * H * 0.02;
      const amp = H * (0.024 + k * 0.012);
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.12, rgba(colors[k], 1));
      grad.addColorStop(0.45, rgba(colors[(k + 1) % 3], 1));
      grad.addColorStop(0.78, rgba(colors[(k + 2) % 3], 1));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath();
      for (let x = -80; x <= W + 80; x += 32) {
        const y = baseY
          + Math.sin(x * 0.0042 + t * (0.25 + k * 0.05) + k * 2.1) * amp
          + Math.sin(x * 0.0105 - t * 0.18 + k * 1.3) * amp * 0.42;
        if (x === -80) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = grad;
      ctx.lineCap = 'round';
      ctx.globalAlpha = (0.055 + env.fast * 0.05) * (1 - env.end * 0.5);
      ctx.lineWidth = H * (0.11 - k * 0.02);
      ctx.stroke();
      ctx.globalAlpha *= 1.9;
      ctx.lineWidth *= 0.34;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStars(t, env) {
    const accent = accentPulse(t);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const tw = 0.55 + 0.45 * Math.sin(t * s.sp + s.ph);
      let a = s.a * (0.45 + 0.55 * tw) * (1 - env.end * 0.2);
      a = Math.min(1, a + accent * 0.07);
      if (s.big) paintGlow('ice', s.x, s.y, s.r * 11, a * 0.5);
      ctx.fillStyle = `rgba(214,236,255,${a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMoon(t, env) {
    const W = view.W;
    const H = view.H;
    const x = W * 0.79;
    const y = H * 0.185;
    const r = clamp(Math.min(W, H) * 0.055, 18, 48);

    ctx.save();
    const halo = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 6.5);
    halo.addColorStop(0, `rgba(255,242,214,${0.20 + env.end * 0.08})`);
    halo.addColorStop(0.35, 'rgba(210,230,240,0.07)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * 6.5, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    const disc = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    disc.addColorStop(0, '#fffaf0');
    disc.addColorStop(0.65, '#f6e9cf');
    disc.addColorStop(1, '#d8c4a6');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();

    ctx.fillStyle = 'rgba(190,170,140,0.22)';
    ctx.beginPath(); ctx.arc(x - r * 0.28, y + r * 0.18, r * 0.16, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.30, y - r * 0.22, r * 0.10, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.10, y + r * 0.42, r * 0.07, 0, TAU); ctx.fill();

    ctx.strokeStyle = 'rgba(255,240,210,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.35, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawHills(t, env) {
    const W = view.W;
    const H = view.H;
    const top = view.groundY - H * 0.055;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, top + H * 0.012);
    ctx.bezierCurveTo(W * 0.18, top - H * 0.025, W * 0.34, top + H * 0.02, W * 0.5, top - H * 0.004);
    ctx.bezierCurveTo(W * 0.66, top - H * 0.028, W * 0.82, top + H * 0.012, W, top - H * 0.012);
    ctx.lineTo(W, H);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, top - H * 0.03, 0, top + H * 0.10);
    g.addColorStop(0, '#14343a');
    g.addColorStop(1, '#0a1e26');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(168,208,208,0.13)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawBgPines(t, env) {
    for (let p = 0; p < bgPines.length; p++) {
      const pine = bgPines[p];
      const h = pine.h;
      const w = h * 0.38;
      ctx.save();
      ctx.translate(pine.x, pine.y);
      const sway = Math.sin(t * 0.3 + pine.x * 0.01) * h * 0.004 * (1 + env.fast);
      ctx.rotate(sway * 0.01);
      ctx.fillStyle = `rgba(6,20,24,${pine.a})`;
      for (let i = 0; i < 5; i++) {
        const topY = -h * (0.97 - i * 0.155);
        const botY = -h * (0.64 - i * 0.135);
        const half = w * (0.12 + i * 0.19);
        ctx.beginPath();
        ctx.moveTo(0, topY);
        ctx.lineTo(-half, botY);
        ctx.quadraticCurveTo(0, botY - h * 0.04, half, botY);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillRect(-h * 0.012, -h * 0.10, h * 0.024, h * 0.10);
      ctx.strokeStyle = `rgba(178,214,216,${0.10 * pine.a + 0.03})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const botY = -h * (0.64 - i * 0.135);
        const half = w * (0.12 + i * 0.19);
        ctx.beginPath();
        ctx.moveTo(-half * 0.92, botY - h * 0.012);
        ctx.quadraticCurveTo(0, botY - h * 0.045, half * 0.92, botY - h * 0.012);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawGround(t, env) {
    const W = view.W;
    const H = view.H;
    const groundY = view.groundY;
    const treeH = view.treeH;
    const crest = groundY - treeH * 0.05;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, crest + H * 0.02);
    ctx.bezierCurveTo(W * 0.20, crest - H * 0.02, W * 0.38, crest + H * 0.015, W * 0.52, crest);
    ctx.bezierCurveTo(W * 0.68, crest - H * 0.012, W * 0.84, crest + H * 0.02, W, crest - H * 0.005);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, crest - H * 0.03, 0, H);
    g.addColorStop(0, '#5d7d80');
    g.addColorStop(0.10, '#406064');
    g.addColorStop(0.38, '#1d373d');
    g.addColorStop(1, '#08161c');
    ctx.fillStyle = g;
    ctx.fill();

    ctx.strokeStyle = 'rgba(200,235,235,0.22)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, crest + H * 0.02);
    ctx.bezierCurveTo(W * 0.20, crest - H * 0.02, W * 0.38, crest + H * 0.015, W * 0.52, crest);
    ctx.bezierCurveTo(W * 0.68, crest - H * 0.012, W * 0.84, crest + H * 0.02, W, crest - H * 0.005);
    ctx.stroke();

    // moon sheen on the snow
    const sheen = ctx.createRadialGradient(W * 0.80, crest + H * 0.005, 0, W * 0.80, crest + H * 0.005, W * 0.34);
    sheen.addColorStop(0, 'rgba(178,218,226,0.12)');
    sheen.addColorStop(1, 'rgba(178,218,226,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, crest - H * 0.02, W, H);

    // slow warm spill from the tree
    ctx.globalCompositeOperation = 'lighter';
    const warm = ctx.createRadialGradient(view.cx, groundY, 0, view.cx, groundY, treeH * 0.9);
    warm.addColorStop(0, `rgba(255,170,90,${0.20 + 0.10 * accentPulse(t) + 0.06 * env.end})`);
    warm.addColorStop(0.42, 'rgba(255,150,80,0.06)');
    warm.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, crest - H * 0.02, W, H - crest + H * 0.02);
    ctx.globalCompositeOperation = 'source-over';

    // snow grain
    for (let i = 0; i < groundSpecks.length; i++) {
      const sp = groundSpecks[i];
      const x = sp.x * W;
      const y = crest - H * 0.01 + sp.y * (H - crest + H * 0.03);
      ctx.fillStyle = `rgba(210,235,235,${sp.a})`;
      ctx.beginPath();
      ctx.arc(x, y, sp.r * (H / 800 + 0.4), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------ *
   *  Drawing — weather
   * ------------------------------------------------------------------ */
  function snowFlow(t) {
    const a = Math.min(t, FAST_AT) * 0.85;
    const b = t > FAST_AT ? Math.min(t, END_AT) - FAST_AT : 0;
    const c = t > END_AT ? t - END_AT : 0;
    return a + b * 1.9 + c * 0.55;
  }

  function drawSnow(t, env, front) {
    const W = view.W;
    const H = view.H;
    const flow = snowFlow(t);
    const sizeScale = clamp(H / 800, 0.65, 1.5);
    ctx.save();
    for (let i = 0; i < snow.length; i++) {
      const f = snow[i];
      if (f.front !== front) continue;
      const y = ((f.y * (H + 80) + flow * (12 + f.sp * 30)) % (H + 80)) - 40;
      const x = f.x * W + Math.sin(t * 0.35 + f.ph + flow * 0.02) * f.sway;
      const r = f.r * sizeScale * (front ? 1.15 : 0.9);
      const a = f.a * (front ? 0.9 : 0.55) * (1 - 0.35 * env.end);
      if (front && f.r > 2.3) {
        ctx.globalCompositeOperation = 'lighter';
        paintGlow('ice', x, y, r * 7, a * 0.22);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.fillStyle = `rgba(223,241,248,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------ *
   *  Drawing — the tree
   * ------------------------------------------------------------------ */
  function drawTreeAura(t, env) {
    const cx = view.cx;
    const cy = view.groundY - view.treeH * 0.52;
    const r = view.treeH * 0.86;
    const accent = Math.min(1.4, accentPulse(t));
    const warm = mix([255, 184, 116], [255, 128, 154], env.fast * 0.65);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rgba(warm, 0.16 * env.intro + 0.10 * accent + 0.05 * env.end));
    g.addColorStop(0.45, rgba(warm, 0.055 + 0.05 * env.fast));
    g.addColorStop(1, rgba(warm, 0));
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }

  function bulbAtS(s) {
    const angle = s * TAU * 2.45 + 0.75;
    const R = tree.baseW * Math.pow(s, 0.94) * 1.005 + view.treeH * 0.002;
    return {
      x: Math.sin(angle) * R,
      y: -tree.CH * (0.985 - 0.955 * s) + Math.cos(angle) * view.treeH * 0.006
    };
  }

  function drawGarlandLayer(t, env, bulbs, front, alphaScale) {
    const scale = clamp(view.treeH / 560, 0.75, 1.7);
    const beat = Math.min(1, beatPulse(t));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < bulbs.length; i++) {
      const b = bulbs[i];
      const bloom = bellBloom(b.s, t);
      const tw = 0.55 + 0.45 * Math.sin(t * (1.6 + env.fast * 2.1) + b.ph);
      const chase = env.fast * 0.30 * (0.5 + 0.5 * Math.sin(b.s * 24 - t * 7.2));
      let a = (0.34 + 0.36 * tw + 0.55 * Math.min(1.4, bloom) + chase + 0.14 * beat) * env.intro;
      a *= alphaScale * (1 - env.end * 0.32);
      a = clamp(a, 0, 1);
      const size = (b.big ? 4.0 : 3.0) * scale * (1 + 0.85 * Math.min(1.3, bloom) + 0.12 * beat);
      paintGlow(b.colName, b.x, b.y, size * 6.0, a * 0.85);
      ctx.fillStyle = `rgba(255,248,226,${clamp(a + 0.18, 0, 0.95)})`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, Math.max(0.8, size * 0.42), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBellEffects(t) {
    const active = activeBells(t);
    if (!active.length) return;
    const scale = clamp(view.treeH / 560, 0.75, 1.7);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < active.length; i++) {
      const bell = active[i];
      const p = bulbAtS(BELL_S[bell.i]);
      const age = bell.age;
      const fade = Math.exp(-age * 2.5);
      ctx.strokeStyle = `rgba(255,218,156,${fade * 0.5})`;
      ctx.lineWidth = Math.max(0.7, scale * 1.1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 + age * 46 * scale, 0, TAU);
      ctx.stroke();
      for (let k = 0; k < 6; k++) {
        const a = (k * TAU) / 6 + bell.i * 1.13;
        const rr = 3 + age * (14 + (k % 3) * 6) * scale;
        const mx = p.x + Math.cos(a) * rr + Math.sin(age * 4 + k) * 2;
        const my = p.y + Math.sin(a) * rr * 0.6 - age * 28 * scale;
        paintGlow('warm', mx, my, 9 * scale, fade * 0.5);
      }
    }
    ctx.restore();
  }

  function drawStar(t, env) {
    const beat = Math.min(1.2, beatPulse(t));
    const accent = Math.min(1.6, accentPulse(t));
    const R = tree.starR * (1 + 0.06 * beat + 0.16 * accent);
    const y = tree.starY;
    const rot = Math.sin(t * 0.42) * 0.05 + swayWave(t) * 0.02;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    paintGlow('warm', 0, y, R * 16, 0.18 + 0.12 * env.intro + 0.16 * accent + 0.10 * env.end);
    paintGlow('gold', 0, y, R * 8, 0.35 + 0.12 * env.intro + 0.15 * accent + 0.08 * env.end);

    for (let i = 0; i < 12; i++) {
      const ang = i * (TAU / 12) + rot * 0.6;
      const long = i % 3 === 0;
      const len = R * (long ? 4.4 : 2.2) * (1 + 0.35 * accent + 0.10 * beat);
      const ex = Math.cos(ang) * len;
      const ey = Math.sin(ang) * len;
      const g = ctx.createLinearGradient(0, y, ex, y + ey);
      g.addColorStop(0, 'rgba(255,248,224,0.55)');
      g.addColorStop(0.35, 'rgba(255,226,164,0.18)');
      g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(0.8, R * (long ? 0.15 : 0.08));
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(ex, y + ey);
      ctx.stroke();
    }

    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 === 0 ? R : R * 0.43;
      const a = -Math.PI / 2 + (i * Math.PI) / 5 + rot;
      const x = Math.cos(a) * rr;
      const yy = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.closePath();
    const g2 = ctx.createRadialGradient(0, y - R * 0.25, 0, 0, y, R * 1.1);
    g2.addColorStop(0, 'rgba(255,255,250,1)');
    g2.addColorStop(0.4, 'rgba(255,241,190,1)');
    g2.addColorStop(0.8, 'rgba(255,206,112,0.95)');
    g2.addColorStop(1, 'rgba(255,180,80,0.8)');
    ctx.fillStyle = g2;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,252,238,0.85)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    paintGlow('white', 0, y, R * 3, 0.5);
    ctx.restore();
  }

  function drawAccentSparks(t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < ACCENTS.length; i++) {
      const a = ACCENTS[i];
      const age = t - a;
      if (age < 0 || age > 1.25) continue;
      const fade = 1 - age / 1.25;
      for (let k = 0; k < 10; k++) {
        const ang = (k * TAU) / 10 + a * 0.4;
        const dist = view.treeH * (0.02 + age * 0.10 * (0.7 + (k % 3) * 0.25));
        const x = Math.cos(ang) * dist;
        const y = tree.starY + Math.sin(ang) * dist * 0.85 - age * view.treeH * 0.012;
        paintGlow('warm', x, y, view.treeH * 0.014, fade * 0.55);
      }
    }
    ctx.restore();
  }

  function drawTree(t, env) {
    const th = view.treeH;
    const sway = swayWave(t);
    const beat = Math.min(1.25, beatPulse(t));
    const accent = Math.min(1.4, accentPulse(t));
    const lean = sway * 0.008 * (1 + env.fast * 0.55) * (1 - env.end * 0.45);
    const breath = 1 + 0.010 * beat - 0.006 * accent;
    const scale = clamp(th / 560, 0.75, 1.7);
    const swayGain = 1 + env.fast * 0.5;

    drawTreeAura(t, env);

    ctx.save();
    ctx.translate(view.cx, view.groundY);
    ctx.rotate(lean);
    ctx.scale(1 + 0.007 * beat, breath);

    // trunk
    const trunkW = th * 0.035;
    const trunkH = th * 0.19;
    const tg = ctx.createLinearGradient(-trunkW, 0, trunkW, 0);
    tg.addColorStop(0, '#1a251d');
    tg.addColorStop(0.45, '#463a2b');
    tg.addColorStop(0.8, '#241e17');
    tg.addColorStop(1, '#10160f');
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(-trunkW, 0);
    ctx.lineTo(-trunkW * 0.48, -trunkH);
    ctx.lineTo(trunkW * 0.48, -trunkH);
    ctx.lineTo(trunkW, 0);
    ctx.closePath();
    ctx.fill();

    const angles = tree.tiers.map((tier, i) => (
      sway * swayGain * (0.004 + tier.u * 0.014) +
      Math.sin(t * 0.5 + i * 0.62) * 0.0015 * (0.35 + env.fast)
    ));

    drawGarlandLayer(t, env, tree.backBulbs, false, 0.28);

    const backGrad = ctx.createLinearGradient(0, -tree.CH * 1.02, 0, -tree.CH * 0.02);
    backGrad.addColorStop(0, '#173f2e');
    backGrad.addColorStop(0.55, '#0d2a20');
    backGrad.addColorStop(1, '#06140f');
    ctx.fillStyle = backGrad;
    ctx.fill(tree.backing);

    for (let i = 0; i < tree.tiers.length; i++) {
      const tier = tree.tiers[i];
      ctx.save();
      ctx.translate(0, tier.pivotY);
      ctx.rotate(angles[i]);
      ctx.translate(0, -tier.pivotY);

      const lift = env.fast * 0.08;
      const cTop = mix(tier.cTop, [118, 138, 96], lift);
      const cMid = mix(tier.cMid, [74, 96, 66], lift * 0.6);
      const cBright = mix(tier.cBright, [118, 142, 98], lift * 0.5);
      const cBot = tier.cBottom;
      const g = ctx.createLinearGradient(0, tier.bottomY - tier.h * 1.05, 0, tier.bottomY + tier.h * 0.15);
      g.addColorStop(0, rgba(cTop, 1));
      g.addColorStop(0.36, rgba(cMid, 1));
      g.addColorStop(0.80, rgba(cBright, 1));
      g.addColorStop(1, rgba(cBot, 1));
      ctx.fillStyle = g;
      ctx.fill(tier.path);

      ctx.strokeStyle = `rgba(156,214,174,${0.045 + 0.045 * env.intro})`;
      ctx.lineWidth = Math.max(0.6, th * 0.0011);
      ctx.stroke(tier.texture);

      ctx.strokeStyle = `rgba(198,238,216,${0.11 + 0.10 * env.intro + 0.05 * Math.min(1, accent)})`;
      ctx.lineWidth = Math.max(0.8, th * 0.0014);
      ctx.stroke(tier.path);

      ctx.strokeStyle = `rgba(214,246,230,${0.08 + 0.08 * env.intro})`;
      ctx.lineWidth = Math.max(0.7, th * 0.0011);
      ctx.stroke(tier.topEdge);

      ctx.fillStyle = `rgba(226,244,236,${0.18 + 0.10 * env.intro})`;
      for (let k = 0; k < tier.specks.length; k++) {
        const sp = tier.specks[k];
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.r, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    // moonlit rim, clipped lightly to the canopy body
    ctx.save();
    ctx.clip(tree.backing);
    ctx.globalCompositeOperation = 'lighter';
    const rimGrad = ctx.createLinearGradient(-tree.baseW, 0, tree.baseW, 0);
    rimGrad.addColorStop(0, 'rgba(120,220,190,0)');
    rimGrad.addColorStop(0.55, 'rgba(120,220,190,0.015)');
    rimGrad.addColorStop(1, `rgba(196,246,222,${0.045 + 0.03 * env.intro})`);
    ctx.fillStyle = rimGrad;
    ctx.fillRect(-tree.baseW * 1.1, -tree.CH * 1.05, tree.baseW * 2.2, tree.CH * 1.1);
    ctx.restore();

    // fairy lights follow the sway of their own tier
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < tree.tiers.length; i++) {
      const tier = tree.tiers[i];
      ctx.save();
      ctx.translate(0, tier.pivotY);
      ctx.rotate(angles[i]);
      ctx.translate(0, -tier.pivotY);
      for (let k = 0; k < tier.lights.length; k++) {
        const b = tier.lights[k];
        const tw = 0.5 + 0.5 * Math.sin(t * (1.5 + env.fast * 1.9) + b.ph);
        const a = (0.16 + 0.34 * tw) * env.intro * (1 - env.end * 0.28) + 0.08 * beat;
        const size = (3.0 + 2.2 * tw) * scale;
        paintGlow('gold', b.x, b.y, size * 3.4, Math.min(0.75, a * 0.8));
        ctx.fillStyle = `rgba(255,238,204,${Math.min(0.92, a + 0.3)})`;
        ctx.beginPath();
        ctx.arc(b.x, b.y, Math.max(0.7, 0.9 * scale), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();

    // ornaments
    for (let i = 0; i < tree.ornaments.length; i++) {
      const o = tree.ornaments[i];
      const tier = tree.tiers[o.tierIndex];
      const ang = angles[o.tierIndex];
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const rx = o.x * cos - (o.y - tier.pivotY) * sin;
      const ry = tier.pivotY + o.x * sin + (o.y - tier.pivotY) * cos;
      const swing = Math.sin(t * 0.95 + o.ph) * 0.045 * (1 + env.fast * 1.4) + sway * 0.05;
      const bx = rx + Math.sin(swing) * o.len;
      const by = ry + Math.cos(swing) * o.len;

      ctx.strokeStyle = 'rgba(224,232,214,0.22)';
      ctx.lineWidth = Math.max(0.6, o.r * 0.16);
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(bx, by);
      ctx.stroke();

      const shimmer = Math.min(1, accent * 0.9 + beat * 0.3);
      if (shimmer > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        paintGlow('warm', bx, by, o.r * (5 + 5 * shimmer), 0.35 * shimmer);
        ctx.restore();
      }

      const og = ctx.createRadialGradient(
        bx - o.r * 0.35, by - o.r * 0.42, o.r * 0.05,
        bx, by, o.r * 1.12
      );
      og.addColorStop(0, 'rgba(255,255,250,0.95)');
      og.addColorStop(0.18, rgba(mix(o.color, [255, 255, 255], 0.45), 1));
      og.addColorStop(0.62, rgba(o.color, 1));
      og.addColorStop(1, rgba(mix(o.color, [8, 10, 10], 0.6), 1));
      ctx.fillStyle = og;
      ctx.beginPath();
      ctx.arc(bx, by, o.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,246,226,0.22)';
      ctx.lineWidth = Math.max(0.5, o.r * 0.12);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,250,0.85)';
      ctx.beginPath();
      ctx.arc(bx - o.r * 0.32, by - o.r * 0.38, Math.max(0.5, o.r * 0.17), 0, TAU);
      ctx.fill();
    }

    drawGarlandLayer(t, env, tree.frontBulbs, true, 1);
    drawBellEffects(t);
    drawStar(t, env);
    drawAccentSparks(t);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ *
   *  Drawing — ground detail, gifts, atmsophere
   * ------------------------------------------------------------------ */
  function drawBaseMound(t, env) {
    const cx = view.cx;
    const gy = view.groundY;
    const th = view.treeH;
    const g = ctx.createLinearGradient(0, gy - th * 0.04, 0, gy + th * 0.05);
    g.addColorStop(0, '#d7e7e2');
    g.addColorStop(0.40, '#8fadae');
    g.addColorStop(1, '#38565b');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, gy + th * 0.012, th * 0.295, th * 0.048, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(cx, gy, 0, cx, gy, th * 0.36);
    glow.addColorStop(0, `rgba(255,184,104,${0.18 + 0.08 * accentPulse(t) + 0.10 * env.end})`);
    glow.addColorStop(1, 'rgba(255,184,104,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(cx, gy, th * 0.36, th * 0.07, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawGift(g, t, env) {
    const W = g.w;
    const H = g.h;
    const x = view.cx + g.x;
    const y = view.groundY + view.treeH * 0.006;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(g.tilt + Math.sin(t * 0.6 + g.x) * 0.002);

    const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 1.3);
    sh.addColorStop(0, 'rgba(0,0,0,0.5)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(0, 2, W * 1.15, Math.max(2, H * 0.22), 0, 0, TAU);
    ctx.fill();

    const bodyH = H * 0.82;
    const body = ctx.createLinearGradient(-W / 2, -H, W / 2, 0);
    body.addColorStop(0, rgba(mix(g.color, [8, 12, 14], 0.4), 1));
    body.addColorStop(0.55, rgba(g.color, 1));
    body.addColorStop(1, rgba(mix(g.color, [255, 224, 180], 0.2), 1));
    ctx.fillStyle = body;
    ctx.fillRect(-W / 2, -bodyH, W, bodyH);

    const lidH = H * 0.18;
    const lid = ctx.createLinearGradient(-W * 0.58, -H, W * 0.58, -H + lidH);
    lid.addColorStop(0, rgba(mix(g.color, [255, 240, 210], 0.18), 1));
    lid.addColorStop(1, rgba(mix(g.color, [4, 8, 10], 0.25), 1));
    ctx.fillStyle = lid;
    ctx.fillRect(-W * 0.57, -H, W * 1.14, lidH);

    ctx.fillStyle = rgba(g.ribbon, 0.92);
    ctx.fillRect(-W * 0.57, -H + lidH * 0.28, W * 1.14, lidH * 0.30);
    const rib = ctx.createLinearGradient(-W * 0.05, 0, W * 0.05, 0);
    rib.addColorStop(0, rgba(mix(g.ribbon, [255, 255, 255], 0.15), 0.88));
    rib.addColorStop(1, rgba(mix(g.ribbon, [40, 20, 10], 0.2), 0.88));
    ctx.fillStyle = rib;
    ctx.fillRect(-W * 0.05, -bodyH, W * 0.10, bodyH);

    ctx.strokeStyle = rgba(g.ribbon, 0.95);
    ctx.lineWidth = Math.max(1.2, W * 0.05);
    ctx.beginPath();
    ctx.ellipse(-W * 0.14, -H - H * 0.015, W * 0.13, Math.max(2, H * 0.075), -0.55, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(W * 0.14, -H - H * 0.015, W * 0.13, Math.max(2, H * 0.075), 0.55, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = rgba(g.ribbon, 1);
    ctx.beginPath();
    ctx.arc(0, -H - H * 0.012, Math.max(1.5, W * 0.055), 0, TAU);
    ctx.fill();

    ctx.fillStyle = 'rgba(224,240,238,0.6)';
    ctx.beginPath();
    ctx.ellipse(
      -W * 0.12, -H - lidH * 0.015,
      W * 0.30, Math.max(1.4, H * 0.028),
      -0.06, 0, TAU
    );
    ctx.fill();

    // warm rim from the tree
    const towardTree = x < view.cx ? 1 : -1;
    ctx.globalCompositeOperation = 'lighter';
    const rim = ctx.createRadialGradient(
      towardTree * W * 0.62, -H * 0.4, 0,
      towardTree * W * 0.62, -H * 0.4, W * 1.1
    );
    rim.addColorStop(0, 'rgba(255,180,110,0.20)');
    rim.addColorStop(1, 'rgba(255,180,110,0)');
    ctx.fillStyle = rim;
    ctx.fillRect(-W / 2, -H, W, H);
    ctx.restore();
  }

  function drawGifts(t, env) {
    const sorted = gifts.slice().sort((a, b) => Math.abs(b.x) - Math.abs(a.x));
    for (let i = 0; i < sorted.length; i++) drawGift(sorted[i], t, env);
  }

  function drawRipples(t) {
    const events = ACCENTS.concat([END_AT]);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < events.length; i++) {
      const age = t - events[i];
      if (age < 0 || age > 1.6) continue;
      const p = age / 1.6;
      const r = view.treeH * (0.10 + p * 0.55);
      const cx = view.cx;
      const cy = view.groundY + view.treeH * 0.015;
      ctx.strokeStyle = `rgba(255,214,154,${(1 - p) * 0.28})`;
      ctx.lineWidth = Math.max(1, view.treeH * 0.0025 * (1 - p));
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.22, 0, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = `rgba(210,240,230,${(1 - p) * 0.14})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.72, r * 0.16, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMotes(t, env) {
    if (env.fast < 0.04) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
      const ph = i * 0.618 * TAU;
      const prog = (t * 0.055 + i / 14) % 1;
      const x = view.cx + Math.sin(ph + t * 0.35) * view.treeH * 0.33 * (0.3 + prog * 0.7);
      const y = view.groundY - prog * view.treeH * 0.85;
      const a = Math.sin(prog * Math.PI) * 0.3 * env.fast;
      paintGlow('gold', x, y, view.treeH * 0.012 * (0.6 + prog), a);
    }
    ctx.restore();
  }

  function drawShootingStar(t) {
    const age = t - FAST_AT;
    if (age < 0 || age > 1.35) return;
    const p = age / 1.35;
    const sx = view.W * 0.46;
    const sy = view.H * 0.16;
    const ex = view.W * 0.70;
    const ey = view.H * 0.31;
    const x = lerp(sx, ex, p);
    const y = lerp(sy, ey, p);
    const len = view.W * 0.10;
    const tx = x - len;
    const ty = y - len * 0.42;
    const grad = ctx.createLinearGradient(tx, ty, x, y);
    grad.addColorStop(0, 'rgba(180,240,255,0)');
    grad.addColorStop(0.6, 'rgba(220,248,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0.95)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(x, y);
    ctx.stroke();
    paintGlow('ice', x, y, view.W * 0.03, 0.7 * Math.sin(Math.PI * p));
    ctx.restore();
  }

  function drawForeground(t, env) {
    const W = view.W;
    const H = view.H;
    const accent = Math.min(1.2, accentPulse(t));

    if (accent > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,206,150,${0.025 * accent})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    const g = ctx.createRadialGradient(
      W * 0.5, H * 0.46, Math.min(W, H) * 0.22,
      W * 0.5, H * 0.5, Math.max(W, H) * 0.80
    );
    g.addColorStop(0, 'rgba(2,6,10,0)');
    g.addColorStop(0.6, 'rgba(2,6,10,0.06)');
    g.addColorStop(1, `rgba(2,6,10,${0.62 + env.end * 0.08})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const bg = ctx.createLinearGradient(0, view.groundY, 0, H);
    bg.addColorStop(0, 'rgba(3,10,14,0)');
    bg.addColorStop(1, 'rgba(2,7,10,0.62)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, view.groundY, W, H - view.groundY);
  }

  /* ------------------------------------------------------------------ *
   *  Frame
   * ------------------------------------------------------------------ */
  function drawScene(t) {
    if (!view.W || !view.H || !tree) return;
    const env = sections(t);
    const W = view.W;
    const H = view.H;

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);

    drawSky(t, env);
    drawAurora(t, env);
    drawStars(t, env);
    drawMoon(t, env);
    drawHills(t, env);
    drawBgPines(t, env);
    drawGround(t, env);
    drawSnow(t, env, false);
    drawTree(t, env);
    drawMotes(t, env);
    drawRipples(t);
    drawBaseMound(t, env);
    drawGifts(t, env);
    drawSnow(t, env, true);
    drawShootingStar(t);
    drawForeground(t, env);
  }

  function frame() {
    requestAnimationFrame(frame);
    if (playing) needsDraw = true;
    if (!needsDraw) return;
    const t = nowTime();
    drawScene(t);
    updateUI(t);
    needsDraw = false;
  }

  /* ------------------------------------------------------------------ *
   *  Events
   * ------------------------------------------------------------------ */
  playBtn.addEventListener('click', togglePlay);

  const scrubStart = () => { scrubbing = true; };
  const scrubEnd = () => { scrubbing = false; };
  seek.addEventListener('pointerdown', scrubStart);
  seek.addEventListener('touchstart', scrubStart, { passive: true });
  window.addEventListener('pointerup', scrubEnd);
  window.addEventListener('pointercancel', scrubEnd);
  window.addEventListener('touchend', scrubEnd);
  window.addEventListener('blur', scrubEnd);

  seek.addEventListener('input', () => {
    const total = audioDuration();
    setTime(clamp(Number(seek.value) || 0, 0, total));
  });

  seek.addEventListener('change', () => {
    const total = audioDuration();
    setTime(clamp(Number(seek.value) || 0, 0, total));
  });

  seek.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const total = audioDuration();
    const step = e.shiftKey ? 5 : 1;
    let target = nowTime();
    if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = total;
    else target = clamp(target + (e.key === 'ArrowRight' ? step : -step), 0, total);
    setTime(target);
  });

  music.addEventListener('play', () => {
    playing = true;
    clock.running = true;
    syncClock(music.currentTime);
    setPlayButton(true, false);
    needsDraw = true;
  });

  music.addEventListener('playing', () => {
    if (clock.running) syncClock(music.currentTime);
    needsDraw = true;
  });

  music.addEventListener('pause', () => {
    playing = false;
    clock.running = false;
    clock.t = music.ended ? audioDuration() : clamp(music.currentTime, 0, audioDuration());
    clock.at = performance.now();
    setPlayButton(false, music.ended);
    needsDraw = true;
    drawScene(clock.t);
    updateUI(clock.t);
  });

  music.addEventListener('ended', () => {
    playing = false;
    clock.running = false;
    clock.t = audioDuration();
    clock.at = performance.now();
    setPlayButton(false, true);
    needsDraw = true;
    drawScene(clock.t);
    updateUI(clock.t);
  });

  music.addEventListener('timeupdate', correctClock);
  music.addEventListener('seeked', () => {
    if (performance.now() < seekLockUntil) return;
    const t = clamp(music.currentTime, 0, audioDuration());
    if (clock.running) syncClock(t);
    else { clock.t = t; clock.at = performance.now(); }
    needsDraw = true;
    drawScene(t);
    updateUI(t);
  });

  function onMeta() {
    const total = audioDuration();
    seek.max = String(total);
    timeTotal.textContent = formatTime(total);
    needsDraw = true;
  }
  music.addEventListener('loadedmetadata', onMeta);
  music.addEventListener('durationchange', onMeta);

  document.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'Space') {
      if (e.repeat) return;
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      const step = e.shiftKey ? 5 : 1;
      setTime(clamp(nowTime() + (e.code === 'ArrowRight' ? step : -step), 0, audioDuration()));
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && playing) {
      syncClock(music.currentTime);
      needsDraw = true;
    }
  });

  window.addEventListener('orientationchange', () => {
    setTimeout(() => resize(true), 260);
  });

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => resize(false));
    ro.observe(stage);
  } else {
    window.addEventListener('resize', () => resize(false));
  }

  window.addEventListener('load', () => resize(true));

  /* ------------------------------------------------------------------ *
   *  Boot
   * ------------------------------------------------------------------ */
  function boot() {
    initSprites();
    resize(true);
    if (music.readyState >= 1) onMeta();
    syncClock(0);
    drawScene(0);
    updateUI(0);
    setPlayButton(false, false);
    requestAnimationFrame(frame);
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(() => resize(true));
    }
  }

  boot();
})();
