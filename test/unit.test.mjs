// 單元測試 —— 覆蓋 docs/AUDIT.md 標紅的脆弱邏輯：
//   classify 四家 / parseResetAt / LIMIT_RE 誤判 / state 原子寫與壞檔備份 / 共享記憶注入
// 跑法：node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseResetAt, LIMIT_RE, AUTH_RE,
  classifyClaude, classifyCodex, classifyGrok, classifyCursor,
} from '../src/providers.js';
import { loadState, saveState, setCooldown, isCoolingDown, recordUse, getUses } from '../src/state.js';
import { composeDispatchPrompt, recordDispatchResult } from '../src/memory.js';
import { needsShell, sanitizedEnv } from '../src/spawn.js';
import { summarizeBriefIfHuge, planWithFallback, buildPlanPrompt } from '../src/mission.js';

const res = (stdout, extra = {}) => ({ stdout, stderr: '', code: 0, timedOut: false, spawnError: false, truncated: false, ...extra });

// ---------- parseResetAt ----------
test('parseResetAt: claude 的 unix epoch 格式（|秒數）', () => {
  const d = parseResetAt('Claude AI usage limit reached|4102444800'); // 2100-01-01
  assert.ok(d instanceof Date && d > new Date());
});

test('parseResetAt: 相對時間 in N minutes / hours', () => {
  const d = parseResetAt('Rate limit exceeded, try again in 45 minutes');
  const diff = (d - new Date()) / 60000;
  assert.ok(diff > 43 && diff < 47, `預期約 45 分，得到 ${diff}`);
  const d2 = parseResetAt('please retry in 2 hours');
  const diff2 = (d2 - new Date()) / 3600000;
  assert.ok(diff2 > 1.9 && diff2 < 2.1);
});

test('parseResetAt: 絕對時刻 at 11:25 PM 與無冒號 3pm', () => {
  const d = parseResetAt('try again at 11:25 PM.');
  assert.equal(d.getHours(), 23);
  assert.equal(d.getMinutes(), 25);
  const d2 = parseResetAt('5-hour limit reached ∙ resets 3pm');
  assert.equal(d2.getHours(), 15);
});

test('parseResetAt: 解析不到回 null、模糊不猜', () => {
  assert.equal(parseResetAt('nothing useful here'), null);
  assert.equal(parseResetAt('resets 3'), null); // 無冒號無 AM/PM，資訊不足
  assert.equal(parseResetAt(''), null);
});

test('parseResetAt: 含月份日期的 codex 新格式（Jul 12th, 2026 3:34 AM）', () => {
  const d = parseResetAt('You have hit your usage limit. Try again at Dec 25th, 2099 3:34 AM.');
  assert.ok(d instanceof Date);
  assert.equal(d.getFullYear(), 2099);
  assert.equal(d.getMonth(), 11);
  assert.equal(d.getDate(), 25);
  assert.equal(d.getHours(), 3);
  assert.equal(d.getMinutes(), 34);
  // 過去的日期不猜，回 null 退預設冷卻
  assert.equal(parseResetAt('try again at Jan 1st, 2020 3:34 AM'), null);
});

// ---------- LIMIT_RE / AUTH_RE 誤判（AUDIT P0-3）----------
test('LIMIT_RE: 不誤判正常輸出裡的 429', () => {
  assert.ok(!LIMIT_RE.test('processed 429 files successfully'));
  assert.ok(!LIMIT_RE.test('total 4290 tokens used'));
});

test('LIMIT_RE: 命中真實額度訊息', () => {
  assert.ok(LIMIT_RE.test("You've hit your usage limit. Upgrade to Pro"));
  assert.ok(LIMIT_RE.test('Rate limit exceeded'));
  assert.ok(LIMIT_RE.test('API error status 429'));
});

test('AUTH_RE: 不誤判成功登入訊息', () => {
  assert.ok(!AUTH_RE.test('Authenticated as user@example.com'));
  assert.ok(!AUTH_RE.test('Authentication: OK'));
  assert.ok(!AUTH_RE.test('request id 4013 completed'));
});

test('AUTH_RE: 命中真實認證錯誤', () => {
  assert.ok(AUTH_RE.test("Authentication required. Please run 'agent login' first"));
  assert.ok(AUTH_RE.test('Failed to authenticate. API Error: 401 Invalid authentication credentials'));
  assert.ok(AUTH_RE.test('You are not logged in'));
});

