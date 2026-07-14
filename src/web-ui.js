// web 控制台前端 —— 單一自帶 HTML（零 CDN、零框架），由 server.js 直接回傳。
// 安全：所有動態內容一律走 textContent，不用 innerHTML 塞資料（防 XSS）。
// 注意：客戶端 JS 刻意不用反引號與 ${}，避免和這個外層 template literal 打架。
export const WEB_UI = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>agentbaton 控制台</title>
<style>
:root{
  --bg:#f5f6f8; --card:#ffffff; --ink:#1c2128; --ink2:#57606a; --line:#d8dee4;
  --accent:#0e7a8a; --ok:#2da160; --warn:#c08a1f; --bad:#cf4a44;
  --claude:#c6763b; --codex:#2f8c6c; --grok:#5a6472; --cursor:#4a72b0;
}
@media (prefers-color-scheme:dark){
  :root{ --bg:#0f1319; --card:#171d26; --ink:#e6ebf1; --ink2:#9aa6b2; --line:#2a3340;
    --accent:#3fb3c4; --ok:#46c380; --warn:#d6a84a; --bad:#e0665e;
    --claude:#d98b4f; --codex:#41a783; --grok:#7a8494; --cursor:#6a93d0; }
}
*{box-sizing:border-box} body{margin:0;font:15px/1.6 system-ui,"Segoe UI","Microsoft JhengHei",sans-serif;background:var(--bg);color:var(--ink);padding:16px}
h1{font-size:19px;margin:0} h2{font-size:15px;margin:0 0 10px}
.wrap{max-width:1180px;margin:0 auto;display:grid;gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media (max-width:900px){.grid{grid-template-columns:1fr}}
.pill{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:20px;padding:2px 10px;font-size:12.5px;color:var(--ink2)}
.dot{width:8px;height:8px;border-radius:50%} .dot.ok{background:var(--ok)} .dot.warn{background:var(--warn)} .dot.bad{background:var(--bad)}
/* 狀態卡：一家一列、橫向長條，橫跨整個寬度 */
.pcards{display:flex;flex-direction:column;gap:8px}
.pcard{border:1px solid var(--line);border-radius:10px;padding:12px 16px;background:linear-gradient(90deg,var(--card),var(--bg));transition:border-color .15s;display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.pcard:hover{border-color:var(--accent)}
.pcard .name{font-weight:600;display:flex;align-items:center;gap:8px;min-width:150px;flex:0 0 auto}
.pcard .tile{width:26px;height:26px;border-radius:6px;color:#fff;display:grid;place-items:center;font-size:13px;font-weight:700}
.pcard .meta{font-size:13px;color:var(--ink2);line-height:1.5;display:flex;align-items:center;gap:16px;flex:1;flex-wrap:wrap}
.pcard .meta .sep{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.banner{border-left:3px solid var(--accent);padding:8px 12px;background:var(--bg);border-radius:0 8px 8px 0;font-size:13.5px}
/* 「目前正在處理什麼」訊息框：大、醒目、常駐感 */
.busybar{display:flex;align-items:center;gap:12px;padding:16px 20px;border-radius:12px;font-size:16px;font-weight:600;
  background:linear-gradient(90deg,rgba(88,166,255,.16),rgba(88,166,255,.04));border:1px solid var(--accent);color:var(--ink);box-shadow:0 2px 12px rgba(88,166,255,.15)}
.busybar.idle{background:var(--card);border-color:var(--line);color:var(--ink2);font-weight:500;box-shadow:none}
.busybar .spin{width:18px;height:18px;border-width:3px}
/* 執行中任務可摺疊區塊 */
.runblk{width:100%;margin-top:8px;border:1px solid var(--accent);border-radius:8px;overflow:hidden;background:rgba(88,166,255,.06)}
.runhead{display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;font-size:13px;font-weight:600;color:var(--accent);user-select:none}
.runhead:hover{background:rgba(88,166,255,.10)}
.runarrow{font-size:10px;flex:0 0 auto}
.runtitle{flex:1;white-space:normal;word-break:break-word}
.runbody{padding:10px 12px;border-top:1px solid var(--line);font-size:12.5px;line-height:1.6;color:var(--ink2);max-height:360px;overflow:auto}
.livetitle{font-size:11px;font-weight:700;color:var(--accent);letter-spacing:.5px;margin-bottom:4px}
.livebox{white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.55;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:8px 10px}
.livebox.dim{color:var(--ink2);opacity:.7;font-style:italic;font-family:inherit}
textarea,input[type=text],select{width:100%;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit}
textarea{min-height:88px;resize:vertical}
button{background:var(--accent);color:#fff;border:0;border-radius:8px;padding:8px 16px;font:inherit;cursor:pointer}
button.sec{background:transparent;color:var(--accent);border:1px solid var(--accent)}
button:disabled{opacity:.5;cursor:not-allowed}
label{font-size:12.5px;color:var(--ink2)}
.field{display:flex;flex-direction:column;gap:4px;min-width:130px;flex:1}
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:10px}
.tabs button{background:transparent;color:var(--ink2);border:0;border-bottom:2px solid transparent;border-radius:0;padding:6px 12px}
.tabs button.on{color:var(--ink);border-bottom-color:var(--accent);font-weight:600}
pre{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px;font-size:12.5px;white-space:pre-wrap;word-break:break-word;max-height:460px;overflow:auto}
.msgs{display:flex;flex-direction:column;gap:8px;max-height:380px;overflow:auto;padding:4px}
.msg{border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:13.5px;max-width:88%;white-space:pre-wrap;word-break:break-word}
.msg.user{align-self:flex-end;background:var(--bg)}
.msg .who{font-size:11.5px;color:var(--ink2);margin-bottom:2px}
.skill{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px}
.skill .n{font-weight:600;font-size:13.5px}.skill .d{font-size:12.5px;color:var(--ink2);margin:4px 0}
.effwrap{display:flex;align-items:center;gap:10px}
input[type=range]{flex:1;accent-color:var(--accent)}
.result{margin-top:10px;display:none}
.small{font-size:12px;color:var(--ink2)}
.spin{display:inline-block;width:14px;height:14px;border:2px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:sp 1s linear infinite;vertical-align:-2px}
@keyframes sp{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="row" style="justify-content:space-between">
      <div class="row"><h1>agentbaton 控制台</h1><span class="small" id="proj"></span></div>
      <div class="row" id="doctorPills"></div>
      <div class="row">
        <button class="sec" id="btnDoctor">重新檢查登入</button>
      </div>
    </div>
  </div>

  <div id="busyBanner" class="busybar idle"></div>

  <div class="card">
    <h2>四家狀態（額度／冷卻／用量）</h2>
    <div class="pcards" id="pcards"></div>
  </div>

  <div class="grid">
    <div class="card">
      <h2>派工</h2>
      <textarea id="task" placeholder="要團隊做什麼？（會自動注入共享記憶，接手的家知道前面做到哪）"></textarea>
      <div class="row" style="margin-top:8px">
        <div class="field"><label>指名（子代理）</label><select id="only"><option value="">自動（依策略選家）</option><option>claude</option><option>codex</option><option>grok</option><option>cursor</option></select></div>
        <div class="field"><label>任務鏈</label><select id="chain"></select></div>
        <div class="field"><label>策略</label><select id="strategy"><option value="balance">balance 均攤</option><option value="priority">priority 依鏈</option></select></div>
      </div>
      <div class="row" style="margin-top:8px">
        <div class="field"><label>claude 模型</label><input type="text" id="m-claude" list="dl-claude" placeholder="載入中…"><datalist id="dl-claude"></datalist></div>
        <div class="field"><label>codex 模型</label><input type="text" id="m-codex" list="dl-codex" placeholder="載入中…"><datalist id="dl-codex"></datalist></div>
        <div class="field"><label>grok 模型</label><input type="text" id="m-grok" list="dl-grok" placeholder="載入中…"><datalist id="dl-grok"></datalist></div>
        <div class="field"><label>cursor 模型</label><input type="text" id="m-cursor" list="dl-cursor" placeholder="載入中…"><datalist id="dl-cursor"></datalist></div>
      </div>
      <div class="small" style="margin-top:4px">留空＝用該家預設（顯示在提示字）；點欄位可從帳號的完整模型清單挑，也可手打 id。</div>
      <div class="row" style="margin-top:8px">
        <div class="field" style="flex:2">
          <label>強度 Effort：<b id="effLabel">預設</b>（Faster ↔ Smarter）</label>
          <div class="effwrap"><span class="small">快</span><input type="range" id="effort" min="0" max="4" step="1" value="0"><span class="small">聰明</span></div>
        </div>
        <button id="btnGo" style="align-self:end">派工</button>
      </div>
      <div class="result card" id="resultBox"><div class="small" id="resultMeta"></div><pre id="resultText" style="max-height:300px"></pre></div>
    </div>

    <div class="card">
      <div class="tabs">
        <button class="on" data-tab="chat">對話</button>
        <button data-tab="mission">任務書</button>
        <button data-tab="docs">紀錄</button>
        <button data-tab="skills">技能</button>
      </div>
      <div id="tab-mission" style="display:none">
        <div class="small" style="margin-bottom:8px">給一個資料夾＋一份規劃書 → 總指揮（Agent OS 思考）產出「完成目標＋任務清單」→ 你確認後才逐項執行；額度滿自動換手接續，紀錄寫進作業區。</div>
        <div class="row">
          <div class="field" style="flex:2"><label>作業區資料夾</label>
            <div class="row" style="flex-wrap:nowrap;gap:6px">
              <input type="text" id="mWorkdir" placeholder="點「瀏覽」選資料夾，或直接貼絕對路徑" style="flex:1">
              <button class="sec" id="fsBrowse" style="white-space:nowrap">瀏覽…</button>
            </div>
          </div>
          <div class="field"><label>總指揮</label><select id="mChief"><option>claude</option><option>codex</option><option>grok</option><option>cursor</option></select></div>
          <div class="field" style="max-width:100px"><label title="總指揮最多能拆出幾個任務的硬上限——防止無限拆解、無限執行燒光額度；超過會被截斷。小專案可調低。">任務上限 ⓘ</label><input type="text" id="mMax" value="12" title="總指揮最多能拆出幾個任務（防無限執行）"></div>
        </div>
        <div id="fsPanel" style="display:none;border:1px solid var(--line);border-radius:10px;padding:10px;margin-top:8px">
          <div class="row" style="justify-content:space-between">
            <div class="small" id="fsPath" style="word-break:break-all">（選擇磁碟機）</div>
            <div class="row" style="flex-wrap:nowrap">
              <button class="sec" id="fsUp">↑ 上一層</button>
              <button id="fsSelect">✓ 就用這個資料夾</button>
              <button class="sec" id="fsClose">關閉</button>
            </div>
          </div>
          <div id="fsList" style="max-height:190px;overflow:auto;margin-top:8px;display:flex;flex-wrap:wrap;gap:6px"></div>
          <div class="row" style="margin-top:8px;flex-wrap:nowrap">
            <input type="text" id="fsNewName" placeholder="在目前位置建立新資料夾…" style="flex:1">
            <button class="sec" id="fsMk">建立</button>
          </div>
        </div>
        <div class="field" style="margin-top:8px">
          <label>規劃書（要做什麼、目標、限制）　<button class="sec" id="mImport" style="padding:1px 10px;font-size:12px">匯入檔案…</button></label>
          <input type="file" id="mFile" accept=".md,.txt,.markdown,text/plain" style="display:none">
          <textarea id="mPlanDoc" style="min-height:110px" placeholder="貼上規劃書內容，或用「匯入檔案」載入 .md / .txt…"></textarea>
        </div>
        <div class="row" style="margin-top:8px">
          <button id="mBtnPlan">① 產生規劃單</button>
          <button id="mBtnStart" class="sec" disabled>② 開始執行（勾選的任務）</button>
          <button id="mBtnStop" class="sec" disabled>停止</button>
        </div>
        <div id="mPlanBox" style="display:none;margin-top:10px">
          <div class="banner" style="margin-bottom:8px"><b>完成目標：</b><span id="mGoal"></span></div>
          <div id="mRisks" class="small" style="margin-bottom:6px"></div>
          <div id="mTaskList"></div>
          <pre id="mReport" style="display:none;margin-top:8px"></pre>
        </div>
      </div>
      <div id="tab-chat">
        <div class="msgs" id="msgs"></div>
        <div class="row" style="margin-top:8px">
          <input type="text" id="chatInput" placeholder="跟協作團隊說話（寫進共享記憶，換手不失憶）" style="flex:3">
          <select id="chatOnly" style="flex:1;min-width:110px"><option value="">自動選家</option><option>claude</option><option>codex</option><option>grok</option><option>cursor</option></select>
          <button id="btnChat">送出</button>
        </div>
      </div>
      <div id="tab-docs" style="display:none">
        <div class="row" style="margin-bottom:8px">
          <select id="docName" style="max-width:240px">
            <option>CONVERSATION_LOG</option><option>HANDOFF</option><option>DEV_LOG</option><option>LOG</option><option>TASKS</option><option>PLAN</option><option>ROADMAP</option>
          </select>
          <span class="small">檔案有變動會自動刷新</span>
        </div>
        <pre id="docContent">（載入中）</pre>
      </div>
      <div id="tab-skills" style="display:none">
        <div class="small" style="margin-bottom:8px">已安裝的技能——「帶入派工」會填好任務範本，由對應的家執行。</div>
        <div id="skillList"></div>
      </div>
    </div>
  </div>
</div>
<script>
var EFF = ['', 'low', 'medium', 'high', 'max'];
var EFF_LABEL = ['預設', 'low（最快）', 'medium', 'high', 'max（最聰明）'];
var CHAIN_DESC = {
  'default': '通用｜claude→codex→grok→cursor',
  'implement': '寫程式優先｜codex 先上，額度滿換 cursor→grok→claude',
  'review': '審查/挑錯優先｜claude 先上，換 grok→codex→cursor',
  'plan': '規劃/設計優先｜claude 先上，換 grok→cursor→codex'
};
var PCOLOR = { claude: 'var(--claude)', codex: 'var(--codex)', grok: 'var(--grok)', cursor: 'var(--cursor)' };
var state = null;
var modelDefaults = {}; // 各家「留空時實際會用」的預設模型（來自 /api/models）

function loadModels() {
  fetchJSON('/api/models').then(function (m) {
    ['claude', 'codex', 'grok', 'cursor'].forEach(function (n) {
      var info = m[n] || {};
      modelDefaults[n] = info.default || '';
      var dl = document.getElementById('dl-' + n); dl.textContent = '';
      (info.options || []).forEach(function (id) { var o = document.createElement('option'); o.value = id; dl.appendChild(o); });
      var input = document.getElementById('m-' + n);
      input.placeholder = info.default ? ('預設 ' + info.default) : '(該家預設)';
      input.title = info.note || '';
    });
    refreshState(); // 讓狀態卡吃到預設模型顯示
  }).catch(function () {});
}

function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function fetchJSON(url, opt) { return fetch(url, opt).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); }); }

function renderDoctor(d) {
  var box = document.getElementById('doctorPills'); box.textContent = '';
  if (!d) return;
  d.results.forEach(function (r) {
    var p = el('span', 'pill'); var dot = el('span', 'dot ' + (r.ok ? (r.warn ? 'warn' : 'ok') : 'bad'));
    p.appendChild(dot); p.appendChild(document.createTextNode(r.name + (r.ok ? '' : '（' + (r.fix || '未就緒') + '）')));
    p.title = r.detail || ''; box.appendChild(p);
  });
}

function fmtRemain(until) {
  var ms = new Date(until) - Date.now(); if (ms <= 0) return '即將解鎖';
  var m = Math.floor(ms / 60000), h = Math.floor(m / 60);
  return h > 0 ? h + ' 小時 ' + (m % 60) + ' 分後解鎖' : m + ' 分鐘後解鎖';
}

// 毫秒 → 人類可讀時長（累計消耗顯示）
function fmtDuration(ms) {
  var s = Math.round(ms / 1000);
  if (s < 60) return s + 's';
  var m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return m + 'm' + (r ? ' ' + r + 's' : '');
  var h = Math.floor(m / 60);
  return h + 'h ' + (m % 60) + 'm';
}
// 過去時間 → 「N 分鐘前」
function fmtAgo(iso) {
  var ms = Date.now() - new Date(iso); if (ms < 0) return '剛剛';
  var m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (m < 1) return '剛剛'; if (m < 60) return m + ' 分鐘前';
  if (h < 24) return h + ' 小時前'; return d + ' 天前';
}
// 進行中任務已執行多久
function fmtElapsed(iso) {
  var ms = Date.now() - new Date(iso); if (ms < 0) return '0s';
  return fmtDuration(ms);
}

// 執行中任務的可摺疊區塊：標題列（角色+任務名+已執行時間）可點擊展開/收起完整內容
var runOpen = {}; // 記住哪些家被展開（provider -> bool），重繪時保留
function makeRunningBlock(running, pname) {
  var wrap = el('div', 'runblk');
  var label = running.label || running.task || '執行中';
  var detail = running.detail || running.task || '';
  var elapsed = running.startedAt ? fmtElapsed(running.startedAt) : '';
  var opened = !!runOpen[pname];

  var head = el('div', 'runhead');
  var arrow = el('span', 'runarrow', opened ? '▼' : '▶');
  var titleTxt = el('span', 'runtitle', '執行中：' + label + (elapsed ? '（已 ' + elapsed + '）' : ''));
  head.appendChild(arrow); head.appendChild(titleTxt);
  wrap.appendChild(head);

  var body = el('div', 'runbody');
  body.style.display = opened ? 'block' : 'none';
  // 即時進度（live）：codex 會逐行吐；其餘家算完才給結果 → 顯示提示
  var liveTitle = el('div', 'livetitle', '📡 即時進度');
  body.appendChild(liveTitle);
  var liveBox = el('div', 'livebox');
  if (running.live) {
    liveBox.textContent = running.live;
    if (running.liveAt) liveTitle.textContent = '📡 即時進度（' + fmtAgo(running.liveAt) + '更新）';
  } else if (pname === 'codex') {
    liveBox.textContent = '（等待 codex 吐出第一條進度…）';
    liveBox.className = 'livebox dim';
  } else {
    liveBox.textContent = '此家（' + pname + '）headless 模式不輸出中間過程，算完才給結果。可看下方任務內容。';
    liveBox.className = 'livebox dim';
  }
  body.appendChild(liveBox);
  // 任務內容（detail）
  var dTitle = el('div', 'livetitle', '📋 任務內容'); dTitle.style.marginTop = '10px';
  body.appendChild(dTitle);
  var dBox = el('div'); dBox.style.cssText = 'white-space:pre-wrap;word-break:break-word'; dBox.textContent = detail;
  body.appendChild(dBox);
  wrap.appendChild(body);

  head.onclick = function () {
    runOpen[pname] = !runOpen[pname];
    var nowOpen = runOpen[pname];
    body.style.display = nowOpen ? 'block' : 'none';
    arrow.textContent = nowOpen ? '▼' : '▶';
  };
  return wrap;
}

function renderState(s) {
  state = s;
  document.getElementById('proj').textContent = s.project + '・策略 ' + s.strategy;
  var pc = document.getElementById('pcards'); pc.textContent = '';
  s.providers.forEach(function (p) {
    var c = el('div', 'pcard');
    if (p.running) c.style.borderColor = 'var(--accent)'; // 執行中高亮整張卡
    var name = el('div', 'name');
    var tile = el('span', 'tile', p.name[0].toUpperCase()); tile.style.background = PCOLOR[p.name] || 'var(--grok)';
    name.appendChild(tile); name.appendChild(document.createTextNode(p.name));
    var dot = el('span', 'dot ' + (p.running ? '' : p.cooling ? 'bad' : 'ok')); dot.style.marginLeft = 'auto';
    if (p.running) name.appendChild(el('span', 'spin')); else name.appendChild(dot);
    c.appendChild(name);
    if (p.running) {
      c.appendChild(makeRunningBlock(p.running, p.name)); // 可摺疊：預設顯示標題，點開看完整
    }
    var meta = el('div', 'meta');
    var mLabel = p.configModel || (modelDefaults[p.name] ? modelDefaults[p.name] + '（預設）' : '最新預設');
    meta.appendChild(el('span', 'sep', 'model：' + mLabel));
    var usageLine = '成功 ' + p.uses + ' 次';
    if (p.quota && p.quota.avgMs) usageLine += '｜平均 ' + Math.round(p.quota.avgMs / 1000) + 's/次';
    if (p.totalMs) usageLine += '｜累計 ' + fmtDuration(p.totalMs);
    meta.appendChild(el('span', 'sep', usageLine));
    if (p.lastUsedAt) meta.appendChild(el('span', 'sep', '最後執行：' + fmtAgo(p.lastUsedAt)));
    if (p.quota && p.quota.fiveHour) {
      var q = p.quota.fiveHour;
      var qText = q.stale ? '5h額度：已重置（滿）' : '5h額度：已用 ' + q.usedPct + '%';
      if (!q.stale && q.resetsAt) qText += '（' + fmtRemain(q.resetsAt).replace('後解鎖', '後重置') + '）';
      var qEl = el('span', 'sep', qText);
      if (!q.stale && q.usedPct >= 85) { qEl.style.color = 'var(--warn)'; qEl.textContent = '⚠️ ' + qText; }
      meta.appendChild(qEl);
      if (p.quota.weekly && !p.quota.weekly.stale) {
        meta.appendChild(el('span', 'sep', '週額度：已用 ' + p.quota.weekly.usedPct + '%'));
      }
    }
    if (p.cooling) {
      var cd = el('span', 'sep', '🔴 冷卻中，' + fmtRemain(p.cooldownUntil)); cd.title = p.reason || ''; meta.appendChild(cd);
    }
    c.appendChild(meta); pc.appendChild(c);
  });
  var bb = document.getElementById('busyBanner');
  var curMap = s.current || {}, b = s.busy;
  var runningNames = Object.keys(curMap).filter(function (n) { return curMap[n] && curMap[n].task; }); // 跳過殘缺紀錄
  bb.style.display = 'flex'; bb.innerHTML = ''; // 常駐顯示（你要求隨時出現）
  if (runningNames.length) {
    bb.className = 'busybar'; bb.appendChild(el('span', 'spin'));
    var head = el('div', null, '並行執行中（' + runningNames.length + ' 家）— 點任一家看完整任務');
    head.style.cssText = 'font-weight:700;margin-bottom:6px';
    var wrap = el('div'); wrap.style.cssText = 'flex:1;min-width:0';
    wrap.appendChild(head);
    runningNames.forEach(function (n) {
      var cur = curMap[n];
      var since = cur.startedAt ? '（已 ' + fmtElapsed(cur.startedAt) + '）' : '';
      var label = cur.label || cur.task || '';
      var detail = cur.detail || cur.task || '';
      var opened = !!runOpen['bb_' + n];
      var line = el('div', null);
      line.style.cssText = 'font-size:14px;font-weight:600;line-height:1.5;margin:4px 0 0;cursor:pointer;white-space:normal;word-break:break-word';
      line.textContent = (opened ? '▼ ' : '▶ ') + n + ' ' + since + '：' + label;
      var body = el('div', null);
      body.style.cssText = 'font-size:12.5px;font-weight:400;line-height:1.55;margin:2px 0 4px 16px;color:var(--ink2);white-space:pre-wrap;word-break:break-word;display:' + (opened ? 'block' : 'none');
      body.textContent = detail;
      line.onclick = (function (nn, ln, bd) { return function () {
        runOpen['bb_' + nn] = !runOpen['bb_' + nn];
        var o = runOpen['bb_' + nn];
        bd.style.display = o ? 'block' : 'none';
        ln.textContent = (o ? '▼ ' : '▶ ') + ln.textContent.slice(2);
      }; })(n, line, body);
      wrap.appendChild(line); wrap.appendChild(body);
    });
    bb.appendChild(wrap);
  } else if (b) {
    bb.className = 'busybar'; bb.appendChild(el('span', 'spin'));
    bb.appendChild(document.createTextNode(' 任務進行中（' + b.kind + '）：' + b.task)); // 完整不截斷
  } else {
    bb.className = 'busybar idle';
    bb.appendChild(document.createTextNode('💤 目前閒置 —— 尚無任務執行中。派工或送出對話後，這裡會即時顯示各家正在處理什麼。'));
  }
  var chainSel = document.getElementById('chain');
  if (chainSel.options.length === 0) s.chains.forEach(function (cn) {
    var o = document.createElement('option'); o.value = cn;
    o.textContent = CHAIN_DESC[cn] ? cn + '：' + CHAIN_DESC[cn] : cn;
    o.title = CHAIN_DESC[cn] || cn;
    chainSel.appendChild(o);
  });
  var stratSel = document.getElementById('strategy');
  if (!stratSel.dataset.init) { stratSel.value = s.strategy; stratSel.dataset.init = '1'; }
}

function refreshState() { fetchJSON('/api/state').then(renderState).catch(function () {}); }

function loadDoc() {
  var name = document.getElementById('docName').value;
  fetchJSON('/api/docs?name=' + encodeURIComponent(name)).then(function (j) {
    var pre = document.getElementById('docContent'); pre.textContent = j.content || '（空）'; pre.scrollTop = pre.scrollHeight;
  }).catch(function () {});
}

function loadChat() {
  fetchJSON('/api/docs?name=CONVERSATION_LOG').then(function (j) {
    var box = document.getElementById('msgs'); box.textContent = '';
    var re = /### [^\\n]* — WEB — ([^\\n]+)\\n([\\s\\S]*?)(?=\\n### |$)/g, m, items = [];
    while ((m = re.exec(j.content))) items.push({ who: m[1], text: m[2].trim() });
    items.slice(-20).forEach(function (it) {
      var isUser = it.who.indexOf('使用者') === 0;
      var d = el('div', 'msg' + (isUser ? ' user' : ''));
      d.appendChild(el('div', 'who', isUser ? '你' : it.who));
      d.appendChild(document.createTextNode(it.text));
      box.appendChild(d);
    });
    box.scrollTop = box.scrollHeight;
  }).catch(function () {});
}

function loadSkills() {
  fetchJSON('/api/skills').then(function (j) {
    var box = document.getElementById('skillList'); box.textContent = '';
    if (!j.skills.length) { box.appendChild(el('div', 'small', '（沒找到已安裝的技能）')); return; }
    j.skills.forEach(function (s) {
      var d = el('div', 'skill');
      var n = el('div', 'n'); n.appendChild(document.createTextNode(s.name + '　'));
      var badge = el('span', 'pill', s.owner); n.appendChild(badge); d.appendChild(n);
      if (s.description) d.appendChild(el('div', 'd', s.description));
      var btn = el('button', 'sec', '帶入派工');
      btn.onclick = function () {
        document.getElementById('task').value = '請使用「' + s.name + '」技能：';
        var owner = s.owner.indexOf('codex') === 0 ? 'codex' : 'claude';
        document.getElementById('only').value = owner;
        document.getElementById('task').focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
      d.appendChild(btn); box.appendChild(d);
    });
  }).catch(function () {});
}

document.getElementById('effort').oninput = function () {
  document.getElementById('effLabel').textContent = EFF_LABEL[this.value];
};

document.getElementById('btnDoctor').onclick = function () {
  this.disabled = true; var self = this;
  fetchJSON('/api/doctor').then(function (d) { renderDoctor(d); })
    .catch(function (e) { alert('檢查失敗：' + e.message); })
    .finally(function () { self.disabled = false; });
};

document.getElementById('btnGo').onclick = function () {
  var task = document.getElementById('task').value.trim(); if (!task) return;
  var only = document.getElementById('only').value;
  var models = {};
  ['claude', 'codex', 'grok', 'cursor'].forEach(function (n) {
    var v = document.getElementById('m-' + n).value.trim();
    if (v) models[n] = v;
  });
  var effIdx = document.getElementById('effort').value;
  var btn = this; btn.disabled = true; btn.textContent = '執行中…';
  var box = document.getElementById('resultBox'); box.style.display = 'none';
  fetchJSON('/api/dispatch', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: task, only: only || null, chain: document.getElementById('chain').value, strategy: document.getElementById('strategy').value, models: models, effort: EFF[effIdx] || null })
  }).then(function (j) {
    box.style.display = 'block';
    var meta = j.ok ? ('✅ 由 ' + j.chosen + ' [' + j.model + '] 完成（' + Math.round(j.ms / 1000) + 's）') : '✘ 所有家都不可用（看四家狀態卡的冷卻原因）';
    document.getElementById('resultMeta').textContent = meta;
    document.getElementById('resultText').textContent = j.result || JSON.stringify(j.attempts, null, 2);
  }).catch(function (e) {
    box.style.display = 'block';
    document.getElementById('resultMeta').textContent = '錯誤：' + e.message;
    document.getElementById('resultText').textContent = '';
  }).finally(function () { btn.disabled = false; btn.textContent = '派工'; refreshState(); });
};

document.getElementById('btnChat').onclick = function () {
  var input = document.getElementById('chatInput'); var msg = input.value.trim(); if (!msg) return;
  var btn = this; btn.disabled = true; input.value = '';
  var box = document.getElementById('msgs');
  var d = el('div', 'msg user'); d.appendChild(el('div', 'who', '你')); d.appendChild(document.createTextNode(msg)); box.appendChild(d);
  var wait = el('div', 'msg'); wait.appendChild(el('span', 'spin')); wait.appendChild(document.createTextNode(' 團隊思考中…')); box.appendChild(wait);
  box.scrollTop = box.scrollHeight;
  fetchJSON('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg, only: document.getElementById('chatOnly').value || null }) })
    .then(function (j) {
      wait.textContent = '';
      wait.appendChild(el('div', 'who', j.ok ? (j.provider + ' 回覆') : '失敗'));
      wait.appendChild(document.createTextNode(j.ok ? j.reply : '所有家都不可用，稍後再試。'));
      box.scrollTop = box.scrollHeight;
    })
    .catch(function (e) { wait.textContent = '錯誤：' + e.message; })
    .finally(function () { btn.disabled = false; refreshState(); });
};

document.getElementById('chatInput').addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) document.getElementById('btnChat').click();
});

