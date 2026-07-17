// 任務書（Mission）模式 —— 總指揮流程的核心。
// 流程：規劃書 → 總指揮（Agent_OS 思考）產出「完成目標＋任務清單」→ 使用者確認 → 逐項派工執行。
// 三技能整合（基於 Agent-LV.MAX record system 的邏輯）：
//   Agent_OS_Skill        總指揮必用（意圖解碼→拆解→指派）；子代理用它判斷自己的角色
//   Loop_Engineering_Skill 子代理彈性判斷：任務若是「重複/持續型」先設計迴圈規格再動
//   Record_System_Skill    全程交接紀錄：紀錄寫在「作業區」的 docs/，換手不失憶
// claude 原生觸發已安裝技能；grok/cursor 沒技能系統 → 注入下方濃縮版核心程序（像商用 APP 的內建 system prompt）。
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PROVIDERS } from './providers.js';
import { runTask } from './orchestrator.js';
import { getQuotaSnapshot } from './quota.js';
import { loadState, isCoolingDown } from './state.js';
import { composeSkillBlock, SKILL_CORES } from './skills.js';
import { verifyBar } from './verify.js';

// 三技能核心改由 skills.js（讀專案內建 skills/）提供，任何機器/任何家都自包含。
const OS_CORE = SKILL_CORES.Agent_OS_Skill;
const LOOP_CORE = SKILL_CORES.Loop_Engineering_Skill;
const RECORD_CORE = SKILL_CORES.Record_System_Skill;

// ---------- 作業區骨架（Record System 最小版，缺什麼補什麼、絕不覆蓋既有檔） ----------
export function ensureWorkspaceScaffold(workdir, projectName = '') {
  const docs = join(workdir, 'docs');
  if (!existsSync(docs)) mkdirSync(docs, { recursive: true });
  const created = [];
  const writeIfMissing = (rel, content) => {
    const p = join(workdir, rel);
    if (!existsSync(p)) { writeFileSync(p, content); created.push(rel); }
  };
  writeIfMissing('AGENTS.md', [
    `# AGENTS.md — ${projectName || '本專案'} 的唯一入口`,
    '',
    '> 所有 agent（claude/codex/grok/cursor）先讀這份＋docs/，再動手。不要掃整個程式碼庫。',
    '',
    '## 工作守則',
    '- 開工前讀 docs/CONVERSATION_LOG.md（Active Summary）+ docs/HANDOFF.md + docs/MISSION.md。',
    '- 改動小而可驗證；完成要附證據；回覆末尾寫 [交接] 段。',
    '- 識別符英文、註解繁體中文；零簡體字。',
    '',
    '## 目前任務書',
    '見 docs/MISSION.md（完成目標與任務清單）。',
    '',
  ].join('\n'));
  writeIfMissing('docs/CONVERSATION_LOG.md', [
    '# Conversation Log', '',
    '> 接力紀錄：新接手的 agent 讀這份就知道進行到哪。', '',
    `Last updated: ${new Date().toISOString().slice(0, 10)}`, '',
    '## Active Summary', '（任務書模式啟動，見 docs/MISSION.md）', '',
    '## Log Entries', '',
  ].join('\n'));
  writeIfMissing('docs/HANDOFF.md', [
    '# Handoff', '',
    `Last updated: ${new Date().toISOString().slice(0, 10)}`, '',
    '## Current State', '任務書模式初始化。', '',
    '## Last Completed Task', '（尚無）', '',
    '## Next Safe Task', '見 docs/MISSION.md 任務清單。', '',
    '## Notes for Next Agent', '從 AGENTS.md + docs/ 上手，不要掃碼庫。', '',
  ].join('\n'));
  writeIfMissing('docs/TASKS.md', '# 任務板\n\n（由任務書模式維護，見 docs/MISSION.md）\n');
  writeIfMissing('docs/DEV_LOG.md', '# Dev Log — 每次派工做了什麼\n\n');
  return created;
}

