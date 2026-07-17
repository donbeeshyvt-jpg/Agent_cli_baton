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
import { loadState, saveState, setCooldown, isCoolingDown, recordUse, getUses, getFailStreak } from '../src/state.js';
import { composeDispatchPrompt, recordDispatchResult, staleWarning } from '../src/memory.js';
import { needsShell, sanitizedEnv, isSafeArgValue } from '../src/spawn.js';
import { summarizeBriefIfHuge, planWithFallback, buildPlanPrompt, parsePlan } from '../src/mission.js';
import { trimOutput } from '../src/log.js';
import { isDegenerateReport } from '../src/providers.js';
import { backoffMs, jitteredCooldownUntil, TRANSIENT_RE } from '../src/orchestrator.js';
import { collectHarnessTruth, parseVerdict, buildVerifyPrompt } from '../src/verify.js';

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

// ═══════════ grok-build 知識提取（A1-A5 + B1/B3/B4）2026-07-17 ═══════════

// ---------- A1 交接紀錄過期警語 ----------
test('staleWarning: 交接超過門檻回警語、新鮮回空', () => {
  const now = new Date('2026-07-17T12:00:00Z');
  const fresh = '## Last Completed Task\n2026-07-17T10:00:00Z — claude：做了事\n\n## 其他';
  assert.equal(staleWarning(fresh, now), ''); // 2 小時前，新鮮
  const stale = '## Last Completed Task\n2026-07-15T10:00:00Z — claude：做了事\n\n## 其他';
  assert.match(staleWarning(stale, now), /交接紀錄已.*小時未更新/); // 50 小時前
  assert.equal(staleWarning('', now), ''); // 空的不炸
  assert.equal(staleWarning('沒有時間戳的文字', now), ''); // 抓不到時間戳回空
});

// ---------- A2/A3 LOG 頭尾剪裁 ----------
test('trimOutput: 短的不動、長的頭尾保留中段略去', () => {
  assert.equal(trimOutput('短短的'), '短短的');
  const long = 'A'.repeat(1600) + 'MIDDLE' + 'B'.repeat(1600); // >3200
  const t = trimOutput(long);
  assert.ok(t.length < long.length, '應變短');
  assert.ok(t.startsWith('A'.repeat(100)), '保留開頭');
  assert.ok(t.endsWith('B'.repeat(100)), '保留結尾');
  assert.match(t, /中段.*字略/);
  assert.ok(!t.includes('MIDDLE'), '中段應被略去');
});

// ---------- A5 參數安全驗證 ----------
test('isSafeArgValue: 放行合法 model/sandbox、擋 shell 元字元', () => {
  assert.ok(isSafeArgValue('claude-opus-4-8'));
  assert.ok(isSafeArgValue('opus[1m]'));
  assert.ok(isSafeArgValue('danger-full-access'));
  assert.ok(isSafeArgValue('gpt-5.6-sol'));
  assert.ok(!isSafeArgValue('a b'), '空白擋掉');
  assert.ok(!isSafeArgValue('x && rm -rf'), 'shell 符號擋掉');
  assert.ok(!isSafeArgValue('a"b'), '引號擋掉');
  assert.ok(!isSafeArgValue(''), '空字串擋掉');
  assert.ok(!isSafeArgValue('a'.repeat(201)), '超長擋掉');
});

// ---------- B3 劣化輸出偵測 ----------
test('isDegenerateReport: 空洞回報判劣化、有證據不判', () => {
  assert.ok(isDegenerateReport('已完成')); // 純空殼
  assert.ok(isDegenerateReport('done. 搞定了，沒問題')); // 都是空殼語句
  assert.ok(isDegenerateReport('')); // 全空
  assert.ok(!isDegenerateReport('已完成，改了 src/foo.js，跑 `npm test` 42 passed')); // 有檔案+指令+測試
  assert.ok(!isDegenerateReport('修好了，見 tools/bar.js 第 20 行的 function')); // 有路徑+function
  const longReal = '我分析了問題，' + '這段邏輯需要重構因為'.repeat(30); // 長但無證據
  assert.ok(!isDegenerateReport(longReal), '夠長就不算劣化（可能是規劃/分析）');
});