document.querySelectorAll('.tabs button').forEach(function (b) {
  b.onclick = function () {
    document.querySelectorAll('.tabs button').forEach(function (x) { x.classList.remove('on'); });
    b.classList.add('on');
    ['chat', 'mission', 'docs', 'skills'].forEach(function (t) { document.getElementById('tab-' + t).style.display = b.dataset.tab === t ? '' : 'none'; });
    if (b.dataset.tab === 'docs') loadDoc();
    if (b.dataset.tab === 'skills') loadSkills();
    if (b.dataset.tab === 'chat') loadChat();
    if (b.dataset.tab === 'mission') loadMissionUI();
  };
});

// ── 任務書（Mission）────────────────────────────────
var ROLE_ZH = { plan: '規劃', implement: '實作', review: '審查', test: '測試', docs: '文件', research: '研究' };
var mission = null;

function renderMission(m) {
  mission = m;
  var box = document.getElementById('mPlanBox');
  if (!m) { box.style.display = 'none'; document.getElementById('mBtnStart').disabled = true; return; }
  box.style.display = 'block';
  document.getElementById('mGoal').textContent = m.goal;
  document.getElementById('mRisks').textContent = m.risks ? ('風險：' + m.risks) : '';
  var list = document.getElementById('mTaskList'); list.textContent = '';
  m.tasks.forEach(function (t) {
    var d = el('div', 'skill');
    var head = el('div', 'n');
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.tid = t.id;
    cb.checked = t.status === 'pending' || t.status === 'running' || t.status === 'failed';
    cb.disabled = t.status === 'done';
    head.appendChild(cb);
    var icon = t.status === 'done' ? ' ✅ ' : t.status === 'running' ? ' ▶️ ' : t.status === 'failed' ? ' ❌ ' : t.status === 'skipped' ? ' ⏭️ ' : ' ⬜ ';
    head.appendChild(document.createTextNode(icon + '#' + t.id + ' ' + t.title + '　'));
    var badge = el('span', 'pill', (ROLE_ZH[t.role] || t.role) + '｜' + (t.doneBy || t.provider || '依角色鏈'));
    head.appendChild(badge);
    d.appendChild(head);
    if (t.description) d.appendChild(el('div', 'd', t.description));
    if (t.acceptance) d.appendChild(el('div', 'd', '驗收：' + t.acceptance));
    if (t.resultSummary) d.appendChild(el('div', 'd', '結果：' + t.resultSummary));
    list.appendChild(d);
  });
  document.getElementById('mBtnStart').disabled = !(m.status === 'planned' || m.status === 'partial' || m.status === 'stopped' || m.status === 'needs-fix');
  var st = document.getElementById('mRisks');
  var stText = m.status === 'needs-fix' ? '⚠️ 總驗收未達成——修復任務已列出（勾選後按「開始執行」跑修復）' : '';
  if (stText) st.textContent = stText + (m.risks ? '｜風險：' + m.risks : '');
  var rep = document.getElementById('mReport');
  if (m.report) { rep.style.display = 'block'; rep.textContent = '── 總驗收報告 ──\\n' + m.report; }
  else rep.style.display = 'none';
}

