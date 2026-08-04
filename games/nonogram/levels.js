// ============================
// 关卡系统 + 随机生成
// ============================

const LEVEL_SIZE = 15;
const GEN_MIN_BLOCKS = 50;
const GEN_MAX_BLOCKS = 160;
const GEN_MAX_RUN = 5;

// 关卡入口仅保存元数据；真正 solution 运行时随机生成（不预显）
const levels = [
  { id: 1001, name: "随机入门", difficulty: "简单", density: "low" },
  { id: 1002, name: "随机进阶", difficulty: "普通", density: "mid" },
  { id: 1003, name: "随机高难", difficulty: "困难", density: "high" },
  { id: 1004, name: "随机大师", difficulty: "大师", density: "max" },
];

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function emptyGrid(size = LEVEL_SIZE) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function countBlocks(grid) {
  let n = 0;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) if (grid[r][c]) n++;
  }
  return n;
}

function lineMaxRun(values) {
  let best = 0;
  let cur = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i]) {
      cur += 1;
      if (cur > best) best = cur;
    } else cur = 0;
  }
  return best;
}

function rowHasBlock(grid, r) {
  for (let c = 0; c < grid.length; c++) if (grid[r][c]) return true;
  return false;
}

function colHasBlock(grid, c) {
  for (let r = 0; r < grid.length; r++) if (grid[r][c]) return true;
  return false;
}

function isValidSolution(grid, minBlocks = GEN_MIN_BLOCKS, maxBlocks = GEN_MAX_BLOCKS, maxRun = GEN_MAX_RUN) {
  const size = grid.length;
  const total = countBlocks(grid);
  if (total < minBlocks || total > maxBlocks) return false;
  for (let r = 0; r < size; r++) {
    if (!rowHasBlock(grid, r)) return false;
    if (lineMaxRun(grid[r]) > maxRun) return false;
  }
  for (let c = 0; c < size; c++) {
    if (!colHasBlock(grid, c)) return false;
    const col = [];
    for (let r = 0; r < size; r++) col.push(grid[r][c]);
    if (lineMaxRun(col) > maxRun) return false;
  }
  return true;
}

function runLenIfPlace(grid, r, c) {
  const size = grid.length;
  let left = 0;
  for (let i = c - 1; i >= 0 && grid[r][i]; i--) left++;
  let right = 0;
  for (let i = c + 1; i < size && grid[r][i]; i++) right++;
  let up = 0;
  for (let i = r - 1; i >= 0 && grid[i][c]; i--) up++;
  let down = 0;
  for (let i = r + 1; i < size && grid[i][c]; i++) down++;
  return {
    row: left + 1 + right,
    col: up + 1 + down,
  };
}

function canPlace(grid, r, c, maxRun = GEN_MAX_RUN) {
  if (grid[r][c]) return false;
  const len = runLenIfPlace(grid, r, c);
  return len.row <= maxRun && len.col <= maxRun;
}

function densityTargetRange(density, minBlocks, maxBlocks) {
  if (density === "low") return [Math.max(minBlocks, 50), Math.min(maxBlocks, 80)];
  if (density === "high") return [Math.max(minBlocks, 100), Math.min(maxBlocks, 140)];
  if (density === "max") return [Math.max(minBlocks, 120), Math.min(maxBlocks, 160)];
  return [Math.max(minBlocks, 70), Math.min(maxBlocks, 110)];
}

/**
 * 随机构造 15×15 解：
 * - 方块数 50~160
 * - 行列连续实心 ≤ 5
 * - 每行每列至少 1 个
 * 只作为后台答案，不会直接画在棋盘上。
 */