// ---------- classify 四家 ----------
test('classifyClaude: 成功（含中文）', () => {
  const r = classifyClaude(res(JSON.stringify({ type: 'result', is_error: false, result: '哈囉，測試中文', total_cost_usd: 0.01 })));
  assert.equal(r.status, 'ok');
  assert.equal(r.text, '哈囉，測試中文');
});

test('classifyClaude: 429 structured -> limit + resetAt', () => {
  const r = classifyClaude(res(JSON.stringify({ type: 'result', is_error: true, api_error_status: 429, result: 'usage limit reached|4102444800' })));
  assert.equal(r.status, 'limit');
  assert.ok(r.resetAt instanceof Date);
});

test('classifyClaude: 401 -> auth', () => {
  const r = classifyClaude(res(JSON.stringify({ type: 'result', is_error: true, api_error_status: 401, result: 'Failed to authenticate' })));
  assert.equal(r.status, 'auth');
});

test('classifyGrok: stderr 有雜訊也能抓到 JSON', () => {
  const r = classifyGrok(res('{"text":"READY","stopReason":"EndTurn"}', { stderr: 'ERROR tool_error: execution_failure ...' }));
  assert.equal(r.status, 'ok');
  assert.equal(r.text, 'READY');
});

test('classifyCursor: result 欄位', () => {
  const r = classifyCursor(res(JSON.stringify({ type: 'result', result: '我是 Auto' })));
  assert.equal(r.status, 'ok');
  assert.equal(r.text, '我是 Auto');
});

test('classifyCodex: turn.failed 存在時即使 -o 有內容也不算成功（假成功防護 AUDIT P0-10）', async () => {
  const outFile = join(tmpdir(), `codex-test-${Date.now()}.txt`);
  await writeFile(outFile, '看起來像成功的訊息，但其實沒改任何檔案');
  const jsonl = [
    JSON.stringify({ type: 'thread.started', thread_id: 'x' }),
    JSON.stringify({ type: 'turn.failed', error: { message: 'patch apply failed' } }),
  ].join('\n');
  const r = await classifyCodex(res(jsonl), outFile);
  assert.equal(r.status, 'error');
  assert.ok(!existsSync(outFile), 'outFile 應被清理'); // AUDIT P0-12
});

test('classifyCodex: 額度耗盡 -> limit + 解析出重置時間', async () => {
  const outFile = join(tmpdir(), `codex-test2-${Date.now()}.txt`);
  const jsonl = JSON.stringify({ type: 'error', message: "You've hit your usage limit. try again at 11:25 PM." });
  const r = await classifyCodex(res(jsonl), outFile);
  assert.equal(r.status, 'limit');
  assert.equal(r.resetAt.getHours(), 23);
});

test('classifyCodex: 正常成功讀 -o 檔', async () => {
  const outFile = join(tmpdir(), `codex-test3-${Date.now()}.txt`);
  await writeFile(outFile, '完成了');
  const jsonl = JSON.stringify({ type: 'turn.completed' });
  const r = await classifyCodex(res(jsonl), outFile);
  assert.equal(r.status, 'ok');
  assert.equal(r.text, '完成了');
});

// ---------- state 原子寫 / 壞檔備份（AUDIT P0-1）----------
test('state: 存/讀 roundtrip + 冷卻與用量共存', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tricli-state-'));
  const st = loadState(dir);
  setCooldown(st, 'codex', new Date(Date.now() + 60000), '測試');
  recordUse(st, 'codex');
  saveState(dir, st);
  const st2 = loadState(dir);
  assert.ok(isCoolingDown(st2, 'codex'));
  assert.equal(getUses(st2, 'codex'), 1); // setCooldown 不可蓋掉 uses
  const files = readdirSync(join(dir, '.orchestrator'));
  assert.ok(!files.some((f) => f.includes('.tmp-')), '不應留下 tmp 檔');
});

