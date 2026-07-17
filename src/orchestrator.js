// 核心：拿一個任務，沿著 chain 找一個「還有額度」的 CLI 來做。
// next-man-up 換手規則：
//   ok    -> 記用量、寫回共享記憶（交接）、回傳結果
//   limit -> 額度耗盡：設冷卻（優先用錯誤訊息裡的重置時間）並「立即落地」，換下一家
//   auth  -> 認證問題：設短冷卻（≤60 分）標記需人工，換下一家
//   error -> 其他錯誤：記錄，換下一家
//
// P0 修復（docs/AUDIT.md）：
//   - --dry-run 完全零副作用（不寫 state / LOG）
//   - 每次 setCooldown 後立即 saveState —— 中途被 kill 也不丟冷卻記憶
//   - r.resetAt 必須是「未來且 7 天內」的有效時間才採用
//   - provider.run 包 try/catch，adapter 例外不打斷換手鏈
//
// Goal 1 接線：派工前注入共享記憶（memory.js），成功後寫回交接紀錄。
import { PROVIDERS, isDegenerateReport } from './providers.js';
import { loadState, isCoolingDown, setCooldown, recordUse, getUses, getLastUsedAt, getFailStreak, setCurrent, clearCurrent, updateCurrentLive, updateState } from './state.js';
import { appendLog } from './log.js';
import { composeDispatchPrompt, recordDispatchResult } from './memory.js';
import { isSafeArgValue } from './spawn.js';

