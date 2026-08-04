// ===============================
// 数织 AI 求解器
// ===============================

function generatePatterns(length, clues) {
  const result = [];

  function dfs(pos, index, arr) {
    if (index === clues.length) {
      const copy = [...arr];
      while (copy.length < length) copy.push(0);
      result.push(copy);
      return;
    }

    const block = clues[index];
    let remain = 0;
    for (let i = index + 1; i < clues.length; i++) {
      remain += clues[i] + 1;
    }

    const max = length - block - remain;
    for (let start = pos; start <= max; start++) {
      const temp = [...arr];
      while (temp.length < start) temp.push(0);
      for (let i = 0; i < block; i++) temp.push(1);
      if (index < clues.length - 1) temp.push(0);
      dfs(temp.length, index + 1, temp);
    }
  }

  // 空线索：整行全空
  if (!clues || (clues.length === 1 && clues[0] === 0)) {
    return [Array(length).fill(0)];
  }

  dfs(0, 0, []);
  return result;
}

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

function solveStep() {
  let changed = false;

  // 行
  for (let r = 0; r < SIZE; r++) {
    const blocked = [];
    const line = [];
    for (let c = 0; c < SIZE; c++) {
      blocked[c] = isBlocked(r, c);
      // 草/冰视为未知，且不允许写入
      line[c] = blocked[c] ? UNKNOWN : board[r][c];
    }

    const clues = getHint(solution[r]);
    let patterns = generatePatterns(SIZE, clues);
    patterns = filterPatterns(line, patterns);
    if (!patterns.length) continue;

    for (let c = 0; c < SIZE; c++) {
      if (blocked[c] || board[r][c] !== UNKNOWN) continue;
      const values = patterns.map((x) => x[c]);
      if (values.every((v) => v === 1)) {
        board[r][c] = FILLED;
        changed = true;
      } else if (values.every((v) => v === 0)) {
        board[r][c] = EMPTY;
        changed = true;
      }
    }
  }

  // 列
  for (let c = 0; c < SIZE; c++) {
    const blocked = [];
    const line = [];
    const columnSolution = [];
    for (let r = 0; r < SIZE; r++) {
      blocked[r] = isBlocked(r, c);
      line[r] = blocked[r] ? UNKNOWN : board[r][c];
      columnSolution[r] = solution[r][c];
    }

    const clues = getHint(columnSolution);
    let patterns = generatePatterns(SIZE, clues);
    patterns = filterPatterns(line, patterns);
    if (!patterns.length) continue;

    for (let r = 0; r < SIZE; r++) {
      if (blocked[r] || board[r][c] !== UNKNOWN) continue;
      const values = patterns.map((x) => x[r]);
      if (values.every((v) => v === 1)) {
        board[r][c] = FILLED;
        changed = true;
      } else if (values.every((v) => v === 0)) {
        board[r][c] = EMPTY;
        changed = true;
      }
    }
  }

  return changed;
}

function aiHint() {
  if (typeof canPlay === "function" && !canPlay()) return;

  const result = solveStep();
  if (result) {
    if (typeof afterAnyBoardChange === "function") afterAnyBoardChange();
    updateBoard();
    showMessage("🤖 AI 已推理一步（跳过草/冰格）", "msg-info");
    if (typeof checkWin === "function") checkWin();
    if (typeof saveCurrent === "function") saveCurrent();
  } else {
    showMessage("🤔 当前没有确定答案（或仅剩草/冰格）", "msg-info");
  }
}