test('state: 壞檔備份成 .corrupt-*、不炸、回空狀態', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tricli-state2-'));
  mkdirSync(join(dir, '.orchestrator'), { recursive: true });
  writeFileSync(join(dir, '.orchestrator', 'state.json'), '{"providers": {  半寫壞掉');
  const st = loadState(dir);
  assert.deepEqual(st.providers, {});
  const files = readdirSync(join(dir, '.orchestrator'));
  assert.ok(files.some((f) => f.startsWith('state.json.corrupt-')), '壞檔應被備份保留證據');
});

// ---------- 共享記憶（Goal 1）----------
test('memory: 注入 Active Summary / HANDOFF / 交接指示', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tricli-mem-'));
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'CONVERSATION_LOG.md'), '# Conversation Log\n\n## Active Summary\n最新方向：做計算機。\n\n## Log Entries\n');
  writeFileSync(join(dir, 'docs', 'HANDOFF.md'), '# Handoff\n\nLast updated: 2026-07-11\n\n## Current State\n規劃完成。\n\n## Last Completed Task\n無。\n\n## Next Safe Task\n實作 calc.js。\n');
  const p = composeDispatchPrompt(dir, '實作計算機');
  assert.ok(p.includes('共享記憶'));
  assert.ok(p.includes('做計算機'));       // Active Summary 有進去
  assert.ok(p.includes('實作 calc.js'));   // Next Safe Task 有進去
  assert.ok(p.includes('[交接]'));         // 有要求輸出交接摘要
  assert.ok(p.includes('實作計算機'));     // 任務本體在
});

test('memory: 沒有 docs 就原樣派工', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tricli-mem2-'));
  assert.equal(composeDispatchPrompt(dir, '純任務'), '純任務');
});

test('memory: 寫回 DEV_LOG + 更新 HANDOFF Last Completed Task', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tricli-mem3-'));
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'HANDOFF.md'), '# Handoff\n\nLast updated: 2026-01-01\n\n## Last Completed Task\n舊任務。\n\n## Next Safe Task\nX。\n');
  recordDispatchResult(dir, { provider: 'grok', task: '實作計算機', result: '做完了\n[交接] 已建立 calc.js，下一步補測試。' });
  const dev = readFileSync(join(dir, 'docs', 'DEV_LOG.md'), 'utf8');
  assert.ok(dev.includes('grok'));
  assert.ok(dev.includes('[交接] 已建立 calc.js'));
  const h = readFileSync(join(dir, 'docs', 'HANDOFF.md'), 'utf8');
  assert.ok(h.includes('grok：實作計算機'));
  assert.ok(!h.includes('舊任務'));
});

// ---------- mission（任務書）----------
test('mission: 審查/測試任務注入證據鐵律；實作任務不注入', async () => {
  const { buildTaskPrompt } = await import('../src/mission.js');
  const mission = { goal: '目標' };
  const review = buildTaskPrompt({ task: { id: 1, title: 'x', description: 'y', role: 'review', acceptance: 'z' }, mission, provider: 'grok' });
  assert.ok(review.includes('證據鐵律'));
  assert.ok(review.includes('未實際執行'));
  const impl = buildTaskPrompt({ task: { id: 2, title: 'x', description: 'y', role: 'implement', acceptance: 'z' }, mission, provider: 'cursor' });
  assert.ok(!impl.includes('證據鐵律'));
  assert.ok(impl.includes('Agent OS')); // 注入專案內建技能核心
  assert.ok(impl.includes('[交接]')); // Record System 紀律
});

test('mission: parsePlan 解析圍欄 JSON 並強制上限', async () => {
  const { parsePlan } = await import('../src/mission.js');
  const text = '好的\n```json\n{"goal":"G","tasks":[{"id":1,"title":"a","description":"d","role":"implement","provider":"codex","acceptance":"v"},{"id":2,"title":"b","description":"d","role":"bad-role","provider":"nobody","acceptance":"v"}]}\n```';
  const { plan, error } = parsePlan(text, { maxTasks: 1, providers: ['claude', 'codex', 'grok', 'cursor'] });
  assert.equal(error, undefined);
  assert.equal(plan.tasks.length, 1); // maxTasks 硬上限
  assert.equal(plan.tasks[0].provider, 'codex');
});