// B4：暫態錯誤同家原地短重試，別為了網路抖動就整條鏈判死。
// 只認「換一家也一樣會發生」的暫態訊號：連線重置、逾時、DNS 失敗、5xx。
export const TRANSIENT_RE = /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network|(?:status|code)\D{0,8}5\d\d\b|502|503|504/i;
const TRANSIENT_MAX_RETRY = 2;      // 小預算快升級：撐不過就換手，不像 5xx 那樣重試 15 次
const TRANSIENT_BASE_MS = 2000;     // 退避基數：2s、4s（封頂 30s）
// 指數退避 + ±20% 抖動（抗驚群）。attempt 從 1 起算。
export function backoffMs(attempt, base = TRANSIENT_BASE_MS, cap = 30000, rand = Math.random) {
  const exp = Math.min(base * 2 ** (attempt - 1), cap);
  return Math.round(exp * (0.8 + rand() * 0.4)); // 0.8~1.2 倍
}
// B4：冷卻時長「按連續失敗次數指數化 + 抖動」。第 1 次冷卻用 baseMin，之後每次翻倍（封頂 4 倍），加抖動。
export function jitteredCooldownUntil(baseMin, failStreak = 0, from = Date.now(), rand = Math.random) {
  const mult = Math.min(2 ** Math.max(0, failStreak), 4); // 1,2,4,4...
  const ms = baseMin * 60000 * mult * (0.9 + rand() * 0.2); // ±10% 抖動
  return new Date(from + Math.round(ms));
}
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// stateCwd：額度/冷卻狀態存放處（預設同 cwd）。任務書模式派工到「作業區」時，
// cwd=作業區（紀錄跟著專案走），stateCwd=agentbaton 本體（額度是 provider 全域的，不該分散在各作業區）。
export async function runTask({ cwd, stateCwd = cwd, prompt, chain, config, models = {}, strategy, effort = null, simulateLimit = [], dryRun = false, force = false, memory = true, excludeProviders = null, timeoutMs = null, taskLabel = null, taskDetail = null }) {
  const state = loadState(stateCwd); // 唯讀快照，供排序/略過決策；真正的變更走 updateState 原子寫
  const exclude = excludeProviders instanceof Set ? excludeProviders : new Set(excludeProviders || []);
  const now = new Date();
  const attempts = [];
  const cooldownMin = (name) => config.providers?.[name]?.cooldownMinutes ?? 60;
  // model 優先序：CLI 指定該家 > CLI 全域 (*) > 設定檔 > null(各家最新預設)
  const modelFor = (name) => models[name] ?? models['*'] ?? config.providers?.[name]?.model ?? null;

  // 依策略決定嘗試順序：
  //   balance  = 均攤額度：未冷卻的候選依「使用次數少→多」排前面（同次數比 lastUsedAt 舊的優先）
  //   priority = 依鏈原順序（搭配角色鏈 implement/review/plan 就是「角色分工」）
  const strat = strategy || config.strategy || 'priority';
  let order = chain.slice();
  if (strat === 'balance') {
    const runnable = chain.filter((n) => PROVIDERS[n] && !isCoolingDown(state, n, now) && !simulateLimit.includes(n));
    const rest = chain.filter((n) => !runnable.includes(n));
    runnable.sort((a, b) => (getUses(state, a) - getUses(state, b)) || getLastUsedAt(state, a).localeCompare(getLastUsedAt(state, b)));
    order = [...runnable, ...rest];
  }

  // 共享記憶注入：派工前把 docs/ 接力紀錄接在任務前（協作的核心；dry-run 不需要）
  const finalPrompt = memory && !dryRun ? composeDispatchPrompt(cwd, prompt) : prompt;

  for (const name of order) {
    const provider = PROVIDERS[name];
    if (!provider) { attempts.push({ provider: name, status: 'missing' }); continue; }

    // 並行模式：這家正被別的任務佔用 → 跳過（避免同一 CLI 兩個行程在同一作業區互踩檔案）
    if (exclude.has(name)) { attempts.push({ provider: name, status: 'skipped-busy' }); continue; }

    // 還在冷卻 -> 直接跳過，不浪費一次呼叫（--only 子代理模式用 force 繞過）。用 fresh 讀避免並行下的舊快照。
    if (!force && isCoolingDown(loadState(stateCwd), name, new Date())) {
      attempts.push({ provider: name, status: 'skipped-cooldown' });
      continue;
    }

    // dry-run 完全零副作用：模擬名單只標記，不寫任何狀態（P0 修復 AUDIT #11）
    if (dryRun) {
      if (simulateLimit.includes(name)) {
        attempts.push({ provider: name, status: 'limit', simulated: true });
        continue;
      }
      attempts.push({ provider: name, status: 'would-run' });
      return { chosen: name, dryRun: true, attempts };
    }

    // 測試用：強制某家「假裝額度用完」，驗證換手而不燒真額度
    if (simulateLimit.includes(name)) {
      const until = new Date(Date.now() + cooldownMin(name) * 60000);
      await updateState(stateCwd, (s) => setCooldown(s, name, until, '模擬額度耗盡 (--simulate-limit)')); // 原子寫
      attempts.push({ provider: name, status: 'limit', simulated: true, until: until.toISOString() });
      appendLog(cwd, { provider: name, status: 'limit', message: '模擬額度耗盡', until });
      continue;
    }

    // 真的叫這家 CLI（adapter 例外不可打斷換手鏈）
    const model = modelFor(name);
    // model 白名單驗證（一處擋四家）：.cmd 走 shell:true 時 Node 不跳脫 args，擋掉空白/shell 符號
    if (model && !isSafeArgValue(model)) {
      attempts.push({ provider: name, status: 'error', message: `model 含非法字元：${String(model).slice(0, 40)}` });
      continue;
    }
    // A5：sandbox 值也會進 codex argv（-s <sandbox>），同樣要驗，防 config 被污染成注入向量
    const sandboxVal = config.providers?.[name]?.sandbox;
    if (sandboxVal && !isSafeArgValue(sandboxVal)) {
      attempts.push({ provider: name, status: 'error', message: `sandbox 含非法字元：${String(sandboxVal).slice(0, 40)}` });
      continue;
    }
    const started = Date.now();
    // 即時「誰在跑什麼」：label=簡短任務標題（前端預設顯示）、detail=完整任務內容（前端點開看）
    // 沒給 taskLabel 時退回原本的 prompt 開頭（相容單次派工）
    setCurrent(stateCwd, {
      provider: name,
      model: model || '(latest)',
      task: taskLabel || String(prompt).replace(/\s+/g, ' ').slice(0, 140), // 相容舊欄位
      label: taskLabel || String(prompt).replace(/\s+/g, ' ').slice(0, 60),
      detail: taskDetail || String(prompt).replace(/\s+/g, ' '),             // 完整內容（不截斷）
    });
    // 即時進度串流：把最近幾條進度節流寫進 current.live（前端顯示「正在做什麼」）
    // 節流 800ms 一次寫檔，避免 codex 密集吐事件時狂寫檔；保留最近 6 條滾動顯示
    const liveLines = [];
    let liveTimer = null;
    const flushLive = () => { liveTimer = null; updateCurrentLive(stateCwd, name, liveLines.slice(-6).join('\n')); };
    const onProgress = (line) => {
      liveLines.push(line);
      if (!liveTimer) liveTimer = setTimeout(flushLive, 800);
    };
    let r;
    // B4：暫態錯誤（連線重置/逾時/5xx）同家原地短重試，退避+抖動；耗盡才落到換手邏輯
    let transientTry = 0;
    try {
      for (;;) {
        try {
          r = await provider.run(finalPrompt, {
            cwd,
            timeoutMs: timeoutMs ?? config.timeoutMs ?? 180000,
            sandbox: config.providers?.[name]?.sandbox,
            model,
            effort,
            onProgress,
          });
        } catch (err) {
          r = { status: 'error', message: `adapter 例外: ${(err && err.message) || err}` };
        }
        // 只有「非成功 + 訊息像暫態 + 還有重試預算」才原地退避重試
        const looksTransient = r.status !== 'ok' && r.status !== 'limit' && TRANSIENT_RE.test(String(r.message || ''));
        if (looksTransient && transientTry < TRANSIENT_MAX_RETRY) {
          transientTry++;
          const wait = backoffMs(transientTry);
          onProgress(`⏳ 暫態錯誤，${Math.round(wait / 1000)}s 後同家重試（第 ${transientTry}/${TRANSIENT_MAX_RETRY} 次）`);
          await sleep(wait);
          continue;
        }
        break;
      }
    } finally {
      if (liveTimer) clearTimeout(liveTimer);
      clearCurrent(stateCwd, name); // 只清這家（並行下不能全清）
    }
    const ms = Date.now() - started;

    if (r.status === 'ok') {
      await updateState(stateCwd, (s) => recordUse(s, name, new Date(), ms)); // 原子：記次數＋耗時
      const usedModel = model || r.actualModel || '(該家預設)';
      // B3/A4 弱信號接線：劣化輸出偵測 + codex 零動作旗標——不改 ok 判定，
      // 但一路帶到 LOG 標記、任務摘要、與 B1 驗收的額外鐵證（環環相扣）。
      const degenerate = isDegenerateReport(r.text);
      const suspectNoAction = Boolean(r.suspectNoAction);
      attempts.push({ provider: name, status: 'ok', ms, model: usedModel });
      appendLog(cwd, { provider: name, status: 'ok', ms, model: usedModel, result: r.text, degenerate, suspectNoAction });
      if (memory) recordDispatchResult(cwd, { provider: name, task: prompt, result: r.text }); // 寫回交接
      return { chosen: name, result: r.text, attempts, ms, model: usedModel, strategy: strat, degenerate, suspectNoAction };
    }

    if (r.status === 'limit') {
      const limitNow = new Date();
      const validReset = r.resetAt instanceof Date
        && !Number.isNaN(r.resetAt.getTime())
        && r.resetAt > limitNow
        && (r.resetAt.getTime() - limitNow.getTime()) < 7 * 24 * 3600 * 1000;
      // B4：有真實重置時間就用它（最準）；退回預設冷卻時改用指數退避+抖動（連續撞牆就拉長，防狂試）
      const streak = getFailStreak(loadState(stateCwd), name);
      const until = validReset ? r.resetAt : jitteredCooldownUntil(cooldownMin(name), streak, limitNow.getTime());
      await updateState(stateCwd, (s) => setCooldown(s, name, until, r.message)); // 原子：冷卻立即落地
      attempts.push({ provider: name, status: 'limit', ms, until: until.toISOString(), message: short(r.message) });
      appendLog(cwd, { provider: name, status: 'limit', ms, until, message: r.message });
      continue;
    }

    if (r.status === 'auth') {
      const until = new Date(Date.now() + Math.min(cooldownMin(name), 60) * 60000);
      await updateState(stateCwd, (s) => setCooldown(s, name, until, `認證/登入問題: ${short(r.message)}`));
      attempts.push({ provider: name, status: 'auth', ms, until: until.toISOString(), message: short(r.message) });
      appendLog(cwd, { provider: name, status: 'auth', ms, until, message: r.message });
      continue;
    }

    attempts.push({ provider: name, status: 'error', ms, message: short(r.message) });
    appendLog(cwd, { provider: name, status: 'error', ms, message: r.message });
  }

  return { chosen: null, result: null, attempts, exhausted: true };
}

function short(m) { return m ? String(m).replace(/\s+/g, ' ').slice(0, 160) : undefined; }
