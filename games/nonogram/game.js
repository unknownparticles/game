// ===============================
// 游戏核心
// ===============================

const SIZE = 15;
const UNKNOWN = 0;
const FILLED = 1;
const EMPTY = 2;

const MODE_CLASSIC = "classic";
const MODE_GRASS = "grass";
const MODE_ICE = "ice";

const MODE_LABELS = {
  classic: "经典模式",
  grass: "草方块模式",
  ice: "除冰模式",
};

let solution = [];
let board = [];
let currentLevel = null;
let life = 5;
let startTime = 0;
let timer = null;
let seconds = 0;
let tools = { hammer: 3, plane: 1, magnet: 1 };

let errorCells = new Set();
let gameOver = false;
let gameMode = MODE_CLASSIC;
let grassMap = [];
let iceMap = [];
let clearingAnim = new Set();

function cellKey(r, c) {
  return r + "," + c;
}

function inBounds(r, c) {
  return r >= 0 && c >= 0 && r < SIZE && c < SIZE;
}

function neighbors4(r, c) {
  return [
    [r - 1, c],
    [r + 1, c],
    [r, c - 1],
    [r, c + 1],
  ].filter(([nr, nc]) => inBounds(nr, nc));
}

function emptyMask(size = SIZE) {
  return Array.from({ length: size }, () => Array(size).fill(false));
}

function isGrass(r, c) {
  return !!(grassMap[r] && grassMap[r][c]);
}

function isIce(r, c) {
  return !!(iceMap[r] && iceMap[r][c]);
}

function isBlocked(r, c) {
  return isGrass(r, c) || isIce(r, c);
}

function isPlayableUnknown(r, c) {
  return board[r][c] === UNKNOWN && !isBlocked(r, c) && !errorCells.has(cellKey(r, c));
}

function isRevealed(r, c) {
  if (!inBounds(r, c)) return true;
  if (isBlocked(r, c)) return false;
  return board[r][c] !== UNKNOWN;
}

function rowHasHazard(r) {
  for (let c = 0; c < SIZE; c++) {
    if (isGrass(r, c) || isIce(r, c)) return true;
  }
  return false;
}

function colHasHazard(c) {
  for (let r = 0; r < SIZE; r++) {
    if (isGrass(r, c) || isIce(r, c)) return true;
  }
  return false;
}

function isRowHidden(r) {
  return rowHasHazard(r);
}

function isColHidden(c) {
  return colHasHazard(c);
}

function getMessageEl() {
  return document.getElementById("message");
}

function showMessage(html, type) {
  const el = getMessageEl();
  if (!el) return;
  el.classList.remove("msg-error", "msg-success", "msg-info", "msg-pop");
  void el.offsetWidth;
  el.innerHTML = html;
  if (type) el.classList.add(type);
  if (html) el.classList.add("msg-pop");
}

function updateModeUI() {
  const title = document.getElementById("gameTitle");
  const badge = document.getElementById("modeBadge");
  const tip = document.getElementById("modeTip");
  const label = MODE_LABELS[gameMode] || MODE_LABELS.classic;
  if (title) title.textContent = "方块推理 · " + label;
  if (badge) {
    badge.textContent = label;
    badge.dataset.mode = gameMode;
  }
  if (tip) {
    if (gameMode === MODE_GRASS) {
      tip.innerHTML =
        "草方块模式：5×5 草地区不可点击；点击揭示相邻格后草地才会消失。<br>有草的行/列数字隐藏；锤子/磁铁/飞机都不能作用于草地或被隐藏的行/列。<br>操作：单击填充 ■；右键/长按标记 ×。点错会标红并揭示正确答案。";
    } else if (gameMode === MODE_ICE) {
      tip.innerHTML =
        "除冰模式：随机 5 块冰，所在行/列数字隐藏；冰块四周都揭示后才会碎裂。<br>锤子/磁铁只能揭示非冰块，飞机只能揭示未被隐藏的行/列。<br>操作：单击填充 ■；右键/长按标记 ×。点错会标红并揭示正确答案。";
    } else {
      tip.innerHTML =
        "操作：单击填充 ■；右键/长按标记 ×。<br>点错会扣生命，并立刻标红显示该格正确答案。";
    }
  }
}

// ===============================
// 页面切换
// ===============================