test('mission: 強制審查——≥3 任務無審查自動補、審查者避開主要實作者', async () => {
  const { ensureReviewTask } = await import('../src/mission.js');
  const config = { providers: { claude: { preferredRoles: ['plan', 'review'] }, codex: { preferredRoles: ['implement'] }, grok: { preferredRoles: ['review'] }, cursor: { preferredRoles: ['implement'] } } };
  const plan = { tasks: [
    { id: 1, title: 'a', role: 'implement', provider: 'cursor' },
    { id: 2, title: 'b', role: 'implement', provider: 'cursor' },
    { id: 3, title: 'c', role: 'docs', provider: 'claude' },
  ] };
  ensureReviewTask(plan, config);
  assert.equal(plan.tasks.length, 4);
  const rv = plan.tasks[3];
  assert.equal(rv.role, 'review');
  assert.ok(rv.provider !== 'cursor', '審查者不可是主要實作者'); // cursor 做最多
  // 已有審查 → 不重複補
  ensureReviewTask(plan, config);
  assert.equal(plan.tasks.length, 4);
  // <3 任務 → 不補
  const small = { tasks: [{ id: 1, role: 'implement' }, { id: 2, role: 'docs' }] };
  ensureReviewTask(small, config);
  assert.equal(small.tasks.length, 2);
});

test('mission: 修復任務解析——id 接續、上限 5、標記 [修復]', async () => {
  const { parseFixTasks } = await import('../src/mission.js');
  const mission = { tasks: [{ id: 1 }, { id: 2 }, { id: 7 }] };
  const config = { providers: { claude: {}, codex: {}, grok: {}, cursor: {} } };
  const text = '好\n```json\n{"tasks":[{"title":"修A","description":"d","role":"implement","provider":"cursor","acceptance":"v"},{"title":"修B","description":"d","role":"bad","provider":"nobody","acceptance":"v"}]}\n```';
  const fixes = parseFixTasks(text, mission, config);
  assert.equal(fixes.length, 2);
  assert.equal(fixes[0].id, 8); // 接續最大 id
  assert.ok(fixes[0].title.startsWith('[修復]'));
  assert.equal(fixes[1].role, 'implement'); // 壞 role 正規化
  assert.equal(fixes[1].provider, null);    // 壞 provider 交回角色鏈
  assert.deepEqual(parseFixTasks('沒有 JSON', mission, config), []);
});

test('mission: parsePlan 重編重複 id 為唯一並映射 dependsOn（並行安全）', async () => {
  const { parsePlan } = await import('../src/mission.js');
  // 總指揮給了重複 id（1,1,3）＋ dependsOn 指到舊 id
  const text = '```json\n{"goal":"G","tasks":[' +
    '{"id":1,"title":"a","role":"implement","provider":"codex","acceptance":"v"},' +
    '{"id":1,"title":"b","role":"implement","provider":"cursor","acceptance":"v"},' +
    '{"id":3,"title":"c","role":"review","provider":"grok","acceptance":"v","dependsOn":[1,3]}]}\n```';
  const { plan, error } = parsePlan(text, { maxTasks: 12, providers: ['claude', 'codex', 'grok', 'cursor'] });
  assert.equal(error, undefined);
  assert.deepEqual(plan.tasks.map((t) => t.id), [1, 2, 3]); // 全域唯一連續
  // dependsOn:[1,3] → 舊 1 映射到新 1；舊 3 映射到新 3；只留 < 自己(3) 的 → [1]
  assert.deepEqual(plan.tasks[2].dependsOn, [1]);
});

test('mission: computeDeps 偵測循環依賴並打斷（不靜默卡死）', async () => {
  const { computeDeps } = await import('../src/mission.js');
  const tasks = [{ id: 1, role: 'implement', dependsOn: [2] }, { id: 2, role: 'implement', dependsOn: [1] }];
  computeDeps(tasks);
  assert.ok(tasks[0]._depCycle && tasks[1]._depCycle); // 標記為環
  assert.deepEqual(tasks[0]._deps, []); // 依賴被打斷，可執行
  assert.deepEqual(tasks[1]._deps, []);
});

test('state: saveState 回傳 true（成功落地可觀測）', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { saveState } = await import('../src/state.js');
  const dir = mkdtempSync(join(tmpdir(), 'tricli-save-'));
  assert.equal(saveState(dir, { schemaVersion: 1, providers: {} }), true);
});

