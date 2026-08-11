// ======================
// 常量
// ======================
const SIZE = 15;
const MIN_BLOCKS = 100;
const MAX_BLOCKS = 230;

let drawMode = true;
let isGenerating = false;
let mobileXMode = true;

let boardEl = document.getElementById("board");
let rowHintsEl = document.getElementById("rowHints");
let colHintsEl = document.getElementById("colHints");
let statusEl = document.getElementById("status");

// ======================
// 地形数据
// ======================
let terrain = [];
let unlockProgress = [];
let hasGrassRow = Array(SIZE).fill(false);
let hasGrassCol = Array(SIZE).fill(false);

// ======================
// 游戏数据
// ======================
let solution = [];
let state = [];
let errorFlags = [];
let rows = [];
let cols = [];
let cells = [];
let currentMode = 0; // 0=grass, 1=ice
let generationHistory = [];

// ======================
// 拖拽交互
// ======================
let dragSession = null;
let touchPending = null;
const LONG_PRESS_MS = 420;

// ======================
// 工具函数
// ======================
function cellKey(r, c) { return `${r},${c}`; }

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getHintBlocks(arr) {
  const res = [];
  let count = 0;
  let start = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]) {
      if (count === 0) start = i;
      count++;
    } else {
      if (count > 0) {
        res.push({count, start, end: start + count - 1});
        count = 0;
      }
    }
  }
  if (count > 0) {
    res.push({count, start, end: start + count - 1});
  }
  return res.length ? res : [{count: 0, start: 0, end: -1}];
}

function getMaxNeighbors(r, c) {
  let count = 0;
  if (r > 0) count++;
  if (r < SIZE - 1) count++;
  if (c > 0) count++;
  if (c < SIZE - 1) count++;
  return count;
}

function isRowFullySolved(r) {
  return solution[r].some(val => val === 1) &&
         solution[r].every((val, c) => val === 0 || state[r][c] === 1);
}

function isColFullySolved(c) {
  return solution.map(row => row[c]).some(val => val === 1) &&
         solution.map(row => row[c]).every((val, r) => val === 0 || state[r][c] === 1);
}

function autoCrossRow(r) {
  if (!isRowFullySolved(r)) return;
  for (let c = 0; c < SIZE; c++) {
    if (solution[r][c] === 0 && state[r][c] === 0) {
      state[r][c] = 2;
      errorFlags[r][c] = null;
      const cellEl = cells[r][c];
      if (cellEl) renderCell(cellEl, r, c);
    }
  }
}

function autoCrossCol(c) {
  if (!isColFullySolved(c)) return;
  for (let r = 0; r < SIZE; r++) {
    if (solution[r][c] === 0 && state[r][c] === 0) {
      state[r][c] = 2;
      errorFlags[r][c] = null;
      const cellEl = cells[r][c];
      if (cellEl) renderCell(cellEl, r, c);
    }
  }
}

function updateHintStyles() {
  const rowNumberElements = rowHintsEl.querySelectorAll('.number');
  let rowIdx = 0;
  rows.forEach((blocks, r) => {
    blocks.forEach((block, b) => {
      const span = rowNumberElements[rowIdx];
      if (!span) return;
      const isComplete = block.count > 0 && 
        Array.from({length: block.count}, (_, i) => state[r][block.start + i] === 1).every(v => v);
      if (isComplete) {
        span.classList.add('solved');
      } else {
        span.classList.remove('solved');
      }
      rowIdx++;
    });
  });
  const colNumberElements = colHintsEl.querySelectorAll('.number');
  let colIdx = 0;
  cols.forEach((blocks, c) => {
    blocks.forEach((block, b) => {
      const span = colNumberElements[colIdx];
      if (!span) return;
      const isComplete = block.count > 0 && 
        Array.from({length: block.count}, (_, i) => state[block.start + i][c] === 1).every(v => v);
      if (isComplete) {
        span.classList.add('solved');
      } else {
        span.classList.remove('solved');
      }
      colIdx++;
    });
  });
}