function hideAll() {
  document.querySelectorAll(".page").forEach((p) => p.classList.add("hidden"));
}

function show(id) {
  hideAll();
  document.getElementById(id).classList.remove("hidden");
}

function backHome() {
  show("home");
}

// ===============================
// 开始游戏
// ===============================

function startGame(mode = MODE_CLASSIC) {
  gameMode = mode || MODE_CLASSIC;
  loadLevel(levels[0], gameMode);
  show("gamePage");
}

function startGrassMode() {
  startGame(MODE_GRASS);
}

function startIceMode() {
  startGame(MODE_ICE);
}

function showLevels(mode = MODE_CLASSIC) {
  gameMode = mode || MODE_CLASSIC;
  show("levelPage");
  const box = document.getElementById("levels");
  box.innerHTML = "";

  const modeInfo = document.createElement("p");
  modeInfo.className = "level-mode-info";
  modeInfo.textContent = "当前选择：" + (MODE_LABELS[gameMode] || "经典模式");
  box.appendChild(modeInfo);

  levels.forEach((level) => {
    const div = document.createElement("div");
    div.className = "level-card";
    div.innerHTML = `
      <h3>${level.name}</h3>
      <p>难度: ${level.difficulty}</p>
      <button type="button">开始</button>
    `;
    div.querySelector("button").onclick = () => {
      loadLevel(level, gameMode);
      show("gamePage");
    };
    box.appendChild(div);
  });
}

function dailyGame(mode = MODE_CLASSIC) {
  gameMode = mode || MODE_CLASSIC;
  loadLevel(getDailyLevel(), gameMode);
  show("gamePage");
}

function showRank() {
  show("rankPage");
  renderRank();
}

// ===============================
// 模式障碍生成
// ===============================

function resetHazards() {
  grassMap = emptyMask();
  iceMap = emptyMask();
  clearingAnim = new Set();
}

function placeGrassPatch() {
  grassMap = emptyMask();
  const top = Math.floor(Math.random() * (SIZE - 4));
  const left = Math.floor(Math.random() * (SIZE - 4));
  for (let r = top; r < top + 5; r++) {
    for (let c = left; c < left + 5; c++) {
      grassMap[r][c] = true;
    }
  }
  return { top, left };
}

function placeIceBlocks(count = 5) {
  iceMap = emptyMask();
  const pool = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) pool.push([r, c]);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (let i = 0; i < count && i < pool.length; i++) {
    const [r, c] = pool[i];
    iceMap[r][c] = true;
  }
}

function initModeHazards(mode) {
  resetHazards();
  gameMode = mode || MODE_CLASSIC;
  if (gameMode === MODE_GRASS) {
    const pos = placeGrassPatch();
    showMessage(
      `🌿 草方块模式：草地生成在 (${pos.top + 1},${pos.left + 1}) 起的 5×5 区域`,
      "msg-info",
    );
  } else if (gameMode === MODE_ICE) {
    placeIceBlocks(5);
    showMessage("🧊 除冰模式：已冻结 5 个方块，先揭示其四周再破冰", "msg-info");
  }
}

// 点击揭示后：相邻草方块消失
function clearGrassAdjacentTo(r, c) {
  if (gameMode !== MODE_GRASS) return false;
  let cleared = 0;
  neighbors4(r, c).forEach(([nr, nc]) => {
    if (isGrass(nr, nc)) {
      grassMap[nr][nc] = false;
      clearingAnim.add(cellKey(nr, nc));
      cleared += 1;
    }
  });
  if (cleared) {
    showMessage(`🌿 揭示相邻格，清除了 ${cleared} 个草方块`, "msg-info");
  }
  return cleared > 0;
}

// 冰块四周都被揭示则碎裂
function breakReadyIce() {
  if (gameMode !== MODE_ICE) return false;
  let broken = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!isIce(r, c)) continue;
      const around = neighbors4(r, c);
      if (around.length === 0) continue;
      if (around.every(([nr, nc]) => isRevealed(nr, nc))) {
        iceMap[r][c] = false;
        clearingAnim.add(cellKey(r, c));
        broken += 1;
      }
    }
  }
  if (broken) {
    showMessage(`🧊 碎裂了 ${broken} 块冰，格子已可点击`, "msg-info");
  }
  return broken > 0;
}

