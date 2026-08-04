// ===============================
// 游戏核心
// ===============================

let solution = [];

let board = [];

let currentLevel = null;

let life = 5;

let startTime = 0;

let timer = null;

let seconds = 0;

let tools = {
  hammer: 3,

  plane: 1,

  magnet: 1,
};

const UNKNOWN = 0;

const FILLED = 1;

const EMPTY = 2;

// 记录点错并已揭示正确答案的格子
let errorCells = new Set();
let gameOver = false;

function cellKey(r, c) {
  return r + "," + c;
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
  el.classList.add("msg-pop");
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

function startGame() {
  let level = levels[0];

  loadLevel(level);

  show("gamePage");
}

function showLevels() {
  show("levelPage");

  let box = document.getElementById("levels");

  box.innerHTML = "";

  levels.forEach((level) => {
    let div = document.createElement("div");

    div.className = "level-card";

    div.innerHTML = `
<h3>
${level.name}
</h3>

<p>
难度:
${level.difficulty}
</p>


<button>
开始
</button>
`;

    div.querySelector("button").onclick = () => {
      loadLevel(level);

      show("gamePage");
    };

    box.appendChild(div);
  });
}

function dailyGame() {
  let level = getDailyLevel();

  loadLevel(level);

  show("gamePage");
}

function showRank() {
  show("rankPage");

  renderRank();
}

// ===============================
// 加载关卡
// ===============================

function loadLevel(level) {
  currentLevel = level;

  solution = JSON.parse(JSON.stringify(level.solution));

  board = Array.from(
    {
      length: 15,
    },

    () => Array(15).fill(UNKNOWN),
  );

  life = 5;

  seconds = 0;

  startTime = Date.now();

  tools = {
    hammer: 3,

    plane: 1,

    magnet: 1,
  };

  errorCells = new Set();
  gameOver = false;
  showMessage("", null);

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

    document.getElementById("timer").innerText = formatTime(seconds);
  }, 1000);
}

// ===============================
// 提示生成
// ===============================

function getHint(arr) {
  let result = [];

  let count = 0;

  arr.forEach((v) => {
    if (v) {
      count++;
    } else {
      if (count) {
        result.push(count);

        count = 0;
      }
    }
  });

  if (count) result.push(count);

  return result.length ? result : [0];
}

function renderTips() {
  let rows = document.getElementById("rowHints");

  let cols = document.getElementById("colHints");

  rows.innerHTML = "";

  cols.innerHTML = "";

  for (let r = 0; r < 15; r++) {
    let div = document.createElement("div");

    div.className = "row-hint";

    getHint(solution[r]).forEach((n) => {
      let span = document.createElement("span");

      span.className = "number";

      span.innerText = n;

      div.appendChild(span);
    });

    rows.appendChild(div);
  }

  for (let c = 0; c < 15; c++) {
    let div = document.createElement("div");

    div.className = "col-hint";

    let arr = [];

    for (let r = 0; r < 15; r++) arr.push(solution[r][c]);

    getHint(arr).forEach((n) => {
      let span = document.createElement("span");

      span.className = "number";

      span.innerText = n;

      div.appendChild(span);
    });

    cols.appendChild(div);
  }
}

// ===============================
// 绘制棋盘
// ===============================

function renderBoard() {
  let box = document.getElementById("board");

  box.innerHTML = "";

  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      let cell = document.createElement("div");

      cell.className = "cell";

      cell.onclick = () => {
        clickCell(r, c);
      };

      cell.oncontextmenu = (e) => {
        e.preventDefault();

        markEmpty(r, c);
      };

      let timer;

      cell.ontouchstart = () => {
        timer = setTimeout(() => {
          markEmpty(r, c);
        }, 500);
      };

      cell.ontouchend = () => {
        clearTimeout(timer);
      };

      box.appendChild(cell);
    }
  }

  updateBoard();
}