// ======================
// 地形相关函数
// ======================
function createTerrain() {
  terrain = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  unlockProgress = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  hasGrassRow = Array(SIZE).fill(false);
  hasGrassCol = Array(SIZE).fill(false);

  const mode = currentMode;
  if (mode === 0) { // 草方块
    let placed = false;
    while (!placed) {
      const sr = Math.floor(Math.random() * (SIZE - 4));
      const sc = Math.floor(Math.random() * (SIZE - 4));
      let canPlace = true;
      for (let r = sr; r < sr + 5; r++) {
        for (let c = sc; c < sc + 5; c++) {
          if (terrain[r][c] !== 0) canPlace = false;
        }
      }
      if (canPlace) {
        for (let r = sr; r < sr + 5; r++) {
          for (let c = sc; c < sc + 5; c++) {
            terrain[r][c] = 1;
            hasGrassRow[r] = true;
            hasGrassCol[c] = true;
          }
        }
        placed = true;
      }
    }
  } else if (mode === 1) { // 冰方块
    const positions = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) positions.push([r, c]);
    shuffle(positions);
    for (let i = 0; i < 5; i++) {
      const [r, c] = positions[i];
      terrain[r][c] = 2;
    }
  } // normal mode (mode === 2): all empty, no special terrain

  // initial progress always 0 for locked start
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      unlockProgress[r][c] = 0;
    }
  }

  updateHasGrassStatus();
}

function isUnlocked(r, c) {
  if (terrain[r][c] === 0) return true;
  const t = terrain[r][c];
  const need = t === 1 ? 1 : 4;
  const maxPossible = getMaxNeighbors(r, c);
  const effectiveNeed = Math.min(need, maxPossible);
  return unlockProgress[r][c] >= effectiveNeed;
}

// 更新草方块/冰方块剩余状态（用于提示隐藏逻辑）
function updateHasGrassStatus() {
  hasGrassRow = Array(SIZE).fill(false);
  hasGrassCol = Array(SIZE).fill(false);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (terrain[r][c] === 1 || terrain[r][c] === 2) {
        hasGrassRow[r] = true;
        hasGrassCol[c] = true;
      }
    }
  }
}

function updateTerrainUnlocks() {
  let changed = false;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (terrain[r][c] === 0) continue;
      const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
      let count = 0;
      for (let [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
        if (state[nr][nc] !== 0) count++;
      }
      const t = terrain[r][c];
      const need = t === 1 ? 1 : 4;
      const maxPossible = getMaxNeighbors(r, c);
      const effectiveNeed = Math.min(need, maxPossible);
      if (count >= effectiveNeed) {
        unlockProgress[r][c] = effectiveNeed;
        if (terrain[r][c] !== 0) {
          const wasGrass = terrain[r][c] === 1;
          terrain[r][c] = 0;
          changed = true;
        }
      } else if (count > unlockProgress[r][c]) {
        unlockProgress[r][c] = count;
        changed = true;
      }
    }
  }
  if (changed) {
    updateHasGrassStatus();
    refreshHints();
  }
  return changed;
}

function paintCell(r, c, mode, erase) {
  if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return false;
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
      state[r][c] = 1;
      errorFlags[r][c] = null;
    } else {
      state[r][c] = 2;
      errorFlags[r][c] = "cross";
      statusEl.classList.remove("win");
      statusEl.textContent = "点错了：该格应为空，已标红显示 ×";
    }
    renderCell(cells[r][c], r, c);
    return true;
  }
  if (erase) {
    if (state[r][c] !== 2) return false;
    state[r][c] = 0;
    errorFlags[r][c] = null;
    renderCell(cells[r][c], r, c);
    return true;
  }
  if (state[r][c] === 2) return false;
  if (solution[r][c] === 0) {
    state[r][c] = 2;
    errorFlags[r][c] = null;
  } else {
    state[r][c] = 1;
    errorFlags[r][c] = "fill";
    statusEl.classList.remove("win");
    statusEl.textContent = "点错了：该格应填充，已标红显示";
  }
  renderCell(cells[r][c], r, c);
  return true;
}

function resolveErase(r, c, mode) {
  if (errorFlags[r][c]) return false;
  if (mode === "fill") return state[r][c] === 1;
  return state[r][c] === 2;
}

function startDragSession(r, c, mode, pointerId) {
  const erase = resolveErase(r, c, mode);
  dragSession = { mode, erase, visited: new Set(), pointerId: pointerId ?? null };
  boardEl.classList.add("dragging");
  applyDragCell(r, c);
}