function settleBoard(fromPlayerClick, clickR, clickC) {
  // 玩家点击才会清除相邻草；冰块在任意揭示后都可碎裂
  if (fromPlayerClick) clearGrassAdjacentTo(clickR, clickC);

  // 冰块碎裂后可能解锁自动补全，自动补全又可能促成下一块冰碎裂
  let guard = 0;
  while (guard++ < 40) {
    const broke = breakReadyIce();
    const before = board.map((row) => row.slice());
    autoFill();
    const same =
      before.length === board.length &&
      before.every((row, r) => row.every((v, c) => v === board[r][c]));
    if (!broke && same) break;
  }
}

function afterPlayerReveal(r, c) {
  settleBoard(true, r, c);
}

function afterAnyBoardChange() {
  // 工具/AI 等非点击揭示：不清除草，只处理冰块与自动补全
  settleBoard(false);
}

// ===============================
// 加载关卡
// ===============================

function loadLevel(level, mode = MODE_CLASSIC) {
  currentLevel = level;
  gameMode = mode || MODE_CLASSIC;
  solution = JSON.parse(JSON.stringify(level.solution));
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(UNKNOWN));
  life = 5;
  seconds = 0;
  startTime = Date.now();
  tools = { hammer: 3, plane: 1, magnet: 1 };
  errorCells = new Set();
  gameOver = false;
  showMessage("", null);
  initModeHazards(gameMode);
  updateModeUI();
  updateStatus();
  renderTips();
  renderBoard();
  startTimer();
}

// ===============================
// 计时
// ===============================

function startTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    seconds = Math.floor((Date.now() - startTime) / 1000);
    const el = document.getElementById("timer");
    if (el) el.innerText = formatTime(seconds);
  }, 1000);
}

// ===============================
// 提示生成
// ===============================

function getHint(arr) {
  const result = [];
  let count = 0;
  arr.forEach((v) => {
    if (v) {
      count++;
    } else if (count) {
      result.push(count);
      count = 0;
    }
  });
  if (count) result.push(count);
  return result.length ? result : [0];
}

function renderTips() {
  const rows = document.getElementById("rowHints");
  const cols = document.getElementById("colHints");
  rows.innerHTML = "";
  cols.innerHTML = "";

  for (let r = 0; r < SIZE; r++) {
    const div = document.createElement("div");
    div.className = "row-hint" + (isRowHidden(r) ? " hint-hidden" : "");
    if (isRowHidden(r)) {
      const span = document.createElement("span");
      span.className = "number hidden-number";
      span.innerText = "?";
      span.title = "该行存在草方块/冰块，数字已隐藏";
      div.appendChild(span);
    } else {
      getHint(solution[r]).forEach((n) => {
        const span = document.createElement("span");
        span.className = "number";
        span.innerText = n;
        div.appendChild(span);
      });
    }
    rows.appendChild(div);
  }

  for (let c = 0; c < SIZE; c++) {
    const div = document.createElement("div");
    div.className = "col-hint" + (isColHidden(c) ? " hint-hidden" : "");
    if (isColHidden(c)) {
      const span = document.createElement("span");
      span.className = "number hidden-number";
      span.innerText = "?";
      span.title = "该列存在草方块/冰块，数字已隐藏";
      div.appendChild(span);
    } else {
      const arr = [];
      for (let r = 0; r < SIZE; r++) arr.push(solution[r][c]);
      getHint(arr).forEach((n) => {
        const span = document.createElement("span");
        span.className = "number";
        span.innerText = n;
        div.appendChild(span);
      });
    }
    cols.appendChild(div);
  }
}

// ===============================
// 绘制棋盘
// ===============================

function renderBoard() {
  const box = document.getElementById("board");
  box.innerHTML = "";

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.r = r;
      cell.dataset.c = c;

      cell.onclick = () => clickCell(r, c);
      cell.oncontextmenu = (e) => {
        e.preventDefault();
        markEmpty(r, c);
      };

      let holdTimer;
      cell.ontouchstart = (e) => {
        holdTimer = setTimeout(() => markEmpty(r, c), 500);
      };
      cell.ontouchend = () => clearTimeout(holdTimer);
      cell.ontouchmove = () => clearTimeout(holdTimer);

      box.appendChild(cell);
    }
  }

  updateBoard();
}

