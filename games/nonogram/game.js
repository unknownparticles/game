// ======================
// 常量
// ======================
const SIZE = 15;
const MODE_GRASS = 0;
const MODE_ICE = 1;
const MODE_NORMAL = 2;
const MODE_LABELS = ["草方块", "冰方块", "普通模式"];

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
let toolRevealed = [];
let rows = [];
let cols = [];
let cells = [];
let currentMode = MODE_GRASS;
let currentSeed = 0;
let generationHistory = [];
let tools = { magnet: 1, plane: 1, hammer: 3 };
let activeTool = null;

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

function getModeLabel(mode = currentMode) {
  return MODE_LABELS[mode] || MODE_LABELS[MODE_NORMAL];
}

function seededRandom(seed) {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function updateToolUI() {
  const counts = {
    magnet: document.getElementById("magnetCount"),
    plane: document.getElementById("planeCount"),
    hammer: document.getElementById("hammerCount"),
  };
  const buttons = {
    magnet: document.getElementById("btnMagnet"),
    plane: document.getElementById("btnPlane"),
    hammer: document.getElementById("btnHammer"),
  };
  Object.keys(tools).forEach((name) => {
    if (counts[name]) counts[name].textContent = tools[name];
    if (buttons[name]) {
      buttons[name].disabled = tools[name] <= 0;
      buttons[name].classList.toggle("active", activeTool === name);
    }
  });
}

function hidePlanePicker() {
  const picker = document.getElementById("planePicker");
  if (picker) picker.hidden = true;
}

function resetTools() {
  tools = { magnet: 1, plane: 1, hammer: 3 };
  activeTool = null;
  if (boardEl) boardEl.classList.remove("tool-targeting");
  hidePlanePicker();
  updateToolUI();
}

function getToolCandidates() {
  const candidates = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (state[r][c] === 0 && terrain[r][c] === 0) candidates.push([r, c]);
    }
  }
  return candidates;
}

function revealWithTool(r, c) {
  if (state[r][c] !== 0 || terrain[r][c] !== 0) return false;
  state[r][c] = solution[r][c] === 1 ? 1 : 2;
  errorFlags[r][c] = null;
  toolRevealed[r][c] = true;
  renderCell(cells[r][c], r, c);
  return true;
}

function finishToolUse(message) {
  afterPlayerMove();
  updateToolUI();
  if (!statusEl.classList.contains("win")) statusEl.textContent = message;
}

function useMagnet() {
  if (tools.magnet <= 0) return;
  const candidates = shuffle(getToolCandidates());
  const revealed = candidates.slice(0, 3).filter(([r, c]) => revealWithTool(r, c)).length;
  if (revealed === 0) {
    statusEl.textContent = "没有可供磁铁揭示的普通格子";
    return;
  }
  tools.magnet = 0;
  finishToolUse(`磁铁揭示了 ${revealed} 个格子`);
}

function activateHammer() {
  if (tools.hammer <= 0) return;
  activeTool = activeTool === "hammer" ? null : "hammer";
  if (boardEl) boardEl.classList.toggle("tool-targeting", activeTool === "hammer");
  updateToolUI();
  statusEl.textContent = activeTool === "hammer" ? "锤子已就绪，请点击一个未揭示的普通格子" : "已取消锤子";
}

function useHammerOnCell(r, c) {
  if (activeTool !== "hammer") return false;
  if (!revealWithTool(r, c)) {
    statusEl.textContent = "锤子不能作用于已揭示或冰/草方块";
    return true;
  }
  tools.hammer--;
  activeTool = null;
  boardEl.classList.remove("tool-targeting");
  finishToolUse("锤子揭示了 1 个格子");
  return true;
}

function populatePlaneTargets() {
  const select = document.getElementById("planeTarget");
  if (!select) return;
  clearChildren(select);
  for (let i = 0; i < SIZE; i++) {
    const row = document.createElement("option");
    row.value = `row:${i}`;
    row.textContent = `第 ${i + 1} 行`;
    select.appendChild(row);
  }
  for (let i = 0; i < SIZE; i++) {
    const col = document.createElement("option");
    col.value = `col:${i}`;
    col.textContent = `第 ${i + 1} 列`;
    select.appendChild(col);
  }
}