function applyDragCell(r, c) {
  if (!dragSession) return;
  const key = cellKey(r, c);
  if (dragSession.visited.has(key)) return;
  dragSession.visited.add(key);
  if (paintCell(r, c, dragSession.mode, dragSession.erase)) {
    afterPlayerMove();
  }
}

function endDragSession() {
  dragSession = null;
  boardEl.classList.remove("dragging");
  clearTouchPending();
}

function clearTouchPending() {
  if (touchPending && touchPending.timer) clearTimeout(touchPending.timer);
  touchPending = null;
}

function getCellFromPoint(clientX, clientY) {
  // Try to find cell via elementFromPoint first (most reliable)
  let hit = null;
  const el = document.elementFromPoint(clientX, clientY);
  if (el) {
    let cell = el.closest ? el.closest(".cell") : null;
    if (cell && boardEl.contains(cell)) {
      hit = cell;
    }
  }

  // Fallback: if mouse is over board but no cell found, calculate by position
  if (!hit) {
    const rect = boardEl.getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
      const cellSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell")) || 40;
      const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gap")) || 1;
      const step = cellSize + gap;
      const c = Math.min(SIZE - 1, Math.max(0, Math.floor((clientX - rect.left) / step)));
      const r = Math.min(SIZE - 1, Math.max(0, Math.floor((clientY - rect.top) / step)));

      // Find the actual cell element by coords
      const cellsAtPos = boardEl.querySelectorAll(`.cell[data-r="${r}"][data-c="${c}"]`);
      if (cellsAtPos.length > 0) {
        hit = cellsAtPos[0];
      }
    }
  }

  if (hit) {
    const r = Number(hit.dataset.r);
    const c = Number(hit.dataset.c);
    return { r, c };
  }
  return null;
}

function bindBoardPointerEvents() {
  boardEl.addEventListener("contextmenu", e => e.preventDefault());
  boardEl.addEventListener("pointerdown", onBoardPointerDown);
  boardEl.addEventListener("pointermove", onBoardPointerMove);
  boardEl.addEventListener("pointerup", onBoardPointerUp);
  boardEl.addEventListener("pointercancel", onBoardPointerUp);
  window.addEventListener("pointerup", onBoardPointerUp);
  window.addEventListener("pointercancel", onBoardPointerUp);
}

function onBoardPointerDown(e) {
  const cell = e.target.closest && e.target.closest(".cell");
  if (!cell || !boardEl.contains(cell)) return;
  const r = Number(cell.dataset.r);
  const c = Number(cell.dataset.c);
  if (e.pointerType !== "touch") {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    const mode = e.button === 2 ? "cross" : drawMode;
    startDragSession(r, c, mode, e.pointerId);
    try { boardEl.setPointerCapture(e.pointerId); } catch (_) {}
    return;
  }
  e.preventDefault();
  clearTouchPending();
  touchPending = {
    pointerId: e.pointerId,
    startR: r, startC: c, startX: e.clientX, startY: e.clientY,
    longFired: false,
    timer: setTimeout(() => {
      if (!touchPending || touchPending.pointerId !== e.pointerId) return;
      touchPending.longFired = true;
      startDragSession(touchPending.startR, touchPending.startC, mobileXMode ? 'cross' : 'fill', e.pointerId);
      if (navigator.vibrate) try { navigator.vibrate(15); } catch (_) {}
    }, LONG_PRESS_MS),
  };
}

function onBoardPointerMove(e) {
  if (e.pointerType === "touch" && touchPending && !dragSession) {
    if (touchPending.pointerId !== e.pointerId) return;
    const dx = e.clientX - touchPending.startX;
    const dy = e.clientY - touchPending.startY;
    if (Math.hypot(dx, dy) >= 12) {
      if (touchPending.timer) clearTimeout(touchPending.timer);
      touchPending.timer = null;
      startDragSession(touchPending.startR, touchPending.startC, mobileXMode ? 'cross' : 'fill', e.pointerId);
    } else return;
  }
  if (!dragSession) return;
  if (dragSession.pointerId != null && e.pointerId !== dragSession.pointerId) return;
  const hit = getCellFromPoint(e.clientX, e.clientY);
  if (hit) applyDragCell(hit.r, hit.c);
}

