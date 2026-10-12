(() => {
  "use strict";

  const PETS = ["🐶", "🐱", "🐰", "🦊", "🐸", "🐹", "🐼", "🐯"];
  const COLUMN_COUNT = 8;
  const ROW_COUNT = 12;
  const PETS_PER_KIND = 6;
  const INITIAL_REVEALED = 2;
  const ROUND_SECONDS = 300;

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
    return shuffle(deck);
  }

  function createColumns() {
    let columns;
    do {
      const deck = createDeck();
      columns = Array.from({ length: COLUMN_COUNT }, (_, index) =>
        deck.slice(index * PETS_PER_KIND, (index + 1) * PETS_PER_KIND)
      );
    } while (columns.some(isSingleKind));
    columns.forEach((column) => revealTop(column));
    return columns;
  }

  function createInitialState() {
    return {
      columns: createColumns(),
      score: 0,
      seconds: ROUND_SECONDS,
      removed: 0,
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
      removed: state.removed,
    });
    if (state.history.length > 30) state.history.shift();
  }

  function revealTop(column) {
    let revealed = 0;
    for (let index = column.length - 1; index >= 0; index -= 1) {
      if (revealed < INITIAL_REVEALED) {
        column[index].revealed = true;
        revealed += 1;
      }
    }
  }

  function isSingleKind(column) {
    return column.length > 0 && column.every((card) => card.pet === column[0].pet);
  }

  function getMove(sourceColumn, cardIndex) {
    const column = state.columns[sourceColumn];
    const card = column[cardIndex];
    if (!card || !card.revealed) return null;

    const pureColumn = isSingleKind(column);
    if (!pureColumn && cardIndex !== column.length - 1) return null;

    const cards = column.slice(cardIndex);
    if (cards.some((item) => !item.revealed)) return null;
    return { sourceColumn, cardIndex, cards };
  }

  function canMove(move, targetColumn) {
    if (!move || targetColumn === move.sourceColumn) return false;
    return state.columns[targetColumn].length + move.cards.length <= ROW_COUNT;
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
      if (isSingleKind(column)) columnEl.classList.add("pure-column");

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
  }

  function renderStats() {
    remainingEl.textContent = String(PETS.length * PETS_PER_KIND - state.removed);
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
      if (move && targetColumn !== move.sourceColumn) setStatus("目标列没有足够空位");
      selected = null;
      renderBoard();
      return false;
    }

    saveHistory();
    const source = state.columns[move.sourceColumn];
    const movedCards = source.splice(move.cardIndex);
    movedCards.forEach((card) => { card.revealed = true; });
    state.columns[targetColumn].push(...movedCards);
    revealTop(source);
    selected = null;
    render();
    setStatus(`已移动 ${movedCards.length} 个 ${movedCards[0].pet}`);
    checkCompletedColumns();
    return true;
  }

  function completedColumnIndexes() {
    return state.columns
      .map((column, index) => ({ column, index }))
      .filter(({ column }) =>
        column.length === PETS_PER_KIND &&
        ROW_COUNT - column.length >= column.length &&
        isSingleKind(column)
      )
      .map(({ index }) => index);
  }

  function checkCompletedColumns() {
    const completed = completedColumnIndexes();
    if (completed.length === 0) return;

    locked = true;
    completed.forEach((index) => {
      const el = boardEl.querySelector(`[data-column="${index}"]`);
      if (el) el.classList.add("clearing");
    });
    setStatus(`整理完成 ${completed.length} 列，整列移出！`);

    window.setTimeout(() => {
      completed.forEach((index) => {
        state.removed += state.columns[index].length;
        state.columns[index] = [];
        state.score += 600;
      });
      locked = false;
      render();
      if (state.removed === PETS.length * PETS_PER_KIND) {
        finish(true, "所有萌宠都整理完成了");
      }
    }, 430);
  }

  function useUndo() {
    if (locked || state.ended || state.history.length === 0) return;
    const previous = state.history.pop();
    state.columns = cloneColumns(previous.columns);
    state.score = previous.score;
    state.removed = previous.removed;
    selected = null;
    render();
    setStatus("已撤回上一步");
  }

  function useShuffle() {
    if (locked || state.ended) return;
    saveHistory();
    const cards = shuffle(state.columns.flat().map((card) => ({ ...card, revealed: false })));
    const lengths = state.columns.map((column) => column.length);
    let cursor = 0;
    state.columns = lengths.map((length) => {
      const column = cards.slice(cursor, cursor + length);
      cursor += length;
      revealTop(column);
      return column;
    });
    selected = null;
    render();
    setStatus("棋盘上的方块已重新打乱");
    checkCompletedColumns();
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
    nextCardId = 1;
    state = createInitialState();
    selected = null;
    pointerAction = null;
    locked = false;
    lastTick = Date.now();
    hideOverlay();
    render();
    setStatus("拖动明牌，把相同萌宠整理到一列");
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
      selectMove(Number(face.dataset.column), Number(face.dataset.index));
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