function openPlanePicker() {
  if (tools.plane <= 0) return;
  const picker = document.getElementById("planePicker");
  if (picker) picker.hidden = false;
  statusEl.textContent = "请选择飞机要揭示的行或列";
}

function cancelPlanePicker() {
  hidePlanePicker();
  if (!statusEl.classList.contains("win")) statusEl.textContent = "已取消飞机";
}

function usePlane() {
  if (tools.plane <= 0) return;
  const select = document.getElementById("planeTarget");
  const [type, indexText] = (select?.value || "").split(":");
  const index = Number(indexText);
  const blocked = type === "row" ? hasGrassRow[index] : hasGrassCol[index];
  if (!Number.isInteger(index) || index < 0 || index >= SIZE || !["row", "col"].includes(type)) {
    statusEl.textContent = "请选择有效的行或列";
    return;
  }
  if (blocked) {
    statusEl.textContent = `第 ${index + 1}${type === "row" ? "行" : "列"}有冰/草方块，飞机无法使用`;
    return;
  }

  const targets = [];
  for (let i = 0; i < SIZE; i++) targets.push(type === "row" ? [index, i] : [i, index]);
  const revealed = targets.filter(([r, c]) => revealWithTool(r, c)).length;
  if (revealed === 0) {
    statusEl.textContent = "所选行或列已经全部揭示";
    return;
  }
  tools.plane = 0;
  hidePlanePicker();
  finishToolUse(`飞机揭示了第 ${index + 1}${type === "row" ? "行" : "列"}`);
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
  if (!isRowFullySolved(r)) return false;
  let changed = false;
  for (let c = 0; c < SIZE; c++) {
    if (solution[r][c] === 0 && state[r][c] === 0) {
      state[r][c] = 2;
      errorFlags[r][c] = null;
      changed = true;
      const cellEl = cells[r][c];
      if (cellEl) renderCell(cellEl, r, c);
    }
  }
  return changed;
}

function autoCrossCol(c) {
  if (!isColFullySolved(c)) return false;
  let changed = false;
  for (let r = 0; r < SIZE; r++) {
    if (solution[r][c] === 0 && state[r][c] === 0) {
      state[r][c] = 2;
      errorFlags[r][c] = null;
      changed = true;
      const cellEl = cells[r][c];
      if (cellEl) renderCell(cellEl, r, c);
    }
  }
  return changed;
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
  if (mode === MODE_GRASS) {
    const sr = Math.floor(seededRandom(currentSeed) * (SIZE - 4));
    const sc = Math.floor(seededRandom(currentSeed + 1) * (SIZE - 4));
    for (let r = sr; r < sr + 5; r++) {
      for (let c = sc; c < sc + 5; c++) {
        terrain[r][c] = 1;
        hasGrassRow[r] = true;
        hasGrassCol[c] = true;
      }
    }
  } else if (mode === MODE_ICE) {
    const positions = [];
    // 冰块不能贴边生成，但不限制冰块之间相邻。
    for (let r = 1; r < SIZE - 1; r++) {
      for (let c = 1; c < SIZE - 1; c++) positions.push([r, c]);
    }
    let offset = 2;
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(seededRandom(currentSeed + offset++) * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    for (let i = 0; i < 5; i++) {
      const [r, c] = positions[i];
      terrain[r][c] = 2;
    }
  }

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
  if (toolRevealed[r][c]) {
    statusEl.textContent = "该格已由道具揭示，不能修改";
    return false;
  }
  if (terrain[r][c] !== 0 && !isUnlocked(r, c)) return false;
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
  if (activeTool === "hammer") {
    e.preventDefault();
    useHammerOnCell(r, c);
    return;
  }
  if (e.pointerType !== "touch") {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    const mode = e.button === 2 ? "cross" : (drawMode ? "fill" : "cross");
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
function renderAllCells() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      renderCell(cells[r][c], r, c);
    }
  }
}