function onBoardPointerUp(e) {
  if (e.pointerType === "touch" && touchPending && !dragSession && touchPending.pointerId === e.pointerId) {
    if (touchPending.timer) clearTimeout(touchPending.timer);
    if (!touchPending.longFired) {
      startDragSession(touchPending.startR, touchPending.startC, "fill", e.pointerId);
    }
  }
  if (dragSession && dragSession.pointerId === e.pointerId) {
    endDragSession();
  } else if (touchPending && touchPending.pointerId === e.pointerId) {
    clearTouchPending();
  }
}

// ======================
// 游戏核心函数
// ======================
function afterPlayerMove() {
  const terrainChanged = updateTerrainUnlocks();
  if (terrainChanged) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        renderCell(cells[r][c], r, c);
      }
    }
  }
  checkWin();
  // Auto mark remaining unrevealed cells with 'x' if all filled cells revealed in row/col
  // and change hint number prompt when a continuous block is fully revealed
  for (let r = 0; r < SIZE; r++) {
    autoCrossRow(r);
  }
  for (let c = 0; c < SIZE; c++) {
    autoCrossCol(c);
  }
  checkWin();
  updateHintStyles();
}

function checkWin() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const need = solution[r][c] === 1;
      const painted = state[r][c] === 1;
      if (need !== painted) {
        statusEl.classList.remove("win");
        return false;
      }
    }
  }
  statusEl.classList.add("win");
  const errors = errorFlags.flat().filter(Boolean).length;
  statusEl.textContent = errors ? `通关（含 ${errors} 处点错标红）` : "恭喜通关！涂色与后台答案完全一致";
  return true;
}

function createBoard() {
  if (!boardEl) return;
  clearChildren(boardEl);
  state = [];
  errorFlags = [];
  if (!cells) cells = [];
  cells.length = 0;
  for (let r = 0; r < SIZE; r++) {
    cells[r] = [];
    state[r] = [];
    errorFlags[r] = [];
    for (let c = 0; c < SIZE; c++) {
      state[r][c] = 0;
      errorFlags[r][c] = null;
      var cell = document.createElement("div");
      cell.dataset.r = String(r);
      cell.dataset.c = String(c);
      cell.onclick = () => {
        if (state[r][c] === 1) state[r][c] = 0;
        else if (solution[r][c] === 1) state[r][c] = 1;
        else { state[r][c] = 2; errorFlags[r][c] = "cross"; statusEl.classList.remove("win"); statusEl.textContent = "点错了：该格应为空，已标红显示 ×"; }
        renderCell(cell, r, c);
        afterPlayerMove();
      };
      cell.oncontextmenu = (e) => {
        e.preventDefault();
        if (state[r][c] === 2) state[r][c] = 0;
        else if (solution[r][c] === 0) state[r][c] = 2;
        else { state[r][c] = 1; errorFlags[r][c] = "fill"; statusEl.classList.remove("win"); statusEl.textContent = "点错了：该格应填充，已标红显示"; }
        renderCell(cell, r, c);
        afterPlayerMove();
      };
      boardEl.appendChild(cell);
      cells[r][c] = cell;
    }
  }
}

function renderCell(el, r, c) {
  el.className = "cell";
  el.innerHTML = "";
  const err = errorFlags[r] && errorFlags[r][c];
  if (err === "fill") {
    el.classList.add("error-fill");
    return;
  }
  if (err === "cross") {
    el.classList.add("error-cross");
    el.innerHTML = "×";
    return;
  }
  if (state[r][c] === 1) el.classList.add("green");
  if (state[r][c] === 2) {
    el.classList.add("cross");
    el.innerHTML = "×";
  }
  const t = terrain[r][c];
  if (t === 1) {
    el.classList.add("terrain-grass");
    el.innerHTML = getTerrainSVG(1, isUnlocked(r, c), unlockProgress[r][c]);
    el.classList.toggle("locked", !isUnlocked(r, c));
    if (isUnlocked(r, c)) {
      el.classList.add("has-progress");
      el.setAttribute("data-progress", unlockProgress[r][c] + "/1");
    }
  } else if (t === 2) {
    el.classList.add("terrain-ice");
    el.innerHTML = getTerrainSVG(2, isUnlocked(r, c), unlockProgress[r][c]);
    el.classList.toggle("locked", !isUnlocked(r, c));
    if (isUnlocked(r, c)) {
      el.classList.add("has-progress");
      el.setAttribute("data-progress", unlockProgress[r][c] + "/4");
    }
  }
}

