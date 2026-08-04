// =======================
// 本地存储
// =======================

const SAVE_KEY = "picross_save";

const RECORD_KEY = "picross_records";

function saveGame(data) {
  localStorage.setItem(
    SAVE_KEY,

    JSON.stringify(data),
  );
}

function loadGame() {
  let data = localStorage.getItem(SAVE_KEY);

  if (!data) return null;

  return JSON.parse(data);
}

function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

// =======================
// 排行榜
// =======================

function saveRecord(record) {
  let list = JSON.parse(localStorage.getItem(RECORD_KEY) || "[]");

  list.push(record);

  list.sort((a, b) => a.time - b.time);

  localStorage.setItem(
    RECORD_KEY,

    JSON.stringify(list.slice(0, 50)),
  );
}

function getRecords() {
  return JSON.parse(localStorage.getItem(RECORD_KEY) || "[]");
}

function renderRank() {
  let box = document.getElementById("rankList");

  let list = getRecords();

  box.innerHTML = "";

  if (list.length == 0) {
    box.innerHTML = "暂无记录";

    return;
  }

  list.forEach((r, i) => {
    let div = document.createElement("div");

    div.className = "level-card";

    div.innerHTML = `

<h3>
第 ${i + 1} 名
</h3>

<p>
关卡:
${r.level}
</p>


<p>
时间:
${formatTime(r.time)}
</p>


<p>
星级:
${"⭐".repeat(r.star)}
</p>

`;

    box.appendChild(div);
  });
}

// formatTime 函数已在 game.js 中定义