function afterPlayerMove() {
  // 自动 X 可能解锁地形，地形移除后又可能触发新的自动 X，因此处理到稳定状态。
  for (let pass = 0; pass < SIZE * SIZE; pass++) {
    const terrainChanged = updateTerrainUnlocks();
    if (terrainChanged) renderAllCells();

    let autoCrossChanged = false;
    for (let r = 0; r < SIZE; r++) {
      autoCrossChanged = autoCrossRow(r) || autoCrossChanged;
    }
    for (let c = 0; c < SIZE; c++) {
      autoCrossChanged = autoCrossCol(c) || autoCrossChanged;
    }
    if (!terrainChanged && !autoCrossChanged) break;
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
  toolRevealed = [];
  if (!cells) cells = [];
  cells.length = 0;
  for (let r = 0; r < SIZE; r++) {
    cells[r] = [];
    state[r] = [];
    errorFlags[r] = [];
    toolRevealed[r] = [];
    for (let c = 0; c < SIZE; c++) {
      state[r][c] = 0;
      errorFlags[r][c] = null;
      toolRevealed[r][c] = false;
      var cell = document.createElement("div");
      cell.dataset.r = String(r);
      cell.dataset.c = String(c);
      cell.setAttribute("role", "button");
      cell.setAttribute("tabindex", "0");
      cell.setAttribute("aria-label", `第 ${r + 1} 行，第 ${c + 1} 列`);
      cell.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        if (useHammerOnCell(r, c)) return;
        if (paintCell(r, c, "fill", resolveErase(r, c, "fill"))) {
          afterPlayerMove();
        }
        renderCell(cell, r, c);
      });
      boardEl.appendChild(cell);
      cells[r][c] = cell;
    }
  }
}

function renderCell(el, r, c) {
  el.className = "cell";
  el.innerHTML = "";
  if (toolRevealed[r] && toolRevealed[r][c]) el.classList.add("tool-revealed");
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
    const unlocked = isUnlocked(r, c);
    const progress = unlockProgress[r][c];
    el.innerHTML = getTerrainSVG(2, unlocked, progress);
    el.classList.toggle("locked", !unlocked);
    if (progress > 0) {
      el.classList.add("has-progress");
      el.setAttribute("data-progress", progress + "/4");
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
  resetTools();
  state = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  errorFlags = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  toolRevealed = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
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
    text += `${i + 1}. ${getModeLabel(r.mode)} - ${r.date} - 填充: ${r.filled}/${r.target}\n`;
  });
  alert(text);
}