function createHints() {
  if (!rowHintsEl || !colHintsEl) return;
  clearChildren(rowHintsEl);
  clearChildren(colHintsEl);
  rows.forEach((blocks, r) => {
    const div = document.createElement("div");
    div.className = "row-tip";
    blocks.forEach((block) => {
      const span = document.createElement("span");
      span.className = "number";
      if (hasGrassRow[r]) {
        span.innerText = '     '; // 固定空白占位（5个字符）
        span.classList.add('hidden');
      } else {
        span.innerText = block.count;
      }
      span.dataset.block = JSON.stringify(block);
      div.appendChild(span);
    });
    rowHintsEl.appendChild(div);
  });
  cols.forEach((blocks, c) => {
    const div = document.createElement("div");
    div.className = "col-tip";
    blocks.forEach((block) => {
      const span = document.createElement("span");
      span.className = "number";
      if (hasGrassCol[c]) {
        span.innerText = '     '; // 固定空白占位（5个字符）
        span.classList.add('hidden');
      } else {
        span.innerText = block.count;
      }
      span.dataset.block = JSON.stringify(block);
      div.appendChild(span);
    });
    colHintsEl.appendChild(div);
  });
}

function refreshHints() {
  if (!rowHintsEl || !colHintsEl) return;
  // 根据当前 hasGrassRow / hasGrassCol 重新设置数字文本（空白占位或真实数字）
  const rowNumberElements = rowHintsEl.querySelectorAll('.number');
  let idx = 0;
  rows.forEach((blocks, r) => {
    blocks.forEach((block) => {
      const span = rowNumberElements[idx];
      if (span) {
        if (hasGrassRow[r]) {
          span.innerText = '     ';
          span.classList.add('hidden');
        } else {
          span.innerText = block.count;
          span.classList.remove('hidden');
        }
      }
      idx++;
    });
  });

  const colNumberElements = colHintsEl.querySelectorAll('.number');
  let colIdx = 0;
  cols.forEach((blocks, c) => {
    blocks.forEach((block) => {
      const span = colNumberElements[colIdx];
      if (span) {
        if (hasGrassCol[c]) {
          span.innerText = '     ';
          span.classList.add('hidden');
        } else {
          span.innerText = block.count;
          span.classList.remove('hidden');
        }
      }
      colIdx++;
    });
  });
}

function clearChildren(el) {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
}

function countFilled(grid) {
  return grid.reduce((sum, row) => sum + row.filter(cell => cell === 1).length, 0);
}

function resetBoard() {
  state = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  errorFlags = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  if (cells && cells.length > 0) {
    cells.forEach(row => {
      row.forEach(el => {
        if (el) {
          el.className = "cell";
          el.innerHTML = "";
          el.classList.remove("solved");
        }
      });
    });
    // re-render terrain
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        renderCell(cells[r][c], r, c);
      }
    }
    refreshHints();
  }
  updateHintStyles();
  checkWin();
  statusEl.classList.remove("win");
  statusEl.textContent = "棋盘已清空";
}

function saveGeneration(filled, target) {
  const modeNames = ['草方块', '冰方块', '普通模式'];
  const record = {
    date: new Date().toLocaleDateString('zh-CN'),
    mode: currentMode,
    filled,
    target
  };
  generationHistory.push(record);
  localStorage.setItem('grassIceGameHistory', JSON.stringify(generationHistory));
}

function showRecords() {
  if (generationHistory.length === 0) {
    alert('暂无生成记录');
    return;
  }
  let text = '生成记录：\n\n';
  generationHistory.forEach((r, i) => {
    const mode = r.mode === 0 ? '草方块' : '冰方块';
    text += `${i + 1}. ${mode} - ${r.date} - 填充: ${r.filled}/${r.target}\n`;
  });
  alert(text);
}

