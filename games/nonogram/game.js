// ==========================================================================
// 方块推理 · 数织挑战 (纯 HTML + SVG 渲染，4状态冰块与完整参考图交互)
// ==========================================================================

const SIZE = 15;
const MODE_ICE = 1;
const MODE_GRASS = 0;
const MODE_NORMAL = 2;
const MODE_LABELS = {
  [MODE_ICE]: "除冰模式",
  [MODE_GRASS]: "除草模式",
  [MODE_NORMAL]: "普通模式"
};

// ======================
// 游戏核心状态
// ======================
let currentMode = MODE_ICE;
let currentSeed = 0;
let levelNumber = 1;
let drawMode = "fill"; // "fill" 或 "cross"
let isGenerating = false;
let soundEnabled = true;

// 棋盘数据
let solution = [];
let state = [];          // 0: 未揭示, 1: 涂色, 2: 标记X
let errorFlags = [];     // null, "fill", "cross"
let toolRevealed = [];   // boolean
let terrain = [];        // 0: 无, 1: 草方块, 2: 冰方块
let unlockProgress = []; // 0, 1, 2, 3, 4 (冰块对应4种状态，4表示消融)
let rows = [];
let cols = [];
let cells = [];

// 道具数据与生命值
let tools = { hammer: 3, magnet: 1, plane: 1 };
let activeTool = null;
let lives = 3;
let timerSeconds = 0;
let timerInterval = null;
let isGameWon = false;

// 交互状态
let dragSession = null;
let touchPending = null;
const LONG_PRESS_MS = 380;

// DOM 元素引用
let boardEl, rowHintsEl, colHintsEl, statusEl;
let timerTextEl, levelBadgeEl, livesContainerEl;

// ==========================================================================
// Web Audio 纯代码合成音效 (无需外置音频文件)
// ==========================================================================
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playSound(type) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === "fill") {
      // 涂色音效：清脆木质气泡音
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.08);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === "cross") {
      // 排除音效：轻柔的竹木咔嗒声
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(560, now);
      osc.frequency.exponentialRampToValueAtTime(280, now + 0.05);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === "crack") {
      // 冰块破裂 (1/4, 1/2, 3/4) 音效：高频脆裂咔嚓声
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.06);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    } else if (type === "shatter") {
      // 冰块彻底消融音效：清脆风铃水晶散落音
      [1046, 1318, 1567, 2093].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.04);
        gain.gain.setValueAtTime(0.2, now + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.04 + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.2);
      });
    } else if (type === "error") {
      // 点错音效：低频震颤提示
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.linearRampToValueAtTime(130, now + 0.2);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === "tool") {
      // 道具使用呼啸风声与金币声
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(1100, now + 0.15);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (type === "win") {
      // 胜利通关大和弦号角！
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + i * 0.09);
        gain.gain.setValueAtTime(0.25, now + i * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.09 + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.09);
        osc.stop(now + i * 0.09 + 0.45);
      });
    }
  } catch (_) {}
}

// ==========================================================================
// 地形 SVG 渲染引擎 (冰块4种状态 + 茂密草方块 + 道具图标)
// ==========================================================================

/**
 * 生成冰块 SVG (4种状态：完整、破损1/4、破损1/2、破损3/4)
 * @param {number} state 0:完整, 1:破损1/4, 2:破损1/2, 3:破损3/4
 */