function updateBoard(flashKey) {
  const cells = document.querySelectorAll(".cell");
  let index = 0;

  cells.forEach((cell) => {
    const r = Math.floor(index / SIZE);
    const c = index % SIZE;
    const key = cellKey(r, c);
    const isError = errorCells.has(key);

    cell.className = "cell";
    cell.innerHTML = "";

    if (isGrass(r, c)) {
      cell.classList.add("grass", "locked");
      cell.innerHTML = "🌿";
      index++;
      return;
    }

    if (isIce(r, c)) {
      cell.classList.add("ice", "locked");
      cell.innerHTML = "🧊";
      index++;
      return;
    }

    if (clearingAnim.has(key)) {
      cell.classList.add("hazard-clear");
    }

    if (board[r][c] === FILLED) {
      cell.classList.add("block");
      cell.innerHTML = "■";
    }

    if (board[r][c] === EMPTY) {
      cell.classList.add("empty");
      cell.innerHTML = "×";
    }

    if (isError) {
      cell.classList.add("error", "locked");
      if (solution[r][c] === 1) {
        cell.classList.add("block");
        cell.classList.remove("empty");
        cell.innerHTML = "■";
      } else {
        cell.classList.add("empty");
        cell.classList.remove("block");
        cell.innerHTML = "×";
      }
    }

    if (flashKey && flashKey === key) {
      cell.classList.remove("error-flash");
      void cell.offsetWidth;
      cell.classList.add("error-flash");
    }

    if (board[r][c] !== UNKNOWN || isError) {
      cell.classList.add("resolved");
    }

    index++;
  });

  // 清理一次性动画标记
  clearingAnim = new Set();
  renderTips();
  updateHints();
}

// ===============================
// 点击格子
// ===============================

function canPlay() {
  return !gameOver && life > 0;
}

function clickCell(r, c) {
  if (!canPlay()) return;
  if (isBlocked(r, c)) {
    showMessage(isGrass(r, c) ? "🌿 草方块不可点击，先揭示相邻格子" : "🧊 冰块不可直接操作，先揭示四周", "msg-info");
    return;
  }
  if (board[r][c] !== UNKNOWN || errorCells.has(cellKey(r, c))) return;

  const correct = solution[r][c] === 1;
  if (correct) {
    board[r][c] = FILLED;
    autoFill();
    afterPlayerReveal(r, c);
    updateBoard();
    checkWin();
    saveCurrent();
    return;
  }

  applyWrongReveal(r, c, "fill");
}

function markEmpty(r, c) {
  if (!canPlay()) return;
  if (isBlocked(r, c)) {
    showMessage(isGrass(r, c) ? "🌿 草方块不可点击，先揭示相邻格子" : "🧊 冰块不可直接操作，先揭示四周", "msg-info");
    return;
  }
  if (board[r][c] !== UNKNOWN || errorCells.has(cellKey(r, c))) return;

  const correct = solution[r][c] === 0;
  if (correct) {
    board[r][c] = EMPTY;
    autoFill();
    afterPlayerReveal(r, c);
    updateBoard();
    checkWin();
    saveCurrent();
    return;
  }

  applyWrongReveal(r, c, "empty");
}

function applyWrongReveal(r, c, action) {
  const key = cellKey(r, c);
  board[r][c] = solution[r][c] === 1 ? FILLED : EMPTY;
  errorCells.add(key);
  loseLife();

  const correctText = solution[r][c] === 1 ? "■ 实心" : "× 空白";
  const actionText = action === "fill" ? "填充" : "标记空白";
  showMessage(
    `❌ 判断错误（你选择了${actionText}）<br>已揭示正确答案：<span class="correct-answer">${correctText}</span>`,
    "msg-error",
  );

  autoFill();
  afterPlayerReveal(r, c);
  updateBoard(key);
  checkWin();
  saveCurrent();
}

function loseLife() {
  life--;
  if (life < 0) life = 0;
  updateStatus();
  if (life === 0) {
    gameOver = true;
    showMessage("💀 生命耗尽，游戏失败<br>错误格子已标红并显示正确答案", "msg-error");
    clearInterval(timer);
  }
}