// 【地形SVG生成器】草方块/冰方块模式专用
function getTerrainSVG(type, unlocked, progress) {
  const state = Math.min(4, Math.max(0, Math.floor(progress)));
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
    }
    switch (state) {
      case 1: // 1/4 broken
        cracks = `
          <path d="M8 10 L12 8" stroke="#1e2937" stroke-width="3" stroke-linecap="round" opacity="0.8" />
          <path d="M18 18 L22 15" stroke="#1e2937" stroke-width="2" stroke-linecap="round" opacity="0.7" />
        `;
        break;
      case 2: // 2/4 broken
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
  const copyBtn = document.getElementById("btnCopy");
  const btnMagnet = document.getElementById("btnMagnet");
  const btnPlane = document.getElementById("btnPlane");
  const btnHammer = document.getElementById("btnHammer");
  const btnPlaneConfirm = document.getElementById("btnPlaneConfirm");
  const btnPlaneCancel = document.getElementById("btnPlaneCancel");
  statusEl = document.getElementById("status");
  boardEl = document.getElementById("board");
  rowHintsEl = document.getElementById("rowHints");
  colHintsEl = document.getElementById("colHints");

  bindBoardPointerEvents();
  populatePlaneTargets();
  updateToolUI();

  if (btnMagnet) btnMagnet.addEventListener("click", useMagnet);
  if (btnPlane) btnPlane.addEventListener("click", openPlanePicker);
  if (btnHammer) btnHammer.addEventListener("click", activateHammer);
  if (btnPlaneConfirm) btnPlaneConfirm.addEventListener("click", usePlane);
  if (btnPlaneCancel) btnPlaneCancel.addEventListener("click", cancelPlanePicker);

  // 添加复制按钮事件
  
function loadLevelBySeed(code) {
  if (!code) return;
  if (!statusEl) {
    statusEl = document.getElementById("status");
  }
  if (!statusEl) return;
  const parts = code.split(":");
  const modeValue = parts.length > 1 ? Number(parts[0]) : currentMode;
  const seedValue = parts.length > 1 ? Number(parts[1]) : Number(parts[0]);
  if (!Number.isInteger(modeValue) || modeValue < MODE_GRASS || modeValue > MODE_NORMAL || !Number.isFinite(seedValue)) {
    statusEl.textContent = "格式错误";
    return;
  }

  const mode = modeValue;
  const seed = Math.abs(Math.floor(seedValue));

  setMode(mode, false);
  currentSeed = seed;
  resetTools();
  statusEl.textContent = `正在加载${getModeLabel(mode)}...`;

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
  statusEl.textContent = `已加载${getModeLabel(mode)} · ${filled} 个方块`;
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

  target = 165;
  grid = [];
  filled = 0;
  for (let r = 0; r < SIZE; r++) {
    grid[r] = [];
    for (let c = 0; c < SIZE; c++) {
      const value = Math.floor(rng(seed + r * 100 + c) * 5);
      grid[r][c] = value < 4 ? 1 : 0;
      if (grid[r][c] === 1) filled++;
    }
  }
  if (filled < target) {
    for (let r = 0; r < SIZE && filled < target; r++) {
      for (let c = 0; c < SIZE && filled < target; c++) {
        if (grid[r][c] === 0) {
          grid[r][c] = 1;
          filled++;
        }
      }
    }
  }

  return { grid, filled, target };
}

  if (btnLoadSeed && seedInput) {
    btnLoadSeed.addEventListener("click", () => {
      loadLevelBySeed(seedInput.value.trim());
    });
  }


  if (seedInput) {
    seedInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") loadLevelBySeed(seedInput.value.trim());
    });
  }

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
  }

  function newLevel() {
    if (!statusEl) {
      statusEl = document.getElementById("status");
      if (!statusEl) return;
    }
    statusEl.textContent = "正在生成关卡...";

    const mode = currentMode;
    const seed = Math.floor(Math.random() * 99999999) + 10000000; // 8位种子

    const { grid, filled, target } = generateSolutionWithSeed(mode, seed);

    solution = grid;
    currentSeed = seed;
    resetTools();
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
    saveGeneration(filled, target);
    statusEl.textContent = `关卡生成完成 · ${getModeLabel(mode)} · ${filled} 个方块`;
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

  function setMode(mode, shouldRegenerate = true) {
    if (mode < MODE_GRASS || mode > MODE_NORMAL) return;
    currentMode = mode;
    if (btnModeGrass) btnModeGrass.classList.toggle("active", mode === MODE_GRASS);
    if (btnModeIce) btnModeIce.classList.toggle("active", mode === MODE_ICE);
    if (btnModeNormal) btnModeNormal.classList.toggle("active", mode === MODE_NORMAL);
    localStorage.setItem('gameMode', mode);
    if (shouldRegenerate && solution.length) newLevel();
  }

  // 恢复持久化模式（不同tab保持相同选择）
  const savedMode = Number(localStorage.getItem("gameMode"));
  if (btnModeGrass && btnModeIce && btnModeNormal) {
    btnModeGrass.addEventListener("click", () => setMode(MODE_GRASS));
    btnModeIce.addEventListener("click", () => setMode(MODE_ICE));
    btnModeNormal.addEventListener("click", () => setMode(MODE_NORMAL));

    setMode(Number.isInteger(savedMode) && savedMode >= MODE_GRASS && savedMode <= MODE_NORMAL ? savedMode : MODE_GRASS, false);
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
    if (!currentSeed) return;
    const text = `${currentMode}:${currentSeed}`;
    if (!statusEl) statusEl = document.getElementById("status");
    const copy = navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(text)
      : Promise.reject(new Error("clipboard unavailable"));
    copy.then(() => {
      const original = statusEl ? statusEl.textContent : '';
      statusEl.textContent = `关卡码已复制：${text}`;
      setTimeout(() => { 
        if (statusEl) statusEl.textContent = original; 
      }, 2000);
    }).catch(() => {
      if (statusEl) statusEl.textContent = "复制失败，请手动复制";
    });
  }
});
