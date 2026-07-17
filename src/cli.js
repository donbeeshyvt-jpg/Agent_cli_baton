#!/usr/bin/env node
// agentbaton —— 三家 CLI 訂閱輪替協作器的進入點。
//
// 用法：
//   node src/cli.js "<任務>"                          用預設鏈 (claude→codex→grok→cursor)
//   node src/cli.js "<任務>" --chain implement         指定鏈 (codex→cursor→grok→claude)
//   node src/cli.js "<任務>" --model grok-4.5           全部家指定同一 model
//   node src/cli.js "<任務>" --model claude=opus,grok=grok-4.5   分家指定 model
//   node src/cli.js --status                           看四家目前額度/冷卻/model
//   node src/cli.js "<任務>" --dry-run                  只顯示會派給誰，不真的跑
//   node src/cli.js "<任務>" --simulate-limit codex,claude   驗證換手（不燒真額度）
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTask } from './orchestrator.js';
import { loadState, saveState, isCoolingDown, clearCooldown, getCurrent } from './state.js';
import { runDoctor } from './doctor.js';

// agentbaton 安裝根目錄（src/ 的上一層）——設定檔與「全域額度狀態」的家
const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const a = { _: [], chain: null, cwd: process.cwd(), dryRun: false, status: false, simulate: [], models: {}, strategy: null, only: [], noMemory: false, clearCooldown: null };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--chain' || t === '--role') a.chain = argv[++i];
    else if (t === '--cwd') a.cwd = resolve(argv[++i]);
    else if (t === '--dry-run') a.dryRun = true;
    else if (t === '--status') a.status = true;
    else if (t === '--simulate-limit') a.simulate = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (t === '--model') a.models = parseModels(argv[++i], a.models);
    else if (t === '--strategy') a.strategy = argv[++i];
    else if (t === '--only' || t === '--agent') a.only = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (t === '--no-memory') a.noMemory = true; // 不注入共享記憶（單純問答用）
    else if (t === '--clear-cooldown') a.clearCooldown = argv[++i] || 'all';
    else if (t === '--doctor' || t === 'doctor') a.doctor = true; // 啟動前登入檢查
    else if (t === 'serve' || t === '--serve') a.serve = true;    // web 控制台
    else if (t === '--port') a.port = parseInt(argv[++i], 10) || 7680;
    else if (t === '--effort') a.effort = argv[++i];              // 強度 low|medium|high|max
    else a._.push(t);
  }
  return a;
}