function updateBoard(flashKey) {
  let cells = document.querySelectorAll(".cell");

  let index = 0;

  cells.forEach((cell) => {
    let r = Math.floor(index / 15);

    let c = index % 15;
    const key = cellKey(r, c);
    const isError = errorCells.has(key);

    cell.className = "cell";
    cell.innerHTML = "";

    if (board[r][c] == FILLED) {
      cell.classList.add("block");
      cell.innerHTML = "■";
    }

    if (board[r][c] == EMPTY) {
      cell.classList.add("empty");
      cell.innerHTML = "×";
    }

    if (isError) {
      cell.classList.add("error");
      // 错误格始终显示“正确答案”
      if (solution[r][c] == 1) {
        cell.classList.add("block");
        cell.classList.remove("empty");
        cell.innerHTML = "■";
      } else {
        cell.classList.add("empty");
        cell.classList.remove("block");
        cell.innerHTML = "×";
      }
      cell.classList.add("locked");
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

  updateHints();
}

// ===============================
// 点击格子（左键/单击：填充）
// ===============================

function canPlay() {
  return !gameOver && life > 0;
}

function clickCell(r, c) {
  if (!canPlay()) return;
  if (board[r][c] !== UNKNOWN || errorCells.has(cellKey(r, c))) return;

  // 玩家尝试填充
  const correct = solution[r][c] == 1;
  if (correct) {
    board[r][c] = FILLED;
    autoFill();
    updateBoard();
    checkWin();
    saveCurrent();
    return;
  }

  // 点错：揭示正确答案（此处应为空 ×），标红并扣生命
  applyWrongReveal(r, c, "fill");
}

function markEmpty(r, c) {
  if (!canPlay()) return;
  if (board[r][c] !== UNKNOWN || errorCells.has(cellKey(r, c))) return;

  // 玩家尝试标记为空
  const correct = solution[r][c] == 0;
  if (correct) {
    board[r][c] = EMPTY;
    autoFill();
    updateBoard();
    checkWin();
    saveCurrent();
    return;
  }

  // 点错：揭示正确答案（此处应填充 ■），标红并扣生命
  applyWrongReveal(r, c, "empty");
}

// ===============================
// 错误揭示：显示该格正确答案并标红
// ===============================

function applyWrongReveal(r, c, action) {
  const key = cellKey(r, c);
  // 直接写成正确答案
  board[r][c] = solution[r][c] == 1 ? FILLED : EMPTY;
  errorCells.add(key);

  loseLife();

  const correctText = solution[r][c] == 1 ? "■ 实心" : "× 空白";
  const actionText = action === "fill" ? "填充" : "标记空白";
  showMessage(
    `❌ 判断错误（你选择了${actionText}）<br>已揭示正确答案：<span class="correct-answer">${correctText}</span>`,
    "msg-error",
  );

  autoFill();
  updateBoard(key);
  checkWin();
  saveCurrent();
}

function loseLife() {
  life--;

  if (life < 0) life = 0;

  updateStatus();

  if (life == 0) {
    gameOver = true;
    showMessage("💀 生命耗尽，游戏失败<br>错误格子已标红并显示正确答案", "msg-error");
    clearInterval(timer);
  }
}

// ===============================
// 状态显示
// ===============================

function updateStatus() {
  document.getElementById("life").innerHTML = "❤️".repeat(life);

  document.getElementById("hammerCount").innerText = tools.hammer;

  document.getElementById("planeCount").innerText = tools.plane;

  document.getElementById("magnetCount").innerText = tools.magnet;
}

// ===============================
// 自动补空
// ===============================

function autoFill() {
  let changed = true;

  while (changed) {
    changed = false;

    // 行

    for (let r = 0; r < 15; r++) {
      let total = 0;

      let filled = 0;

      for (let c = 0; c < 15; c++) {
        if (solution[r][c]) total++;

        if (board[r][c] == FILLED) filled++;
      }

      if (total == filled) {
        for (let c = 0; c < 15; c++) {
          if (solution[r][c] == 0 && board[r][c] == UNKNOWN) {
            board[r][c] = EMPTY;

            changed = true;
          }
        }
      }
    }

    // 列

    for (let c = 0; c < 15; c++) {
      let total = 0;

      let filled = 0;

      for (let r = 0; r < 15; r++) {
        if (solution[r][c]) total++;

        if (board[r][c] == FILLED) filled++;
      }

      if (total == filled) {
        for (let r = 0; r < 15; r++) {
          if (solution[r][c] == 0 && board[r][c] == UNKNOWN) {
            board[r][c] = EMPTY;

            changed = true;
          }
        }
      }
    }
  }
}

// ===============================
// 锤子
// ===============================

function useHammer() {
  if (!canPlay()) return;
  if (tools.hammer <= 0) return;

  let list = [];

  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      if (board[r][c] == UNKNOWN) list.push([r, c]);
    }
  }

  if (list.length == 0) return;

  let p = list[Math.floor(Math.random() * list.length)];

  board[p[0]][p[1]] = solution[p[0]][p[1]] ? FILLED : EMPTY;

  tools.hammer--;

  updateStatus();

  autoFill();

  updateBoard();

  saveCurrent();
}

// ===============================
// 磁铁
// ===============================

function useMagnet() {
  if (!canPlay()) return;
  if (tools.magnet <= 0) return;

  for (let i = 0; i < 3; i++) {
    let list = [];

    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        if (board[r][c] == UNKNOWN) list.push([r, c]);
      }
    }

    if (list.length == 0) break;

    let p = list[Math.floor(Math.random() * list.length)];

    board[p[0]][p[1]] = solution[p[0]][p[1]] ? FILLED : EMPTY;
  }

  tools.magnet--;

  updateStatus();

  autoFill();

  updateBoard();

  saveCurrent();
}

