// ===============================
// 数织 AI 求解器
// ===============================
// 常量 UNKNOWN, FILLED, EMPTY 已在 game.js 中定义

// ===============================
// 生成一行所有可能状态
// ===============================

function generatePatterns(length, clues) {
  let result = [];

  function dfs(pos, index, arr) {
    // 所有数字放完

    if (index === clues.length) {
      let copy = [...arr];

      while (copy.length < length) copy.push(0);

      result.push(copy);

      return;
    }

    let block = clues[index];

    // 后续需要空间

    let remain = 0;

    for (let i = index + 1; i < clues.length; i++) {
      remain += clues[i] + 1;
    }

    let max = length - block - remain;

    for (let start = pos; start <= max; start++) {
      let temp = [...arr];

      while (temp.length < start) {
        temp.push(0);
      }

      for (let i = 0; i < block; i++) {
        temp.push(1);
      }

      if (index < clues.length - 1) {
        temp.push(0);
      }

      dfs(
        temp.length,

        index + 1,

        temp,
      );
    }
  }

  dfs(0, 0, []);

  return result;
}

// ===============================
// 根据当前棋盘过滤
// ===============================

function filterPatterns(line, patterns) {
  return patterns.filter((p) => {
    for (let i = 0; i < line.length; i++) {
      if (line[i] === UNKNOWN) continue;
      const expected = line[i] === FILLED ? 1 : 0;
      if (p[i] !== expected) return false;
    }
    return true;
  });
}

// ===============================
// AI 自动推理
// ===============================

function solveStep() {
  let changed = false;

  // 行

  for (let r = 0; r < 15; r++) {
    let line = [];

    for (let c = 0; c < 15; c++) {
      line.push(board[r][c]);
    }

    let clues = getHint(solution[r]);

    let patterns = generatePatterns(15, clues);

    patterns = filterPatterns(line, patterns);

    if (patterns.length) {
      for (let c = 0; c < 15; c++) {
        let values = patterns.map((x) => x[c]);

        if (values.every((v) => v == 1) && board[r][c] == UNKNOWN) {
          board[r][c] = FILLED;

          changed = true;
        }

        if (values.every((v) => v == 0) && board[r][c] == UNKNOWN) {
          board[r][c] = EMPTY;

          changed = true;
        }
      }
    }
  }

  // 列

  for (let c = 0; c < 15; c++) {
    let line = [];

    for (let r = 0; r < 15; r++) {
      line.push(board[r][c]);
    }

    let column = [];

    for (let r = 0; r < 15; r++) column.push(solution[r][c]);

    let clues = getHint(column);

    let patterns = generatePatterns(15, clues);

    patterns = filterPatterns(line, patterns);

    if (patterns.length) {
      for (let r = 0; r < 15; r++) {
        let values = patterns.map((x) => x[r]);

        if (values.every((v) => v == 1) && board[r][c] == UNKNOWN) {
          board[r][c] = FILLED;

          changed = true;
        }

        if (values.every((v) => v == 0) && board[r][c] == UNKNOWN) {
          board[r][c] = EMPTY;

          changed = true;
        }
      }
    }
  }

  return changed;
}

// ===============================
// AI提示
// ===============================

function aiHint() {
  if (typeof canPlay === "function" && !canPlay()) return;

  let result = solveStep();

  if (result) {
    updateBoard();
    showMessage("🤖 AI 已推理一步", "msg-info");
  } else {
    showMessage("🤔 当前没有确定答案", "msg-info");
  }
}