function loadMissionUI() {
  var wd = document.getElementById('mWorkdir').value.trim();
  if (!wd) return;
  fetchJSON('/api/mission?workdir=' + encodeURIComponent(wd)).then(function (j) { renderMission(j.mission); }).catch(function () {});
}
document.getElementById('mWorkdir').addEventListener('change', loadMissionUI);

// ── 資料夾瀏覽器（點選作業區）────────────────────────
var fsCur = '';
function fsRender(j) {
  fsCur = j.path;
  document.getElementById('fsPath').textContent = j.path || '（選擇磁碟機）';
  document.getElementById('fsUp').disabled = j.path === '';
  document.getElementById('fsSelect').disabled = j.path === '';
  var list = document.getElementById('fsList'); list.textContent = '';
  if (!j.dirs.length) list.appendChild(el('span', 'small', '（沒有子資料夾）'));
  j.dirs.forEach(function (d) {
    var b = el('button', 'sec', '📁 ' + d.name);
    b.style.fontSize = '12.5px'; b.style.padding = '4px 10px';
    b.onclick = function () { fsLoad(d.path); };
    list.appendChild(b);
  });
}
function fsLoad(p) {
  fetchJSON('/api/fs/list?path=' + encodeURIComponent(p || ''))
    .then(fsRender)
    .catch(function () { if (p) fsLoad(''); }); // 壞路徑退回磁碟機層
}
document.getElementById('fsBrowse').onclick = function () {
  var panel = document.getElementById('fsPanel');
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  fsLoad(document.getElementById('mWorkdir').value.trim());
};
document.getElementById('fsUp').onclick = function () {
  fetchJSON('/api/fs/list?path=' + encodeURIComponent(fsCur)).then(function (j) { fsLoad(j.parent || ''); }).catch(function () { fsLoad(''); });
};
document.getElementById('fsSelect').onclick = function () {
  if (!fsCur) return;
  document.getElementById('mWorkdir').value = fsCur;
  document.getElementById('fsPanel').style.display = 'none';
  loadMissionUI();
};
document.getElementById('fsClose').onclick = function () { document.getElementById('fsPanel').style.display = 'none'; };
document.getElementById('fsMk').onclick = function () {
  var name = document.getElementById('fsNewName').value.trim();
  if (!fsCur) { alert('先進入一個資料夾'); return; }
  if (!name) { alert('填新資料夾名稱'); return; }
  fetchJSON('/api/fs/mkdir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base: fsCur, name: name }) })
    .then(function () { document.getElementById('fsNewName').value = ''; fsLoad(fsCur); })
    .catch(function (e) { alert('建立失敗：' + e.message); });
};

// ── 規劃書匯入檔案 ────────────────────────
document.getElementById('mImport').onclick = function (e) {
  e.preventDefault();
  document.getElementById('mFile').click();
};
document.getElementById('mFile').onchange = function () {
  var f = this.files[0]; if (!f) return;
  if (f.size > 512 * 1024) { alert('檔案太大（上限 512KB）'); this.value = ''; return; }
  var reader = new FileReader();
  reader.onload = function () { document.getElementById('mPlanDoc').value = String(reader.result); };
  reader.onerror = function () { alert('讀取失敗'); };
  reader.readAsText(f, 'utf-8');
  this.value = '';
};

var planArmed = false;
var planArmTimer = null;
document.getElementById('mBtnPlan').onclick = function () {
  var wd = document.getElementById('mWorkdir').value.trim();
  var doc = document.getElementById('mPlanDoc').value.trim();
  if (!wd) { alert('請填作業區資料夾路徑'); return; }
  if (doc.length < 10) { alert('規劃書太短'); return; }
  var btn = this;
  if (!planArmed) {
    planArmed = true;
    btn.textContent = '再按一次確認（會呼叫總指揮）';
    clearTimeout(planArmTimer);
    planArmTimer = setTimeout(function () { planArmed = false; btn.textContent = '① 產生規劃單'; }, 6000);
    return;
  }
  clearTimeout(planArmTimer); planArmed = false;
  btn.disabled = true; btn.textContent = '總指揮規劃中…';
  fetchJSON('/api/mission/plan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workdir: wd, planDoc: doc, chief: document.getElementById('mChief').value, maxTasks: document.getElementById('mMax').value })
  }).then(function (j) {
    renderMission(j.mission);
    if (j.scaffoldCreated && j.scaffoldCreated.length) alert('已在作業區自動建立紀錄骨架：' + j.scaffoldCreated.join('、'));
  }).catch(function (e) { alert('規劃失敗：' + e.message); })
    .finally(function () { btn.disabled = false; btn.textContent = '① 產生規劃單'; });
};