function getIceSVG(state) {
  const s = Math.min(3, Math.max(0, state));
  const gradId = `iceG_${s}_${Math.floor(Math.random() * 9999)}`;

  const defs = `
    <defs>
      <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ebf9ff"/>
        <stop offset="25%" stop-color="#9ee6ff"/>
        <stop offset="65%" stop-color="#4bbdf8"/>
        <stop offset="100%" stop-color="#1891df"/>
      </linearGradient>
      <filter id="f_${gradId}" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#0a588c" flood-opacity="0.32"/>
      </filter>
    </defs>
  `;

  if (s === 0) {
    // 状态 1：【完整】 - 水晶方块，棱角分明，带高光反光点与十字星
    return `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      ${defs}
      <rect x="2.5" y="2.5" width="31" height="31" rx="6" fill="url(#${gradId})" filter="url(#f_${gradId})" stroke="#72d3fb" stroke-width="1.2"/>
      <path d="M4 7 C4 5 5 4 7 4 L29 4 C31 4 32 5 32 7 L27 10 L8 10 Z" fill="#ffffff" fill-opacity="0.75"/>
      <path d="M4 7 L4 29 C4 31 5 32 7 32 L10 27 L10 10 Z" fill="#ffffff" fill-opacity="0.45"/>
      <polygon points="8,10 18,7 28,12 25,27 11,25" fill="#ffffff" fill-opacity="0.22"/>
      <polygon points="10,27 25,27 28,32 7,32" fill="#0866a8" fill-opacity="0.25"/>
      <polygon points="25,27 32,29 32,7 28,12" fill="#0c70b8" fill-opacity="0.2"/>
      <path d="M11 6.5 Q11 10 7.5 10 Q11 10 11 13.5 Q11 10 14.5 10 Q11 10 11 6.5 Z" fill="#ffffff"/>
      <circle cx="27" cy="9" r="1.5" fill="#ffffff" fill-opacity="0.9"/>
      <path d="M26 22 Q26 24 24 24 Q26 24 26 26 Q26 24 28 24 Q26 24 26 22 Z" fill="#ffffff" fill-opacity="0.8"/>
      <circle cx="14" cy="20" r="1.2" fill="#ffffff" fill-opacity="0.55"/>
      <circle cx="20" cy="16" r="0.8" fill="#ffffff" fill-opacity="0.6"/>
    </svg>`;
  } else if (s === 1) {
    // 状态 2：【破损 1/4】 - 右上角破碎缺口，裂纹向中心放射，带飞溅小碎晶
    return `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      ${defs}
      <path d="M7 4 C5 4 4 5 4 7 L4 29 C4 31 5 32 7 32 L29 32 C31 32 32 31 32 29 L32 16 L27 15 L30 10 L23 7 L21 4 Z" 
            fill="url(#${gradId})" filter="url(#f_${gradId})" stroke="#72d3fb" stroke-width="1.2"/>
      <path d="M4 7 C4 5 5 4 7 4 L21 4 L19 8 L8 9 L8 27 L4 29 Z" fill="#ffffff" fill-opacity="0.5"/>
      <path d="M21 4 L23 7 L30 10 L27 15 L32 16" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      <polygon points="21,4 23,7 27,10 19,8" fill="#ffffff" fill-opacity="0.35"/>
      <path d="M23 7 L17 12 L19 19 M17 12 L10 13" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M23.5 7.5 L17.5 12.5 L19.5 19.5" stroke="#0a5991" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
      <polygon points="27,3 32,5 29,9" fill="#a4eaff" stroke="#ffffff" stroke-width="0.8"/>
      <polygon points="33,11 35,13 32,14" fill="#81dcfc" stroke="#ffffff" stroke-width="0.7"/>
      <path d="M10 7 Q10 9.5 7.5 9.5 Q10 9.5 10 12 Q10 9.5 12.5 9.5 Q10 9.5 10 7 Z" fill="#ffffff"/>
    </svg>`;
  } else if (s === 2) {
    // 状态 3：【破损 1/2】 - 对角碎脱一半，残存锐利晶茬与深入底部的裂痕
    return `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      ${defs}
      <path d="M4 14 L8 12 L11 16 L18 15 L20 22 L27 21 L32 26 L32 29 C32 31 31 32 29 32 L7 32 C5 32 4 31 4 29 Z" 
            fill="url(#${gradId})" filter="url(#f_${gradId})" stroke="#72d3fb" stroke-width="1.2"/>
      <path d="M4 14 L4 29 C4 31 5 32 7 32 L9 27 L8 18 Z" fill="#ffffff" fill-opacity="0.45"/>
      <polygon points="7,32 29,32 27,28 10,28" fill="#0866a8" fill-opacity="0.25"/>
      <path d="M4 14 L8 12 L11 16 L18 15 L20 22 L27 21 L32 26" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M11 16 L13 24 L7 26 M13 24 L16 30" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M20 22 L23 28" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M11.5 16.5 L13.5 24.5" stroke="#0a5991" stroke-width="0.8" opacity="0.6"/>
      <polygon points="12,6 18,4 16,10" fill="#a4eaff" stroke="#ffffff" stroke-width="0.8"/>
      <polygon points="22,9 28,8 25,14" fill="#7ed7fa" stroke="#ffffff" stroke-width="0.8"/>
      <polygon points="28,16 33,14 31,19" fill="#9de6ff" stroke="#ffffff" stroke-width="0.7"/>
      <circle cx="10" cy="22" r="1.3" fill="#ffffff" fill-opacity="0.8"/>
    </svg>`;
  } else {
    // 状态 4：【破损 3/4】 - 仅剩左下角基座残冰，多处贯穿龟裂，摇摇欲坠
    return `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      ${defs}
      <path d="M4 21 L9 19 L12 25 L18 24 L21 29 L19 32 L7 32 C5 32 4 31 4 29 Z" 
            fill="url(#${gradId})" filter="url(#f_${gradId})" stroke="#72d3fb" stroke-width="1.2"/>
      <path d="M4 21 L9 19 L12 25 L18 24 L21 29 L19 32" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M4 21 L4 29 C4 31 5 32 7 32 L8 28 Z" fill="#ffffff" fill-opacity="0.4"/>
      <path d="M9 19 L7 26 M12 25 L10 30" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round"/>
      <polygon points="11,12 16,10 14,15" fill="#a4eaff" stroke="#ffffff" stroke-width="0.8"/>
      <polygon points="20,13 25,16 22,20" fill="#82ddfc" stroke="#ffffff" stroke-width="0.8"/>
      <polygon points="26,22 31,21 29,26" fill="#69ccf6" stroke="#ffffff" stroke-width="0.8"/>
      <polygon points="18,5 23,4 21,9" fill="#a8ecff" stroke="#ffffff" stroke-width="0.7"/>
      <circle cx="29" cy="11" r="1.2" fill="#a4eaff"/>
      <circle cx="6" cy="25" r="1" fill="#ffffff"/>
    </svg>`;
  }
}

/**
 * 生成茂密草方块 SVG (除草模式)
 */
function getGrassSVG() {
  return `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grassGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#70dd3b"/>
        <stop offset="50%" stop-color="#41b827"/>
        <stop offset="100%" stop-color="#258a18"/>
      </linearGradient>
      <filter id="grassShadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#144d10" flood-opacity="0.4"/>
      </filter>
    </defs>
    <rect x="3" y="3" width="30" height="30" rx="7" fill="#1b6613"/>
    <path d="M7 11 C5 7 11 4 15 6 C18 3 24 4 25 8 C29 6 33 10 31 15 C33 19 31 25 27 27 C29 31 23 33 19 31 C15 33 9 32 8 28 C4 27 3 21 6 18 C3 14 5 11 7 11 Z" 
          fill="url(#grassGrad)" filter="url(#grassShadow)"/>
    <circle cx="12" cy="11" r="3.5" fill="#8fee4e" fill-opacity="0.75"/>
    <circle cx="20" cy="10" r="4" fill="#a4f767" fill-opacity="0.8"/>
    <circle cx="25" cy="17" r="3.5" fill="#8bee4a" fill-opacity="0.7"/>
    <circle cx="16" cy="19" r="4.5" fill="#a6f86a" fill-opacity="0.85"/>
    <circle cx="11" cy="23" r="3.2" fill="#75db35" fill-opacity="0.7"/>
    <circle cx="21" cy="24" r="3.5" fill="#7cdc3b" fill-opacity="0.7"/>
    <path d="M14 18 Q16 15 18 17 M19 10 Q21 8 22 10 M10 22 Q12 20 13 22" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity="0.6"/>
  </svg>`;
}

/**
 * 道具图标 SVG
 */
function getHammerSVG() {
  return `<svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="mGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="35%" stop-color="#cfd8e3"/>
        <stop offset="70%" stop-color="#728294"/>
        <stop offset="100%" stop-color="#424e5c"/>
      </linearGradient>
      <linearGradient id="wGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#e8a252"/>
        <stop offset="60%" stop-color="#ba6a27"/>
        <stop offset="100%" stop-color="#803d0f"/>
      </linearGradient>
    </defs>
    <path d="M19 23 L31 35 C32.5 36.5 35 36.5 36.5 35 C38 33.5 38 31 36.5 29.5 L24.5 17.5 Z" 
          fill="url(#wGrad)" stroke="#582506" stroke-width="1.2"/>
    <g transform="rotate(-35 17 17)">
      <rect x="7" y="10" width="20" height="13" rx="3.5" fill="url(#mGrad)" stroke="#2b343d" stroke-width="1.4"/>
      <rect x="5.5" y="11" width="3" height="11" rx="1.5" fill="#e8edf2" stroke="#2b343d" stroke-width="1"/>
      <line x1="8" y1="12" x2="25" y2="12" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>
    </g>
  </svg>`;
}