// 【地形SVG生成器】草方块/冰方块模式专用
function getTerrainSVG(type, unlocked, progress) {
  let state = unlocked ? Math.min(4, Math.max(0, Math.floor(progress))) : 0;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 30 30">`;
  if (type === 1) { // grass
    svg += `
      <rect width="100%" height="100%" fill="#166534"/>
      <path d="M5 8 Q10 3 15 12 Q20 5 25 10" fill="#4ade80" stroke="#166534" stroke-width="2" />
      <path d="M5 18 Q12 13 18 22 Q24 15 28 20" fill="#86efac" stroke="#166534" stroke-width="1.5" />
    `;
  } else if (type === 2) { // ice - 4 states
    let iceFill = "#c7d2fe";
    let iceStroke = "#4f46e5";
    let shine1 = "rgba(255,255,255,0.7)";
    let shine2 = "rgba(255,255,255,0.5)";
    let cracks = "";
    let opacity = 1;
    if (!unlocked) {
      opacity = 0.6;
      iceFill = "#9ca3af";
      iceStroke = "#6b7280";
      shine1 = "rgba(255,255,255,0.3)";
      shine2 = "rgba(255,255,255,0.2)";
    } else {
      switch (state) {
        case 1: // 1/4 broken
          cracks = `
            <path d="M8 10 L12 8" stroke="#1e2937" stroke-width="3" stroke-linecap="round" opacity="0.8" />
            <path d="M18 18 L22 15" stroke="#1e2937" stroke-width="2" stroke-linecap="round" opacity="0.7" />
          `;
          break;
        case 2: // 1/2 broken
          cracks = `
            <path d="M8 10 L12 8" stroke="#1e2937" stroke-width="3" stroke-linecap="round" />
            <path d="M18 18 L22 15" stroke="#1e2937" stroke-width="2" stroke-linecap="round" />
            <path d="M10 20 L14 22" stroke="#1e2937" stroke-width="2.5" stroke-linecap="round" />
          `;
          break;
        case 3: // 3/4 broken
          cracks = `
            <path d="M8 10 L12 8" stroke="#1e2937" stroke-width="3" stroke-linecap="round" />
            <path d="M18 18 L22 15" stroke="#1e2937" stroke-width="2" stroke-linecap="round" />
            <path d="M10 20 L14 22" stroke="#1e2937" stroke-width="2.5" stroke-linecap="round" />
            <path d="M20 10 L24 12" stroke="#1e2937" stroke-width="2" stroke-linecap="round" />
          `;
          break;
        case 4: // full
          cracks = "";
          break;
      }
    }
    svg += `
      <rect x="3" y="3" width="24" height="24" rx="3" fill="${iceFill}" stroke="${iceStroke}" stroke-width="2" opacity="${opacity}" />
      <circle cx="9" cy="9" r="4" fill="${shine1}" />
      <circle cx="21" cy="18" r="4" fill="${shine2}" />
      ${cracks}
    `;
  }
  svg += `</svg>`;
  return svg;
}

// 初始化
document.addEventListener("DOMContentLoaded", () => {
  const seedInput = document.getElementById("seedInput");
  const btnLoadSeed = document.getElementById("btnLoadSeed");
  const btnExport = document.getElementById("btnExport");
  const copyBtn = document.getElementById("btnCopy");
  const exportTextEl = document.getElementById("exportText");
  statusEl = document.getElementById("status");
  boardEl = document.getElementById("board");
  rowHintsEl = document.getElementById("rowHints");
  colHintsEl = document.getElementById("colHints");

  bindBoardPointerEvents();

  // 添加复制按钮事件
  
function loadLevelBySeed(code) {
  if (!code) return;
  if (!statusEl) {
    statusEl = document.getElementById("status");
  }
  if (!statusEl) return;
  const parts = code.split(':');
  if (parts.length < 2) {
    statusEl.textContent = "格式错误";
    return;
  }

  const mode = parseInt(parts[0]) || 0;
  const seed = parseInt(parts[1]) || Date.now();
  const params = parts[2] || '';

  statusEl.textContent = `正在加载模式${mode} (Seed=${seed})...`;

  const { grid, filled, target } = generateSolutionWithSeed(mode, seed);

  solution = grid;
  rows = solution.map(row => getHintBlocks(row));
  cols = Array.from({length: SIZE}, (_, c) => getHintBlocks(solution.map(row => row[c])));
  createTerrain();
  createBoard();
  createHints();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      renderCell(cells[r][c], r, c);
    }
  }
  refreshHints();
  exportLevelText();
  statusEl.textContent = `已加载模式${mode} (Seed=${seed}) 填充: ${filled}`;
}

// ==================== 新版关卡生成系统 ====================
// 使用 "模式ID + Seed + 参数" 编码方案
// 目标：同一Seed + 模式 = 同一关卡
// 紧凑数据结构 < 10字节

