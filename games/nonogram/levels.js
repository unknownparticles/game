// ============================
// 关卡系统
// ============================

const LEVEL_SIZE = 15;

// 内置示例关卡
// 后续可以扩展1000+

const levels = [
  {
    id: 1001,

    name: "新手练习",

    difficulty: "简单",

    solution: createPattern(1),
  },

  {
    id: 1002,

    name: "基础挑战",

    difficulty: "普通",

    solution: createPattern(2),
  },

  {
    id: 1003,

    name: "高级挑战",

    difficulty: "困难",

    solution: createPattern(3),
  },

  {
    id: 1004,

    name: "大师模式",

    difficulty: "大师",

    solution: createPattern(4),
  },
];

// ============================
// 固定图案生成
// ============================

function createPattern(type) {
  let map = [];

  for (let r = 0; r < 15; r++) {
    let row = [];

    for (let c = 0; c < 15; c++) {
      let value = 0;

      // 简单图案

      if (type == 1) {
        value = r == 7 || c == 7 ? 1 : 0;
      }

      // 普通

      if (type == 2) {
        value = Math.abs(r - 7) + Math.abs(c - 7) < 5 ? 1 : 0;
      }

      // 困难

      if (type == 3) {
        value = (r + c) % 3 == 0 || r == c || r + c == 14 ? 1 : 0;
      }

      // 大师

      if (type == 4) {
        value = (r * r + c * c) % 5 < 2 ? 1 : 0;
      }

      row.push(value);
    }

    map.push(row);
  }

  return map;
}

// ============================
// 获取关卡
// ============================

function getLevel(id) {
  return levels.find((x) => x.id == id);
}

// ============================
// 每日挑战
// ============================

function getDailyLevel() {
  let date = new Date();

  let seed =
    date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();

  // 固定随机

  let type = (seed % 4) + 1;

  return {
    id: "daily_" + seed,

    name: "每日挑战 #" + seed,

    difficulty: "每日",

    solution: createPattern(type),
  };
}