function generateRandomSolution(options = {}) {
  const size = options.size || LEVEL_SIZE;
  const minBlocks = options.minBlocks || GEN_MIN_BLOCKS;
  const maxBlocks = options.maxBlocks || GEN_MAX_BLOCKS;
  const maxRun = options.maxRun || GEN_MAX_RUN;
  const rnd = typeof options.rnd === "function" ? options.rnd : Math.random;
  const [tMin, tMax] = densityTargetRange(options.density || "mid", minBlocks, maxBlocks);

  for (let attempt = 0; attempt < 60; attempt++) {
    const target = tMin + Math.floor(rnd() * (tMax - tMin + 1));
    const grid = emptyGrid(size);

    // 1) 先保证每行每列至少 1 个：放置互不冲突的“基底”
    const colOrder = shuffleInPlace([...Array(size).keys()], rnd);
    for (let r = 0; r < size; r++) {
      const c = colOrder[r];
      grid[r][c] = 1;
    }
    // 再补一些错位，降低后期空洞概率
    for (let r = 0; r < size; r++) {
      const c = (colOrder[r] + 3) % size;
      if (canPlace(grid, r, c, maxRun) && rnd() < 0.8) grid[r][c] = 1;
    }

    // 2) 随机加点到目标数量
    const slots = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) if (!grid[r][c]) slots.push([r, c]);
    }
    shuffleInPlace(slots, rnd);
    for (const [r, c] of slots) {
      if (countBlocks(grid) >= target) break;
      if (canPlace(grid, r, c, maxRun)) grid[r][c] = 1;
    }

    // 3) 若仍不足，放宽尝试更多位置（多轮）
    for (let round = 0; round < 3 && countBlocks(grid) < Math.max(minBlocks, tMin); round++) {
      const again = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) if (!grid[r][c]) again.push([r, c]);
      }
      shuffleInPlace(again, rnd);
      for (const [r, c] of again) {
        if (countBlocks(grid) >= target) break;
        if (canPlace(grid, r, c, maxRun)) grid[r][c] = 1;
      }
    }

    // 4) 过多则删，但不能删到空行/空列，也不能为了删除破坏合法性以外的约束
    if (countBlocks(grid) > Math.min(maxBlocks, tMax)) {
      const filled = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) if (grid[r][c]) filled.push([r, c]);
      }
      shuffleInPlace(filled, rnd);
      const want = Math.min(maxBlocks, Math.max(target, tMin));
      for (const [r, c] of filled) {
        if (countBlocks(grid) <= want) break;
        grid[r][c] = 0;
        if (!rowHasBlock(grid, r) || !colHasBlock(grid, c)) {
          grid[r][c] = 1; // 回滚
        }
      }
    }

    // 5) 修补空行/空列
    for (let r = 0; r < size; r++) {
      if (rowHasBlock(grid, r)) continue;
      const cols = shuffleInPlace([...Array(size).keys()], rnd);
      for (const c of cols) {
        if (canPlace(grid, r, c, maxRun)) {
          grid[r][c] = 1;
          break;
        }
      }
    }
    for (let c = 0; c < size; c++) {
      if (colHasBlock(grid, c)) continue;
      const rows = shuffleInPlace([...Array(size).keys()], rnd);
      for (const r of rows) {
        if (canPlace(grid, r, c, maxRun)) {
          grid[r][c] = 1;
          break;
        }
      }
    }

    if (isValidSolution(grid, minBlocks, maxBlocks, maxRun)) {
      return grid.map((row) => row.slice());
    }
  }

  // 兜底：规则化稀疏图案，再安全填充
  const fallback = emptyGrid(size);
  for (let i = 0; i < size; i++) {
    fallback[i][i] = 1;
    const c2 = (i + 2) % size;
    if (canPlace(fallback, i, c2, maxRun)) fallback[i][c2] = 1;
    const c4 = (i + 5) % size;
    if (canPlace(fallback, i, c4, maxRun)) fallback[i][c4] = 1;
  }
  const slots = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) if (!fallback[r][c]) slots.push([r, c]);
  }
  shuffleInPlace(slots, rnd);
  for (const [r, c] of slots) {
    if (countBlocks(fallback) >= minBlocks) break;
    if (canPlace(fallback, r, c, maxRun)) fallback[r][c] = 1;
  }
  return fallback;
}

function densityLabel(density) {
  if (density === "low") return "简单";
  if (density === "high") return "困难";
  if (density === "max") return "大师";
  return "普通";
}

function buildLevelMeta(base, solution, stage) {
  return {
    id: base.id,
    name: base.name || "随机关卡",
    difficulty: base.difficulty || "随机",
    density: base.density || "mid",
    stage: stage || base.stage || 1,
    blocks: countBlocks(solution),
    solution,
  };
}

function createRandomLevel(options = {}) {
  const stage = options.stage || 1;
  const density = options.density || "mid";
  const seed = options.seed;
  const rnd = seed == null ? Math.random : mulberry32(seed >>> 0);
  const solution = generateRandomSolution({
    density,
    rnd,
    minBlocks: options.minBlocks,
    maxBlocks: options.maxBlocks,
  });
  return buildLevelMeta(
    {
      id: options.id || "rand_" + Date.now() + "_" + stage,
      name: options.name || "第 " + stage + " 关",
      difficulty: options.difficulty || densityLabel(density),
      density,
      stage,
    },
    solution,
    stage,
  );
}

function materializeLevel(levelLike, options = {}) {
  if (levelLike && levelLike.solution && Array.isArray(levelLike.solution) && levelLike.solution.length) {
    return {
      ...levelLike,
      blocks: levelLike.blocks || countBlocks(levelLike.solution),
      stage: levelLike.stage || options.stage || 1,
    };
  }
  return createRandomLevel({
    id: levelLike && levelLike.id,
    name: levelLike && levelLike.name,
    difficulty: levelLike && levelLike.difficulty,
    density: (levelLike && levelLike.density) || options.density || "mid",
    stage: options.stage || (levelLike && levelLike.stage) || 1,
    seed: options.seed,
  });
}

function getLevel(id) {
  const base = levels.find((x) => String(x.id) === String(id));
  if (!base) return null;
  return materializeLevel(base);
}

function getDailyLevel(options = {}) {
  const date = new Date();
  const seed =
    date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  const modeSalt = options.mode === "grass" ? 17 : options.mode === "ice" ? 29 : 0;
  const density = ["low", "mid", "high", "max"][(seed + modeSalt) % 4];
  return createRandomLevel({
    id: "daily_" + seed + (options.mode ? "_" + options.mode : ""),
    name: "每日挑战 #" + seed,
    difficulty: "每日",
    density,
    stage: 1,
    seed: seed * 10 + modeSalt + 3,
  });
}

function nextRandomLevel(current, mode) {
  const stage = ((current && current.stage) || 1) + 1;
  const densities = ["low", "mid", "high", "max"];
  const density = (current && current.density) || densities[(stage - 1) % densities.length];
  return createRandomLevel({
    id: "stage_" + (mode || "classic") + "_" + stage + "_" + Date.now(),
    name: "第 " + stage + " 关",
    difficulty: densityLabel(density),
    density,
    stage,
  });
}