// ---------- B4 重試退避 + 冷卻指數化 ----------
test('backoffMs: 指數退避在抖動範圍內、封頂', () => {
  const r0 = () => 0, r1 = () => 1;
  // attempt=1: base 2000 * 2^0 = 2000, 抖動 0.8~1.2 → 1600~2400
  assert.ok(backoffMs(1, 2000, 30000, r0) >= 1600 && backoffMs(1, 2000, 30000, r1) <= 2400);
  // attempt=2: 4000 → 3200~4800
  assert.ok(backoffMs(2, 2000, 30000, r0) >= 3200);
  // 封頂：attempt 很大也不超過 cap*1.2
  assert.ok(backoffMs(20, 2000, 30000, r1) <= 30000 * 1.2);
});

test('jitteredCooldownUntil: 連續失敗越多冷卻越長（封頂 4 倍）', () => {
  const from = 0, r = () => 0.5; // 抖動中點
  const s0 = jitteredCooldownUntil(60, 0, from, r).getTime(); // 60 分 * 1
  const s1 = jitteredCooldownUntil(60, 1, from, r).getTime(); // * 2
  const s3 = jitteredCooldownUntil(60, 3, from, r).getTime(); // * 4（封頂）
  const s5 = jitteredCooldownUntil(60, 5, from, r).getTime(); // 仍 * 4
  assert.ok(s1 > s0, 'streak 1 比 0 長');
  assert.ok(s3 > s1, 'streak 3 比 1 長');
  assert.equal(s5, s3, 'streak 5 封頂等於 3');
});

test('TRANSIENT_RE: 認得暫態錯誤、不誤判一般錯誤', () => {
  assert.ok(TRANSIENT_RE.test('Error: ECONNRESET'));
  assert.ok(TRANSIENT_RE.test('socket hang up'));
  assert.ok(TRANSIENT_RE.test('server returned status 503'));
  assert.ok(!TRANSIENT_RE.test('syntax error in file')); // 一般錯誤不重試
  assert.ok(!TRANSIENT_RE.test('usage limit reached')); // 額度不是暫態
});

test('state: failStreak 隨冷卻累加、成功清零', () => {
  const st = { providers: {} };
  setCooldown(st, 'grok', new Date(Date.now() + 60000), '測試');
  assert.equal(getFailStreak(st, 'grok'), 1);
  setCooldown(st, 'grok', new Date(Date.now() + 60000), '再撞');
  assert.equal(getFailStreak(st, 'grok'), 2);
  recordUse(st, 'grok');
  assert.equal(getFailStreak(st, 'grok'), 0, '成功清零');
});

// ---------- B1 棒後驗收分類器 ----------
test('parseVerdict: 三階段容錯解析 + verdict 白名單', () => {
  assert.deepEqual(parseVerdict('{"verdict":"DONE_VERIFIED","confidence":0.9,"evidence":"改了3檔"}'),
    { verdict: 'DONE_VERIFIED', confidence: 0.9, evidence: '改了3檔' });
  // 帶 code fence
  assert.equal(parseVerdict('```json\n{"verdict":"CLAIMED_NO_EVIDENCE","confidence":0.8,"evidence":"零變動"}\n```').verdict, 'CLAIMED_NO_EVIDENCE');
  // 前後有雜訊，抓平衡大括號
  assert.equal(parseVerdict('我判斷如下：{"verdict":"PARTIAL","confidence":0.5,"evidence":"半"} 以上').verdict, 'PARTIAL');
  // confidence 超界夾回 [0,1]
  assert.equal(parseVerdict('{"verdict":"DONE_VERIFIED","confidence":5}').confidence, 1);
  // 非法 verdict 回 null
  assert.equal(parseVerdict('{"verdict":"MAYBE"}'), null);
  assert.equal(parseVerdict('沒有 JSON'), null);
});

test('collectHarnessTruth: 從宣稱抓指令、無 git 優雅降級', () => {
  const t = collectHarnessTruth(tmpdir(), { claimText: '我跑了 `npm test`，改了 src/foo.js' });
  assert.ok(Array.isArray(t.claimedCommands));
  assert.ok(t.claimedCommands.some((c) => /npm test/.test(c)));
  assert.equal(typeof t.gitAvailable, 'boolean'); // tmpdir 通常非 git，但不該炸
});

test('verifyBar: config.verify 未啟用時回 null（預設關）', async () => {
  const { verifyBar } = await import('../src/verify.js');
  const r = await verifyBar({ cwd: '.', stateCwd: '.', config: { verify: { enabled: false } }, task: 't', claimText: 'done' });
  assert.equal(r, null);
});