test('mission: computeDeps 推導——review 依賴前面非 review、test 依賴前面 implement', async () => {
  const { computeDeps } = await import('../src/mission.js');
  const tasks = [
    { id: 1, role: 'implement' },
    { id: 2, role: 'implement' },
    { id: 3, role: 'test' },
    { id: 4, role: 'review' },
    { id: 5, role: 'review', dependsOn: [1] }, // 明示優先
  ];
  computeDeps(tasks);
  assert.deepEqual(tasks[0]._deps, []);           // implement 無依賴 → 可並行
  assert.deepEqual(tasks[2]._deps, [1, 2]);       // test 依賴前面 implement
  assert.deepEqual(tasks[3]._deps, [1, 2, 3]);    // review 依賴前面非 review
  assert.deepEqual(tasks[4]._deps, [1]);          // 明示 dependsOn 優先
});

test('state: updateState 並發原子——多筆同時更新不遺失', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { updateState, loadState, getUses } = await import('../src/state.js');
  const dir = mkdtempSync(join(tmpdir(), 'tricli-conc-'));
  // 10 筆並發：5 次 recordUse claude、5 次 recordUse codex —— 全部要記到，不互蓋
  const { recordUse, setCooldown } = await import('../src/state.js');
  const ops = [];
  for (let i = 0; i < 5; i++) ops.push(updateState(dir, (s) => recordUse(s, 'claude')));
  for (let i = 0; i < 5; i++) ops.push(updateState(dir, (s) => recordUse(s, 'codex')));
  ops.push(updateState(dir, (s) => setCooldown(s, 'grok', new Date(Date.now() + 60000), 'x')));
  await Promise.all(ops);
  const st = loadState(dir);
  assert.equal(getUses(st, 'claude'), 5); // 若有 lost update 會 < 5
  assert.equal(getUses(st, 'codex'), 5);
  assert.ok(st.providers.grok.cooldownUntil);
});

test('state: getCurrentMap 容納多家並行、clearCurrent 只清一家', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { setCurrent, clearCurrent, getCurrentMap } = await import('../src/state.js');
  const dir = mkdtempSync(join(tmpdir(), 'tricli-cur-'));
  setCurrent(dir, { provider: 'cursor', model: 'auto', task: 'A' });
  setCurrent(dir, { provider: 'codex', model: 'gpt', task: 'B' });
  let m = getCurrentMap(dir);
  assert.deepEqual(Object.keys(m).sort(), ['codex', 'cursor']);
  clearCurrent(dir, 'cursor');
  m = getCurrentMap(dir);
  assert.deepEqual(Object.keys(m), ['codex']); // 只清 cursor，codex 還在
});

// ---------- spawn helpers ----------
test('needsShell: .cmd 與 Windows 裸名要 shell，.exe 不用', () => {
  assert.equal(needsShell('C:\\Users\\x\\npm\\claude.cmd'), true);
  assert.equal(needsShell('C:\\Users\\x\\.grok\\bin\\grok.exe'), false);
  if (process.platform === 'win32') assert.equal(needsShell('claude'), true); // 裸名靠 cmd 的 PATHEXT
});

test('sanitizedEnv: 保留 CLAUDE_CODE_OAUTH_TOKEN、清掉 ANTHROPIC/AWS/GOOGLE（AUDIT P0-8）', () => {
  process.env.CLAUDE_CODE_OAUTH_TOKEN = 'keep-me';
  process.env.ANTHROPIC_BASE_URL = 'https://proxy';
  process.env.AWS_BEARER_TOKEN_BEDROCK = 'nope';
  process.env.GOOGLE_APPLICATION_CREDENTIALS = 'nope';
  const env = sanitizedEnv();
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, 'keep-me');
  assert.ok(!('ANTHROPIC_BASE_URL' in env));
  assert.ok(!('AWS_BEARER_TOKEN_BEDROCK' in env));
  assert.ok(!('GOOGLE_APPLICATION_CREDENTIALS' in env));
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  delete process.env.AWS_BEARER_TOKEN_BEDROCK;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
});

