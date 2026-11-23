/**
 * ===================================================================
 * 圣诞树的十九秒 · 音乐舞蹈核心脚本 (tree.js)
 * 纯代码生成，无外部依赖、外部包或远程资源
 * 严格基于 cue-sheet.json 时间轴驱动：
 * - 0.00 ~ 8.40s 序幕：逐步铺陈、苏醒、点亮、优雅摇摆
 * - 8.40 ~ 17.35s 加速：欢快加速、弹动跳跃、彩灯快闪、极光与飞雪
 * - 17.35 ~ 19.00s 终章：舒展收束、星芒盛放、金粉漫天、静谧贺卡定格
 * 完全支持暂停定格、拖拽进度即时渲染、重播归零、Retina 屏与 390px 移动端
 * ===================================================================
 */

(() => {
  'use strict';

  // 1. 核心时间轴数据 (严格对应 cue-sheet.json)
  const CUE = {
    duration: 19,
    beats: [
      0.4, 1.06, 1.72, 2.38, 3.04, 3.7, 4.36, 5.02, 5.68, 6.34, 7.0, 7.66, 8.4,
      8.88, 9.36, 9.84, 10.32, 10.8, 11.28, 11.76, 12.24, 12.72, 13.2, 13.68,
      14.16, 14.64, 15.12, 15.6, 16.08, 16.56
    ],
    accents: [
      0.4, 3.04, 5.68, 8.4, 10.32, 12.24, 14.16, 16.08
    ],
    bells: [
      1.39, 2.71, 4.03, 5.35, 6.67, 7.99,
      9.12, 10.08, 11.04, 12.0, 12.96, 13.92, 14.88, 15.84, 16.8
    ],
    sections: {
      opening: 0,
      faster: 8.4,
      ending: 17.35
    }
  };

  // 2. DOM 元素获取 (保留题面指定 ID)
  const stage = document.querySelector('#stage');
  const music = document.querySelector('#music');
  const playBtn = document.querySelector('#play');
  const playIcon = document.querySelector('#play-icon');
  const playText = document.querySelector('#play-text');
  const seek = document.querySelector('#seek');
  const seekFill = document.querySelector('#seek-fill');
  const timeDisplay = document.querySelector('#time-display');
  const sectionBadge = document.querySelector('#section-badge');
  const cueAccent = document.querySelector('#cue-accent');
  const cueBeat = document.querySelector('#cue-beat');
  const cueBell = document.querySelector('#cue-bell');

  // 创建并配置 Canvas
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  stage.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });

  // 3. 确定性随机数与静态场景元素预生成 (保证任意时刻渲染确定性)
  function seededRandom(seed) {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
    return x - Math.floor(x);
  }

  // 70 颗背景星星
  const STARS = Array.from({ length: 70 }, (_, i) => ({
    x: seededRandom(i * 3 + 1) * 600,
    y: seededRandom(i * 3 + 2) * 400,
    r: 0.8 + seededRandom(i * 3 + 3) * 1.6,
    twinkleFreq: 2 + seededRandom(i * 5) * 4,
    phase: seededRandom(i * 7) * Math.PI * 2,
    isCross: i % 7 === 0
  }));

  // 130 片具有分层深度的下落雪花
  const SNOWFLAKES = Array.from({ length: 130 }, (_, i) => ({
    x0: seededRandom(i * 4 + 1) * 600,
    y0: seededRandom(i * 4 + 2) * 750,
    speed: 35 + seededRandom(i * 4 + 3) * 65,
    radius: 1.2 + seededRandom(i * 4 + 4) * 2.8,
    wobbleFreq: 1.5 + seededRandom(i * 6) * 3,
    wobbleAmp: 10 + seededRandom(i * 8) * 20,
    phase: seededRandom(i * 9) * Math.PI * 2,
    alpha: 0.35 + seededRandom(i * 11) * 0.6
  }));

  // 圣诞树 16 个挂饰彩球 (Ruby, Gold, Ice-Cyan, Amethyst, Emerald, Silver)
  const BAUBLE_COLORS = [
    { main: '#e11d48', light: '#fda4af', dark: '#881337', cap: '#f59e0b' }, // Ruby
    { main: '#f59e0b', light: '#fde68a', dark: '#92400e', cap: '#d97706' }, // Gold
    { main: '#0284c7', light: '#7dd3fc', dark: '#0c4a6e', cap: '#f59e0b' }, // Cyan
    { main: '#9333ea', light: '#d8b4fe', dark: '#581c87', cap: '#f59e0b' }, // Amethyst
    { main: '#10b981', light: '#a7f3d0', dark: '#064e3b', cap: '#fbbf24' }, // Emerald
    { main: '#e2e8f0', light: '#ffffff', dark: '#64748b', cap: '#d97706' }  // Silver
  ];

  const BAUBLES = [
    // Tier 1 (底裙): 6个
    { tier: 1, side: -1, prog: 0.88, stringLen: 16, radius: 10.5, colorIdx: 0 },
    { tier: 1, side: -1, prog: 0.52, stringLen: 18, radius: 9.5,  colorIdx: 1 },
    { tier: 1, side: -1, prog: 0.22, stringLen: 15, radius: 8.5,  colorIdx: 2 },
    { tier: 1, side:  1, prog: 0.22, stringLen: 16, radius: 8.5,  colorIdx: 3 },
    { tier: 1, side:  1, prog: 0.52, stringLen: 19, radius: 10.0, colorIdx: 4 },
    { tier: 1, side:  1, prog: 0.88, stringLen: 15, radius: 11.0, colorIdx: 1 },
    // Tier 2 (中下层): 5个
    { tier: 2, side: -1, prog: 0.80, stringLen: 16, radius: 9.5,  colorIdx: 4 },
    { tier: 2, side: -1, prog: 0.38, stringLen: 17, radius: 8.5,  colorIdx: 0 },
    { tier: 2, side:  0, prog: 0.00, stringLen: 18, radius: 9.0,  colorIdx: 1 },
    { tier: 2, side:  1, prog: 0.38, stringLen: 15, radius: 8.5,  colorIdx: 2 },
    { tier: 2, side:  1, prog: 0.80, stringLen: 16, radius: 9.5,  colorIdx: 0 },
    // Tier 3 (中上层): 3个
    { tier: 3, side: -1, prog: 0.65, stringLen: 14, radius: 8.0,  colorIdx: 1 },
    { tier: 3, side:  0, prog: 0.00, stringLen: 16, radius: 8.5,  colorIdx: 3 },
    { tier: 3, side:  1, prog: 0.65, stringLen: 14, radius: 8.0,  colorIdx: 5 },
    // Tier 4 (顶层): 2个
    { tier: 4, side: -1, prog: 0.55, stringLen: 12, radius: 7.0,  colorIdx: 0 },
    { tier: 4, side:  1, prog: 0.55, stringLen: 12, radius: 7.0,  colorIdx: 4 }
  ];

  // 5 只精美金色铃铛 (当高音铃声响起时摇摆并发出光波音浪)
  const BELLS = [
    { tier: 1, side: -1, prog: 0.98, size: 16 },
    { tier: 1, side:  1, prog: 0.98, size: 16 },
    { tier: 2, side: -1, prog: 0.95, size: 14 },
    { tier: 2, side:  1, prog: 0.95, size: 14 },
    { tier: 3, side:  0, prog: 0.00, size: 13 }
  ];

  // 42 颗缠绕树身的流光彩灯
  const FAIRY_LIGHTS = Array.from({ length: 42 }, (_, i) => ({
    tier: (i % 4) + 1,
    strand: Math.floor(i / 14),
    posAlong: (i % 14) / 13,
    colorType: i % 5,
    phase: i * 0.45
  }));

  // 4. 音乐节拍动力学纯函数计算 (根据当前时间 t 返回完整的动作与光效参数)
  function getRhythmState(t) {
    // A. 段落判断
    let section = 'opening';
    let sectionProgress = 0;
    if (t < CUE.sections.faster) {
      section = 'opening';
      sectionProgress = t / CUE.sections.faster;
    } else if (t < CUE.sections.ending) {
      section = 'faster';
      sectionProgress = (t - CUE.sections.faster) / (CUE.sections.ending - CUE.sections.faster);
    } else {
      section = 'ending';
      sectionProgress = Math.min(1, (t - CUE.sections.ending) / (CUE.duration - CUE.sections.ending));
    }

    // B. 重拍状态 (Accents) - 驱动整棵树核心动作与大幅摇摆
    let lastAccentTime = -1;
    let accentIdx = -1;
    for (let i = 0; i < CUE.accents.length; i++) {
      if (t >= CUE.accents[i]) {
        lastAccentTime = CUE.accents[i];
        accentIdx = i;
      } else {
        break;
      }
    }
    const accentDecay = (t < CUE.sections.faster) ? 0.65 : 0.42;
    const accentDt = lastAccentTime >= 0 ? (t - lastAccentTime) : 999;
    const accentIntensity = accentDt < accentDecay ? Math.pow(1 - accentDt / accentDecay, 2) : 0;
    const accentDir = (accentIdx % 2 === 0) ? 1 : -1;

    // C. 弱拍状态 (Beats) - 驱动弹跳 (Squash & Stretch) 与节拍呼吸
    let lastBeatTime = -1;
    let nextBeatTime = -1;
    let beatIdx = -1;
    for (let i = 0; i < CUE.beats.length; i++) {
      if (t >= CUE.beats[i]) {
        lastBeatTime = CUE.beats[i];
        beatIdx = i;
      } else {
        nextBeatTime = CUE.beats[i];
        break;
      }
    }
    const beatPeriod = (lastBeatTime >= 0 && nextBeatTime > 0)
      ? (nextBeatTime - lastBeatTime)
      : (t < CUE.sections.faster ? 0.66 : 0.48);
    const beatDt = lastBeatTime >= 0 ? (t - lastBeatTime) : 999;
    const beatDecay = beatPeriod * 0.8;
    const beatIntensity = beatDt < beatDecay ? Math.pow(1 - beatDt / beatDecay, 1.8) : 0;
    const beatBounce = beatDt < beatDecay ? Math.sin((beatDt / beatDecay) * Math.PI) : 0;

    // D. 高音铃声状态 (Bells) - 驱动局部灯饰高亮爆发、金色铃铛摇摆与音浪光圈
    let lastBellTime = -1;
    let bellIdx = -1;
    for (let i = 0; i < CUE.bells.length; i++) {
      if (t >= CUE.bells[i]) {
        lastBellTime = CUE.bells[i];
        bellIdx = i;
      } else {
        break;
      }
    }
    const bellDecay = 0.72;
    const bellDt = lastBellTime >= 0 ? (t - lastBellTime) : 999;
    const bellIntensity = bellDt < bellDecay ? Math.pow(1 - bellDt / bellDecay, 2) : 0;
    const bellWave = bellDt < bellDecay ? Math.sin(bellDt * 28) * bellIntensity : 0;

    // E. 舞蹈动作动力学 (Squash, Stretch, Sway, Wave)
    let sway = 0;
    let bend = 0;
    let squash = 0;
    let stretch = 0;

    if (t < 0.4) {
      // 0s ~ 0.4s: 尚未开始，安静伫立在星空雪夜中，呈现优雅静止构图
      sway = 0;
      bend = 0;
      squash = 0;
      stretch = 0;
    } else if (section === 'opening') {
      // 序幕：优美舒缓的华尔兹摇摆 (周期约 2.64s = 4 拍)，重拍时倾斜加深
      const waltzPhase = (t - 0.4) / 1.32;
      sway = Math.sin(waltzPhase * Math.PI) * 0.055;
      sway += accentDir * accentIntensity * 0.035;
      bend = sway * 1.4;
      squash = beatBounce * 0.04;
      stretch = beatIntensity * 0.03;
    } else if (section === 'faster') {
      // 加速：欢快富有弹性的节拍舞步 (~125 BPM, 每拍 0.48s)，左右跳跃与层级弹性鞭打
      const fastPhase = (t - CUE.sections.faster) / 0.48;
      const hopSide = Math.sin(fastPhase * Math.PI) * 0.10;
      const kick = accentDir * accentIntensity * 0.08;
      sway = hopSide + kick;
      bend = sway * 1.85;
      squash = beatBounce * 0.09;
      stretch = beatIntensity * 0.08;
    } else {
      // 终章：优雅收束定格，树身缓缓立正，微微挺拔舒展谢幕
      const fade = Math.min(1, (t - CUE.sections.ending) / 1.65);
      sway = (1 - fade) * Math.sin((t - CUE.sections.ending) * 4) * 0.03;
      bend = sway * 1.2;
      squash = 0;
      stretch = Math.sin(fade * Math.PI) * 0.035;
    }

    return {
      t,
      section,
      sectionProgress,
      accentIntensity,
      accentDir,
      accentDt,
      beatIntensity,
      beatBounce,
      bellIntensity,
      bellWave,
      bellDt,
      bellIdx,
      sway,
      bend,
      squash,
      stretch
    };
  }

  // 5. 树身 4 层层级几何参数 (基准坐标空间 600 x 750)
  const TIERS = [
    null, // 1-indexed
    { yBase: 565, yPeak: 450, halfW: 160, boughs: 5 }, // Tier 1 (底裙)
    { yBase: 470, yPeak: 365, halfW: 125, boughs: 4 }, // Tier 2 (中下)
    { yBase: 380, yPeak: 280, halfW: 92,  boughs: 4 }, // Tier 3 (中上)
    { yBase: 290, yPeak: 200, halfW: 60,  boughs: 3 }  // Tier 4 (顶层)
  ];

  // 6. 绘图管线 (纯确定性渲染函数 drawScene(t))
  function drawScene(targetTime) {
    const t = Math.min(19, Math.max(0, targetTime));
    const r = getRhythmState(t);

    const w = canvas.width;
    const h = canvas.height;
    if (w === 0 || h === 0) return;

    // 清空重绘
    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // 标准化缩放到 600 x 750 虚拟视口
    const scale = Math.min(w / 600, h / 750);
    const offsetX = (w - 600 * scale) / 2;
    const offsetY = (h - 750 * scale) / 2;
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // A. 绘制深蓝星空夜幕与节日极光 (Aurora)
    drawBackground(r);

    // B. 绘制远景雪山与地平线森林微光
    drawDistantMountains();

    // C. 绘制地面多层蓬松积雪
    drawSnowbanks(r);

    // D. 绘制树下精美礼品盒 (跟随重拍跳动)
    drawPresents(r);

    // E. 核心圣诞树绘制 (树干、4层层级松针树冠、彩带、挂饰、铃铛、彩灯)
    drawDancingTree(r);

    // F. 绘制树顶璀璨八角伯利恒之星 (Bloom & Finale Halo)
    drawTopperStar(r);

    // G. 绘制自然飘落雪花与金色音乐星尘
    drawSnowfallAndSparks(r);

    // H. 终章华丽定格金字标语 ("Merry Christmas")
    if (t >= CUE.sections.ending) {
      drawEndingGreeting(r);
    }

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 子绘制模块实现
  // -------------------------------------------------------------

  // 背景天幕与极光
  function drawBackground(r) {
    const bgGrad = ctx.createLinearGradient(300, 0, 300, 750);
    if (r.section === 'faster') {
      bgGrad.addColorStop(0, '#060a18');
      bgGrad.addColorStop(0.5, '#0b162c');
      bgGrad.addColorStop(1, '#14273d');
    } else if (r.section === 'ending') {
      bgGrad.addColorStop(0, '#070c1a');
      bgGrad.addColorStop(0.5, '#121e33');
      bgGrad.addColorStop(1, '#222d42');
    } else {
      bgGrad.addColorStop(0, '#050c16');
      bgGrad.addColorStop(0.5, '#0a1928');
      bgGrad.addColorStop(1, '#11293a');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 600, 750);

    // 绘制加速段落专属北极光 (Aurora Borealis)
    if (r.section === 'faster') {
      ctx.save();
      const auroraAlpha = Math.min(0.24, 0.12 + r.beatIntensity * 0.12);
      ctx.globalAlpha = auroraAlpha;

      // 翡翠绿极光波
      ctx.beginPath();
      ctx.moveTo(0, 180);
      for (let x = 0; x <= 600; x += 30) {
        const y = 140 + Math.sin(x * 0.012 + r.t * 1.5) * 45 + Math.cos(x * 0.008 - r.t * 0.8) * 30;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(600, 320);
      ctx.lineTo(0, 320);
      ctx.closePath();
      const aGrad1 = ctx.createLinearGradient(0, 100, 0, 320);
      aGrad1.addColorStop(0, 'rgba(52, 211, 153, 0)');
      aGrad1.addColorStop(0.5, 'rgba(16, 185, 129, 0.6)');
      aGrad1.addColorStop(1, 'rgba(6, 78, 59, 0)');
      ctx.fillStyle = aGrad1;
      ctx.fill();

      // 梦幻紫极光波
      ctx.beginPath();
      ctx.moveTo(0, 160);
      for (let x = 0; x <= 600; x += 35) {
        const y = 160 + Math.sin(x * 0.015 - r.t * 1.2) * 40;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(600, 300);
      ctx.lineTo(0, 300);
      ctx.closePath();
      const aGrad2 = ctx.createLinearGradient(0, 120, 0, 300);
      aGrad2.addColorStop(0, 'rgba(192, 132, 252, 0)');
      aGrad2.addColorStop(0.5, 'rgba(147, 51, 234, 0.45)');
      aGrad2.addColorStop(1, 'rgba(88, 28, 135, 0)');
      ctx.fillStyle = aGrad2;
      ctx.fill();

      ctx.restore();
    }

    // 闪烁夜星
    ctx.save();
    for (const star of STARS) {
      const alpha = 0.35 + 0.45 * Math.sin(r.t * star.twinkleFreq + star.phase);
      ctx.fillStyle = `rgba(255, 248, 220, ${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();

      if (star.isCross && alpha > 0.6) {
        ctx.strokeStyle = `rgba(255, 250, 230, ${(alpha * 0.5).toFixed(2)})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(star.x - star.r * 2.5, star.y);
        ctx.lineTo(star.x + star.r * 2.5, star.y);
        ctx.moveTo(star.x, star.y - star.r * 2.5);
        ctx.lineTo(star.x, star.y + star.r * 2.5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 远景雪山与地平线
  function drawDistantMountains() {
    ctx.save();
    // 远山剪影
    ctx.fillStyle = '#0f2434';
    ctx.beginPath();
    ctx.moveTo(0, 560);
    ctx.lineTo(80, 500);
    ctx.lineTo(190, 545);
    ctx.lineTo(310, 485);
    ctx.lineTo(440, 535);
    ctx.lineTo(540, 495);
    ctx.lineTo(600, 530);
    ctx.lineTo(600, 600);
    ctx.lineTo(0, 600);
    ctx.closePath();
    ctx.fill();

    // 远山微弱雪峰积雪
    ctx.fillStyle = 'rgba(224, 242, 254, 0.18)';
    ctx.beginPath();
    ctx.moveTo(80, 500);
    ctx.lineTo(105, 520);
    ctx.lineTo(65, 520);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(310, 485);
    ctx.lineTo(340, 510);
    ctx.lineTo(285, 510);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // 地面三层立体雪堆
  function drawSnowbanks(r) {
    ctx.save();
    // 后层雪地
    ctx.fillStyle = '#17364b';
    ctx.beginPath();
    ctx.moveTo(0, 595);
    ctx.quadraticCurveTo(150, 570, 300, 590);
    ctx.quadraticCurveTo(460, 610, 600, 580);
    ctx.lineTo(600, 750);
    ctx.lineTo(0, 750);
    ctx.closePath();
    ctx.fill();

    // 中层雪地 (带节日幽蓝光晕)
    const midSnowGrad = ctx.createLinearGradient(0, 600, 0, 750);
    midSnowGrad.addColorStop(0, '#234a64');
    midSnowGrad.addColorStop(0.4, '#1b3a50');
    midSnowGrad.addColorStop(1, '#112534');
    ctx.fillStyle = midSnowGrad;
    ctx.beginPath();
    ctx.moveTo(0, 625);
    ctx.quadraticCurveTo(220, 650, 390, 615);
    ctx.quadraticCurveTo(510, 595, 600, 620);
    ctx.lineTo(600, 750);
    ctx.lineTo(0, 750);
    ctx.closePath();
    ctx.fill();

    // 前层蓬松积雪
    const frontSnowGrad = ctx.createLinearGradient(0, 640, 0, 750);
    frontSnowGrad.addColorStop(0, '#e2f1fc');
    frontSnowGrad.addColorStop(0.2, '#93c5fd');
    frontSnowGrad.addColorStop(1, '#2d5372');
    ctx.fillStyle = frontSnowGrad;
    ctx.beginPath();
    ctx.moveTo(0, 660);
    ctx.quadraticCurveTo(180, 630, 320, 650);
    ctx.quadraticCurveTo(480, 670, 600, 645);
    ctx.lineTo(600, 750);
    ctx.lineTo(0, 750);
    ctx.closePath();
    ctx.fill();

    // 雪地金粉反光点
    ctx.fillStyle = 'rgba(255, 243, 199, 0.45)';
    for (let i = 0; i < 20; i++) {
      const sx = (seededRandom(i * 13 + 5) * 560) + 20;
      const sy = 650 + seededRandom(i * 17 + 7) * 80;
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }

    ctx.restore();
  }

  // 树底礼物盒 (跟随重拍微跳)
  function drawPresents(r) {
    const hop = -r.beatBounce * 5;

    ctx.save();
    // 1. 左侧大号绯红礼物盒
    drawGiftBox(215, 605 + hop, 48, 42, '#be123c', '#fbbf24');
    // 2. 中间松绿礼物盒
    drawGiftBox(270, 622 + hop * 0.7, 38, 35, '#047857', '#e2e8f0');
    // 3. 右侧华丽金黄礼物盒
    drawGiftBox(355, 608 + hop * 0.8, 50, 46, '#d97706', '#9333ea');
    // 4. 雪地散落小彩球
    drawSingleBaubleOnGround(405, 638, 8, '#0284c7');
    ctx.restore();
  }

  function drawGiftBox(x, y, w, h, boxColor, ribbonColor) {
    ctx.save();
    // 投影
    ctx.fillStyle = 'rgba(5, 15, 25, 0.4)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h + 2, w * 0.55, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 盒身
    const boxGrad = ctx.createLinearGradient(x, y, x + w, y);
    boxGrad.addColorStop(0, boxColor);
    boxGrad.addColorStop(0.7, boxColor);
    boxGrad.addColorStop(1, '#00000044');
    ctx.fillStyle = boxGrad;
    ctx.fillRect(x, y, w, h);

    // 丝带
    ctx.fillStyle = ribbonColor;
    const rw = Math.max(5, w * 0.18);
    // 竖向丝带
    ctx.fillRect(x + (w - rw) / 2, y, rw, h);
    // 横向丝带
    ctx.fillRect(x, y + (h - rw) / 2, w, rw);

    // 顶部蝴蝶结
    const cx = x + w / 2;
    const cy = y;
    ctx.beginPath();
    ctx.ellipse(cx - rw * 0.8, cy - 4, rw * 0.8, rw * 0.5, -Math.PI / 4, 0, Math.PI * 2);
    ctx.ellipse(cx + rw * 0.8, cy - 4, rw * 0.8, rw * 0.5, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSingleBaubleOnGround(x, y, r, color) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + r - 1, r * 1.2, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 1, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.3, color);
    g.addColorStop(1, '#041525');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 核心起舞圣诞树
  function drawDancingTree(r) {
    // 树根锚点：(300, 565)
    // 树干绘制
    drawTrunk(r);

    // 计算 4 个层级的变换矩阵参数 (物理惯性与波形传导)
    const tierTransforms = [];
    for (let k = 1; k <= 4; k++) {
      const frac = k / 4;
      // 左右位移：顶部摆幅更大
      const dx = r.sway * 125 * Math.pow(frac, 1.2);
      // 弹性下蹲与回弹
      const dy = -r.squash * 35 * (1 - frac * 0.3) + r.stretch * 25 * frac;
      // 倾角：高层带微小相位滞后，形成生动的流体舞蹈摆动
      const lag = (r.section === 'faster') ? Math.sin((r.t - 8.4) * 13 - k * 0.45) * 0.03 : 0;
      const angle = r.bend * Math.pow(frac, 1.1) + lag;
      tierTransforms[k] = { dx, dy, angle };
    }

    // 重拍驱动的全树轮廓金光闪耀 (Whole-Tree Downbeat Aura)
    if (r.accentIntensity > 0.05) {
      ctx.save();
      ctx.globalAlpha = r.accentIntensity * 0.35;
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 30 * r.accentIntensity;
      drawTreeFoliageSilhouette(tierTransforms);
      ctx.restore();
    }

    // 从底向顶依次绘制 4 层树冠及挂载装饰 (以便呈现自然遮挡层次)
    for (let k = 1; k <= 4; k++) {
      drawTierFoliage(k, tierTransforms[k], r);
    }

    // 绘制 3 条流光金色串珠彩带 (Garlands)
    drawGarlands(tierTransforms, r);

    // 绘制 16 个摇摆彩球挂饰 (Baubles)
    drawBaubles(tierTransforms, r);

    // 绘制 5 只金色摇摆铃铛 (Bells)
    drawBells(tierTransforms, r);

    // 绘制 42 颗闪耀彩色串灯 (Fairy Lights)
    drawFairyLights(tierTransforms, r);
  }

  // 树干
  function drawTrunk(r) {
    ctx.save();
    const trunkW = 36;
    const trunkH = 65;
    const x = 300 - trunkW / 2 + r.sway * 8;
    const y = 565;

    // 树干木质渐变
    const trunkGrad = ctx.createLinearGradient(x, y, x + trunkW, y);
    trunkGrad.addColorStop(0, '#381c0c');
    trunkGrad.addColorStop(0.5, '#5c2e17');
    trunkGrad.addColorStop(1, '#271207');
    ctx.fillStyle = trunkGrad;

    ctx.beginPath();
    ctx.moveTo(x + 4, y);
    ctx.lineTo(x + trunkW - 4, y);
    ctx.lineTo(x + trunkW + 2, y + trunkH);
    ctx.lineTo(x - 2, y + trunkH);
    ctx.closePath();
    ctx.fill();

    // 树干基部贴地积雪
    ctx.fillStyle = '#e2f1fc';
    ctx.beginPath();
    ctx.ellipse(300 + r.sway * 8, y + trunkH - 3, 24, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 单层树冠 (松针簇与波浪曲线造型)
  function drawTierFoliage(k, tf, r) {
    const info = TIERS[k];
    const { yBase, yPeak, halfW, boughs } = info;

    ctx.save();
    // 应用当前层级的位移与旋转矩阵
    ctx.translate(300 + tf.dx, yBase + tf.dy);
    ctx.rotate(tf.angle);

    // 相对原点：底裙中心为 (0, 0)，尖顶为 (0, -(yBase - yPeak))
    const peakY = -(yBase - yPeak);

    // 1. 底层深色暗影松针
    ctx.fillStyle = '#062013';
    buildBoughPath(ctx, halfW + 4, peakY, boughs, 8);
    ctx.fill();

    // 2. 主体丰富墨绿层级
    const foliageGrad = ctx.createLinearGradient(-halfW, 0, halfW, peakY);
    foliageGrad.addColorStop(0, '#0c3820');
    foliageGrad.addColorStop(0.3, '#14532d');
    foliageGrad.addColorStop(0.7, '#166534');
    foliageGrad.addColorStop(1, '#0c3820');
    ctx.fillStyle = foliageGrad;
    buildBoughPath(ctx, halfW, peakY, boughs, 0);
    ctx.fill();

    // 3. 亮色翡翠绿针叶纹理与高光
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.45;
    for (let i = 1; i <= boughs; i++) {
      const stepFrac = i / boughs;
      const lx = -halfW * (1 - stepFrac * 0.7);
      const ly = stepFrac * peakY + 8;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + 14, ly - 6);
      ctx.stroke();

      const rx = halfW * (1 - stepFrac * 0.7);
      ctx.beginPath();
      ctx.moveTo(rx, ly);
      ctx.lineTo(rx - 14, ly - 6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    // 4. 树梢覆雪 (白雪覆盖在每一折波浪外沿)
    drawTierSnowCaps(ctx, halfW, peakY, boughs);

    ctx.restore();
  }

  // 构造生动的松树波浪多重裙边路径
  function buildBoughPath(c, hw, peakY, boughs, offset) {
    c.beginPath();
    c.moveTo(0, peakY - offset);

    // 左侧向下扇形松针扇面
    const leftPoints = [];
    for (let i = boughs; i >= 1; i--) {
      const frac = i / boughs;
      const bx = -hw * frac - offset * (frac * 0.5);
      const by = peakY + (1 - frac) * (-peakY) + 12;
      leftPoints.push({ x: bx, y: by });
    }

    let prevX = 0;
    let prevY = peakY;
    for (const pt of leftPoints) {
      c.quadraticCurveTo(prevX - 8, prevY + 12, pt.x, pt.y);
      prevX = pt.x;
      prevY = pt.y;
    }

    // 底部内凹托底裙边 (呈弧形微翘)
    c.quadraticCurveTo(-hw * 0.5, 6, 0, 4);
    c.quadraticCurveTo(hw * 0.5, 6, hw, leftPoints[0].y);

    // 右侧向上回溯闭合
    const rightPoints = [];
    for (let i = 2; i <= boughs; i++) {
      const frac = i / boughs;
      const bx = hw * frac + offset * (frac * 0.5);
      const by = peakY + (1 - frac) * (-peakY) + 12;
      rightPoints.push({ x: bx, y: by });
    }
    rightPoints.reverse();

    prevX = hw;
    prevY = leftPoints[0].y;
    for (const pt of rightPoints) {
      c.quadraticCurveTo(prevX + 8, prevY - 8, pt.x, pt.y);
      prevX = pt.x;
      prevY = pt.y;
    }
    c.quadraticCurveTo(prevX + 4, peakY + 8, 0, peakY - offset);
    c.closePath();
  }

  // 树枝边缘积雪层
  function drawTierSnowCaps(c, hw, peakY, boughs) {
    c.save();
    c.fillStyle = '#f8fafc';
    c.strokeStyle = '#bae6fd';
    c.lineWidth = 1;

    for (let i = 1; i <= boughs; i++) {
      const frac = i / boughs;
      const lx = -hw * frac;
      const ly = peakY + (1 - frac) * (-peakY) + 10;
      c.beginPath();
      c.ellipse(lx + 6, ly, 10, 3.5, -0.2, 0, Math.PI * 2);
      c.fill();
      c.stroke();

      const rx = hw * frac;
      c.beginPath();
      c.ellipse(rx - 6, ly, 10, 3.5, 0.2, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    c.restore();
  }

  // 树身轮廓金光路径 (重拍 Bloom 冲顶)
  function drawTreeFoliageSilhouette(tierTransforms) {
    ctx.beginPath();
    const t4 = tierTransforms[4];
    ctx.arc(300 + t4.dx, 200 + t4.dy, 45, 0, Math.PI * 2);
    const t1 = tierTransforms[1];
    ctx.arc(300 + t1.dx, 540 + t1.dy, 160, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(251, 191, 36, 0.2)';
    ctx.fill();
  }

  // 流光金色串珠彩带 (Garlands)
  function drawGarlands(tierTransforms, r) {
    const swags = [
      { tier: 2, yRel: 420, amp: 26, leftFrac: 0.75, rightFrac: 0.75 },
      { tier: 1, yRel: 505, amp: 35, leftFrac: 0.85, rightFrac: 0.85 },
      { tier: 1, yRel: 545, amp: 42, leftFrac: 0.95, rightFrac: 0.95 }
    ];

    ctx.save();
    for (const swag of swags) {
      const tf = tierTransforms[swag.tier];
      const hw = TIERS[swag.tier].halfW;
      const lx = 300 + tf.dx - hw * swag.leftFrac;
      const rx = 300 + tf.dx + hw * swag.rightFrac;
      const ly = swag.yRel + tf.dy - 8;
      const ry = swag.yRel + tf.dy - 8;
      const midY = swag.yRel + tf.dy + swag.amp + Math.sin(r.t * 3) * 2;

      // 金色弧线
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2.2;
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.quadraticCurveTo(300 + tf.dx, midY, rx, ry);
      ctx.stroke();

      // 彩带上的金珠微粒
      ctx.fillStyle = '#f59e0b';
      const steps = 14;
      for (let s = 1; s < steps; s++) {
        const u = s / steps;
        const bx = (1 - u) * (1 - u) * lx + 2 * (1 - u) * u * (300 + tf.dx) + u * u * rx;
        const by = (1 - u) * (1 - u) * ly + 2 * (1 - u) * u * midY + u * u * ry;
        ctx.beginPath();
        ctx.arc(bx, by, (s % 2 === 0 ? 2.8 : 1.8), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // 16 颗彩球挂饰 (带物理摆动与反射光斑)
  function drawBaubles(tierTransforms, r) {
    ctx.save();
    for (let i = 0; i < BAUBLES.length; i++) {
      const b = BAUBLES[i];
      const tf = tierTransforms[b.tier];
      const hw = TIERS[b.tier].halfW;

      // 挂钩世界坐标
      const hookX = 300 + tf.dx + b.side * hw * b.prog;
      const hookY = TIERS[b.tier].yBase + tf.dy - 22;

      // 物理钟摆摆角 (响应树枝横向速度与重拍反弹)
      const swayVel = Math.cos(r.t * 4 + i) * r.sway * 1.5;
      const swingAngle = -swayVel + (r.beatIntensity * 0.15 * Math.sin(r.t * 8 + i));

      const bx = hookX + Math.sin(swingAngle) * b.stringLen;
      const by = hookY + Math.cos(swingAngle) * b.stringLen;

      // 1. 吊绳
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(hookX, hookY);
      ctx.lineTo(bx, by - b.radius);
      ctx.stroke();

      // 2. 金色球托
      ctx.fillStyle = '#ca8a04';
      ctx.fillRect(bx - 2.5, by - b.radius - 2.5, 5, 3);

      // 3. 3D 渐变球体
      const col = BAUBLE_COLORS[b.colorIdx];
      const g = ctx.createRadialGradient(
        bx - b.radius * 0.35, by - b.radius * 0.35, 1,
        bx, by, b.radius
      );
      g.addColorStop(0, col.light);
      g.addColorStop(0.4, col.main);
      g.addColorStop(1, col.dark);

      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, b.radius, 0, Math.PI * 2);
      ctx.fill();

      // 4. 玻璃高光光斑
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.ellipse(bx - b.radius * 0.35, by - b.radius * 0.35, b.radius * 0.35, b.radius * 0.2, -Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();

      // 5. 铃声触发时的彩球局部暴击光晕 (Driving Local Ornaments)
      if (r.bellIntensity > 0.1 && (i % 3 === (r.bellIdx % 3))) {
        ctx.save();
        ctx.globalAlpha = r.bellIntensity * 0.8;
        ctx.fillStyle = '#ffffff';
        drawSparkleStar(ctx, bx, by, 4, b.radius * 2.2, b.radius * 0.6);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // 5 只金色铃铛 (高音铃声驱动摇晃与音浪环)
  function drawBells(tierTransforms, r) {
    ctx.save();
    for (let i = 0; i < BELLS.length; i++) {
      const bell = BELLS[i];
      const tf = tierTransforms[bell.tier];
      const hw = TIERS[bell.tier].halfW;

      const bx = 300 + tf.dx + bell.side * hw * bell.prog;
      const by = TIERS[bell.tier].yBase + tf.dy - 12;

      // 铃声期间的高频共振衰减摆动
      const ringAngle = (r.bellIntensity > 0.05)
        ? Math.sin(r.bellDt * 26 + i) * r.bellIntensity * 0.55
        : Math.sin(r.t * 2 + i) * 0.08;

      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(ringAngle);

      // 铃身绘制 (喇叭口梯形金铃)
      const bGrad = ctx.createLinearGradient(-bell.size * 0.5, -bell.size, bell.size * 0.5, 0);
      bGrad.addColorStop(0, '#fef08a');
      bGrad.addColorStop(0.5, '#f59e0b');
      bGrad.addColorStop(1, '#b45309');
      ctx.fillStyle = bGrad;

      ctx.beginPath();
      ctx.moveTo(-bell.size * 0.3, -bell.size);
      ctx.lineTo(bell.size * 0.3, -bell.size);
      ctx.lineTo(bell.size * 0.55, 0);
      ctx.lineTo(-bell.size * 0.55, 0);
      ctx.closePath();
      ctx.fill();

      // 铃铛底口金色圆环与铃舌
      ctx.fillStyle = '#ca8a04';
      ctx.beginPath();
      ctx.ellipse(0, 0, bell.size * 0.55, bell.size * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.arc(Math.sin(ringAngle * 2) * 2, 2, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // 顶部红色小蝴蝶结
      ctx.fillStyle = '#e11d48';
      ctx.beginPath();
      ctx.arc(-3, -bell.size - 2, 3, 0, Math.PI * 2);
      ctx.arc(3, -bell.size - 2, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // 高音铃声驱动的音浪光圈扩散 (Soundwave Ripples)
      if (r.bellIntensity > 0.08) {
        ctx.save();
        const waveRadius = bell.size + r.bellDt * 45;
        const waveAlpha = Math.max(0, (1 - r.bellDt / 0.72) * 0.75);
        ctx.strokeStyle = `rgba(254, 240, 138, ${waveAlpha.toFixed(2)})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(bx, by + 4, waveRadius, 0, Math.PI * 2);
        ctx.stroke();

        // 伴随微小音符与金星升腾
        ctx.fillStyle = `rgba(251, 191, 36, ${waveAlpha.toFixed(2)})`;
        const sparkY = by - r.bellDt * 30;
        drawSparkleStar(ctx, bx + Math.sin(r.bellDt * 10) * 12, sparkY, 4, 6, 2);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // 42 颗闪耀彩灯 (开场逐层苏醒，中段彩虹跑马，高潮全屏呼吸)
  function drawFairyLights(tierTransforms, r) {
    const RAINBOW = ['#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#a855f7'];

    ctx.save();
    for (let i = 0; i < FAIRY_LIGHTS.length; i++) {
      const fl = FAIRY_LIGHTS[i];
      const tf = tierTransforms[fl.tier];
      const hw = TIERS[fl.tier].halfW;

      // 确定灯泡空间坐标 (沿层级枝叶分布)
      const u = (fl.posAlong - 0.5) * 2; // -1 to 1
      const lx = 300 + tf.dx + u * hw * 0.85;
      const ly = TIERS[fl.tier].yBase + tf.dy - 35 + Math.sin(fl.posAlong * Math.PI) * 22;

      // 灯光颜色与亮度策略
      let color = '#fef08a';
      let brightness = 0.8;

      if (r.section === 'opening') {
        // 序幕：随着音乐播放，自下而上或逐层苏醒点亮
        const wakeTime = 0.4 + (i / FAIRY_LIGHTS.length) * 4.5;
        if (r.t < wakeTime) {
          brightness = 0.15; // 微弱休眠
          color = '#78350f';
        } else {
          brightness = 0.75 + Math.sin(r.t * 5 + fl.phase) * 0.25;
          color = '#fef08a';
        }
      } else if (r.section === 'faster') {
        // 加速段：多彩宝石霓虹快速跑马跟随 125 BPM
        const colorOffset = Math.floor((r.t * 4.2 + i) % RAINBOW.length);
        color = RAINBOW[colorOffset];
        brightness = 0.7 + r.beatIntensity * 0.4 + Math.sin(r.t * 8 + fl.phase) * 0.2;
      } else {
        // 终章：温润香槟金圣洁星光
        color = '#fffbeb';
        brightness = 0.85 + Math.sin(r.t * 3 + fl.phase) * 0.15;
      }

      // 高音铃声瞬间全局光波涌浪
      if (r.bellIntensity > 0.05) {
        brightness = Math.min(1.5, brightness + r.bellIntensity * 0.6);
      }

      // 绘制灯泡光晕
      const glowR = 8 * Math.min(1.4, brightness);
      const glowGrad = ctx.createRadialGradient(lx, ly, 1, lx, ly, glowR);
      glowGrad.addColorStop(0, color);
      glowGrad.addColorStop(0.4, color);
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(lx, ly, glowR, 0, Math.PI * 2);
      ctx.fill();

      // 灯芯高亮小白点
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(lx, ly, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 树顶璀璨八角伯利恒之星 (Bethlehem Star)
  function drawTopperStar(r) {
    const t4 = TIERS[4];
    const tf = {
      dx: r.sway * 125 * Math.pow(1.0, 1.2),
      dy: -r.squash * 35 * 0.7 + r.stretch * 25,
      angle: r.bend * 1.0
    };

    const starX = 300 + tf.dx;
    const starY = t4.yPeak + tf.dy - 6;

    ctx.save();
    ctx.translate(starX, starY);
    ctx.rotate(tf.angle * 0.4);

    // 1. 终章大星爆发天界圣光金轮 (Finale Celestial Halo)
    if (r.section === 'ending') {
      const haloFade = Math.min(1, (r.t - CUE.sections.ending) / 0.8);
      const haloR = 120 + haloFade * 110;
      const haloGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, haloR);
      haloGrad.addColorStop(0, 'rgba(254, 240, 138, 0.75)');
      haloGrad.addColorStop(0.3, 'rgba(251, 191, 36, 0.4)');
      haloGrad.addColorStop(0.7, 'rgba(245, 158, 11, 0.15)');
      haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(0, 0, haloR, 0, Math.PI * 2);
      ctx.fill();

      // 放射状圣洁光束
      ctx.strokeStyle = 'rgba(254, 240, 138, 0.28)';
      ctx.lineWidth = 1.6;
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2 + r.t * 0.2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * 20, Math.sin(ang) * 20);
        ctx.lineTo(Math.cos(ang) * (haloR * 0.9), Math.sin(ang) * (haloR * 0.9));
        ctx.stroke();
      }
    }

    // 2. 常态/加速脉冲光晕
    const baseGlowR = 28 + r.beatIntensity * 16 + (r.section === 'ending' ? 20 : 0);
    const starGlow = ctx.createRadialGradient(0, 0, 4, 0, 0, baseGlowR);
    starGlow.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    starGlow.addColorStop(0.3, 'rgba(254, 240, 138, 0.85)');
    starGlow.addColorStop(0.7, 'rgba(245, 158, 11, 0.35)');
    starGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = starGlow;
    ctx.beginPath();
    ctx.arc(0, 0, baseGlowR, 0, Math.PI * 2);
    ctx.fill();

    // 3. 3D 多切面八角星本体 (4条主芒 + 4条次芒)
    drawFaceted8Star(ctx, 36, 16, 8);

    // 4. 中心镶嵌红宝石
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-1.2, -1.2, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // 8 角立体刻面星
  function drawFaceted8Star(c, outerR, innerR, points) {
    const totalPoints = points * 2;
    for (let i = 0; i < totalPoints; i++) {
      const a1 = (i / totalPoints) * Math.PI * 2 - Math.PI / 2;
      const a2 = ((i + 1) / totalPoints) * Math.PI * 2 - Math.PI / 2;
      const r1 = (i % 2 === 0) ? outerR : innerR;
      const r2 = (i % 2 === 0) ? innerR : outerR;

      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
      c.lineTo(Math.cos(a2) * r2, Math.sin(a2) * r2);
      c.closePath();

      // 切面明暗交替
      c.fillStyle = (i % 2 === 0) ? '#fef08a' : '#d97706';
      c.fill();
    }
  }

  // 雪花与金色音浪星尘 (纯确定性函数)
  function drawSnowfallAndSparks(r) {
    ctx.save();
    const wind = (r.section === 'faster') ? 45 : 12;

    for (let i = 0; i < SNOWFLAKES.length; i++) {
      const s = SNOWFLAKES[i];
      // 垂直周期性 wrap-around (0 ~ 750)
      const y = (s.y0 + r.t * s.speed) % 750;
      // 水平摇曳 + 风力影响
      const wobble = Math.sin(r.t * s.wobbleFreq + s.phase) * s.wobbleAmp;
      let x = (s.x0 + wobble + Math.sin(r.t * 0.8) * wind) % 600;
      if (x < 0) x += 600;

      ctx.fillStyle = `rgba(240, 249, 255, ${s.alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(x, y, s.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 终章金色飞散星粉
    if (r.section === 'ending') {
      const dustCount = 45;
      for (let i = 0; i < dustCount; i++) {
        const seed = i * 7 + 19;
        const speed = 25 + seededRandom(seed) * 35;
        const dt = r.t - CUE.sections.ending;
        const gy = (seededRandom(seed + 1) * 300 + dt * speed) % 550 + 150;
        const gx = 300 + (seededRandom(seed + 2) - 0.5) * (180 + dt * 40);
        const alpha = Math.max(0, 0.8 - (gy - 150) / 450);

        ctx.fillStyle = `rgba(254, 240, 138, ${alpha.toFixed(2)})`;
        drawSparkleStar(ctx, gx, gy, 4, 4, 1.2);
      }
    }

    ctx.restore();
  }

  // 四角闪耀十字星绘制工具函数
  function drawSparkleStar(c, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    c.beginPath();
    c.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      c.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      c.lineTo(x, y);
      rot += step;
    }
    c.lineTo(cx, cy - outerRadius);
    c.closePath();
    c.fill();
  }

  // 终章定格华丽书法金字 ("Merry Christmas")
  function drawEndingGreeting(r) {
    const fade = Math.min(1, (r.t - CUE.sections.ending) / 0.9);
    ctx.save();
    ctx.globalAlpha = fade;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 阴影
    ctx.font = 'bold 36px "Brush Script MT", "Segoe Script", "Apple Chancery", cursive, sans-serif';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillText('Merry Christmas', 300, 688);

    // 金光渐变字
    const textGrad = ctx.createLinearGradient(180, 680, 420, 680);
    textGrad.addColorStop(0, '#fde68a');
    textGrad.addColorStop(0.5, '#ffffff');
    textGrad.addColorStop(1, '#f59e0b');
    ctx.fillStyle = textGrad;
    ctx.fillText('Merry Christmas', 300, 686);

    // 副标题小字
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(254, 243, 199, 0.85)';
    ctx.fillText('愿爱与温暖伴你度过每一个美好的十九秒', 300, 716);

    ctx.restore();
  }

  // 7. 高清屏幕适配与尺寸同步 (支持 Retina & 390px 移动端)
  function resizeCanvas() {
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }

  // 8. 界面与控制控件状态同步
  function updateUI(t) {
    const safeTime = Math.min(19, Math.max(0, t));

    // 同步 #seek 输入条 (单位为秒，保留2位小数)
    if (document.activeElement !== seek) {
      seek.value = safeTime.toFixed(2);
    }

    // 同步自定义进度条视觉填充
    const percent = ((safeTime / 19) * 100).toFixed(1);
    if (seekFill) {
      seekFill.style.width = `${percent}%`;
    }

    // 时间显示
    if (timeDisplay) {
      timeDisplay.textContent = `${safeTime.toFixed(2)}s / 19.00s`;
    }

    // 段落指示徽标
    if (sectionBadge) {
      if (safeTime < CUE.sections.faster) {
        sectionBadge.textContent = '序幕 · 逐步铺陈';
        sectionBadge.className = 'section-badge';
      } else if (safeTime < CUE.sections.ending) {
        sectionBadge.textContent = '高潮 · 欢乐加速';
        sectionBadge.className = 'section-badge faster';
      } else {
        sectionBadge.textContent = '终章 · 圣洁定格';
        sectionBadge.className = 'section-badge ending';
      }
    }

    // 节奏指示灯实时状态反馈
    const r = getRhythmState(safeTime);
    if (cueAccent) {
      if (r.accentIntensity > 0.35) cueAccent.classList.add('active');
      else cueAccent.classList.remove('active');
    }
    if (cueBeat) {
      if (r.beatIntensity > 0.35) cueBeat.classList.add('active');
      else cueBeat.classList.remove('active');
    }
    if (cueBell) {
      if (r.bellIntensity > 0.35) cueBell.classList.add('active');
      else cueBell.classList.remove('active');
    }
  }

  // 9. 动画渲染循环控制
  let rafId = null;

  function tick() {
    const curTime = Math.min(19, Math.max(0, music.currentTime || 0));
    updateUI(curTime);
    drawScene(curTime);

    if (!music.paused && !music.ended) {
      rafId = requestAnimationFrame(tick);
    }
  }

  // 10. 事件监听与键盘无障碍交互绑定

  // A. 播放 / 暂停 / 重播
  function togglePlay() {
    if (music.ended || music.currentTime >= 18.95) {
      // 重播必须从零开始
      music.currentTime = 0;
      music.play().catch(() => {});
    } else if (music.paused) {
      music.play().catch(() => {});
    } else {
      music.pause();
    }
  }

  playBtn.addEventListener('click', togglePlay);

  music.addEventListener('play', () => {
    playBtn.classList.add('playing');
    playIcon.textContent = '❚❚';
    playText.textContent = '暂停';
    playBtn.setAttribute('aria-label', '暂停音乐与动画');
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  });

  music.addEventListener('pause', () => {
    playBtn.classList.remove('playing');
    if (music.currentTime >= 18.95) {
      playIcon.textContent = '↺';
      playText.textContent = '重播';
      playBtn.setAttribute('aria-label', '从零重播');
    } else {
      playIcon.textContent = '▶';
      playText.textContent = '播放';
      playBtn.setAttribute('aria-label', '播放音乐与动画');
    }
    if (rafId) cancelAnimationFrame(rafId);
    drawScene(music.currentTime || 0);
    updateUI(music.currentTime || 0);
  });

  music.addEventListener('ended', () => {
    playBtn.classList.remove('playing');
    playIcon.textContent = '↺';
    playText.textContent = '重播';
    playBtn.setAttribute('aria-label', '从零重播');
    if (rafId) cancelAnimationFrame(rafId);
    drawScene(19);
    updateUI(19);
  });

  // B. #seek 拖拽即刻渲染 (无论是播放中还是暂停时，立即呈现该瞬间构图)
  function handleSeekInput() {
    const targetVal = Math.min(19, Math.max(0, parseFloat(seek.value) || 0));
    try {
      music.currentTime = targetVal;
    } catch (_) {}
    updateUI(targetVal);
    drawScene(targetVal);
  }

  seek.addEventListener('input', handleSeekInput);
  seek.addEventListener('change', handleSeekInput);

  // C. 键盘支持 (空格播放/暂停，左右方向键微调进度)
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      if (e.target !== playBtn) {
        e.preventDefault();
        togglePlay();
      }
    } else if (e.code === 'ArrowLeft') {
      if (e.target !== seek) {
        e.preventDefault();
        const nextTime = Math.max(0, (music.currentTime || 0) - 0.5);
        music.currentTime = nextTime;
        seek.value = nextTime.toFixed(2);
        updateUI(nextTime);
        drawScene(nextTime);
      }
    } else if (e.code === 'ArrowRight') {
      if (e.target !== seek) {
        e.preventDefault();
        const nextTime = Math.min(19, (music.currentTime || 0) + 0.5);
        music.currentTime = nextTime;
        seek.value = nextTime.toFixed(2);
        updateUI(nextTime);
        drawScene(nextTime);
      }
    }
  });

  // D. 窗口与视口缩放自适应监听
  window.addEventListener('resize', () => {
    resizeCanvas();
    const t = Math.min(19, Math.max(0, music.currentTime || 0));
    drawScene(t);
  });

  // 11. 初始化加载：在静音或尚未播放时即刻给出完整精美构图
  window.addEventListener('DOMContentLoaded', () => {
    resizeCanvas();
    updateUI(0);
    drawScene(0);
  });

  // 立即首屏执行一次保证无需等待事件
  resizeCanvas();
  updateUI(0);
  drawScene(0);

})();
