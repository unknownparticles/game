(() => {
  "use strict";

  const PETS = ["🐶", "🐱", "🐰", "🦊", "🐸", "🐹", "🐼", "🐯"];
  const COLUMN_COUNT = 8;
  const ROW_COUNT = 12;
  const PETS_PER_KIND = 6;
  const INITIAL_REVEALED = 1;
  const ROUND_SECONDS = 300;
  const MOVE_SETTLE_MS = 240;
  const MAX_LAYOUT_ATTEMPTS = 60;
  const MIN_SCRAMBLED_COLUMN = 2;
  const MAX_SCRAMBLED_COLUMN = 10;

  const boardEl = document.getElementById("board");
  const remainingEl = document.getElementById("remaining");
  const scoreEl = document.getElementById("score");
  const statusEl = document.getElementById("status");
  const timerEl = document.getElementById("timer");
  const shuffleBtn = document.getElementById("shuffleBtn");
  const undoBtn = document.getElementById("undoBtn");
  const dragGhostEl = document.getElementById("dragGhost");
  const overlayEl = document.getElementById("overlay");
  const overlayTitleEl = document.getElementById("overlayTitle");
  const overlayTextEl = document.getElementById("overlayText");
  const dialogPetEl = document.getElementById("dialogPet");
  const dialogMainBtn = document.getElementById("dialogMainBtn");

  let state;
  let timerId;
  let lastTick;
  let overlayMode = "pause";
  let selected = null;
  let pointerAction = null;
  let ignoreClick = false;
  let locked = false;
  let transitionToken = 0;
  let newlyRevealedCardIds = new Set();
  let nextCardId = 1;

  function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function createDeck() {
    const deck = [];
    PETS.forEach((pet) => {
      for (let i = 0; i < PETS_PER_KIND; i += 1) {
        deck.push({ id: nextCardId, pet, revealed: false });
        nextCardId += 1;
      }
    });
    return deck;
  }

  function topRunLength(column) {
    if (column.length === 0) return 0;
    const pet = column[column.length - 1].pet;
    let length = 0;
    for (let index = column.length - 1; index >= 0 && column[index].pet === pet; index -= 1) {
      length += 1;
    }
    return length;
  }

  function isSingleKind(column) {
    return column.length > 0 && column.every((card) => card.pet === column[0].pet);
  }

  function isCompletedColumn(column) {
    return column.length === PETS_PER_KIND && isSingleKind(column);
  }

  function createSolvedColumns(cards, columnCount) {
    const groups = new Map();
    cards.forEach((card) => {
      if (!groups.has(card.pet)) groups.set(card.pet, []);
      groups.get(card.pet).push({ ...card, revealed: false });
    });
    if (groups.size !== columnCount) return null;
    if ([...groups.values()].some((group) => group.length !== PETS_PER_KIND)) return null;
    return shuffle([...groups.values()]).map((group) => shuffle(group));
  }

  function hasValidReverseSolution(layout, reverseMoves) {
    const columns = cloneColumns(layout);
    const completed = new Set();

    for (let index = reverseMoves.length - 1; index >= 0; index -= 1) {
      const move = reverseMoves[index];
      const sourceIndex = move.target;
      const targetIndex = move.source;
      const source = columns[sourceIndex];
      const target = columns[targetIndex];
      if (completed.has(sourceIndex) || completed.has(targetIndex)) return false;
      if (source.length < move.count || target.length + move.count > ROW_COUNT) return false;

      const cards = source.slice(source.length - move.count);
      const targetTop = target[target.length - 1];
      if (cards.some((card) => card.pet !== move.pet)) return false;
      if (targetTop && targetTop.pet !== move.pet) return false;
      target.push(...source.splice(source.length - move.count));

      columns.forEach((column, columnIndex) => {
        if (isCompletedColumn(column)) completed.add(columnIndex);
      });
    }

    return completed.size === columns.length;
  }

  // Start with solved columns and apply reversible splits. Replaying the splits
  // backwards always uses the same-top rule and leads back to locked columns.
  function createSolvableLayout(cards, columnCount) {
    for (let attempt = 0; attempt < MAX_LAYOUT_ATTEMPTS; attempt += 1) {
      const columns = createSolvedColumns(cards, columnCount);
      if (!columns) return null;
      const reverseMoves = [];
      const targetSteps = Math.max(12, columnCount * 8);

      for (let step = 0; step < targetSteps; step += 1) {
        const candidates = [];
        columns.forEach((source, sourceIndex) => {
          const runLength = topRunLength(source);
          columns.forEach((target, targetIndex) => {
            if (sourceIndex === targetIndex) return;
            const maxCount = Math.min(
              runLength - 1,
              source.length - MIN_SCRAMBLED_COLUMN,
              MAX_SCRAMBLED_COLUMN - target.length
            );
            if (maxCount < 1) return;
            const sourcePet = source[source.length - 1].pet;
            const targetTop = target[target.length - 1];
            candidates.push({
              source: sourceIndex,
              target: targetIndex,
              maxCount,
              pet: sourcePet,
              mixesKinds: !targetTop || targetTop.pet !== sourcePet,
            });
          });
        });

        if (candidates.length === 0) break;
        const mixedCandidates = candidates.filter((candidate) => candidate.mixesKinds);
        const pool = mixedCandidates.length ? mixedCandidates : candidates;
        const candidate = pool[Math.floor(Math.random() * pool.length)];
        const count = 1 + Math.floor(Math.random() * candidate.maxCount);
        const source = columns[candidate.source];
        columns[candidate.target].push(...source.splice(source.length - count));
        reverseMoves.push({ ...candidate, count });
      }

      const mixedEnough = reverseMoves.length >= Math.max(4, columnCount * 2);
      if (!mixedEnough || columns.some(isCompletedColumn)) continue;
      if (hasValidReverseSolution(columns, reverseMoves)) return columns;
    }
    return null;
  }

  function createFallbackLayout(cards, columnCount) {
    const columns = createSolvedColumns(cards, columnCount);
    if (!columns || columnCount < 2) return columns;

    let cursor = 0;
    while (columnCount - cursor > 0) {
      const remaining = columnCount - cursor;
      const groupSize = remaining === 3 ? 3 : 2;
      const targetIndex = cursor + 1;
      for (let offset = 0; offset < groupSize; offset += 1) {
        const sourceIndex = cursor + offset;
        if (sourceIndex === targetIndex) continue;
        columns[targetIndex].push(...columns[sourceIndex].splice(-2));
      }
      cursor += groupSize;
    }
    return columns;
  }

  function createColumns() {
    const deck = createDeck();
    const columns = createSolvableLayout(deck, COLUMN_COUNT) || createFallbackLayout(deck, COLUMN_COUNT);
    if (!columns || columns.some(isCompletedColumn)) {
      throw new Error("Unable to create a solvable pet layout");
    }
    columns.forEach((column) => revealTop(column));
    return columns;
  }

  function createInitialState() {
    return {
      columns: createColumns(),
      score: 0,
      seconds: ROUND_SECONDS,
      completedCards: 0,
      completedColumns: Array(COLUMN_COUNT).fill(false),
      ended: false,
      paused: false,
      history: [],
    };
  }

  function cloneColumns(columns) {
    return columns.map((column) => column.map((card) => ({ ...card })));
  }

  function saveHistory() {
    state.history.push({
      columns: cloneColumns(state.columns),
      score: state.score,
      completedCards: state.completedCards,
      completedColumns: [...state.completedColumns],
    });
    if (state.history.length > 30) state.history.shift();
  }

  function revealTop(column) {
    let visibleSlots = 0;
    for (let index = column.length - 1; index >= 0 && visibleSlots < INITIAL_REVEALED; index -= 1) {
      if (!column[index].revealed) {
        column[index].revealed = true;
        newlyRevealedCardIds.add(column[index].id);
      }
      visibleSlots += 1;
    }
  }

  function getMove(sourceColumn, cardIndex) {
    const column = state.columns[sourceColumn];
    const card = column && column[cardIndex];
    if (!card || !card.revealed || state.completedColumns[sourceColumn]) return null;

    const cards = column.slice(cardIndex);
    if (cards.some((item) => !item.revealed || item.pet !== card.pet)) return null;
    return { sourceColumn, cardIndex, cards };
  }

  function canMove(move, targetColumn) {
    if (!move || targetColumn === move.sourceColumn || state.completedColumns[targetColumn]) return false;
    const target = state.columns[targetColumn];
    if (!target || target.length + move.cards.length > ROW_COUNT) return false;
    const targetTop = target[target.length - 1];
    return !targetTop || targetTop.pet === move.cards[0].pet;
  }

  function invalidMoveMessage(move, targetColumn) {
    if (state.completedColumns[targetColumn]) return "已完成的列不能再移动";
    const target = state.columns[targetColumn];
    if (target && target.length + move.cards.length > ROW_COUNT) return "目标列没有足够空位";
    return "只能叠放到空列或顶部相同的萌宠上";
  }

  function setStatus(message) {
    statusEl.textContent = message;
    statusEl.classList.remove("bump");
    void statusEl.offsetWidth;
    statusEl.classList.add("bump");
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    state.columns.forEach((column, columnIndex) => {
      const columnEl = document.createElement("div");
      columnEl.className = "column";
      columnEl.dataset.column = String(columnIndex);
      columnEl.setAttribute("aria-label", `第 ${columnIndex + 1} 列，${column.length} 个方块`);
      if (state.completedColumns[columnIndex]) {
        columnEl.classList.add("completed-column");
        columnEl.setAttribute("aria-label", `第 ${columnIndex + 1} 列，已整理完成`);
      }

      const selectedMove = selected && selected.sourceColumn !== columnIndex ? selected : null;
      if (selectedMove) {
        columnEl.classList.add(canMove(selectedMove, columnIndex) ? "drop-target" : "invalid-target");
      }

      for (let row = 0; row < ROW_COUNT; row += 1) {
        const stackIndex = ROW_COUNT - 1 - row;
        const card = column[stackIndex];
        if (!card) {
          const empty = document.createElement("span");
          empty.className = "cell empty";
          empty.setAttribute("aria-hidden", "true");
          columnEl.appendChild(empty);
          continue;
        }

        if (!card.revealed) {
          const hidden = document.createElement("span");
          hidden.className = "cell filled hidden-card";
          hidden.textContent = "?";
          hidden.setAttribute("aria-label", "未翻开的方块");
          columnEl.appendChild(hidden);
          continue;
        }

        const move = getMove(columnIndex, stackIndex);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "cell filled face";
        if (newlyRevealedCardIds.has(card.id)) button.classList.add("revealing");
        button.textContent = card.pet;
        button.dataset.column = String(columnIndex);
        button.dataset.index = String(stackIndex);
        button.setAttribute("aria-label", `${card.pet}，第 ${columnIndex + 1} 列`);
        if (!move) button.disabled = true;
        if (move && move.cards.length > 1) {
          button.classList.add("movable-group");
          button.dataset.count = String(move.cards.length);
          button.setAttribute("aria-label", `${card.pet}，可一起移动 ${move.cards.length} 个`);
        }
        if (selected && selected.sourceColumn === columnIndex && selected.cardIndex === stackIndex) {
          button.classList.add("selected");
        }
        columnEl.appendChild(button);
      }

      boardEl.appendChild(columnEl);
    });
    newlyRevealedCardIds.clear();
  }

  function renderStats() {
    remainingEl.textContent = String(PETS.length * PETS_PER_KIND - state.completedCards);
    scoreEl.textContent = String(state.score);
    undoBtn.disabled = state.history.length === 0 || state.ended || locked;
    shuffleBtn.disabled = state.ended || locked;
    renderTimer();
  }

  function renderTimer() {
    const minutes = Math.floor(state.seconds / 60);
    const seconds = state.seconds % 60;
    timerEl.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    timerEl.classList.toggle("urgent", state.seconds <= 30);
  }

  function render() {
    renderBoard();
    renderStats();
  }

  function selectMove(sourceColumn, cardIndex) {
    const move = getMove(sourceColumn, cardIndex);
    if (!move || locked || state.ended || state.paused) return;
    selected = move;
    renderBoard();
    setStatus(move.cards.length > 1 ? `已选中 ${move.cards.length} 个 ${move.cards[0].pet}` : `已选中 ${move.cards[0].pet}`);
  }

  function performMove(move, targetColumn) {
    if (locked || state.ended || state.paused || !canMove(move, targetColumn)) {
      if (move && targetColumn !== move.sourceColumn) setStatus(invalidMoveMessage(move, targetColumn));
      selected = null;
      renderBoard();
      return false;
    }

    saveHistory();
    locked = true;
    const moveToken = ++transitionToken;
    const source = state.columns[move.sourceColumn];
    const movedCards = source.splice(move.cardIndex);
    state.columns[targetColumn].push(...movedCards);
    selected = null;
    render();
    const targetEl = boardEl.querySelector(`[data-column="${targetColumn}"]`);
    if (targetEl) targetEl.classList.add("receiving");
    setStatus(`正在移动 ${movedCards.length} 个 ${movedCards[0].pet}`);

    window.setTimeout(() => {
      if (moveToken !== transitionToken) return;
      revealTop(source);
      const completed = checkCompletedColumns();
      locked = false;
      render();
      completed.forEach((index) => {
        const columnEl = boardEl.querySelector(`[data-column="${index}"]`);
        if (columnEl) columnEl.classList.add("just-completed");
      });

      if (state.completedCards === PETS.length * PETS_PER_KIND) {
        finish(true, "所有萌宠都整理完成了");
      } else if (completed.length > 0) {
        setStatus(`整理完成 ${completed.length} 列，已固定`);
      } else {
        setStatus(`已移动 ${movedCards.length} 个 ${movedCards[0].pet}`);
      }
    }, MOVE_SETTLE_MS);
    return true;
  }

  function checkCompletedColumns() {
    const completed = [];
    state.columns.forEach((column, index) => {
      if (state.completedColumns[index] || !isCompletedColumn(column)) return;
      state.completedColumns[index] = true;
      state.completedCards += column.length;
      state.score += 600;
      column.forEach((card) => {
        if (!card.revealed) newlyRevealedCardIds.add(card.id);
        card.revealed = true;
      });
      completed.push(index);
    });
    return completed;
  }

  function useUndo() {
    if (locked || state.ended || state.history.length === 0) return;
    const previous = state.history.pop();
    state.columns = cloneColumns(previous.columns);
    state.score = previous.score;
    state.completedCards = previous.completedCards;
    state.completedColumns = [...previous.completedColumns];
    selected = null;
    render();
    setStatus("已撤回上一步");
  }

  function useShuffle() {
    if (locked || state.ended) return;
    const columnIndexes = state.columns
      .map((_, index) => index)
      .filter((index) => !state.completedColumns[index]);
    const cards = columnIndexes.flatMap((index) =>
      state.columns[index].map((card) => ({ ...card, revealed: false }))
    );
    const shuffledColumns = createSolvableLayout(cards, columnIndexes.length)
      || createFallbackLayout(cards, columnIndexes.length);
    if (!shuffledColumns) {
      setStatus("未找到新的可解布局，请继续当前棋盘");
      return;
    }

    saveHistory();
    columnIndexes.forEach((columnIndex, index) => {
      state.columns[columnIndex] = shuffledColumns[index];
      revealTop(state.columns[columnIndex]);
    });
    selected = null;
    const completed = checkCompletedColumns();
    render();
    if (state.completedCards === PETS.length * PETS_PER_KIND) {
      finish(true, "所有萌宠都整理完成了");
    } else if (completed.length > 0) {
      setStatus(`整理完成 ${completed.length} 列，已固定`);
    } else {
      setStatus("未完成的列已重新打乱，并确认可以完成");
    }
  }

  function tick() {
    if (state.paused || state.ended) return;
    const now = Date.now();
    if (now - lastTick < 900) return;
    state.seconds = Math.max(0, state.seconds - 1);
    lastTick = now;
    renderTimer();
    if (state.seconds === 0) finish(false, "倒计时结束了");
  }

  function showOverlay(mode, reason = "") {
    overlayMode = mode;
    overlayEl.classList.remove("hidden");
    if (mode === "pause") {
      overlayTitleEl.textContent = "暂停中";
      overlayTextEl.textContent = "休息一下，萌宠们会在这里等你。";
      dialogPetEl.textContent = "🐶";
      dialogMainBtn.textContent = "继续游戏";
    } else if (mode === "win") {
      overlayTitleEl.textContent = "整理完成！";
      overlayTextEl.textContent = `得分 ${state.score}，剩余时间 ${formatTime(state.seconds)}。`;
      dialogPetEl.textContent = "🎉";
      dialogMainBtn.textContent = "再玩一局";
    } else {
      overlayTitleEl.textContent = "时间到";
      overlayTextEl.textContent = `${reason}，再调整一下移动顺序。`;
      dialogPetEl.textContent = "🐹";
      dialogMainBtn.textContent = "重新开始";
    }
  }

  function hideOverlay() {
    overlayEl.classList.add("hidden");
  }

  function togglePause() {
    if (state.ended) return;
    state.paused = !state.paused;
    selected = null;
    if (state.paused) {
      renderBoard();
      showOverlay("pause");
    } else {
      hideOverlay();
      lastTick = Date.now();
    }
  }

  function finish(won, reason) {
    if (state.ended) return;
    state.ended = true;
    state.paused = false;
    selected = null;
    renderStats();
    showOverlay(won ? "win" : "lose", reason);
  }

  function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function startGame() {
    transitionToken += 1;
    newlyRevealedCardIds.clear();
    nextCardId = 1;
    state = createInitialState();
    selected = null;
    pointerAction = null;
    locked = false;
    lastTick = Date.now();
    hideOverlay();
    render();
    setStatus("拖动顶部同种萌宠，叠放到相同萌宠上");
  }

  function positionGhost(event) {
    dragGhostEl.style.left = `${event.clientX}px`;
    dragGhostEl.style.top = `${event.clientY}px`;
  }

  function showDragGhost(move, event) {
    dragGhostEl.innerHTML = "";
    move.cards.forEach((card) => {
      const ghostCard = document.createElement("span");
      ghostCard.className = "ghost-card";
      ghostCard.textContent = card.pet;
      dragGhostEl.appendChild(ghostCard);
    });
    dragGhostEl.classList.remove("hidden");
    positionGhost(event);
  }

  function hideDragGhost() {
    dragGhostEl.classList.add("hidden");
    dragGhostEl.innerHTML = "";
    boardEl.querySelectorAll(".drop-target, .invalid-target").forEach((element) => {
      element.classList.remove("drop-target", "invalid-target");
    });
  }

  function columnAtPoint(x, y) {
    const element = document.elementFromPoint(x, y);
    const column = element && element.closest(".column");
    return column ? Number(column.dataset.column) : null;
  }

  function highlightDragTarget(move, targetColumn) {
    boardEl.querySelectorAll(".drop-target, .invalid-target").forEach((element) => {
      element.classList.remove("drop-target", "invalid-target");
    });
    if (targetColumn == null || targetColumn === move.sourceColumn) return;
    const target = boardEl.querySelector(`[data-column="${targetColumn}"]`);
    if (target) target.classList.add(canMove(move, targetColumn) ? "drop-target" : "invalid-target");
  }

  boardEl.addEventListener("pointerdown", (event) => {
    const card = event.target.closest(".cell.face:not(:disabled)");
    if (!card || locked || state.ended || state.paused) return;
    const move = getMove(Number(card.dataset.column), Number(card.dataset.index));
    if (!move) return;
    pointerAction = {
      move,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
    card.setPointerCapture(event.pointerId);
  });

  boardEl.addEventListener("pointermove", (event) => {
    if (!pointerAction || pointerAction.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - pointerAction.startX, event.clientY - pointerAction.startY);
    if (!pointerAction.dragging && distance > 6) {
      pointerAction.dragging = true;
      selected = null;
      showDragGhost(pointerAction.move, event);
    }
    if (!pointerAction.dragging) return;
    event.preventDefault();
    positionGhost(event);
    highlightDragTarget(pointerAction.move, columnAtPoint(event.clientX, event.clientY));
  });

  function endPointerAction(event) {
    if (!pointerAction || pointerAction.pointerId !== event.pointerId) return;
    const action = pointerAction;
    pointerAction = null;
    ignoreClick = true;
    window.setTimeout(() => { ignoreClick = false; }, 0);
    if (action.dragging) {
      const targetColumn = columnAtPoint(event.clientX, event.clientY);
      hideDragGhost();
      if (targetColumn != null) performMove(action.move, targetColumn);
      else setStatus("请拖到棋盘中的目标列");
    } else if (selected && selected.sourceColumn !== action.move.sourceColumn) {
      performMove(selected, action.move.sourceColumn);
    } else {
      selectMove(action.move.sourceColumn, action.move.cardIndex);
    }
  }

  boardEl.addEventListener("pointerup", endPointerAction);
  boardEl.addEventListener("pointercancel", (event) => {
    if (!pointerAction || pointerAction.pointerId !== event.pointerId) return;
    pointerAction = null;
    hideDragGhost();
  });

  boardEl.addEventListener("click", (event) => {
    if (ignoreClick || locked || state.ended || state.paused) return;
    const face = event.target.closest(".cell.face:not(:disabled)");
    if (face) {
      const targetColumn = Number(face.dataset.column);
      if (selected && selected.sourceColumn !== targetColumn) {
        performMove(selected, targetColumn);
      } else {
        selectMove(targetColumn, Number(face.dataset.index));
      }
      return;
    }
    if (!selected) return;
    const target = event.target.closest(".column");
    if (target) performMove(selected, Number(target.dataset.column));
  });

  document.getElementById("restartBtn").addEventListener("click", startGame);
  document.getElementById("pauseBtn").addEventListener("click", togglePause);
  document.getElementById("dialogHomeBtn").addEventListener("click", () => GameCenter.goHome());
  dialogMainBtn.addEventListener("click", () => {
    if (overlayMode === "pause") togglePause();
    else startGame();
  });
  shuffleBtn.addEventListener("click", useShuffle);
  undoBtn.addEventListener("click", useUndo);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && !state.ended && !state.paused) togglePause();
  });

  timerId = window.setInterval(tick, 250);
  window.addEventListener("beforeunload", () => window.clearInterval(timerId));
  startGame();
})();