// ---------- 規劃降級（planWithFallback / summarizeBriefIfHuge）2026-07-13 ----------
// 修復「headless 總指揮對大規格易卡死整條 Mission」：超大 brief 自動摘要 + 規劃逐家降級。
const _planCfg = { providers: { claude: { preferredRoles: ['plan'] }, codex: { preferredRoles: ['implement'] } } };
const _goodPlan = '```json\n{"goal":"g","tasks":[{"id":1,"title":"t","description":"d","role":"implement","provider":"codex","acceptance":"a","dependsOn":[]}]}\n```';

test('summarizeBriefIfHuge：小規格原樣不動', () => {
  const small = '# 目標\n做一個 TODO CLI\n- 新增\n- 列出';
  const r = summarizeBriefIfHuge(small);
  assert.equal(r.summarized, false);
  assert.equal(r.text, small);
});

test('summarizeBriefIfHuge：超大規格摘要並保留結構骨架與頭尾', () => {
  const huge = ['# 大型規格', 'SLICE-001 匯入模組',
    ...Array.from({ length: 5000 }, (_, i) => `第 ${i} 行散文填充，無結構意義。`),
    'FR-004 功能需求', 'QG-001 品質關卡', '## 交付驗收'].join('\n');
  const r = summarizeBriefIfHuge(huge);
  assert.equal(r.summarized, true);
  assert.ok(r.text.length < huge.length / 2);
  for (const id of ['SLICE-001', 'FR-004', 'QG-001', '# 大型規格', '## 交付驗收']) assert.ok(r.text.includes(id), `應保留 ${id}`);
  assert.equal(r.originalLen, huge.length);
});

test('buildPlanPrompt：超大規劃書自動走摘要', () => {
  const huge = ['# 規格', ...Array.from({ length: 5000 }, (_, i) => `第 ${i} 行散文。`)].join('\n');
  const p = buildPlanPrompt({ planDoc: huge, config: _planCfg, quotaNote: '', maxTasks: 5, chief: 'codex' });
  assert.ok(p.includes('已自動摘要'));
  assert.ok(p.length < huge.length);
});

test('planWithFallback：第一家成功就不換家（不浪費額度）', async () => {
  const calls = [];
  const r = await planWithFallback({ cwd: '.', stateCwd: '.', prompt: 'p', chain: ['claude', 'codex'], config: _planCfg,
    runFn: async ({ chain }) => { calls.push(chain[0]); return { chosen: chain[0], result: _goodPlan }; } });
  assert.equal(r.plannedBy, 'claude');
  assert.equal(calls.length, 1);
  assert.equal(r.plan.tasks.length, 1);
});

test('planWithFallback：第一家卡住(unavailable)→自動換第二家', async () => {
  const r = await planWithFallback({ cwd: '.', stateCwd: '.', prompt: 'p', chain: ['claude', 'codex'], config: _planCfg,
    runFn: async ({ chain }) => chain[0] === 'claude' ? { chosen: null, attempts: [] } : { chosen: 'codex', result: _goodPlan } });
  assert.equal(r.plannedBy, 'codex');
});

test('planWithFallback：第一家回垃圾(解析失敗)→自動換第二家', async () => {
  const r = await planWithFallback({ cwd: '.', stateCwd: '.', prompt: 'p', chain: ['claude', 'codex'], config: _planCfg,
    runFn: async ({ chain }) => chain[0] === 'claude' ? { chosen: 'claude', result: '想一下…沒有 JSON' } : { chosen: 'codex', result: _goodPlan } });
  assert.equal(r.plannedBy, 'codex');
});

test('planWithFallback：全部失敗→明確報錯且附 attempts 診斷（不靜默）', async () => {
  const r = await planWithFallback({ cwd: '.', stateCwd: '.', prompt: 'p', chain: ['claude', 'codex'], config: _planCfg,
    runFn: async () => ({ chosen: null, attempts: [] }) });
  assert.ok(r.error);
  assert.equal(r.attempts.length, 2);
});

test('planWithFallback：規劃用專用短 timeout（非執行階段的全域長 timeout）', async () => {
  let seen = null;
  await planWithFallback({ cwd: '.', stateCwd: '.', prompt: 'p', chain: ['claude'], config: _planCfg, perTryTimeoutMs: 180000,
    runFn: async ({ timeoutMs }) => { seen = timeoutMs; return { chosen: 'claude', result: _goodPlan }; } });
  assert.equal(seen, 180000);
});