function updateStatus() {
  const lifeEl = document.getElementById("life");
  if (lifeEl) lifeEl.innerHTML = "❤️".repeat(life) || "💔";
  const hammer = document.getElementById("hammerCount");
  const plane = document.getElementById("planeCount");
  const magnet = document.getElementById("magnetCount");
  if (hammer) hammer.innerText = tools.hammer;
  if (plane) plane.innerText = tools.plane;
  if (magnet) magnet.innerText = tools.magnet;
}

// ===============================
// 自动补空（跳过草/冰）
// ===============================

function autoFill() {
  let changed = true;
  while (changed) {
    changed = false;

    for (let r = 0; r < SIZE; r++) {
      let total = 0;
      let filled = 0;
      for (let c = 0; c < SIZE; c++) {
        if (solution[r][c]) total++;
        if (board[r][c] === FILLED) filled++;
      }
      if (total === filled) {
        for (let c = 0; c < SIZE; c++) {
          if (solution[r][c] === 0 && board[r][c] === UNKNOWN && !isBlocked(r, c)) {
            board[r][c] = EMPTY;
            changed = true;
          }
        }
      }
    }

    for (let c = 0; c < SIZE; c++) {
      let total = 0;
      let filled = 0;
      for (let r = 0; r < SIZE; r++) {
        if (solution[r][c]) total++;
        if (board[r][c] === FILLED) filled++;
      }
      if (total === filled) {
        for (let r = 0; r < SIZE; r++) {
          if (solution[r][c] === 0 && board[r][c] === UNKNOWN && !isBlocked(r, c)) {
            board[r][c] = EMPTY;
            changed = true;
          }
        }
      }
    }
  }
}

function listSkillTargets() {
  const list = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      // 技能不能作用于草方块/冰块
      if (isPlayableUnknown(r, c)) list.push([r, c]);
    }
  }
  return list;
}

// ===============================
// 锤子
// ===============================

function useHammer() {
  if (!canPlay()) return;
  if (tools.hammer <= 0) return;

  const list = listSkillTargets();
  if (!list.length) {
    showMessage("🔨 没有可揭示的非草/非冰格子", "msg-info");
    return;
  }

  const p = list[Math.floor(Math.random() * list.length)];
  board[p[0]][p[1]] = solution[p[0]][p[1]] ? FILLED : EMPTY;
  tools.hammer--;
  updateStatus();
  autoFill();
  afterAnyBoardChange();
  updateBoard();
  checkWin();
  saveCurrent();
  showMessage("🔨 锤子已揭示 1 个可操作格子", "msg-info");
}

// ===============================
// 磁铁
// ===============================

function useMagnet() {
  if (!canPlay()) return;
  if (tools.magnet <= 0) return;

  let revealed = 0;
  for (let i = 0; i < 3; i++) {
    const list = listSkillTargets();
    if (!list.length) break;
    const p = list[Math.floor(Math.random() * list.length)];
    board[p[0]][p[1]] = solution[p[0]][p[1]] ? FILLED : EMPTY;
    revealed++;
  }

  if (!revealed) {
    showMessage("🧲 没有可揭示的非草/非冰格子", "msg-info");
    return;
  }

  tools.magnet--;
  updateStatus();
  autoFill();
  afterAnyBoardChange();
  updateBoard();
  checkWin();
  saveCurrent();
  showMessage(`🧲 磁铁揭示了 ${revealed} 个可操作格子`, "msg-info");
}

// ===============================
// 飞机：只能揭示没被隐藏的行/列
// ===============================

function usePlane() {
  if (!canPlay()) return;
  if (tools.plane <= 0) return;

  const type = prompt("输入 row 或 col（仅可选择数字未隐藏的行/列）");
  if (type == null) return;
  const normalized = String(type).trim().toLowerCase();
  const index = Number(prompt("输入编号 1-15")) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= SIZE) {
    showMessage("✈️ 编号无效", "msg-error");
    return;
  }

  if (normalized === "row") {
    if (isRowHidden(index)) {
      showMessage("✈️ 该行被草/冰隐藏，飞机无法揭示", "msg-error");
      return;
    }
    for (let c = 0; c < SIZE; c++) {
      if (isBlocked(index, c)) continue;
      board[index][c] = solution[index][c] ? FILLED : EMPTY;
    }
  } else if (normalized === "col") {
    if (isColHidden(index)) {
      showMessage("✈️ 该列被草/冰隐藏，飞机无法揭示", "msg-error");
      return;
    }
    for (let r = 0; r < SIZE; r++) {
      if (isBlocked(r, index)) continue;
      board[r][index] = solution[r][index] ? FILLED : EMPTY;
    }
  } else {
    showMessage("✈️ 请输入 row 或 col", "msg-error");
    return;
  }

  tools.plane--;
  updateStatus();
  autoFill();
  afterAnyBoardChange();
  updateBoard();
  checkWin();
  saveCurrent();
  showMessage("✈️ 飞机已揭示未隐藏的行/列（跳过草/冰）", "msg-info");
}