document.getElementById('mBtnStart').onclick = function () {
  var wd = document.getElementById('mWorkdir').value.trim(); if (!wd || !mission) return;
  var ids = [];
  document.querySelectorAll('#mTaskList input[type=checkbox]').forEach(function (cb) { if (cb.checked) ids.push(parseInt(cb.dataset.tid, 10)); });
  if (!ids.length) { alert('至少勾一個任務'); return; }
  var btn = this; btn.disabled = true;
  document.getElementById('mBtnStop').disabled = false;
  fetchJSON('/api/mission/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workdir: wd, selectedIds: ids, effort: EFF[document.getElementById('effort').value] || null }) })
    .catch(function (e) { alert('啟動失敗：' + e.message); btn.disabled = false; });
};

document.getElementById('mBtnStop').onclick = function () {
  fetchJSON('/api/mission/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(function () {});
  this.disabled = true;
};
document.getElementById('docName').onchange = loadDoc;

var es = null;
function connectSSE() {
  if (es) { try { es.close(); } catch (e) {} }
  es = new EventSource('/api/events');
  es.addEventListener('refresh', function () {
    refreshState();
    if (document.getElementById('tab-docs').style.display !== 'none') loadDoc();
    if (document.getElementById('tab-chat').style.display !== 'none') loadChat();
  });
  es.addEventListener('busy', refreshState);
  es.addEventListener('mission', function (ev) {
    try {
      var p = JSON.parse(ev.data);
      if (mission && p.tasks) {
        p.tasks.forEach(function (u) {
          var t = mission.tasks.find(function (x) { return x.id === u.id; });
          if (t) { t.status = u.status; if (u.doneBy) t.doneBy = u.doneBy; }
        });
        mission.status = p.status;
        renderMission(mission);
        if (p.status === 'done' || p.status === 'partial' || p.status === 'stopped' || p.status === 'needs-fix') {
          document.getElementById('mBtnStop').disabled = true;
          loadMissionUI(); // 抓完整版（含總驗收報告/修復任務）
        }
      }
    } catch (e) {}
  });
  es.onerror = function () {
    if (es.readyState === EventSource.CLOSED) setTimeout(connectSSE, 3000);
  };
}
connectSSE();

fetchJSON('/api/state').then(function (s) { renderState(s); renderDoctor(s.doctor); });
loadModels();
loadChat();
// 智慧輪詢：有任務執行中時每 2 秒刷（讓 live 即時進度跳動）、閒置時 15 秒
var pollTimer = null;
function scheduleNextPoll() {
  if (pollTimer) clearTimeout(pollTimer);
  var running = state && state.providers && state.providers.some(function (p) { return p.running; });
  pollTimer = setTimeout(function () { refreshState(); scheduleNextPoll(); }, running ? 2000 : 15000);
}
scheduleNextPoll();
</script>
</body>
</html>`;
