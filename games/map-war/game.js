(() => {
  "use strict";

  const PLAYER = "player";
  const RED = "red";
  const GOLD = "gold";
  const NEUTRAL = "neutral";
  const STORAGE_KEY = "gc_map_war_progress";
  const SOUND_KEY = "gc_map_war_sound";

  const FACTIONS = {
    [PLAYER]: { color: "#31d3bd", dark: "#0d5e55", land: "#266c63", name: "我方" },
    [RED]: { color: "#ef626c", dark: "#762f38", land: "#773e44", name: "赤焰" },
    [GOLD]: { color: "#f4bb4f", dark: "#77591f", land: "#776337", name: "金盟" },
    [NEUTRAL]: { color: "#a1aaa7", dark: "#4e5958", land: "#4e5b5b", name: "中立" },
  };

  const LEVELS = [
    {
      name: "海峡初战",
      ai: [RED],
      growth: 1.02,
      aiDelay: 2.65,
      territories: [
        ["A", 0.10, 0.28, PLAYER, 24, 0.95],
        ["B", 0.29, 0.18, NEUTRAL, 6, 0.82],
        ["C", 0.28, 0.67, NEUTRAL, 8, 1.02],
        ["D", 0.49, 0.43, NEUTRAL, 10, 1.08],
        ["E", 0.69, 0.20, RED, 14, 0.92],
        ["F", 0.72, 0.70, RED, 12, 1.00],
        ["G", 0.90, 0.43, NEUTRAL, 10, 0.92],
      ],
      edges: [["A", "B"], ["A", "C"], ["B", "C"], ["B", "D"], ["C", "D"], ["D", "E"], ["D", "F"], ["E", "F"], ["E", "G"], ["F", "G"]],
    },
    {
      name: "三角纷争",
      ai: [RED, GOLD],
      growth: 1.15,
      aiDelay: 1.85,
      territories: [
        ["A", 0.09, 0.52, PLAYER, 21, 1.00],
        ["B", 0.23, 0.20, NEUTRAL, 9, 0.78],
        ["C", 0.26, 0.78, NEUTRAL, 13, 0.88],
        ["D", 0.43, 0.46, NEUTRAL, 18, 1.12],
        ["E", 0.54, 0.15, RED, 20, 0.92],
        ["F", 0.67, 0.44, NEUTRAL, 15, 0.96],
        ["G", 0.54, 0.79, GOLD, 20, 0.94],
        ["H", 0.84, 0.20, RED, 14, 0.82],
        ["I", 0.88, 0.70, GOLD, 14, 0.86],
      ],
      edges: [["A", "B"], ["A", "C"], ["A", "D"], ["B", "D"], ["B", "E"], ["C", "D"], ["C", "G"], ["D", "E"], ["D", "F"], ["D", "G"], ["E", "F"], ["E", "H"], ["F", "G"], ["F", "H"], ["F", "I"], ["G", "I"], ["H", "I"]],
    },
    {
      name: "群岛决战",
      ai: [RED, GOLD],
      growth: 1.22,
      aiDelay: 1.55,
      territories: [
        ["A", 0.07, 0.28, PLAYER, 24, 0.92],
        ["B", 0.08, 0.73, PLAYER, 14, 0.82],
        ["C", 0.24, 0.48, NEUTRAL, 17, 1.00],
        ["D", 0.35, 0.16, NEUTRAL, 12, 0.82],
        ["E", 0.39, 0.78, NEUTRAL, 15, 0.88],
        ["F", 0.50, 0.46, NEUTRAL, 25, 1.15],
        ["G", 0.62, 0.17, RED, 20, 0.90],
        ["H", 0.65, 0.76, GOLD, 20, 0.90],
        ["I", 0.76, 0.48, NEUTRAL, 18, 0.96],
        ["J", 0.89, 0.18, RED, 22, 0.94],
        ["K", 0.92, 0.55, NEUTRAL, 13, 0.78],
        ["L", 0.87, 0.82, GOLD, 22, 0.94],
      ],
      edges: [["A", "B"], ["A", "C"], ["A", "D"], ["B", "C"], ["B", "E"], ["C", "D"], ["C", "E"], ["C", "F"], ["D", "F"], ["D", "G"], ["E", "F"], ["E", "H"], ["F", "G"], ["F", "H"], ["F", "I"], ["G", "I"], ["G", "J"], ["H", "I"], ["H", "L"], ["I", "J"], ["I", "K"], ["I", "L"], ["J", "K"], ["K", "L"]],
    },
  ];

  const canvas = document.getElementById("battleCanvas");
  const ctx = canvas.getContext("2d");
  const stage = document.querySelector(".battle-stage");
  const battleState = document.getElementById("battleState");
  const levelSelect = document.getElementById("levelSelect");
  const levelNumber = document.getElementById("levelNumber");
  const levelName = document.getElementById("levelName");
  const playerScore = document.getElementById("playerScore");
  const redScore = document.getElementById("redScore");
  const goldScore = document.getElementById("goldScore");
  const goldScoreBox = document.getElementById("goldScoreBox");
  const toastEl = document.getElementById("toast");
  const pauseBtn = document.getElementById("pauseBtn");
  const soundBtn = document.getElementById("soundBtn");
  const speedBtn = document.getElementById("speedBtn");
  const resultLayer = document.getElementById("resultLayer");

  let width = 1000;
  let height = 620;
  let currentLevel = 0;
  let unlocked = Math.max(1, Math.min(LEVELS.length, Number(GameCenter.storage.get(STORAGE_KEY, 1)) || 1));
  let territories = [];
  let territoryById = new Map();
  let edges = [];
  let convoys = [];
  let mapRegions = [];
  let selected = null;
  let hovered = null;
  let pointer = null;
  let speed = 1;
  let paused = false;
  let ended = false;
  let elapsed = 0;
  let moves = 0;
  let captures = 0;
  let growthClock = 0;
  let resultClock = 0;
  let lastFrame = performance.now();
  let toastTimer = 0;
  let audioContext = null;
  let soundOn = GameCenter.storage.get(SOUND_KEY, true) !== false;
  let oceanMarks = [];

  const MAP_OUTLINE = [
    [0.025, 0.29], [0.055, 0.16], [0.17, 0.10], [0.29, 0.12],
    [0.38, 0.07], [0.49, 0.11], [0.58, 0.08], [0.68, 0.13],
    [0.79, 0.10], [0.91, 0.17], [0.97, 0.30], [0.94, 0.42],
    [0.98, 0.55], [0.93, 0.68], [0.95, 0.82], [0.84, 0.90],
    [0.71, 0.86], [0.60, 0.92], [0.47, 0.87], [0.35, 0.92],
    [0.25, 0.86], [0.13, 0.89], [0.04, 0.78], [0.07, 0.63],
    [0.02, 0.50],
  ];

  function seeded(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function buildOceanMarks() {
    const random = seeded(7281);
    oceanMarks = Array.from({ length: 86 }, () => ({
      x: random(),
      y: random(),
      length: 6 + random() * 22,
      alpha: 0.025 + random() * 0.05,
    }));
  }

  function makeTerritory(data, index) {
    const random = seeded((currentLevel + 1) * 907 + index * 131);
    return {
      id: data[0],
      x: data[1],
      y: data[2],
      owner: data[3],
      units: data[4],
      size: data[5],
      growth: random(),
      pulse: 0,
    };
  }

  function clipPolygon(polygon, normalX, normalY, limit) {
    const result = [];
    for (let index = 0; index < polygon.length; index += 1) {
      const start = polygon[index];
      const end = polygon[(index + 1) % polygon.length];
      const startDistance = start.x * normalX + start.y * normalY - limit;
      const endDistance = end.x * normalX + end.y * normalY - limit;
      const startInside = startDistance <= 0;
      const endInside = endDistance <= 0;

      if (startInside) result.push(start);
      if (startInside !== endInside) {
        const progress = startDistance / (startDistance - endDistance);
        result.push({
          x: start.x + (end.x - start.x) * progress,
          y: start.y + (end.y - start.y) * progress,
        });
      }
    }
    return result;
  }

  function buildMapRegions() {
    const outline = MAP_OUTLINE.map(([x, y]) => ({ x: x * width, y: y * height }));
    mapRegions = territories.map((territory) => {
      const site = pointOf(territory);
      const polygon = territories.reduce((region, other) => {
        if (other === territory || !region.length) return region;
        const otherSite = pointOf(other);
        const normalX = otherSite.x - site.x;
        const normalY = otherSite.y - site.y;
        const limit = (otherSite.x ** 2 + otherSite.y ** 2 - site.x ** 2 - site.y ** 2) / 2;
        return clipPolygon(region, normalX, normalY, limit);
      }, outline);
      return { territory, polygon };
    });
  }

  function populateLevelSelect() {
    levelSelect.innerHTML = "";
    LEVELS.forEach((level, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${String(index + 1).padStart(2, "0")} ${level.name}${index >= unlocked ? " · 锁定" : ""}`;
      option.disabled = index >= unlocked;
      levelSelect.append(option);
    });
  }

  function loadLevel(index) {
    currentLevel = Math.max(0, Math.min(index, LEVELS.length - 1));
    const level = LEVELS[currentLevel];
    level.ai.forEach((_, index) => {
      level[`aiClock${index}`] = 0;
    });
    territories = level.territories.map(makeTerritory);
    territoryById = new Map(territories.map((territory) => [territory.id, territory]));
    edges = level.edges.map(([from, to]) => ({ from: territoryById.get(from), to: territoryById.get(to) }));
    buildMapRegions();
    convoys = [];
    selected = null;
    hovered = null;
    pointer = null;
    paused = false;
    ended = false;
    elapsed = 0;
    moves = 0;
    captures = 0;
    growthClock = 0;
    resultClock = 0;
    lastFrame = performance.now();
    resultLayer.hidden = true;
    levelSelect.value = String(currentLevel);
    levelNumber.textContent = String(currentLevel + 1).padStart(2, "0");
    levelName.textContent = level.name;
    goldScoreBox.hidden = !level.ai.includes(GOLD);
    pauseBtn.textContent = "Ⅱ";
    pauseBtn.title = "暂停";
    pauseBtn.setAttribute("aria-label", "暂停");
    battleState.textContent = "战斗进行中";
    updateScores();
  }

  function resizeCanvas() {
    const rect = stage.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildMapRegions();
  }

  function pointOf(territory) {
    return { x: territory.x * width, y: territory.y * height };
  }

  function radiusOf(territory) {
    const base = Math.max(22, Math.min(36, Math.min(width, height) * 0.06));
    return base * territory.size;
  }

  function isConnected(a, b) {
    return edges.some((edge) =>
      (edge.from === a && edge.to === b) || (edge.from === b && edge.to === a));
  }

  function connectedTo(source) {
    const result = [];
    edges.forEach((edge) => {
      if (edge.from === source) result.push(edge.to);
      else if (edge.to === source) result.push(edge.from);
    });
    return result;
  }

  function pointInPolygon(x, y, polygon) {
    let inside = false;
    for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
      const a = polygon[current];
      const b = polygon[previous];
      const crosses = (a.y > y) !== (b.y > y)
        && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x;
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function territoryAt(x, y) {
    const region = mapRegions.find(({ polygon }) => pointInPolygon(x, y, polygon));
    return region ? region.territory : null;
  }

  function sendArmy(source, target, owner, sendRatio, isPlayerMove = false) {
    if (!source || !target || source.owner !== owner || source === target || !isConnected(source, target)) return false;
    const amount = isPlayerMove ? source.units : Math.floor(source.units * sendRatio);
    if (amount < 1) return false;

    source.units -= amount;
    const from = pointOf(source);
    const to = pointOf(target);
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const duration = Math.max(0.58, Math.min(1.35, distance / 340));
    const arcSign = (source.id.charCodeAt(0) + target.id.charCodeAt(0)) % 2 ? 1 : -1;

    convoys.push({ source, target, owner, amount, elapsed: 0, duration, arcSign });

    if (isPlayerMove) {
      moves += 1;
      tone(330, 0.07, 0.035);
    }
    return true;
  }

  function resolveArrival(convoy) {
    const target = convoy.target;
    if (target.owner === convoy.owner) {
      target.units = Math.min(999, target.units + convoy.amount);
      return;
    }

    if (convoy.amount <= target.units) {
      target.units -= convoy.amount;
      target.pulse = 1;
      return;
    }

    const previousOwner = target.owner;
    target.owner = convoy.owner;
    target.units = convoy.amount - target.units;
    target.pulse = 1.8;
    if (convoy.owner === PLAYER && previousOwner !== PLAYER) {
      captures += 1;
      tone(520, 0.1, 0.04);
    }
  }

  function updateConvoys(dt) {
    for (let index = convoys.length - 1; index >= 0; index -= 1) {
      const convoy = convoys[index];
      convoy.elapsed += dt;
      if (convoy.elapsed >= convoy.duration) {
        resolveArrival(convoy);
        convoys.splice(index, 1);
      }
    }
  }

  function growTerritories(dt) {
    growthClock += dt;
    const level = LEVELS[currentLevel];
    territories.forEach((territory) => {
      territory.pulse = Math.max(0, territory.pulse - dt * 2.8);
      if (territory.owner === NEUTRAL || territory.units >= 99) return;
      const ownerModifier = territory.owner === PLAYER ? 1 : 0.94;
      territory.growth += dt * level.growth * ownerModifier;
      while (territory.growth >= 1) {
        territory.units += 1;
        territory.growth -= 1;
      }
    });
  }

  function chooseAiMove(owner) {
    const sources = territories
      .filter((territory) => territory.owner === owner && territory.units >= 5)
      .sort((a, b) => b.units - a.units);
    if (!sources.length) return;

    let best = null;
    sources.forEach((source) => {
      connectedTo(source).forEach((target) => {
        let score;
        if (target.owner !== owner) {
          const advantage = source.units - target.units;
          score = advantage * 2.4 + (target.owner === NEUTRAL ? 8 : 14) + Math.random() * 7;
          if (advantage <= 1) score -= 24;
          if (target.owner === PLAYER) score += currentLevel * 2;
        } else {
          score = target.units + 7 < source.units ? 2 + Math.random() * 3 : -20;
        }
        if (!best || score > best.score) best = { source, target, score };
      });
    });

    if (!best || best.score < 0) return;
    const attackRatio = best.target.owner === owner ? 0.42 : (best.source.units > best.target.units * 1.8 ? 0.72 : 0.58);
    sendArmy(best.source, best.target, owner, attackRatio);
  }

  function updateAi(dt) {
    const level = LEVELS[currentLevel];
    level.ai.forEach((owner, index) => {
      const key = `aiClock${index}`;
      level[key] = (level[key] || 0) + dt;
      const jitter = owner === GOLD ? 0.17 : 0;
      if (level[key] >= level.aiDelay + jitter) {
        level[key] = 0;
        chooseAiMove(owner);
      }
    });
  }

  function totalFor(owner) {
    const stationed = territories.reduce((sum, territory) => sum + (territory.owner === owner ? territory.units : 0), 0);
    const moving = convoys.reduce((sum, convoy) => sum + (convoy.owner === owner ? convoy.amount : 0), 0);
    return stationed + moving;
  }

  function updateScores() {
    playerScore.textContent = String(totalFor(PLAYER));
    redScore.textContent = String(totalFor(RED));
    goldScore.textContent = String(totalFor(GOLD));
  }

  function checkResult(dt) {
    resultClock += dt;
    if (resultClock < 0.35) return;
    resultClock = 0;

    const playerAlive = territories.some((territory) => territory.owner === PLAYER) || convoys.some((convoy) => convoy.owner === PLAYER);
    const conqueredAll = territories.every((territory) => territory.owner === PLAYER) && !convoys.some((convoy) => convoy.owner !== PLAYER);
    if (conqueredAll) finish(true);
    else if (!playerAlive) finish(false);
  }

  function finish(won) {
    if (ended) return;
    ended = true;
    paused = true;
    battleState.textContent = won ? "战役胜利" : "阵线失守";

    if (won && currentLevel + 1 < LEVELS.length && unlocked < currentLevel + 2) {
      unlocked = currentLevel + 2;
      GameCenter.storage.set(STORAGE_KEY, unlocked);
      populateLevelSelect();
      levelSelect.value = String(currentLevel);
    }

    document.getElementById("resultEmblem").textContent = won ? "◆" : "×";
    document.getElementById("resultKicker").textContent = won ? "战役完成" : "战役结束";
    document.getElementById("resultTitle").textContent = won ? "全境统一" : "阵线失守";
    document.getElementById("resultTime").textContent = formatTime(elapsed);
    document.getElementById("resultLands").textContent = String(captures);
    document.getElementById("resultMoves").textContent = String(moves);
    const nextBtn = document.getElementById("nextBtn");
    nextBtn.textContent = won && currentLevel + 1 < LEVELS.length ? "下一战役" : (won ? "重返第一战" : "重新部署");
    nextBtn.dataset.won = won ? "true" : "false";
    resultLayer.hidden = false;
    tone(won ? 660 : 150, won ? 0.25 : 0.35, 0.07);
  }

  function formatTime(seconds) {
    const total = Math.floor(seconds);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function update(dt) {
    const scaled = dt * speed;
    elapsed += scaled;
    growTerritories(scaled);
    updateConvoys(scaled);
    updateAi(scaled);
    checkResult(scaled);
    updateScores();
  }

  function tracePolygon(polygon) {
    ctx.beginPath();
    polygon.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
  }

  function drawBackground() {
    ctx.fillStyle = "#10191c";
    ctx.fillRect(0, 0, width, height);

    oceanMarks.forEach((mark) => {
      const x = mark.x * width;
      const y = mark.y * height;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + mark.length * 0.45, y - 2, x + mark.length, y);
      ctx.strokeStyle = `rgba(160, 202, 196, ${mark.alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  function drawMap() {
    if (!mapRegions.length) return;

    const outline = MAP_OUTLINE.map(([x, y]) => ({ x: x * width, y: y * height }));
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    tracePolygon(outline);
    ctx.fillStyle = "#263638";
    ctx.fill();
    ctx.restore();

    mapRegions.forEach(({ territory, polygon }) => {
      const faction = FACTIONS[territory.owner];
      const isSelected = territory === selected;
      const isHovered = territory === hovered && territory !== selected;
      const isValidTarget = selected && isHovered && isConnected(selected, territory);

      tracePolygon(polygon);
      ctx.fillStyle = faction.land;
      ctx.globalAlpha = territory.owner === NEUTRAL ? 0.82 : 0.96;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = isValidTarget
        ? FACTIONS[PLAYER].color
        : (isHovered ? "#ef626c" : (isSelected ? "#d7fff7" : "rgba(183, 207, 201, 0.3)"));
      ctx.lineWidth = isSelected || isHovered ? 3 : 1.25;
      ctx.stroke();
    });

    tracePolygon(outline);
    ctx.strokeStyle = "rgba(208, 228, 221, 0.58)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawEdges() {
    ctx.save();
    ctx.setLineDash([3, 8]);
    ctx.lineCap = "round";
    edges.forEach((edge) => {
      const from = pointOf(edge.from);
      const to = pointOf(edge.to);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      const selectedEdge = selected && (edge.from === selected || edge.to === selected);
      ctx.strokeStyle = selectedEdge ? "rgba(181, 219, 211, 0.42)" : "rgba(113, 145, 143, 0.22)";
      ctx.lineWidth = selectedEdge ? 2 : 1.4;
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawTerritory(territory) {
    const center = pointOf(territory);
    const radius = radiusOf(territory);
    const faction = FACTIONS[territory.owner];

    ctx.save();
    const pulseScale = 1 + territory.pulse * 0.035;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius * 0.68 * pulseScale, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(8, 16, 18, 0.52)";
    ctx.fill();
    ctx.strokeStyle = faction.color;
    ctx.lineWidth = territory === selected ? 4 : 2.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(center.x, center.y, radius * 0.51, 0, Math.PI * 2);
    ctx.fillStyle = faction.dark;
    ctx.fill();

    const tickCount = 8;
    for (let index = 0; index < tickCount; index += 1) {
      const angle = (index / tickCount) * Math.PI * 2;
      const inner = radius * 0.71;
      const outer = radius * 0.8;
      ctx.beginPath();
      ctx.moveTo(center.x + Math.cos(angle) * inner, center.y + Math.sin(angle) * inner);
      ctx.lineTo(center.x + Math.cos(angle) * outer, center.y + Math.sin(angle) * outer);
      ctx.strokeStyle = `${faction.color}99`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (territory === selected) {
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius * 0.95, 0, Math.PI * 2);
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = FACTIONS[PLAYER].color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle = faction.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = "750 10px system-ui";
    ctx.fillText(territory.id, center.x, center.y - radius * 0.9);

    ctx.fillStyle = "#f4faf7";
    ctx.textBaseline = "middle";
    ctx.font = `800 ${Math.max(15, Math.min(24, radius * 0.56))}px system-ui`;
    ctx.fillText(String(territory.units), center.x, center.y + 1);
    ctx.restore();
  }

  function convoyPosition(convoy) {
    const from = pointOf(convoy.source);
    const to = pointOf(convoy.target);
    const raw = Math.max(0, Math.min(1, convoy.elapsed / convoy.duration));
    const progress = raw * raw * (3 - 2 * raw);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const offset = Math.min(38, distance * 0.11) * convoy.arcSign;
    const control = {
      x: (from.x + to.x) / 2 - (dy / distance) * offset,
      y: (from.y + to.y) / 2 + (dx / distance) * offset,
    };
    const inverse = 1 - progress;
    return {
      x: inverse * inverse * from.x + 2 * inverse * progress * control.x + progress * progress * to.x,
      y: inverse * inverse * from.y + 2 * inverse * progress * control.y + progress * progress * to.y,
    };
  }

  function drawConvoys() {
    convoys.forEach((convoy) => {
      const point = convoyPosition(convoy);
      const faction = FACTIONS[convoy.owner];
      const tokenRadius = convoy.amount >= 100 ? 15 : 13;

      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = 7;
      ctx.beginPath();
      ctx.arc(point.x, point.y, tokenRadius, 0, Math.PI * 2);
      ctx.fillStyle = faction.dark;
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = faction.color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 ${convoy.amount >= 100 ? 9 : 11}px system-ui`;
      ctx.fillText(String(convoy.amount), point.x, point.y + 0.5);
      ctx.restore();
    });
  }

  function drawCommand() {
    if (!selected || !pointer) return;
    const from = pointOf(selected);
    const target = hovered && hovered !== selected ? hovered : null;
    const to = target ? pointOf(target) : pointer;
    const valid = target && isConnected(selected, target);
    const color = valid ? FACTIONS[PLAYER].color : "#c8d5d1";
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const startDistance = radiusOf(selected) * 0.9;
    const endDistance = target ? radiusOf(target) * 1.02 : 4;
    const start = { x: from.x + Math.cos(angle) * startDistance, y: from.y + Math.sin(angle) * startDistance };
    const end = { x: to.x - Math.cos(angle) * endDistance, y: to.y - Math.sin(angle) * endDistance };

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash(valid ? [] : [6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - Math.cos(angle - 0.5) * 13, end.y - Math.sin(angle - 0.5) * 13);
    ctx.lineTo(end.x - Math.cos(angle + 0.5) * 13, end.y - Math.sin(angle + 0.5) * 13);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    drawBackground();
    drawMap();
    drawEdges();
    territories.forEach(drawTerritory);
    drawConvoys();
    drawCommand();

    if (paused && !ended) {
      ctx.fillStyle = "rgba(5, 10, 12, 0.48)";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#e6efeb";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "800 22px system-ui";
      ctx.fillText("战斗暂停", width / 2, height / 2);
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!paused && !ended) update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerDown(event) {
    if (paused || ended) return;
    pointer = pointerPosition(event);
    const territory = territoryAt(pointer.x, pointer.y);
    if (!territory || territory.owner !== PLAYER) {
      pointer = null;
      return;
    }
    selected = territory;
    hovered = territory;
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    const position = pointerPosition(event);
    const over = territoryAt(position.x, position.y);
    if (!selected) {
      canvas.style.cursor = over && over.owner === PLAYER ? "grab" : "crosshair";
      return;
    }
    pointer = position;
    hovered = over;
    canvas.style.cursor = "grabbing";
  }

  function onPointerUp(event) {
    if (!selected) return;
    const position = pointerPosition(event);
    const target = territoryAt(position.x, position.y);
    if (target && target !== selected) {
      if (isConnected(selected, target)) {
        if (!sendArmy(selected, target, PLAYER, 1, true)) showToast("兵力不足");
      } else {
        showToast("两地之间没有航线");
      }
    }
    selected = null;
    hovered = null;
    pointer = null;
    canvas.style.cursor = "crosshair";
  }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 1500);
  }

  function togglePause() {
    if (ended) return;
    paused = !paused;
    pauseBtn.textContent = paused ? "▶" : "Ⅱ";
    pauseBtn.title = paused ? "继续" : "暂停";
    pauseBtn.setAttribute("aria-label", paused ? "继续" : "暂停");
    battleState.textContent = paused ? "战斗已暂停" : "战斗进行中";
    lastFrame = performance.now();
  }

  function tone(frequency, duration, volume) {
    if (!soundOn) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch (_) {
      // Audio is optional and may be blocked until a user gesture.
    }
  }

  function updateSoundButton() {
    soundBtn.textContent = soundOn ? "♪" : "×";
    soundBtn.title = soundOn ? "关闭音效" : "开启音效";
    soundBtn.setAttribute("aria-label", soundBtn.title);
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  document.getElementById("restartBtn").addEventListener("click", () => loadLevel(currentLevel));
  document.getElementById("retryBtn").addEventListener("click", () => loadLevel(currentLevel));
  document.getElementById("nextBtn").addEventListener("click", (event) => {
    const won = event.currentTarget.dataset.won === "true";
    loadLevel(won ? (currentLevel + 1) % LEVELS.length : currentLevel);
  });
  pauseBtn.addEventListener("click", togglePause);
  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    GameCenter.storage.set(SOUND_KEY, soundOn);
    updateSoundButton();
    if (soundOn) tone(440, 0.08, 0.04);
  });
  speedBtn.addEventListener("click", () => {
    speed = speed === 1 ? 2 : 1;
    speedBtn.textContent = `${speed}×`;
  });
  levelSelect.addEventListener("change", () => loadLevel(Number(levelSelect.value)));
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !resultLayer.hidden) return;
    if (event.code === "Space") {
      event.preventDefault();
      togglePause();
    }
    if (event.key === "Escape" && selected) {
      selected = null;
      hovered = null;
      pointer = null;
    }
  });

  buildOceanMarks();
  populateLevelSelect();
  updateSoundButton();
  resizeCanvas();
  new ResizeObserver(resizeCanvas).observe(stage);
  loadLevel(0);
  requestAnimationFrame(frame);
})();