test('buildVerifyPrompt: 有 git 鐵證時把變動數攤進 prompt', () => {
  const p = buildVerifyPrompt({ task: '做一個函式', claimText: '已完成',
    truth: { gitAvailable: true, changedFiles: 0, changedLines: 0, diffStat: '' } });
  assert.match(p, /harness-truth/);
  assert.match(p, /改了 0 個檔/); // 零變動的鐵證要出現
  assert.match(p, /CLAIMED_NO_EVIDENCE/); // 選項要在
});

// B1 修復：collectHarnessTruth 要算 untracked 新建檔（實戰抓到的 bug）
test('collectHarnessTruth: git repo 裡的 untracked 新檔要算進 changedFiles', async () => {
  const { collectHarnessTruth } = await import('../src/verify.js');
  const { execSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'baton-verify-'));
  try {
    execSync('git init -q && git config user.email t@t && git config user.name t', { cwd: dir, shell: true });
    execSync('git commit -q --allow-empty -m init', { cwd: dir, shell: true });
    writeFileSync(join(dir, 'newfile.js'), 'export const x = 1;\n'); // 新建 untracked 檔
    const t = collectHarnessTruth(dir, { claimText: '建了 newfile.js' });
    assert.equal(t.gitAvailable, true);
    assert.ok(t.changedFiles >= 1, `untracked 新檔應算變動，得到 ${t.changedFiles}`);
    assert.ok(t.untrackedFiles.includes('newfile.js'));
  } catch (e) {
    // 沒 git 的環境跳過（CI 有 git）
    if (!/git/.test(String(e.message))) throw e;
  }
});

// 接線稽核修復：B3/A4 弱信號要一路帶到 LOG 標記與 B1 額外鐵證
test('appendLog: degenerate/suspectNoAction 旗標寫進 LOG 標記', async () => {
  const { appendLog } = await import('../src/log.js');
  const dir = mkdtempSync(join(tmpdir(), 'baton-log-'));
  appendLog(dir, { provider: 'codex', status: 'ok', ms: 100, result: '已完成', degenerate: true, suspectNoAction: true });
  const log = readFileSync(join(dir, 'docs', 'LOG.md'), 'utf8');
  assert.match(log, /疑似空洞回報/);
  assert.match(log, /零動作事件/);
});

test('buildVerifyPrompt: extraTruth 弱信號攤進鐵證區', () => {
  const p = buildVerifyPrompt({ task: 't', claimText: 'done', truth: { gitAvailable: true, changedFiles: 0, changedLines: 0, diffStat: '' }, extraTruth: '上游弱信號：codex 零動作' });
  assert.match(p, /上游弱信號：codex 零動作/);
  assert.ok(p.indexOf('上游弱信號') < p.indexOf('=== 機器鐵證') + 500, '弱信號要在鐵證區內');
});

// 大型實戰抓到的 bug：規劃單描述含 ```（反引號圍欄）時，圍欄正則提早截斷 → 全滅
test('parsePlan: 任務描述含 ``` 反引號不再截斷（實戰回歸）', () => {
  const reply = '```json\n{"goal":"做 markdown 模組","tasks":[{"id":1,"title":"markdown","description":"支援 ```圍欄程式碼區塊``` 與 `inline code`","role":"implement","provider":"codex","acceptance":"全綠","dependsOn":[]}]}\n```';
  const r = parsePlan(reply, { maxTasks: 12, providers: ['claude','codex','grok','cursor'] });
  assert.ok(!r.error, `不應解析失敗：${r.error}`);
  assert.equal(r.plan.tasks.length, 1);
  assert.match(r.plan.tasks[0].description, /圍欄程式碼區塊/);
});

test('parsePlan: 無圍欄 + 描述含 } 與 ``` 也能抽（平衡掃描泛化）', () => {
  const reply = '規劃如下：{"goal":"g","tasks":[{"id":1,"title":"t","description":"用 ``` 包 {x} 的碼","role":"implement","provider":"grok","acceptance":"a","dependsOn":[]}]} 以上。';
  const r = parsePlan(reply, { maxTasks: 12, providers: ['claude','codex','grok','cursor'] });
  assert.ok(!r.error, `不應解析失敗：${r.error}`);
});