function getMagnetSVG() {
  return `<svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 24 C12 14 16 10 22 10 C28 10 32 14 32 24 L32 28 L26 28 L26 24 C26 18 24 16 22 16 C20 16 18 18 18 24 L18 28 L12 28 Z" 
          fill="#ee3b32" stroke="#9e1812" stroke-width="1.4"/>
    <rect x="12" y="27" width="6" height="7" rx="1" fill="#44b7f9" stroke="#106da4" stroke-width="1.2"/>
    <rect x="26" y="27" width="6" height="7" rx="1" fill="#e2ebf2" stroke="#718290" stroke-width="1.2"/>
    <path d="M14 20 C14 13 17 12 22 12" stroke="#ffa39e" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M8 29 L5 29 M7 26 L4 24 M7 32 L4 34" stroke="#ffd13b" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M36 29 L39 29 M37 26 L40 24 M37 32 L40 34" stroke="#ffd13b" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;
}

function getPlaneSVG() {
  return `<svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="pBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="35%" stop-color="#72cbfb"/>
        <stop offset="100%" stop-color="#188be1"/>
      </linearGradient>
      <linearGradient id="pFoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ffe153"/>
        <stop offset="100%" stop-color="#f59e0b"/>
      </linearGradient>
    </defs>
    <polygon points="36,8 8,24 19,27" fill="url(#pBodyGrad)" stroke="#0f64a4" stroke-width="1.3"/>
    <polygon points="36,8 19,27 25,36" fill="url(#pFoldGrad)" stroke="#a16207" stroke-width="1.3"/>
    <polygon points="36,8 25,36 30,22" fill="#58b8f6" stroke="#0f64a4" stroke-width="1.3"/>
    <line x1="36" y1="8" x2="19" y2="27" stroke="#ffffff" stroke-width="1.6"/>
    <path d="M11 29 Q6 32 4 37 M15 33 Q12 37 9 40" stroke="#60a5fa" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="2 2"/>
  </svg>`;
}

// ==========================================================================
// 地形生成与 4 状态破损逻辑
// ==========================================================================

function createTerrain() {
  terrain = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  unlockProgress = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));

  const mode = currentMode;
  if (mode === MODE_GRASS) {
    // 草丛聚簇生成 (5x5 核心草丛块)
    const sr = Math.floor(seededRandom(currentSeed) * (SIZE - 5));
    const sc = Math.floor(seededRandom(currentSeed + 1) * (SIZE - 5));
    for (let r = sr; r < sr + 5; r++) {
      for (let c = sc; c < sc + 5; c++) {
        terrain[r][c] = 1;
      }
    }
  } else if (mode === MODE_ICE) {
    // 冰块散布在内部区域（不贴边，确保上下左右四周均有4个格子）
    const positions = [];
    for (let r = 2; r < SIZE - 2; r++) {
      for (let c = 2; c < SIZE - 2; c++) {
        // 优先在有涂色方块周围布置冰块
        positions.push([r, c]);
      }
    }
    let offset = 3;
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(seededRandom(currentSeed + offset++) * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    // 生成 5~6 个独立冰块
    const iceCount = 5;
    for (let i = 0; i < iceCount && i < positions.length; i++) {
      const [r, c] = positions[i];
      terrain[r][c] = 2;
      unlockProgress[r][c] = 0; // 初始完整状态 (0: 完整)
    }
  }
}

/**
 * 检查四周4个邻居格子点亮状态，并更新冰块/草块
 * 冰块：0邻居完成->完整，1邻居完成->破损1/4，2邻居完成->破损1/2，3邻居完成->破损3/4，4邻居完成->消融消除
 * 草方块：任意1邻居完成->除去
 */
function updateTerrainUnlocks() {
  let changed = false;
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = terrain[r][c];
      if (t === 0) continue;

      let solvedNeighbors = 0;
      for (let [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
        // 邻格如果是已正确涂色(1)或者正确排除(2且答案为0)，均视为点亮解决
        if (state[nr][nc] === 1 || (state[nr][nc] === 2 && solution[nr][nc] === 0)) {
          solvedNeighbors++;
        }
      }

      if (t === 2) {
        // 冰块有 4 种破损状态
        const oldProgress = unlockProgress[r][c];
        if (solvedNeighbors >= 4) {
          // 四周4个格子全部点亮 -> 冰块消融击破！
          unlockProgress[r][c] = 4;
          terrain[r][c] = 0;
          changed = true;
          triggerCellShatterEffect(r, c);
          playSound("shatter");
        } else {
          // 破损程度更新 (0: 完整, 1: 破损1/4, 2: 破损1/2, 3: 破损3/4)
          unlockProgress[r][c] = solvedNeighbors;
          if (solvedNeighbors > oldProgress) {
            changed = true;
            playSound("crack");
          }
        }
      } else if (t === 1) {
        // 草方块：点亮四周任意1个格子即可除去草丛
        if (solvedNeighbors >= 1) {
          terrain[r][c] = 0;
          unlockProgress[r][c] = 1;
          changed = true;
          triggerCellShatterEffect(r, c);
          playSound("fill");
        }
      }
    }
  }

  if (changed) {
    updateHintFrozenCovers();
  }
  return changed;
}

function triggerCellShatterEffect(r, c) {
  const el = cells[r] && cells[r][c];
  if (el) {
    el.classList.add("ice-shattering");
    setTimeout(() => {
      if (el) el.classList.remove("ice-shattering");
      renderCell(el, r, c);
    }, 380);
  }
}

/**
 * 更新行/列提示标签的冰封/草丛覆盖 (神还原 IMG_5205 与 IMG_5223 特征)
 */
function updateHintFrozenCovers() {
  if (!rowHintsEl || !colHintsEl) return;

  const hasIceCol = Array(SIZE).fill(false);
  const hasIceRow = Array(SIZE).fill(false);
  const hasGrassCol = Array(SIZE).fill(false);
  const hasGrassRow = Array(SIZE).fill(false);

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (terrain[r][c] === 2) {
        hasIceRow[r] = true;
        hasIceCol[c] = true;
      } else if (terrain[r][c] === 1) {
        hasGrassRow[r] = true;
        hasGrassCol[c] = true;
      }
    }
  }

  const colTips = colHintsEl.querySelectorAll(".col-tip");
  colTips.forEach((tip, c) => {
    tip.classList.toggle("frozen", hasIceCol[c]);
    tip.classList.toggle("bushy", hasGrassCol[c]);
  });

  const rowTips = rowHintsEl.querySelectorAll(".row-tip");
  rowTips.forEach((tip, r) => {
    tip.classList.toggle("frozen", hasIceRow[r]);
    tip.classList.toggle("bushy", hasGrassRow[r]);
  });
}

// ==========================================================================
// 棋盘渲染与单格绘制
// ==========================================================================

function renderCell(el, r, c) {
  if (!el) return;
  el.className = "cell";
  el.innerHTML = "";

  if (toolRevealed[r] && toolRevealed[r][c]) {
    el.classList.add("tool-revealed");
  }

  const err = errorFlags[r] && errorFlags[r][c];
  if (err === "fill") {
    el.classList.add("error-fill");
    return;
  }
  if (err === "cross") {
    el.classList.add("error-cross");
    return;
  }

  // 基础填色与打X
  if (state[r][c] === 1) {
    el.classList.add("green");
  } else if (state[r][c] === 2) {
    el.classList.add("cross");
  }

  // 特殊地形覆盖
  const t = terrain[r][c];
  if (t === 2) {
    // 冰块：根据当前进度 (0, 1, 2, 3) 渲染对应冰块 SVG
    el.classList.add("terrain-ice", "locked");
    const progress = unlockProgress[r][c] || 0;
    el.innerHTML = getIceSVG(progress);
  } else if (t === 1) {
    // 草方块
    el.classList.add("terrain-grass", "locked");
    el.innerHTML = getGrassSVG();
  }
}

function renderAllCells() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      renderCell(cells[r][c], r, c);
    }
  }
}

function paintCell(r, c, mode, erase) {
  if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return false;
  if (isGameWon) return false;
  if (toolRevealed[r][c]) return false;

  // 冰块或草方块未消除时不能直接操作
  if (terrain[r][c] !== 0) return false;
  if (errorFlags[r][c] && !erase) return false;

  if (mode === "fill") {
    if (erase) {
      if (state[r][c] !== 1) return false;
      state[r][c] = 0;
      errorFlags[r][c] = null;
      renderCell(cells[r][c], r, c);
      return true;
    }
    if (state[r][c] === 1) return false;

    if (solution[r][c] === 1) {
      // 涂色正确
      state[r][c] = 1;
      errorFlags[r][c] = null;
      playSound("fill");
    } else {
      // 点错：该格应为空
      state[r][c] = 2;
      errorFlags[r][c] = "cross";
      handleMistake("点错了：该格应为空，已标红排除 ×");
    }
    renderCell(cells[r][c], r, c);
    return true;
  }

  if (mode === "cross") {
    if (erase) {
      if (state[r][c] !== 2) return false;
      state[r][c] = 0;
      errorFlags[r][c] = null;
      renderCell(cells[r][c], r, c);
      return true;
    }
    if (state[r][c] === 2) return false;

    if (solution[r][c] === 0) {
      // 标记X正确
      state[r][c] = 2;
      errorFlags[r][c] = null;
      playSound("cross");
    } else {
      // 点错：该格应涂色
      state[r][c] = 1;
      errorFlags[r][c] = "fill";
      handleMistake("点错了：该格应填充，已标红提示");
    }
    renderCell(cells[r][c], r, c);
    return true;
  }

  return false;
}

function handleMistake(message) {
  playSound("error");
  statusEl.textContent = message;
  lives = Math.max(0, lives - 1);
  updateLivesUI();
  if (lives <= 0) {
    statusEl.textContent = "生命值耗尽，但可继续完成挑战！";
  }
}

function updateLivesUI() {
  if (!livesContainerEl) return;
  const hearts = livesContainerEl.querySelectorAll(".heart");
  hearts.forEach((h, idx) => {
    h.classList.toggle("active", idx < lives);
  });
}

function resolveErase(r, c, mode) {
  if (errorFlags[r][c]) return false;
  if (mode === "fill") return state[r][c] === 1;
  return state[r][c] === 2;
}

// ==========================================================================
// 自动排除线索与移动后处理
// ==========================================================================

function isRowFullySolved(r) {
  return solution[r].some(v => v === 1) &&
         solution[r].every((v, c) => v === 0 || state[r][c] === 1);
}

function isColFullySolved(c) {
  return solution.map(row => row[c]).some(v => v === 1) &&
         solution.map(row => row[c]).every((v, r) => v === 0 || state[r][c] === 1);
}

function autoCrossRow(r) {
  if (!isRowFullySolved(r)) return false;
  let changed = false;
  for (let c = 0; c < SIZE; c++) {
    if (solution[r][c] === 0 && state[r][c] === 0 && terrain[r][c] === 0) {
      state[r][c] = 2;
      errorFlags[r][c] = null;
      changed = true;
      renderCell(cells[r][c], r, c);
    }
  }
  return changed;
}

function autoCrossCol(c) {
  if (!isColFullySolved(c)) return false;
  let changed = false;
  for (let r = 0; r < SIZE; r++) {
    if (solution[r][c] === 0 && state[r][c] === 0 && terrain[r][c] === 0) {
      state[r][c] = 2;
      errorFlags[r][c] = null;
      changed = true;
      renderCell(cells[r][c], r, c);
    }
  }
  return changed;
}

function afterPlayerMove() {
  for (let pass = 0; pass < SIZE; pass++) {
    const terrainChanged = updateTerrainUnlocks();
    if (terrainChanged) renderAllCells();

    let autoCrossChanged = false;
    for (let r = 0; r < SIZE; r++) autoCrossChanged = autoCrossRow(r) || autoCrossChanged;
    for (let c = 0; c < SIZE; c++) autoCrossChanged = autoCrossCol(c) || autoCrossChanged;

    if (!terrainChanged && !autoCrossChanged) break;
  }

  updateHintStyles();
  checkWin();
}

function updateHintStyles() {
  if (!rowHintsEl || !colHintsEl) return;
  const rowNums = rowHintsEl.querySelectorAll(".number");
  let rIdx = 0;
  rows.forEach((blocks, r) => {
    blocks.forEach(block => {
      const span = rowNums[rIdx++];
      if (!span) return;
      const isComplete = block.count > 0 &&
        Array.from({ length: block.count }, (_, i) => state[r][block.start + i] === 1).every(Boolean);
      span.classList.toggle("solved", isComplete);
    });
  });

  const colNums = colHintsEl.querySelectorAll(".number");
  let cIdx = 0;
  cols.forEach((blocks, c) => {
    blocks.forEach(block => {
      const span = colNums[cIdx++];
      if (!span) return;
      const isComplete = block.count > 0 &&
        Array.from({ length: block.count }, (_, i) => state[block.start + i][c] === 1).every(Boolean);
      span.classList.toggle("solved", isComplete);
    });
  });
}

function checkWin() {
  if (isGameWon) return true;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if ((solution[r][c] === 1) !== (state[r][c] === 1)) {
        return false;
      }
    }
  }
  isGameWon = true;
  clearInterval(timerInterval);
  playSound("win");
  statusEl.classList.add("win");
  statusEl.textContent = "恭喜通关！完美还原图案！";
  showWinModal();
  return true;
}

// ==========================================================================
// 道具系统 (锤子、磁铁、飞机)
// ==========================================================================

function revealWithTool(r, c) {
  if (state[r][c] !== 0 || terrain[r][c] !== 0) return false;
  state[r][c] = solution[r][c] === 1 ? 1 : 2;
  errorFlags[r][c] = null;
  toolRevealed[r][c] = true;
  renderCell(cells[r][c], r, c);
  return true;
}

function updateToolUI() {
  const counts = {
    hammer: document.getElementById("hammerCount"),
    magnet: document.getElementById("magnetCount"),
    plane: document.getElementById("planeCount")
  };
  const btns = {
    hammer: document.getElementById("btnHammer"),
    magnet: document.getElementById("btnMagnet"),
    plane: document.getElementById("btnPlane")
  };
  Object.keys(tools).forEach(k => {
    if (counts[k]) counts[k].textContent = tools[k];
    if (btns[k]) {
      btns[k].disabled = tools[k] <= 0;
      btns[k].classList.toggle("active", activeTool === k);
    }
  });
}

function resetTools() {
  tools = { hammer: 3, magnet: 1, plane: 1 };
  activeTool = null;
  if (boardEl) boardEl.classList.remove("tool-targeting");
  hidePlanePicker();
  updateToolUI();
}

function activateHammer() {
  if (tools.hammer <= 0) return;
  activeTool = activeTool === "hammer" ? null : "hammer";
  if (boardEl) boardEl.classList.toggle("tool-targeting", activeTool === "hammer");
  updateToolUI();
  statusEl.textContent = activeTool === "hammer" ? "锤子已就绪：点击任意未知格子揭示" : "已取消锤子";
}

function useHammerOnCell(r, c) {
  if (activeTool !== "hammer") return false;
  if (!revealWithTool(r, c)) {
    statusEl.textContent = "锤子只能作用于未揭示且无冰/草的格子";
    return true;
  }
  tools.hammer--;
  activeTool = null;
  if (boardEl) boardEl.classList.remove("tool-targeting");
  playSound("tool");
  updateToolUI();
  afterPlayerMove();
  statusEl.textContent = "锤子成功揭示了 1 个格子";
  return true;
}

function useMagnet() {
  if (tools.magnet <= 0) return;
  const candidates = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (state[r][c] === 0 && terrain[r][c] === 0) candidates.push([r, c]);
    }
  }
  if (!candidates.length) {
    statusEl.textContent = "没有可供磁铁揭示的格子";
    return;
  }
  shuffle(candidates);
  const revealed = candidates.slice(0, 3).filter(([r, c]) => revealWithTool(r, c)).length;
  tools.magnet--;
  playSound("tool");
  updateToolUI();
  afterPlayerMove();
  statusEl.textContent = `磁铁揭示了 ${revealed} 个格子`;
}

function openPlanePicker() {
  if (tools.plane <= 0) return;
  const picker = document.getElementById("planePicker");
  if (picker) picker.hidden = false;
  statusEl.textContent = "请选择飞机要飞过揭示的行或列";
}

function hidePlanePicker() {
  const picker = document.getElementById("planePicker");
  if (picker) picker.hidden = true;
}

function populatePlaneTargets() {
  const select = document.getElementById("planeTarget");
  if (!select) return;
  select.innerHTML = "";
  for (let i = 0; i < SIZE; i++) {
    const opt = document.createElement("option");
    opt.value = `row:${i}`;
    opt.textContent = `第 ${i + 1} 行`;
    select.appendChild(opt);
  }
  for (let i = 0; i < SIZE; i++) {
    const opt = document.createElement("option");
    opt.value = `col:${i}`;
    opt.textContent = `第 ${i + 1} 列`;
    select.appendChild(opt);
  }
}

function usePlane() {
  if (tools.plane <= 0) return;
  const select = document.getElementById("planeTarget");
  const [type, idxText] = (select?.value || "").split(":");
  const idx = Number(idxText);
  if (!Number.isInteger(idx)) return;

  const targets = [];
  for (let i = 0; i < SIZE; i++) {
    targets.push(type === "row" ? [idx, i] : [i, idx]);
  }
  const revealed = targets.filter(([r, c]) => revealWithTool(r, c)).length;
  tools.plane--;
  hidePlanePicker();
  playSound("tool");
  updateToolUI();
  afterPlayerMove();
  statusEl.textContent = `飞机揭示了第 ${idx + 1} ${type === "row" ? "行" : "列"}`;
}

// ==========================================================================
// 拖拽与触摸操作交互 (支持移动端滑动与点选)
// ==========================================================================

function getCellFromPoint(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  if (el) {
    const cell = el.closest ? el.closest(".cell") : null;
    if (cell && boardEl.contains(cell)) {
      return { r: Number(cell.dataset.r), c: Number(cell.dataset.c) };
    }
  }
  return null;
}

function startDragSession(r, c, mode, pointerId) {
  const erase = resolveErase(r, c, mode);
  dragSession = { mode, erase, visited: new Set(), pointerId };
  applyDragCell(r, c);
}

function applyDragCell(r, c) {
  if (!dragSession) return;
  const key = `${r},${c}`;
  if (dragSession.visited.has(key)) return;
  dragSession.visited.add(key);
  if (paintCell(r, c, dragSession.mode, dragSession.erase)) {
    afterPlayerMove();
  }
}

function endDragSession() {
  dragSession = null;
  clearTouchPending();
}

function clearTouchPending() {
  if (touchPending && touchPending.timer) clearTimeout(touchPending.timer);
  touchPending = null;
}

function bindBoardPointerEvents() {
  if (!boardEl) return;
  boardEl.addEventListener("contextmenu", e => e.preventDefault());

  boardEl.addEventListener("pointerdown", e => {
    const cell = e.target.closest && e.target.closest(".cell");
    if (!cell || !boardEl.contains(cell)) return;
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);

    if (activeTool === "hammer") {
      e.preventDefault();
      useHammerOnCell(r, c);
      return;
    }

    if (e.pointerType !== "touch") {
      // 鼠标模式：左键使用当前模式(drawMode)，右键使用相反模式
      if (e.button !== 0 && e.button !== 2) return;
      e.preventDefault();
      const mode = e.button === 2 ? (drawMode === "fill" ? "cross" : "fill") : drawMode;
      startDragSession(r, c, mode, e.pointerId);
      try { boardEl.setPointerCapture(e.pointerId); } catch (_) {}
      return;
    }

    // 触摸屏模式：短按使用当前模式，长按切换模式
    e.preventDefault();
    clearTouchPending();
    touchPending = {
      pointerId: e.pointerId,
      startR: r, startC: c, startX: e.clientX, startY: e.clientY,
      longFired: false,
      timer: setTimeout(() => {
        if (!touchPending || touchPending.pointerId !== e.pointerId) return;
        touchPending.longFired = true;
        const oppMode = drawMode === "fill" ? "cross" : "fill";
        startDragSession(touchPending.startR, touchPending.startC, oppMode, e.pointerId);
        if (navigator.vibrate) try { navigator.vibrate(15); } catch (_) {}
      }, LONG_PRESS_MS)
    };
  });

  boardEl.addEventListener("pointermove", e => {
    if (e.pointerType === "touch" && touchPending && !dragSession) {
      const dx = e.clientX - touchPending.startX;
      const dy = e.clientY - touchPending.startY;
      if (Math.hypot(dx, dy) >= 10) {
        clearTouchPending();
        startDragSession(touchPending.startR, touchPending.startC, drawMode, e.pointerId);
      }
    }
    if (!dragSession) return;
    if (dragSession.pointerId != null && e.pointerId !== dragSession.pointerId) return;
    const hit = getCellFromPoint(e.clientX, e.clientY);
    if (hit) applyDragCell(hit.r, hit.c);
  });

  const onPointerUp = e => {
    if (e.pointerType === "touch" && touchPending && !dragSession && touchPending.pointerId === e.pointerId) {
      clearTouchPending();
      startDragSession(touchPending.startR, touchPending.startC, drawMode, e.pointerId);
    }
    endDragSession();
  };

  boardEl.addEventListener("pointerup", onPointerUp);
  boardEl.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("pointerup", onPointerUp);
}

// ==========================================================================
// 棋盘构建与线索生成
// ==========================================================================

function getHintBlocks(arr) {
  const res = [];
  let count = 0, start = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]) {
      if (count === 0) start = i;
      count++;
    } else {
      if (count > 0) {
        res.push({ count, start, end: start + count - 1 });
        count = 0;
      }
    }
  }
  if (count > 0) res.push({ count, start, end: start + count - 1 });
  return res.length ? res : [{ count: 0, start: 0, end: -1 }];
}

function createBoard() {
  if (!boardEl) return;
  boardEl.innerHTML = "";
  state = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  errorFlags = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  toolRevealed = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  cells = [];

  for (let r = 0; r < SIZE; r++) {
    cells[r] = [];
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.r = String(r);
      cell.dataset.c = String(c);
      cell.setAttribute("role", "button");
      cell.setAttribute("tabindex", "0");
      boardEl.appendChild(cell);
      cells[r][c] = cell;
    }
  }
}

function createHints() {
  if (!rowHintsEl || !colHintsEl) return;
  rowHintsEl.innerHTML = "";
  colHintsEl.innerHTML = "";

  rows.forEach((blocks, r) => {
    const div = document.createElement("div");
    div.className = "row-tip";
    blocks.forEach(b => {
      const span = document.createElement("span");
      span.className = "number";
      span.textContent = b.count;
      div.appendChild(span);
    });
    rowHintsEl.appendChild(div);
  });

  cols.forEach((blocks, c) => {
    const div = document.createElement("div");
    div.className = "col-tip";
    blocks.forEach(b => {
      const span = document.createElement("span");
      span.className = "number";
      span.textContent = b.count;
      div.appendChild(span);
    });
    colHintsEl.appendChild(div);
  });

  updateHintFrozenCovers();
}

// ==========================================================================
// 关卡生成器 (种子哈希与图案生成)
// ==========================================================================

function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 经典像素图案库 (预置趣味生动的图案，如萌宠、花朵、雪人、皇冠等)
 */
const PATTERNS = [
  // 1. 可爱小蛇 (参考图 IMG_5201 风格)
  [
    [0,0,0,0,0,0,0,1,1,1,1,1,1,0,0],
    [0,0,0,0,0,0,0,1,0,0,0,0,1,0,0],
    [0,0,0,0,0,0,0,1,0,1,1,0,1,0,0],
    [0,0,1,1,1,1,1,1,0,1,1,0,1,0,0],
    [0,1,1,0,0,0,0,0,0,1,1,0,1,0,0],
    [0,1,0,0,1,1,1,1,1,1,0,0,1,0,0],
    [0,1,0,1,1,0,0,0,0,1,0,0,1,0,0],
    [0,1,0,1,0,0,1,1,0,1,0,0,1,0,0],
    [0,1,0,1,0,1,1,1,0,1,0,0,1,0,0],
    [0,1,0,1,0,0,0,0,0,1,0,0,1,0,0],
    [0,1,0,1,1,1,1,1,1,1,0,0,1,0,0],
    [0,1,0,0,0,0,0,0,0,0,0,0,1,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
  ],
  // 2. 盛开玫瑰花 (参考图 IMG_5202 风格)
  [
    [0,0,0,0,0,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,1,1,0,1,1,1,1,0,1,1,0,0,0],
    [0,1,1,1,1,0,1,1,0,1,1,1,1,0,0],
    [0,1,1,0,1,1,1,1,1,1,0,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,0,0,0,0,1,1,0,0,0,0,0,0,0],
    [0,0,1,1,0,0,1,1,0,0,1,1,0,0,0],
    [0,1,1,1,1,0,1,1,0,1,1,1,1,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,0,0,0,0,0,0,0]
  ],
  // 3. 胜利皇冠 (参考图 IMG_5203 风格)
  [
    [0,0,1,0,0,0,0,1,0,0,0,0,1,0,0],
    [0,1,1,1,0,0,0,1,0,0,0,1,1,1,0],
    [0,0,1,0,0,0,1,1,1,0,0,0,1,0,0],
    [0,1,1,1,0,1,1,1,1,1,0,1,1,1,0],
    [0,1,1,1,0,1,1,1,1,1,0,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,0,1,1,0,1,1,0,1,1,0,1,1,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
  ]
];

function generateSolution(mode, seed) {
  // 如果种子命中预置趣味图案
  const patternIdx = seed % (PATTERNS.length + 3);
  if (patternIdx < PATTERNS.length) {
    const raw = PATTERNS[patternIdx];
    return raw.map(row => [...row]);
  }

  // 否则通过高品质伪随机生成合法的连通数织关卡
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const val = seededRandom(seed + r * 37 + c * 19);
      grid[r][c] = val > 0.44 ? 1 : 0;
    }
  }

  // 保证每行每列至少有 1 个填色块
  for (let i = 0; i < SIZE; i++) {
    if (!grid[i].some(v => v === 1)) grid[i][Math.floor(seededRandom(seed + i) * SIZE)] = 1;
    if (!grid.some(row => row[i] === 1)) grid[Math.floor(seededRandom(seed + i * 2) * SIZE)][i] = 1;
  }
  return grid;
}

function startLevel(seed = null) {
  if (isGenerating) return;
  isGenerating = true;

  if (seed === null) {
    currentSeed = Math.floor(Math.random() * 89999999) + 10000000;
  } else {
    currentSeed = seed;
  }

  isGameWon = false;
  lives = 3;
  timerSeconds = 0;
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timerSeconds++;
    updateTimerUI();
  }, 1000);
  updateTimerUI();
  updateLivesUI();

  // 更新关卡标签
  if (levelBadgeEl) {
    levelBadgeEl.textContent = `第 ${levelNumber} 关 · ${MODE_LABELS[currentMode]}`;
  }

  // 生成解法与地形
  solution = generateSolution(currentMode, currentSeed);
  rows = solution.map(row => getHintBlocks(row));
  cols = Array.from({ length: SIZE }, (_, c) => getHintBlocks(solution.map(row => row[c])));

  createTerrain();
  createBoard();
  createHints();
  renderAllCells();
  resetTools();
  populatePlaneTargets();

  statusEl.classList.remove("win");
  statusEl.textContent = `关卡已就绪 · ${MODE_LABELS[currentMode]}`;

  setTimeout(() => {
    isGenerating = false;
  }, 120);
}

function updateTimerUI() {
  if (!timerTextEl) return;
  const m = String(Math.floor(timerSeconds / 60)).padStart(2, "0");
  const s = String(timerSeconds % 60).padStart(2, "0");
  timerTextEl.textContent = `${m}:${s}`;
}

// ==========================================================================
// 弹窗与控制面板交互 (关卡信息、胜利弹窗、菜单设置)
// ==========================================================================

function showModeInfoModal() {
  const modal = document.getElementById("modalInfo");
  if (!modal) return;
  const previewIcon = document.getElementById("infoPreviewIcon");
  const badgeText = document.getElementById("infoBadgeText");
  const tipText = document.getElementById("infoTipText");

  badgeText.textContent = MODE_LABELS[currentMode];
  if (currentMode === MODE_ICE) {
    previewIcon.innerHTML = getIceSVG(0); // 展示完整冰块
    tipText.textContent = "点亮冰块四周的4个格子可以去除冰块 (经历完整、破损1/4、破损1/2、破损3/4四种状态)";
  } else if (currentMode === MODE_GRASS) {
    previewIcon.innerHTML = getGrassSVG();
    tipText.textContent = "点亮草丛四周的任意格子可以除去草丛";
  } else {
    previewIcon.innerHTML = `<div style="width:48px;height:48px;background:#5de047;border-radius:10px;margin:8px auto;box-shadow:0 4px 10px rgba(0,0,0,0.2);"></div>`;
    tipText.textContent = "根据行列数字推理填充所有方块";
  }
  modal.hidden = false;
}

function hideModeInfoModal() {
  const modal = document.getElementById("modalInfo");
  if (modal) modal.hidden = true;
}

function showWinModal() {
  const modal = document.getElementById("modalWin");
  if (!modal) return;
  const timeVal = document.getElementById("winTimeVal");
  const blocksVal = document.getElementById("winBlocksVal");
  const preview = document.getElementById("winArtMiniPreview");

  if (timeVal) {
    const m = String(Math.floor(timerSeconds / 60)).padStart(2, "0");
    const s = String(timerSeconds % 60).padStart(2, "0");
    timeVal.textContent = `${m}:${s}`;
  }

  let totalFilled = 0;
  if (preview) {
    preview.innerHTML = "";
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const d = document.createElement("div");
        d.className = "win-art-cell" + (solution[r][c] === 1 ? " filled" : "");
        preview.appendChild(d);
        if (solution[r][c] === 1) totalFilled++;
      }
    }
  }
  if (blocksVal) blocksVal.textContent = totalFilled;
  modal.hidden = false;
}

function hideWinModal() {
  const modal = document.getElementById("modalWin");
  if (modal) modal.hidden = true;
}

function showMenuModal() {
  const modal = document.getElementById("modalMenu");
  if (!modal) return;
  const input = document.getElementById("seedInput");
  if (input) input.value = `${currentMode}:${currentSeed}`;
  modal.hidden = false;
}

function hideMenuModal() {
  const modal = document.getElementById("modalMenu");
  if (modal) modal.hidden = true;
}

// ==========================================================================
// 初始化与事件绑定
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
  // DOM 节点捕获
  boardEl = document.getElementById("board");
  rowHintsEl = document.getElementById("rowHints");
  colHintsEl = document.getElementById("colHints");
  statusEl = document.getElementById("status");
  timerTextEl = document.getElementById("timerText");
  levelBadgeEl = document.getElementById("levelBadge");
  livesContainerEl = document.getElementById("livesContainer");

  // 渲染底部道具矢量图
  const hammerWrap = document.getElementById("hammerIcon");
  const magnetWrap = document.getElementById("magnetIcon");
  const planeWrap = document.getElementById("planeIcon");
  if (hammerWrap) hammerWrap.innerHTML = getHammerSVG();
  if (magnetWrap) magnetWrap.innerHTML = getMagnetSVG();
  if (planeWrap) planeWrap.innerHTML = getPlaneSVG();

  // 模式切换滑块逻辑 (X / ■)
  const actionSwitch = document.getElementById("actionSwitch");
  const btnToggleCross = document.getElementById("btnToggleCross");
  const btnToggleFill = document.getElementById("btnToggleFill");

  function setDrawMode(m) {
    drawMode = m;
    if (actionSwitch) {
      actionSwitch.classList.toggle("fill-active", m === "fill");
      actionSwitch.classList.toggle("cross-active", m === "cross");
    }
  }

  setDrawMode("fill");

  if (actionSwitch) {
    actionSwitch.addEventListener("click", () => {
      setDrawMode(drawMode === "fill" ? "cross" : "fill");
      playSound("cross");
    });
  }

  // 顶部音效切换
  const btnSound = document.getElementById("btnSound");
  const soundIconOn = document.getElementById("soundIconOn");
  const soundIconOff = document.getElementById("soundIconOff");
  if (btnSound) {
    btnSound.addEventListener("click", () => {
      soundEnabled = !soundEnabled;
      if (soundIconOn) soundIconOn.hidden = !soundEnabled;
      if (soundIconOff) soundIconOff.hidden = soundEnabled;
      if (soundEnabled) playSound("fill");
    });
  }

  // 关卡信息弹窗按钮
  const btnInfo = document.getElementById("btnInfo");
  const btnCloseInfo = document.getElementById("btnCloseInfo");
  const btnStartGame = document.getElementById("btnStartGame");
  if (btnInfo) btnInfo.addEventListener("click", showModeInfoModal);
  if (btnCloseInfo) btnCloseInfo.addEventListener("click", hideModeInfoModal);
  if (btnStartGame) btnStartGame.addEventListener("click", hideModeInfoModal);

  // 胜利弹窗按钮
  const btnNextLevel = document.getElementById("btnNextLevel");
  if (btnNextLevel) {
    btnNextLevel.addEventListener("click", () => {
      hideWinModal();
      levelNumber++;
      startLevel();
    });
  }

  // 底部菜单按钮
  const btnMenu = document.getElementById("btnMenu");
  const btnCloseMenu = document.getElementById("btnCloseMenu");
  const btnMenuNewGame = document.getElementById("btnMenuNewGame");
  const btnMenuReset = document.getElementById("btnMenuReset");
  if (btnMenu) btnMenu.addEventListener("click", showMenuModal);
  if (btnCloseMenu) btnCloseMenu.addEventListener("click", hideMenuModal);

  if (btnMenuNewGame) {
    btnMenuNewGame.addEventListener("click", () => {
      hideMenuModal();
      startLevel();
    });
  }

  if (btnMenuReset) {
    btnMenuReset.addEventListener("click", () => {
      hideMenuModal();
      createBoard();
      createTerrain();
      renderAllCells();
      statusEl.textContent = "棋盘已清空";
    });
  }

  // 关卡码导入/导出
  const btnLoadSeed = document.getElementById("btnLoadSeed");
  const seedInput = document.getElementById("seedInput");
  const btnCopySeed = document.getElementById("btnCopySeed");

  if (btnLoadSeed && seedInput) {
    btnLoadSeed.addEventListener("click", () => {
      const parts = seedInput.value.trim().split(":");
      if (parts.length === 2) {
        currentMode = Number(parts[0]);
        startLevel(Number(parts[1]));
        hideMenuModal();
      }
    });
  }

  if (btnCopySeed) {
    btnCopySeed.addEventListener("click", () => {
      const code = `${currentMode}:${currentSeed}`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code);
        alert(`关卡码已复制：${code}`);
      }
    });
  }

  // 顶部模式切换 Tab (冰方块 / 草方块 / 普通模式)
  const btnModeIce = document.getElementById("btnModeIce");
  const btnModeGrass = document.getElementById("btnModeGrass");
  const btnModeNormal = document.getElementById("btnModeNormal");

  function switchGameMode(m) {
    currentMode = m;
    [btnModeIce, btnModeGrass, btnModeNormal].forEach(b => {
      if (b) b.classList.remove("active");
    });
    if (m === MODE_ICE && btnModeIce) btnModeIce.classList.add("active");
    if (m === MODE_GRASS && btnModeGrass) btnModeGrass.classList.add("active");
    if (m === MODE_NORMAL && btnModeNormal) btnModeNormal.classList.add("active");
    startLevel();
    showModeInfoModal();
  }

  if (btnModeIce) btnModeIce.addEventListener("click", () => switchGameMode(MODE_ICE));
  if (btnModeGrass) btnModeGrass.addEventListener("click", () => switchGameMode(MODE_GRASS));
  if (btnModeNormal) btnModeNormal.addEventListener("click", () => switchGameMode(MODE_NORMAL));

  // 道具按钮事件
  const btnHammer = document.getElementById("btnHammer");
  const btnMagnet = document.getElementById("btnMagnet");
  const btnPlane = document.getElementById("btnPlane");
  const btnPlaneConfirm = document.getElementById("btnPlaneConfirm");
  const btnPlaneCancel = document.getElementById("btnPlaneCancel");

  if (btnHammer) btnHammer.addEventListener("click", activateHammer);
  if (btnMagnet) btnMagnet.addEventListener("click", useMagnet);
  if (btnPlane) btnPlane.addEventListener("click", openPlanePicker);
  if (btnPlaneConfirm) btnPlaneConfirm.addEventListener("click", usePlane);
  if (btnPlaneCancel) btnPlaneCancel.addEventListener("click", hidePlanePicker);

  // 启动棋盘与事件
  bindBoardPointerEvents();

  // 开启第一关并展示关卡信息卡片
  startLevel();
  showModeInfoModal();

  // 隐藏全局加载器
  const loading = document.getElementById("loading-overlay");
  if (loading) loading.style.display = "none";
});