// ---------- 階段 1：總指揮規劃 ----------
// 超大規劃書自動摘要：headless 總指揮吞不下 100KB+ 規格（會懸著不收尾）。
// 策略：>PLAN_BRIEF_MAX 時，保留頭尾各一段 + 抽出結構骨架行（SLICE/FR/NFR/QG/標題/編號項），
// 中間大段散文用省略標記取代。回傳 { text, summarized, originalLen }。
export const PLAN_BRIEF_MAX = 20000; // 約 20KB；超過才摘要
export function summarizeBriefIfHuge(planDoc, max = PLAN_BRIEF_MAX) {
  const s = String(planDoc || '');
  if (s.length <= max) return { text: s, summarized: false, originalLen: s.length };
  const lines = s.split(/\r?\n/);
  const headLines = lines.slice(0, 60);           // 開頭（通常含目標/總覽）
  const tailLines = lines.slice(-25);             // 結尾（通常含驗收/交付）
  // 結構骨架：標題、SLICE/FR/NFR/QG/AC 等規格 ID、編號或項目符號的關鍵行
  const skeleton = lines.filter((l) => /^\s{0,3}#{1,6}\s|\b(SLICE|FR|NFR|QG|AC|REQ|US|EPIC)[-\s]?\d|^\s*[-*]\s+\S|^\s*\d+[.)]\s+\S/.test(l));
  const seen = new Set();
  const dedupSkel = skeleton.filter((l) => { const k = l.trim(); if (seen.has(k) || !k) return false; seen.add(k); return true; }).slice(0, 400);
  const text = [
    '（※ 規劃書過長已自動摘要：保留頭尾與結構骨架，中間散文省略。若需精確條文請引用下方 ID 追問。）',
    '', '--- 開頭 ---', ...headLines,
    '', `--- 結構骨架（${dedupSkel.length} 條關鍵行）---`, ...dedupSkel,
    '', '--- 結尾 ---', ...tailLines,
  ].join('\n');
  return { text, summarized: true, originalLen: s.length };
}

export function buildPlanPrompt({ planDoc, config, quotaNote, maxTasks, chief }) {
  const brief = summarizeBriefIfHuge(planDoc);
  const planText = brief.text;
  const prefs = Object.entries(config.providers || {})
    .map(([n, p]) => `- ${n}：任務優先=${(p.preferredRoles || []).join('/') || '無偏好'}${p.note ? '' : ''}`)
    .join('\n');
  return [
    `你是多 CLI 協作團隊的「總指揮」。${chief === 'claude' ? '請實際使用你已安裝的 Agent_OS_Skill 技能來思考（意圖解碼→拆解→指派）。' : OS_CORE}`,
    '',
    '你的職責：讀懂下面的規劃書，產出「完成目標＋任務清單」。先規劃、定好目標，執行階段才會開始。',
    '',
    '=== 使用者的規劃書 ===',
    planText,
    '=== 規劃書結束 ===',
    '',
    '=== 團隊成員與任務偏好（預設指派依據；額度滿會自動換手，不用擔心）===',
    prefs,
    quotaNote ? `目前額度狀況：${quotaNote}` : '',
    '',
    '=== 產出要求（嚴格遵守）===',
    `1. 任務數量 ≤ ${maxTasks} 個；每個任務小而可驗證、有明確驗收標準（這是防止無限執行的上限）。`,
    '2. 每個任務指定 role（plan/implement/review/test/docs/research 之一）與建議 provider（依偏好）。',
    '3. goal 是可驗收的「完成目標」（Definition of Done），不是願景口號。',
    '4. **並行**：多個任務會同時分派給不同 CLI 執行。用 dependsOn（前置任務的 id 陣列）標依賴——沒依賴的任務會並行跑，加速完成。**盡量讓可獨立的任務不互相依賴、且碰不同檔案**（避免並行衝突）；審查/測試任務應 dependsOn 它要驗的實作任務。',
    '5. 只輸出一個 ```json 圍欄區塊，不要有其他文字。格式：',
    '```json',
    '{',
    '  "goal": "完成目標（可驗收）",',
    '  "tasks": [',
    '    { "id": 1, "title": "短標題", "description": "做什麼、怎麼驗、碰哪些檔", "role": "implement", "provider": "codex", "acceptance": "驗收標準", "dependsOn": [] }',
    '  ],',
    '  "risks": "一句話風險（可省略）"',
    '}',
    '```',
  ].filter(Boolean).join('\n');
}

// 規劃降級：headless 總指揮對「純輸出型」大規劃易懸著不收尾（本專案實測痛點）。
// 對策：規劃用「較短的專用 timeout」逐家嘗試——某家逾時/失敗/回覆解析不出規劃單，就換鏈上下一家，
// 全部試完才明確報錯。避免單一總指揮卡死整條 Mission。
//   planPrompt：buildPlanPrompt 產出的字串
//   chain：嘗試順序（總指揮優先，其餘家備援）
//   runFn：注入 runTask（測試可替身）；parseFn：注入 parsePlan（測試可替身）
//   perTryTimeoutMs：每家的規劃 timeout（預設 3 分，比執行階段的 10 分短很多）
export const PLAN_TIMEOUT_MS = 180000;
export async function planWithFallback({ cwd, stateCwd, prompt, chain, config, effort = null, maxTasks = 12, perTryTimeoutMs = PLAN_TIMEOUT_MS, runFn = runTask, parseFn = parsePlan }) {
  const providers = Object.keys(config.providers || PROVIDERS);
  const attempts = [];
  for (const name of chain) {
    if (!(config.providers?.[name] || PROVIDERS[name])) continue;
    const out = await runFn({ cwd, stateCwd, prompt, chain: [name], config, strategy: 'priority', effort, memory: true, timeoutMs: perTryTimeoutMs });
    if (!out.chosen) { attempts.push({ provider: name, ok: false, reason: 'unavailable' }); continue; } // 額度/認證/逾時 → 換家
    const parsed = parseFn(out.result, { maxTasks, providers });
    if (parsed.error) { attempts.push({ provider: name, ok: false, reason: `解析失敗：${parsed.error}` }); continue; } // 回了但不是合法規劃單 → 換家
    return { plan: parsed.plan, plannedBy: out.chosen, attempts, raw: out.result };
  }
  return { error: '所有總指揮候選都無法產出有效規劃單（逾時或格式錯誤）', attempts };
}

// 從總指揮回覆中抽出 JSON 規劃單（容錯：圍欄優先，退而求其次抓平衡大括號）
export function parsePlan(text, { maxTasks = 12, providers = Object.keys(PROVIDERS) } = {}) {
  if (!text) return { error: '總指揮沒有回覆內容' };
  let raw = null;
  const fenced = String(text).match(/```json\s*([\s\S]*?)```/i) || String(text).match(/```\s*(\{[\s\S]*?\})\s*```/);
  if (fenced) raw = fenced[1];
  else {
    const s = String(text);
    const start = s.indexOf('{');
    if (start >= 0) {
      // 括號計數時略過字串內字元（處理引號與跳脫），避免 goal 內含 } 提早截斷（#8）
      let depth = 0, inStr = false, esc = false;
      for (let i = start; i < s.length; i++) {
        const ch = s[i];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { raw = s.slice(start, i + 1); break; } }
      }
    }
  }
  if (!raw) return { error: '回覆中找不到 JSON 規劃單' };
  let plan;
  try { plan = JSON.parse(raw); } catch (e) { return { error: `規劃單 JSON 解析失敗: ${e.message}` }; }
  if (!plan.goal || typeof plan.goal !== 'string') return { error: '規劃單缺少 goal（完成目標）' };
  if (!Array.isArray(plan.tasks) || plan.tasks.length === 0) return { error: '規劃單沒有任務' };
  if (plan.tasks.length > maxTasks) plan.tasks = plan.tasks.slice(0, maxTasks); // 硬上限，防無限執行
  const ROLES = ['plan', 'implement', 'review', 'test', 'docs', 'research'];
  // 以「位置」為權威重編 id（總指揮可能給重複/撞號 id → 會毀掉並行調度的 running Map，審查抓到的 medium）
  const oldToNew = new Map();
  plan.tasks.forEach((t, i) => { if (t.id != null && !oldToNew.has(t.id)) oldToNew.set(t.id, i + 1); });
  plan.tasks = plan.tasks.map((t, i) => ({
    id: i + 1, // 全域唯一、連續
    title: String(t.title || `任務 ${i + 1}`).slice(0, 120),
    description: String(t.description || '').slice(0, 1500),
    role: ROLES.includes(t.role) ? t.role : 'implement',
    provider: providers.includes(t.provider) ? t.provider : null, // null=交給角色鏈
    acceptance: String(t.acceptance || '').slice(0, 500),
    // dependsOn 依舊 id 映射到新 id；只保留指到「更早任務」的（避免前向/自我依賴）
    dependsOn: (Array.isArray(t.dependsOn) ? t.dependsOn : [])
      .map((x) => oldToNew.get(x)).filter((n) => Number.isInteger(n) && n < i + 1),
    status: 'pending',
  }));
  plan.risks = String(plan.risks || '').slice(0, 400);
  return { plan };
}