// --model 支援：`--model grok-4.5`（套用全部家）或 `--model claude=opus,grok=grok-4.5`（分家指定）
function parseModels(spec, prev = {}) {
  const out = { ...prev };
  for (const item of (spec || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const eq = item.indexOf('=');
    if (eq > 0) out[item.slice(0, eq).trim()] = item.slice(eq + 1).trim();
    else out['*'] = item;
  }
  return out;
}

// A5：不認得的設定鍵 warn 但不擋（向前相容）：config 載入後補一層輕量 schema 驗證。
// 只驗會影響安全/行為的關鍵欄位型別，不認得的頂層鍵只警告不擋（向前相容）。回傳警告陣列。
export function validateConfig(config) {
  const warns = [];
  const KNOWN = new Set(['project', 'defaultChain', 'strategy', 'timeoutMs', 'chief', 'mission', 'chains', 'providers', 'verify']);
  for (const k of Object.keys(config)) {
    if (!KNOWN.has(k) && !k.startsWith('_')) warns.push(`不認得的設定鍵「${k}」（已忽略；底線開頭的註解鍵不算）`);
  }
  if (config.strategy && !['balance', 'priority'].includes(config.strategy)) warns.push(`strategy「${config.strategy}」非 balance/priority，執行時會退回預設`);
  if (config.timeoutMs != null && (!Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0)) warns.push(`timeoutMs 應為正數，現值：${config.timeoutMs}`);
  if (config.chains && typeof config.chains !== 'object') warns.push('chains 應為物件（鏈名→家陣列）');
  if (config.providers && typeof config.providers === 'object') {
    for (const [name, p] of Object.entries(config.providers)) {
      if (p && p.sandbox != null && typeof p.sandbox !== 'string') warns.push(`providers.${name}.sandbox 應為字串或 null`);
      if (p && p.cooldownMinutes != null && (!Number.isFinite(p.cooldownMinutes) || p.cooldownMinutes < 0)) warns.push(`providers.${name}.cooldownMinutes 應為非負數`);
    }
  }
  return warns;
}

// 設定檔尋找順序：--cwd 指定的目錄 → agentbaton 安裝根目錄（讓 --cwd 指到任何作業區都能跑）
function loadConfig(cwd) {
  for (const base of [cwd, APP_ROOT]) {
    const p = join(base, 'orchestrator.config.json');
    if (existsSync(p)) {
      let cfg;
      try { cfg = JSON.parse(readFileSync(p, 'utf8')); }
      catch (e) { console.error(`設定檔解析失敗：${p}\n${e.message}`); process.exit(1); }
      for (const w of validateConfig(cfg)) console.error(`⚠️ 設定檔：${w}`); // A5：warn 但不擋
      return cfg;
    }
  }
  console.error(`找不到 orchestrator.config.json（找過：${cwd} 與 ${APP_ROOT}）`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const config = loadConfig(args.cwd);

// --effort 入口 fail-fast：打錯字不可無聲蒸發成預設強度
const EFF_OK = ['low', 'medium', 'high', 'xhigh', 'max'];
if (args.effort && !EFF_OK.includes(String(args.effort).toLowerCase())) {
  console.error(`--effort 只接受 ${EFF_OK.join('|')}（收到：${args.effort}）`);
  process.exit(1);
}

// serve：本地 web 控制台（啟動前自動跑 doctor）
if (args.serve) {
  const { serve } = await import('./server.js');
  console.log('# agentbaton serve —— 本地 web 控制台\n');
  console.log('啟動前檢查（doctor）…');
  const { runDoctor: doctorFn } = await import('./doctor.js');
  const d = await doctorFn(config);
  for (const r of d.results) {
    console.log(`  ${r.ok ? (r.warn ? '🟡' : '🟢') : '🔴'} ${r.name.padEnd(7)} ${r.detail}${r.fix ? `　→ ${r.fix}` : ''}`);
  }
  if (!d.allOk) console.log('\n⚠️ 有幾家未就緒（照上面修法登入）。控制台照常啟動，未就緒的家會在派工時被自動跳過。');
  const port = args.port || 7680;
  try {
    await serve({ cwd: args.cwd, config, port });
    console.log(`\n✔ 控制台在 http://127.0.0.1:${port} （只綁本機，Ctrl+C 結束）`);
  } catch (err) {
    console.error(`✘ 啟動失敗：${err.message}（改用 --port <其他埠> 重試）`);
    process.exit(1);
  }
} else {

// --doctor：啟動前檢查——要啟用的每家 CLI 是否已安裝＋登入（零額度消耗）
if (args.doctor) {
  console.log('# 啟動前檢查（doctor）—— 確認各家吃得到訂閱額度\n');
  const { allOk, results } = await runDoctor(config);
  for (const r of results) {
    const icon = r.ok ? (r.warn ? '🟡' : '🟢') : '🔴';
    console.log(`  ${icon} ${r.name.padEnd(7)} ${r.detail}${r.fix ? `　→ 修法：${r.fix}` : ''}`);
  }
  console.log(allOk ? '\n✔ 全部就緒，訂閱額度可用。' : '\n✘ 有幾家還沒就緒——照上面的修法登入後再跑一次 --doctor。');
  process.exit(allOk ? 0 : 1);
}

// --clear-cooldown <家|all>：手動解除冷卻（登入修好後用）
if (args.clearCooldown) {
  const st = loadState(APP_ROOT); // 額度狀態全域共用
  const targets = args.clearCooldown === 'all' ? Object.keys(st.providers || {}) : [args.clearCooldown];
  for (const t of targets) clearCooldown(st, t);
  saveState(APP_ROOT, st);
  console.log(`已清除冷卻：${targets.join(', ') || '(無)'}`);
  process.exit(0);
}

// --status：印出各家狀態就結束
if (args.status) {
  const state = loadState(APP_ROOT); // 額度狀態全域共用
  const now = new Date();
  console.log('# 各家額度狀態\n');
  console.log(`策略：${config.strategy || 'priority'}（balance=均攤 / priority=依鏈順序）\n`);
  const cur = getCurrent(APP_ROOT);
  if (cur) console.log(`  ⏳ 進行中：${cur.provider} [${cur.model}] 正在處理「${cur.task}」（自 ${new Date(cur.startedAt).toLocaleTimeString()}）\n`);
  for (const name of Object.keys(config.providers)) {
    const model = config.providers[name].model || '(最新預設)';
    const uses = state.providers?.[name]?.uses || 0;
    const usage = `用量 ${String(uses).padStart(3)} 次`;
    if (isCoolingDown(state, name, now)) {
      const info = state.providers[name];
      console.log(`  🔴 ${name.padEnd(7)} model=${String(model).padEnd(14)} ${usage}  冷卻到 ${new Date(info.cooldownUntil).toLocaleString()}  ${info.reason ? `(${info.reason})` : ''}`);
    } else {
      console.log(`  🟢 ${name.padEnd(7)} model=${String(model).padEnd(14)} ${usage}  可用`);
    }
  }
  process.exit(0);
}

const prompt = args._.join(' ').trim();
if (!prompt) {
  console.error([
    '用法: node src/cli.js "<任務>" [選項]',
    '  --chain default|implement|review|plan   選任務鏈（角色分工用）',
    '  --strategy balance|priority             調度策略（預設看設定檔；balance=均攤, priority=依鏈順序）',
    '  --only grok  /  --only codex,grok        子代理模式：只叫指定的家（依序，不均攤）',
    '  --model grok-4.5  /  --model claude=opus,grok=grok-4.5   指定 model（不指定=各家最新）',
    '  --status        看四家額度/冷卻/用量      --dry-run  只顯示派給誰（零副作用）',
    '  --simulate-limit codex,claude            測試換手（不燒真額度）',
    '  --no-memory     不注入共享記憶（單純問答）  --clear-cooldown <家|all>  手動解除冷卻',
    '  --doctor        啟動前檢查：各家是否已安裝＋登入（零額度消耗）',
  ].join('\n'));
  process.exit(1);
}

let chainName;
let chain;
let strat;
if (args.only.length) {
  // 子代理模式：指定一或多家直接叫，依給定順序（不做均攤）
  chain = args.only;
  chainName = 'only:' + args.only.join('+');
  strat = args.strategy || 'priority';
} else {
  chainName = args.chain && config.chains[args.chain] ? args.chain : config.defaultChain;
  chain = config.chains[chainName] || config.chains[config.defaultChain];
  strat = args.strategy || config.strategy || 'priority';
}

console.error(`▶ 任務交給鏈 [${chainName}] · 策略 ${strat}：${chain.join(' → ')}\n`);

const out = await runTask({
  cwd: args.cwd,
  stateCwd: APP_ROOT, // 額度/冷卻集中在 agentbaton 本體，不分裂到各作業區
  prompt,
  chain,
  config,
  models: args.models,
  strategy: strat,
  effort: args.effort || null, // 強度 low|medium|high|max（各家自動翻譯）
  simulateLimit: args.simulate,
  dryRun: args.dryRun,
  force: args.only.length > 0, // 子代理模式：繞過冷卻強制叫指定的家
  memory: !args.noMemory,      // 預設注入共享記憶（docs/ 接力紀錄）
});

for (const at of out.attempts) {
  const icon =
    at.status === 'ok' ? '✅ 完成' :
    at.status === 'limit' ? '🔴 額度耗盡' :
    at.status === 'auth' ? '🔑 認證問題' :
    at.status === 'skipped-cooldown' ? '⏭️  冷卻中跳過' :
    at.status === 'would-run' ? '🟡 會派給這家' :
    at.status === 'missing' ? '❔ 未設定' : '⚠️  錯誤';
  let line = `  ${icon.padEnd(8)} ${at.provider}`;
  if (at.model) line += ` [${at.model}]`;
  if (at.ms != null) line += ` (${at.ms}ms)`;
  if (at.simulated) line += ' [模擬]';
  if (at.until) line += ` → 冷卻到 ${new Date(at.until).toLocaleString()}`;
  if (at.message) line += ` · ${at.message}`;
  console.error(line);
}

if (out.dryRun) {
  console.error(`\n(dry-run) 會派給：${out.chosen}`);
  process.exit(0);
}

if (out.chosen) {
  console.error(`\n✔ 由 ${out.chosen} 完成 (${out.ms}ms)。結果 ↓\n`);
  console.log(out.result);
  process.exit(0);
}

console.error('\n✘ 這條鏈上所有家都不可用（額度耗盡 / 認證 / 錯誤）。用 `--status` 看冷卻時間，登入修好後可用 `--clear-cooldown <家>` 解鎖。');
process.exit(2);

} // 非 serve 模式的 CLI 邏輯結束