// ===============================
// 提示数字完成状态
// ===============================

function updateHints() {
  const rows = document.querySelectorAll(".row-hint");
  rows.forEach((div, r) => {
    if (isRowHidden(r)) return;
    const need = getHint(solution[r]);
    const current = getHint(board[r].map((x) => (x === FILLED ? 1 : 0)));
    [...div.children].forEach((span, i) => {
      if (need[i] != null && current[i] === need[i]) span.classList.add("done");
      else span.classList.remove("done");
    });
  });

  const cols = document.querySelectorAll(".col-hint");
  cols.forEach((div, c) => {
    if (isColHidden(c)) return;
    const arr = [];
    const boardCol = [];
    for (let r = 0; r < SIZE; r++) {
      arr.push(solution[r][c]);
      boardCol.push(board[r][c] === FILLED ? 1 : 0);
    }
    const need = getHint(arr);
    const current = getHint(boardCol);
    [...div.children].forEach((span, i) => {
      if (need[i] != null && current[i] === need[i]) span.classList.add("done");
      else span.classList.remove("done");
    });
  });
}

// ===============================
// 胜利判断
// ===============================

function checkWin() {
  // 仍有草/冰时不可通关
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (isBlocked(r, c)) return;
      if (solution[r][c] === 1 && board[r][c] !== FILLED) return;
      if (solution[r][c] === 0 && board[r][c] === FILLED) return;
    }
  }

  clearInterval(timer);
  const star = calculateStar();
  gameOver = true;
  showMessage(
    `🎉 挑战完成!<br>${"⭐".repeat(star)}<br>时间：${formatTime(seconds)}<br>${MODE_LABELS[gameMode] || ""}`,
    "msg-success",
  );

  saveRecord({
    level: currentLevel.id,
    mode: gameMode,
    time: seconds,
    star,
  });
  clearSave();
}

function calculateStar() {
  if (life >= 5 && seconds < 300) return 3;
  if (life >= 3) return 2;
  return 1;
}

function serializeMask(mask) {
  const out = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (mask[r][c]) out.push(cellKey(r, c));
    }
  }
  return out;
}

function deserializeMask(list) {
  const mask = emptyMask();
  (list || []).forEach((key) => {
    const [r, c] = key.split(",").map(Number);
    if (inBounds(r, c)) mask[r][c] = true;
  });
  return mask;
}

function saveCurrent() {
  if (!currentLevel) return;
  saveGame({
    level: currentLevel.id,
    mode: gameMode,
    solution,
    board,
    life,
    tools,
    seconds,
    errorCells: [...errorCells],
    gameOver,
    grass: serializeMask(grassMap),
    ice: serializeMask(iceMap),
    levelSnapshot: currentLevel,
  });
}

function restoreGame() {
  const data = loadGame();
  if (!data) return;

  let level = getLevel(data.level);
  if (!level && data.levelSnapshot) level = data.levelSnapshot;
  if (!level && String(data.level).startsWith("daily_")) {
    level = data.levelSnapshot || getDailyLevel();
  }
  if (!level) return;

  currentLevel = level;
  gameMode = data.mode || MODE_CLASSIC;
  solution = data.solution;
  board = data.board;
  life = data.life;
  tools = data.tools;
  seconds = data.seconds;
  errorCells = new Set(data.errorCells || []);
  gameOver = !!data.gameOver || life <= 0;
  grassMap = deserializeMask(data.grass);
  iceMap = deserializeMask(data.ice);
  startTime = Date.now() - seconds * 1000;

  updateModeUI();
  updateStatus();
  renderTips();
  renderBoard();
  startTimer();
  if (gameOver) clearInterval(timer);
  show("gamePage");
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

window.onload = function () {
  restoreGame();
};