// 強制審查（使用者確認的強化 #2）：任務書 ≥3 個任務卻沒有獨立審查任務時，
// 自動補一個，指派給「偏好審查、且不是主要實作者」的家（避免自己驗自己）。
export function ensureReviewTask(plan, config) {
  if (!Array.isArray(plan.tasks) || plan.tasks.length < 3) return plan;
  if (plan.tasks.some((t) => t.role === 'review')) return plan;
  const implCount = {};
  for (const t of plan.tasks) if (t.provider) implCount[t.provider] = (implCount[t.provider] || 0) + 1;
  const busiest = Object.entries(implCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const reviewers = Object.entries(config.providers || {})
    .filter(([, p]) => (p.preferredRoles || []).includes('review'))
    .map(([n]) => n);
  const reviewer = reviewers.find((n) => n !== busiest) || reviewers[0] || null;
  plan.tasks.push({
    id: Math.max(...plan.tasks.map((t) => t.id)) + 1,
    title: '獨立審查與驗收（系統自動補）',
    description: '審查前面所有任務的產出是否符合各自的驗收標準與整體完成目標；對關鍵行為做實測。',
    role: 'review',
    provider: reviewer,
    acceptance: '每條判定附實際命令輸出；環境跑不了就明說「未實際執行」。',
    status: 'pending',
    auto: true,
  });
  return plan;
}

// 自動修復循環（使用者確認的強化 #1）：總驗收「未達成」→ 請總指揮把缺口轉成修復任務。
// 修復任務只會「附加為待執行」，一樣要過使用者的開始執行閘門——先規劃確認再行動。
export function buildFixPrompt(mission) {
  return [
    '你是總指揮。總驗收判定「未達成」，請把缺口轉成最少量的修復任務。',
    `完成目標：${mission.goal}`,
    `總驗收報告：\n${String(mission.report || '').slice(0, 3000)}`,
    '要求：每個修復任務小而可驗證、有驗收標準、指定 role 與建議 provider；最多 5 個；不要重做已達成的部分。',
    '只輸出一個 ```json 圍欄：{"tasks":[{"title":"","description":"","role":"implement","provider":"cursor","acceptance":""}]}',
  ].join('\n');
}

export function parseFixTasks(text, mission, config) {
  const providers = Object.keys(config.providers || {});
  const fenced = String(text || '').match(/```json\s*([\s\S]*?)```/i) || String(text || '').match(/(\{[\s\S]*\})/);
  if (!fenced) return [];
  let obj;
  try { obj = JSON.parse(fenced[1]); } catch { return []; }
  if (!Array.isArray(obj.tasks)) return [];
  const ROLES = ['plan', 'implement', 'review', 'test', 'docs', 'research'];
  let nextId = Math.max(0, ...mission.tasks.map((t) => t.id)) + 1;
  return obj.tasks.slice(0, 5).map((t) => ({
    id: nextId++,
    title: `[修復] ${String(t.title || '修復任務').slice(0, 110)}`,
    description: String(t.description || '').slice(0, 1500),
    role: ROLES.includes(t.role) ? t.role : 'implement',
    provider: providers.includes(t.provider) ? t.provider : null,
    acceptance: String(t.acceptance || '').slice(0, 500),
    status: 'pending',
    fix: true,
  }));
}

// 規劃單存檔：人看的 MISSION.md + 機器讀的 mission.json
export function saveMission(workdir, mission) {
  const dir = join(workdir, '.orchestrator');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mission.json'), JSON.stringify(mission, null, 2));
  const icon = (s) => (s === 'done' ? '✅' : s === 'running' ? '▶️' : s === 'failed' ? '❌' : s === 'skipped' ? '⏭️' : s === 'blocked' ? '🚫' : '⬜');
  const md = [
    '# MISSION — 任務書', '',
    `建立：${mission.createdAt}　總指揮：${mission.chief}　狀態：${mission.status}`, '',
    '## 完成目標（Definition of Done）', mission.goal, '',
    mission.risks ? `## 風險\n${mission.risks}\n` : '',
    '## 任務清單',
    ...mission.tasks.map((t) => `- ${icon(t.status)} **#${t.id} ${t.title}**（${t.role}｜建議 ${t.provider || '依角色鏈'}）${t.doneBy ? `｜由 ${t.doneBy} 完成` : ''}${t.ms ? `｜耗時 ${Math.round(t.ms / 1000)}s` : ''}\n  ${t.description}\n  驗收：${t.acceptance}`),
    '',
    mission.report ? `## 總驗收報告\n${mission.report}\n` : '',
  ].filter(Boolean).join('\n');
  writeFileSync(join(workdir, 'docs', 'MISSION.md'), md);
}

export function loadMission(workdir) {
  try {
    const p = join(workdir, '.orchestrator', 'mission.json');
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch { return null; }
}

// ---------- 階段 2：子代理任務 prompt（自動組裝的 system prompt） ----------
// 角色中文標籤（控制台顯示用）
export function roleLabel(role) {
  return { implement: '實作', review: '審查', test: '測試', plan: '規劃', docs: '文件', research: '研究' }[role] || role || '任務';
}

export function buildTaskPrompt({ task, mission, provider }) {
  const native = provider === 'claude' || provider === 'codex'; // 這兩家有自己的技能系統
  // 證據鐵律（debug 發現：grok 審查曾 12 秒宣稱「實測」——宣稱與事實必須分開）
  const evidenceRule = (task.role === 'review' || task.role === 'test')
    ? '證據鐵律：你的每一條判定都必須附上「實際執行的命令＋原始輸出」。若你的環境跑不了命令，必須明講「未實際執行，以下為靜態審查」——嚴禁把靜態推測寫成「實測」。無證據的「通過」視同未驗收。'
    : '';
  return [
    `你是多 CLI 協作團隊的一員（${provider}），被總指揮指派本任務。此任務可能與其他家同時進行——只碰本任務範圍的檔案，避免衝突。`,
    '',
    composeSkillBlock({ roleHint: task.role, native }), // 專案內建三技能，自包含
    '',
    '=== 整體完成目標（所有任務共同朝向）===',
    mission.goal,
    '',
    `=== 本任務 #${task.id}：${task.title} ===`,
    task.description,
    '',
    `=== 驗收標準（達不到不得聲稱完成）===`,
    task.acceptance || '產出可實際運作/驗證。',
    '',
    evidenceRule,
    '規則：只做本任務範圍，不要動其他任務的事；完成後在回覆末尾輸出 [交接] 段（做了什麼＋動了哪些檔＋證據＋下一步建議）。',
  ].filter(Boolean).join('\n');
}

// 任務的換手鏈：總指揮建議的家排最前，然後照角色鏈，最後補其餘（去重）+ codex 額度感知降位
export function chainForTask(task, config, stateCwd = null) {
  const roleChain = { implement: 'implement', review: 'review', plan: 'plan', test: 'implement', docs: 'plan', research: 'review' };
  const base = config.chains[roleChain[task.role]] || config.chains[config.defaultChain] || [];
  const all = Object.keys(config.providers || {});
  let chain = [];
  for (const n of [task.provider, ...base, ...all]) if (n && !chain.includes(n) && all.includes(n)) chain.push(n);
  // codex 額度密度高：5h 窗 ≥60% 就把 codex 降到鏈尾（debug 發現：一個重任務就燒滿 codex 5h）
  if (stateCwd) {
    try {
      const snap = getQuotaSnapshot(stateCwd, config);
      const overloaded = (n) => snap[n]?.fiveHour && !snap[n].fiveHour.stale && snap[n].fiveHour.usedPct >= (n === 'codex' ? 60 : 90);
      chain = [...chain.filter((n) => !overloaded(n)), ...chain.filter(overloaded)];
    } catch { /* 快照失敗照原鏈 */ }
  }
  return chain;
}

// 依賴推導：總指揮可在任務填 dependsOn；沒填則保守推——
//   review 依賴「所有更早、非 review 的任務」；test 依賴「所有更早的 implement 任務」。
//   其餘（implement/docs/plan/research）預設無依賴 → 可並行。
export function computeDeps(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const t of tasks) {
    if (Array.isArray(t.dependsOn) && t.dependsOn.length) {
      t._deps = t.dependsOn.filter((id) => byId.has(id) && id !== t.id);
      continue;
    }
    const earlier = tasks.filter((x) => x.id < t.id);
    if (t.role === 'review') t._deps = earlier.filter((x) => x.role !== 'review').map((x) => x.id);
    else if (t.role === 'test') t._deps = earlier.filter((x) => x.role === 'implement').map((x) => x.id);
    else t._deps = [];
  }
  // 循環依賴偵測（Kahn）：成環的任務會永遠 depsDone=false 靜默停住 → 打斷環的邊並標記
  const indeg = new Map(tasks.map((t) => [t.id, (t._deps || []).length]));
  const queue = tasks.filter((t) => indeg.get(t.id) === 0).map((t) => t.id);
  const seen = new Set(queue);
  while (queue.length) {
    const id = queue.shift();
    for (const t of tasks) {
      if ((t._deps || []).includes(id)) {
        indeg.set(t.id, indeg.get(t.id) - 1);
        if (indeg.get(t.id) === 0 && !seen.has(t.id)) { seen.add(t.id); queue.push(t.id); }
      }
    }
  }
  for (const t of tasks) if (!seen.has(t.id)) { t._deps = []; t._depCycle = true; } // 在環裡→打斷依賴，讓它能跑
  return tasks;
}

// ---------- 執行器：並行調度（依賴圖 + 每家一次一任務 + 調度層換手），支援中途停止 ----------
export async function executeMission({ workdir, stateCwd, config, mission, selectedIds = null, effort = null, onProgress = () => {}, shouldStop = () => false }) {
  mission.status = 'running';
  computeDeps(mission.tasks);
  const providerCount = Object.keys(config.providers || {}).length;
  const maxParallel = Math.max(1, Math.min(config.mission?.maxParallel ?? providerCount, providerCount));
  const inSel = (t) => !selectedIds || selectedIds.includes(t.id);
  const depOf = (id) => mission.tasks.find((x) => x.id === id);
  // #6：從未執行只是沒勾選（unselected skipped）不算依賴滿足；只有 done 或「已完成後跳過」才算
  const depsDone = (t) => (t._deps || []).every((id) => { const d = depOf(id); return !d || d.status === 'done' || (d.status === 'skipped' && !d.unselected); });
  // #4：依賴有任一 failed/blocked/未執行跳過 → 這任務不可能安全執行（缺前置產物），要向下傳播 blocked
  const isDeadDep = (d) => d && (d.status === 'failed' || d.status === 'blocked' || (d.status === 'skipped' && d.unselected));
  const depDead = (t) => (t._deps || []).some((id) => isDeadDep(depOf(id)));
  const deadDepIds = (t) => (t._deps || []).filter((id) => isDeadDep(depOf(id))).map((id) => `#${id}`).join(',');

  // #3：使用者重新勾選 failed/blocked/skipped 的任務要能重跑——重置為 pending 並清掉試過記錄
  if (selectedIds) {
    const RERUN = new Set(['failed', 'blocked', 'skipped']);
    for (const t of mission.tasks) {
      if (selectedIds.includes(t.id) && RERUN.has(t.status)) {
        t.status = 'pending';
        delete t._tried;
        delete t.unselected;
        delete t.resultSummary;
      }
    }
  }
  // 非選取的 pending 標 skipped（#6：標記 unselected 以區分「從未執行」與「已完成後跳過」）
  for (const t of mission.tasks) if (!inSel(t) && t.status === 'pending') { t.status = 'skipped'; t.unselected = true; }
  saveMission(workdir, mission);
  onProgress(mission);

  const busy = new Set();               // 正被佔用的 provider
  const running = new Map();            // taskId -> promise
  let stopped = false;

  const launch = (task) => {
    // 選這家：鏈上第一個「沒忙、沒冷卻、還沒試過」的
    const chain = chainForTask(task, config, stateCwd);
    const st = loadState(stateCwd);
    const now = new Date();
    const provider = chain.find((n) => !busy.has(n) && !isCoolingDown(st, n, now) && !(task._tried || []).includes(n));
    if (!provider) return false; // 現在沒可用的家，稍後再排
    busy.add(provider);
    task.status = 'running';
    task._assigned = provider;
    saveMission(workdir, mission);
    onProgress(mission);
    const prompt = buildTaskPrompt({ task, mission, provider });
    // 給控制台顯示用：簡短標題（角色+任務名）＋完整內容（描述+驗收）
    const taskLabel = `#${task.id} ${roleLabel(task.role)}：${task.title}`;
    const taskDetail = `【#${task.id} ${task.title}】角色：${task.role}\n\n${task.description || ''}\n\n驗收：${task.acceptance || '—'}`;
    const p = (async () => {
      let out;
      try {
        // 單一 provider 鏈：調度器已保證這家沒被別任務佔用，不需 excludeProviders（傳了反而會把它自己排除）
        out = await runTask({ cwd: workdir, stateCwd, prompt, chain: [provider], config, strategy: 'priority', effort, memory: true, taskLabel, taskDetail });
      } catch (err) { out = { chosen: null, result: `執行例外: ${(err && err.message) || err}` }; }
      return { task, provider, out };
    })();
    running.set(task.id, p);
    return true;
  };

  // #4：向下傳播 blocked——前置 failed/blocked/未執行跳過的下游不可能安全執行，逐層標記（fixpoint 確保級聯）
  const propagateBlocked = () => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of mission.tasks) {
        if (inSel(t) && t.status === 'pending' && depDead(t)) {
          t.status = 'blocked';
          t.resultSummary = `因前置任務未成（${deadDepIds(t)}）未執行`;
          changed = true;
        }
      }
    }
  };
  // #5：收尾——把還卡著的 pending 收斂為明確終態（別留假 partial）。
  //   depDead → blocked；就緒卻無家可用（全冷卻/全試過，此時 busy 已空）→ failed 並記原因。
  const settlePending = () => {
    let changed = true;
    while (changed) {
      changed = false;
      propagateBlocked();
      for (const t of mission.tasks) {
        if (inSel(t) && t.status === 'pending' && depsDone(t)) {
          t.status = 'failed';
          t.resultSummary = '就緒但所有家暫時不可用（額度/認證/冷卻），可稍後續跑';
          changed = true;
        }
      }
    }
  };

  // 主調度迴圈
  while (true) {
    if (shouldStop()) stopped = true;
    // #4：前置任務未成（failed/blocked/未執行跳過）的下游不會執行 → 向下傳播 blocked（避免靜默卡 pending）
    propagateBlocked();
    // 有空位就盡量派（不 stop 時）
    if (!stopped) {
      let filled = true;
      while (filled && busy.size < maxParallel) {
        filled = false;
        const ready = mission.tasks.filter((t) => inSel(t) && t.status === 'pending' && depsDone(t) && !running.has(t.id));
        for (const t of ready) { if (busy.size >= maxParallel) break; if (launch(t)) { filled = true; } }
      }
    }
    // #5：沒有進行中的了 → 收尾。收尾前把還卡著的 pending 收斂為明確終態，別留假 partial
    if (running.size === 0) { if (!stopped) settlePending(); break; }

    // 等任一個完成
    const { task, provider, out } = await Promise.race(running.values());
    running.delete(task.id);
    busy.delete(provider);
    if (out.chosen) {
      task.doneBy = out.chosen;
      task.ms = out.ms || null;
      task.resultSummary = String(out.result || '').replace(/\s+/g, ' ').slice(0, 400);
      // B1：棒後驗收分類器（可選，config.verify.enabled）。餵 harness-truth 鐵證抓幻覺回報。
      // 判 CLAIMED_NO_EVIDENCE → 標 unverified（介於 done 與 failed，會被送進總驗收讓總指揮看到紅旗）。
      let verdict = null;
      try { verdict = await verifyBar({ cwd: workdir, stateCwd, config, task: `#${task.id} ${task.title}：${task.description || ''}`, claimText: out.result }); }
      catch { /* 驗收失敗不擋主流程 */ }
      if (verdict && verdict.verdict === 'CLAIMED_NO_EVIDENCE') {
        task.status = 'unverified';
        task.resultSummary = `⚠️ 疑似幻覺回報（${verdict.evidence}）｜原宣稱：${task.resultSummary}`.slice(0, 400);
      } else {
        task.status = 'done';
        if (verdict) task.verifyEvidence = verdict.evidence; // 留驗收依據供追溯
      }
    } else {
      // 這家沒成（額度/認證/錯誤）→ 記下試過的，還有別家就退回 pending 重排，否則 failed
      task._tried = [...(task._tried || []), provider];
      const chain = chainForTask(task, config, stateCwd);
      const st = loadState(stateCwd);
      const hasAlt = chain.some((n) => !task._tried.includes(n) && !isCoolingDown(st, n, new Date()));
      if (hasAlt) { task.status = 'pending'; } // 換一家重試
      else { task.status = 'failed'; task.resultSummary = '所有家皆不可用（額度/認證），可稍後續跑'; }
    }
    task.completedAt = new Date().toISOString();
    delete task._assigned;
    saveMission(workdir, mission);
    onProgress(mission);
  }
  if (stopped) { mission.status = 'stopped'; saveMission(workdir, mission); onProgress(mission); return mission; }

  // 總驗收：對照完成目標出報告（總指揮鏈，一次呼叫）
  // unverified（B1 驗收判疑似幻覺）視為「完工但帶紅旗」——不阻止總驗收，讓總指揮在報告裡看到並處理
  const remaining = mission.tasks.filter((t) => t.status !== 'done' && t.status !== 'skipped' && t.status !== 'unverified');
  if (remaining.length === 0) {
    try {
      const verifyPrompt = [
        '你是總指揮，做「總驗收」。對照完成目標與各任務結果，判斷目標是否達成。',
        `完成目標：${mission.goal}`,
        '各任務結果：',
        ...mission.tasks.map((t) => `- #${t.id} ${t.title}（${t.status}${t.doneBy ? `，由 ${t.doneBy}` : ''}）：${t.resultSummary || ''}`),
        mission.tasks.some((t) => t.status === 'unverified') ? '⚠️ 標記 unverified 的任務已被驗收分類器判「疑似幻覺回報」（宣稱完成但 harness 鐵證顯示沒有對應變動），請務必當成缺口、傾向判未達成。' : '',
        '證據鐵律：判定必須附「實際執行的命令＋原始輸出」；跑不了命令就明講「未實際執行」，嚴禁把推測寫成實測。',
        '請簡短輸出：【判定】達成/未達成；【依據】對照驗收標準的證據；【缺口】若有。',
      ].join('\n');
      const chiefChain = [mission.chief, ...Object.keys(config.providers)].filter((v, i, a) => a.indexOf(v) === i);
      const v = await runTask({ cwd: workdir, stateCwd, prompt: verifyPrompt, chain: chiefChain, config, strategy: 'priority', memory: true });
      mission.report = v.chosen ? String(v.result).slice(0, 3000) : '（總驗收呼叫失敗）';
    } catch { mission.report = '（總驗收呼叫失敗）'; }

    // 自動修復循環：判「未達成」→ 缺口轉修復任務（附加後等使用者閘門，最多兩輪防失控）
    const failed = /【判定】\s*未達成|判定[：:]\s*未達成/.test(mission.report || '');
    if (failed && (mission.fixRounds || 0) < 2) {
      try {
        const chiefChain = [mission.chief, ...Object.keys(config.providers)].filter((v, i, a) => a.indexOf(v) === i);
        const fx = await runTask({ cwd: workdir, stateCwd, prompt: buildFixPrompt(mission), chain: chiefChain, config, strategy: 'priority', memory: true });
        const fixes = fx.chosen ? parseFixTasks(fx.result, mission, config) : [];
        if (fixes.length) {
          mission.tasks.push(...fixes);
          mission.fixRounds = (mission.fixRounds || 0) + 1;
          mission.status = 'needs-fix'; // 修復任務已列出，等使用者按「開始執行」
        } else {
          mission.status = 'partial';
        }
      } catch { mission.status = 'partial'; }
    } else {
      mission.status = failed ? 'partial' : 'done';
    }
  } else if (mission.status !== 'stopped') {
    mission.status = 'partial';
  }
  saveMission(workdir, mission);
  onProgress(mission);
  return mission;
}