function generateSolutionWithSeed(mode, seed) {
  const rng = (s) => {
    let x = Math.sin(s) * 10000;
    return x - Math.floor(x);
  };

  let grid = [];
  let filled = 0;
  let target = 0;

  switch (mode) {
    case 0: // 普通模式 - 高密度布局，保证每个种子生成的地图有效方块 >= target (165+)
      target = 165;
      grid = [];
      filled = 0;
      for (let r = 0; r < SIZE; r++) {
        grid[r] = [];
        for (let c = 0; c < SIZE; c++) {
          const val = Math.floor(rng(seed + r * 100 + c) * 5);
          grid[r][c] = val < 4 ? 1 : 0;
          if (grid[r][c] === 1) filled++;
        }
      }
      if (filled < target) {
        let zeros = [];
        for (let r = 0; r < SIZE; r++) {
          for (let c = 0; c < SIZE; c++) {
            if (grid[r][c] === 0) zeros.push([r, c]);
          }
        }
        zeros.sort((a, b) => (a[0] * SIZE + a[1]) - (b[0] * SIZE + b[1]));
        for (let i = 0; i < zeros.length && filled < target; i++) {
          const [r, c] = zeros[i];
          grid[r][c] = 1;
          filled++;
        }
      }
      break;

    case 1: // 冰块模式 - 5个随机离散冰块
      const positions = [];
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (r < 2 || r > SIZE - 3 || c < 2 || c > SIZE - 3) continue; // 避免边缘
          positions.push([r, c]);
        }
      }
      const shuffled = positions.sort(() => rng(seed) - 0.5);
      grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
      for (let i = 0; i < 5; i++) {
        const [r, c] = shuffled[i];
        grid[r][c] = 1;
        filled++;
      }
      target = 5;
      break;

    case 2: // 草地模式 - 单个5×5连续区域
      const sr = Math.floor(rng(seed) * (SIZE - 4));
      const sc = Math.floor(rng(seed + 1) * (SIZE - 4));
      grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
      for (let r = sr; r < sr + 5; r++) {
        for (let c = sc; c < sc + 5; c++) {
          grid[r][c] = 1;
        }
      }
      filled = 25;
      target = 25;
      break;

    default:
      // fallback 普通模式 - 高密度布局，保证每个种子生成的地图有效方块 >= target (165+)
      target = 165;
      grid = [];
      filled = 0;
      for (let r = 0; r < SIZE; r++) {
        grid[r] = [];
        for (let c = 0; c < SIZE; c++) {
          const val = Math.floor(rng(seed + r * 100 + c) * 5);
          grid[r][c] = val < 4 ? 1 : 0;
          if (grid[r][c] === 1) filled++;
        }
      }
      if (filled < target) {
        let zeros = [];
        for (let r = 0; r < SIZE; r++) {
          for (let c = 0; c < SIZE; c++) {
            if (grid[r][c] === 0) zeros.push([r, c]);
          }
        }
        zeros.sort((a, b) => (a[0] * SIZE + a[1]) - (b[0] * SIZE + b[1]));
        for (let i = 0; i < zeros.length && filled < target; i++) {
          const [r, c] = zeros[i];
          grid[r][c] = 1;
          filled++;
        }
      }
      break;
  }

  return { grid, filled, target };
}

btnLoadSeed.addEventListener("click", () => {
  loadLevelBySeed(seedInput.value.trim());
});


seedInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") loadLevelBySeed(seedInput.value.trim());
});

  if (copyBtn) {
    copyBtn.addEventListener("click", copyToClipboard);
  }

  // 加载生成记录
  const savedHistory = localStorage.getItem('grassIceGameHistory');
  if (savedHistory) {
    generationHistory = JSON.parse(savedHistory);
  }

  // 清空棋盘
  const btnReset = document.getElementById("btnReset");
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      resetBoard();
    });
  }

  // 生成记录
  const btnRecords = document.getElementById("btnRecords");
  if (btnRecords) {
    btnRecords.addEventListener("click", showRecords);
  }

  // 随机生成关卡
  const btnGenerate = document.getElementById("btnGenerate");
  if (btnGenerate) {
    btnGenerate.addEventListener("click", () => {
      generateFromSeed();
    });
    seedInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        generateFromSeed();
      }
    });
  }

  function newLevel() {
    if (!statusEl) {
      statusEl = document.getElementById("status");
      if (!statusEl) return;
    }
    statusEl.textContent = "正在生成关卡...";

    // 随机选择模式 (0=普通, 1=冰块, 2=草地)
    const mode = Math.floor(Math.random() * 3);
    const seed = Math.floor(Math.random() * 99999999) + 10000000; // 8位种子

    const { grid, filled, target } = generateSolutionWithSeed(mode, seed);

    solution = grid;
    if (!solution) solution = [];
    rows = solution.map(row => getHintBlocks(row));
    cols = Array.from({length: SIZE}, (_, c) => getHintBlocks(solution.map(row => row[c])));
    if (!rows || !cols) return;
    cells = [];
    createTerrain();
    createBoard();
    createHints();
    refreshHints();
    if (!cells) return;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (cells[r] && cells[r][c]) {
          renderCell(cells[r][c], r, c);
        }
      }
    }
    exportLevelText();
    statusEl.textContent = `关卡生成完成！填充: ${filled} (模式${mode}, Seed=${seed})`;
  }

  function exportLevelText() {
    if (!solution || solution.length === 0) return;
    let text = '';
    for (let row of solution) {
      text += row.join(' ') + '\n';
    }
    exportTextEl.value = text.trim();
  }

  function showLoading() {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.style.display = "flex";
  }

  function hideLoading() {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.style.display = "none";
  }

  function generateFromSeed() {
    if (isGenerating) return;
    isGenerating = true;
    if (btnGenerate) btnGenerate.disabled = true;
    if (btnRecords) btnRecords.disabled = true;
    if (btnReset) btnReset.disabled = true;

    newLevel();

    setTimeout(() => {
      isGenerating = false;
      if (btnGenerate) btnGenerate.disabled = false;
      if (btnRecords) btnRecords.disabled = false;
      if (btnReset) btnReset.disabled = false;
    }, 300);
  }

  // 模式切换（支持草/冰/普通，三种类型，持久化到 localStorage）
  const btnModeGrass = document.getElementById("btnModeGrass");
  const btnModeIce = document.getElementById("btnModeIce");
  const btnModeNormal = document.getElementById("btnModeNormal");

  function setMode(mode) {
    currentMode = mode;
    if (btnModeGrass) btnModeGrass.classList.toggle('active', mode === 0);
    if (btnModeIce) btnModeIce.classList.toggle('active', mode === 1);
    if (btnModeNormal) btnModeNormal.classList.toggle('active', mode === 2);
    localStorage.setItem('gameMode', mode);
  }

  // 恢复持久化模式（不同tab保持相同选择）
  const savedMode = parseInt(localStorage.getItem('gameMode') || '0');
  if (btnModeGrass && btnModeIce && btnModeNormal) {
    btnModeGrass.addEventListener("click", () => setMode(0));
    btnModeIce.addEventListener("click", () => setMode(1));
    btnModeNormal.addEventListener("click", () => setMode(2));

    // 设置初始 active 状态
    setMode(savedMode);
  }

  // 手机长按拖拽模式切换（打X开关）
  const xModeToggle = document.getElementById("xMode");
  if (xModeToggle) {
    xModeToggle.addEventListener("change", () => {
      mobileXMode = xModeToggle.checked;
    });
  }

  // 显示加载动画（仅用于首次加载）
  showLoading();

  // 启动游戏（生成逻辑较快，立即执行避免卡住）
  setTimeout(() => {
    hideLoading();
    newLevel();
    statusEl.textContent = "游戏已就绪";
  }, 80); // 极短延迟

  function copyToClipboard() {
    if (!exportTextEl) exportTextEl = document.getElementById("exportText");
    const text = exportTextEl ? exportTextEl.value : '';
    if (!text) return;
    if (!statusEl) statusEl = document.getElementById("status");
    navigator.clipboard.writeText(text).then(() => {
      const original = statusEl ? statusEl.textContent : '';
      statusEl.textContent = "已复制到剪贴板 ✓";
      setTimeout(() => { 
        if (statusEl) statusEl.textContent = original; 
      }, 2000);
    }).catch(() => {
      if (statusEl) statusEl.textContent = "复制失败，请手动复制";
    });
  }
});