// ===============================
// 飞机
// ===============================

function usePlane() {
  if (!canPlay()) return;
  if (tools.plane <= 0) return;

  let type = prompt("输入 row 或 col");

  let index = Number(prompt("输入编号1-15")) - 1;

  if (index < 0 || index >= 15) return;

  if (type == "row") {
    for (let c = 0; c < 15; c++) {
      board[index][c] = solution[index][c] ? FILLED : EMPTY;
    }
  }

  if (type == "col") {
    for (let r = 0; r < 15; r++) {
      board[r][index] = solution[r][index] ? FILLED : EMPTY;
    }
  }

  tools.plane--;

  updateStatus();

  autoFill();

  updateBoard();

  saveCurrent();
}

// ===============================
// AI提示
// ===============================
// aiHint 函数已在 solver.js 中定义

// ===============================
// 提示数字完成状态
// ===============================

function updateHints() {
  let rows = document.querySelectorAll(".row-hint");

  rows.forEach((div, r) => {
    let need = getHint(solution[r]);

    let current = getHint(board[r].map((x) => (x == FILLED ? 1 : 0)));

    [...div.children].forEach((span, i) => {
      if (current[i] && current[i] >= need[i]) {
        span.classList.add("done");
      }
    });
  });
}

// ===============================
// 胜利判断
// ===============================

function checkWin() {
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      if (solution[r][c] == 1 && board[r][c] != FILLED) return;

      if (solution[r][c] == 0 && board[r][c] == FILLED) return;
    }
  }

  clearInterval(timer);

  let star = calculateStar();

  gameOver = true;
  showMessage(`
🎉 挑战完成!<br>
${"⭐".repeat(star)}<br>
时间：${formatTime(seconds)}
`, "msg-success");

  saveRecord({
    level: currentLevel.id,

    time: seconds,

    star: star,
  });
}

// ===============================
// 星级计算
// ===============================

function calculateStar() {
  if (life >= 5 && seconds < 300) return 3;

  if (life >= 3) return 2;

  return 1;
}

// ===============================
// 保存当前游戏
// ===============================

function saveCurrent() {
  saveGame({
    level: currentLevel.id,
    solution,
    board,
    life,
    tools,
    seconds,
    errorCells: [...errorCells],
    gameOver,
  });
}

// ===============================
// 恢复游戏
// ===============================

function restoreGame() {
  let data = loadGame();

  if (!data) return;

  let level = getLevel(data.level);

  if (!level) return;

  currentLevel = level;

  solution = data.solution;

  board = data.board;

  life = data.life;
  tools = data.tools;
  seconds = data.seconds;
  errorCells = new Set(data.errorCells || []);
  gameOver = !!data.gameOver || life <= 0;

  updateStatus();
  renderTips();
  renderBoard();
  startTimer();
  if (gameOver) clearInterval(timer);
  show("gamePage");
}

// ===============================
// 时间格式
// ===============================

function formatTime(sec) {
  let m = Math.floor(sec / 60);

  let s = sec % 60;

  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

// ===============================
// 初始化恢复
// ===============================

window.onload = function () {
  restoreGame();
};
