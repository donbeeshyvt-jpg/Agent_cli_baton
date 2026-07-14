// 四家 CLI 的 adapter。每家負責三件事：
//   1. 找到執行檔（resolveBin，有 fallback）
//   2. 用「這台機器實測過」的正確旗標把 prompt + 指定 model 送進去（run）
//   3. 把輸出歸類成 ok / limit / auth / error（classify）—— 這是換手邏輯的依據
//
// model 規則：run() 收到 model 就加對應旗標；沒收到就不加 -> 各家用自己的「最新預設」。
//
// 實測結論（2026-07，Windows）：
//   claude : claude.cmd -p --output-format json，prompt 走 stdin；需 sanitizedEnv
//   codex  : codex.exe exec <p> --json -C <cwd> -s <sandbox> --skip-git-repo-check -o <file>
//   grok   : grok.exe -p <p> --output-format json；結果在 .text；stderr 的 log 是雜訊
//   cursor : cursor-agent.cmd --print --output-format json --trust，prompt 走 stdin
import { existsSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli, sanitizedEnv, needsShell } from './spawn.js';

// Windows 命令列參數上限約 32KB —— prompt 超過這個門檻就不能走 argv（大規格書會爆）
const ARGV_SAFE_LIMIT = 6000;

const HOME = process.env.USERPROFILE || process.env.HOME || '';

// P0 修復（AUDIT #3）：去掉裸 429/401/authenticat —— 「processed 429 files」「Authenticated as…」
// 這類正常輸出不可再誤判。數字碼必須跟 status/code/error 這種語境相鄰才算。
export const LIMIT_RE = /usage limit|rate.?limit|quota (?:exceeded|reached|hit)|too many requests|hit your (?:usage|limit)|insufficient_quota|out of (?:credits|usage)|(?:status|code|error)\D{0,12}429\b|\b429\D{0,12}(?:too many|rate)/i;
export const AUTH_RE = /authentication (?:failed|required|error)|failed to authenticate|unauthorized|not logged in|please (?:log|sign) ?in|invalid (?:\w+ )?credential|re-?authenticat|(?:status|code|error)\D{0,12}401\b/i;

/**
 * 從錯誤訊息解析「重試時間」→ 未來的 Date（解析不到回 null，上層用預設冷卻分鐘數）。
 * P0 修復（AUDIT #7）：支援四種真實格式 ——
 *   1. claude headless："usage limit reached|<unix epoch 秒>"
 *   2. 相對時間："try again in 3 hours 20 minutes" / "in 45 minutes"
 *   3. 絕對時刻（含 AM/PM 無冒號）："try again at 11:25 PM" / "resets 3pm" / "resets at 23:05"
 */
export function parseResetAt(text) {
  if (!text) return null;
  const s = String(text);
  const now = new Date();

  // 1) unix epoch（豎線後接 9-13 位數字）
  const epoch = s.match(/\|\s*(\d{9,13})\b/);
  if (epoch) {
    let n = parseInt(epoch[1], 10);
    if (n < 1e12) n *= 1000; // 秒 -> 毫秒
    const d = new Date(n);
    if (!Number.isNaN(d.getTime()) && d > now) return d;
  }

  // 1.5) 含月份日期："try again at Jul 12th, 2026 3:34 AM"（codex 實撞過的格式）
  const md = s.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\s+(?:at\s+)?(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (md) {
    const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const mon = MONTHS.indexOf(md[1].toLowerCase());
    let hh = parseInt(md[4], 10);
    const mm = parseInt(md[5], 10);
    const ap = (md[6] || '').toUpperCase();
    if (ap === 'PM' && hh < 12) hh += 12;
    if (ap === 'AM' && hh === 12) hh = 0;
    const d = new Date(md[3] ? parseInt(md[3], 10) : now.getFullYear(), mon, parseInt(md[2], 10), hh, mm, 0, 0);
    if (!Number.isNaN(d.getTime()) && d > now) return d; // 過去的日期不猜，退回預設冷卻
  }

  // 2) 相對時間 "in N hours M minutes"（分鐘須 min/minutes 或詞界 m，避免 "modules" 誤判）
  const rel = s.match(/\bin\s+(?:(\d+)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?\b)?/i);
  if (rel && (rel[1] || rel[2])) {
    const ms = ((parseInt(rel[1] || '0', 10) * 60) + parseInt(rel[2] || '0', 10)) * 60000;
    if (ms > 0) return new Date(now.getTime() + ms);
  }

  // 3) 絕對時刻（"resets 3pm" 無冒號也接；純數字無 AM/PM 太模糊，不猜）
  const abs = s.match(/(?:try again at|resets?(?:\s+at)?|available again at|again at)\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (abs) {
    let hh = parseInt(abs[1], 10);
    const mm = abs[2] ? parseInt(abs[2], 10) : 0;
    const ap = (abs[3] || '').toUpperCase();
    if (!abs[2] && !ap) return null; // "resets 3" 資訊不足
    if (hh > 23 || mm > 59) return null;
    if (ap === 'PM' && hh < 12) hh += 12;
    if (ap === 'AM' && hh === 12) hh = 0;
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1); // 時間已過 => 明天同一時刻
    return d;
  }
  return null;
}

function resolveClaudeBin() {
  const cmd = join(process.env.APPDATA || join(HOME, 'AppData', 'Roaming'), 'npm', 'claude.cmd');
  return existsSync(cmd) ? cmd : 'claude'; // 裸名 fallback 由 needsShell 處理（走 shell 讓 PATHEXT 解析）
}
function resolveCodexBin() {
  const p = join(process.env.LOCALAPPDATA || join(HOME, 'AppData', 'Local'), 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe');
  return existsSync(p) ? p : 'codex';
}
function resolveGrokBin() {
  const p = join(HOME, '.grok', 'bin', 'grok.exe');
  return existsSync(p) ? p : 'grok';
}
function resolveCursorBin() {
  const cands = [
    join(process.env.LOCALAPPDATA || '', 'cursor-agent', 'cursor-agent.cmd'), // 本機實測位置
    join(HOME, '.local', 'bin', 'cursor-agent.exe'),
    join(HOME, '.local', 'bin', 'cursor-agent'),
    join(process.env.APPDATA || '', 'npm', 'cursor-agent.cmd'),
  ];
  for (const c of cands) if (c && existsSync(c)) return c;
  return 'cursor-agent';
}

/** 給 doctor / serve 用：回報四家執行檔的解析結果 */
export function resolveBins() {
  return { claude: resolveClaudeBin(), codex: resolveCodexBin(), grok: resolveGrokBin(), cursor: resolveCursorBin() };
}

// effort（強度）對映：統一收 low|medium|high|max，翻譯成各家方言。
// claude 原生支援 low/medium/high/xhigh/max；grok/codex 用 low/medium/high（max 降為 high）；
// cursor 只能內嵌在 model 字串（沒指定 model 就忽略）。
export function mapEffort(name, effort) {
  if (!effort) return null;
  const e = String(effort).toLowerCase();
  if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(e)) return null;
  if (name === 'claude') return e;
  if (e === 'max' || e === 'xhigh') return 'high';
  return e;
}

export const PROVIDERS = {
  claude: {
    name: 'claude',
    async run(prompt, { cwd, timeoutMs, model, effort }) {
      const bin = resolveClaudeBin();
      const args = ['-p', '--output-format', 'json'];
      if (model) args.push('--model', model);
      const eff = mapEffort('claude', effort);
      if (eff) args.push('--effort', eff);
      const res = await runCli({
        bin, args,
        shell: needsShell(bin),
        input: prompt,           // prompt 走 stdin
        env: sanitizedEnv(),     // 清 ANTHROPIC_*/雲端憑證，保留 CLAUDE_CODE_OAUTH_TOKEN
        cwd, timeoutMs,
      });
      return classifyClaude(res);
    },
  },

  codex: {
    name: 'codex',
    async run(prompt, { cwd, timeoutMs, sandbox, model, effort, onProgress }) {
      const bin = resolveCodexBin();
      const outFile = join(tmpdir(), `codex-last-${process.pid}-${Date.now()}.txt`);
      // 大 prompt（如整份規格書）走 stdin（'-'），避開 Windows argv 上限
      const viaStdin = prompt.length > ARGV_SAFE_LIMIT;
      const args = ['exec', viaStdin ? '-' : prompt, '--json', '-C', cwd, '-s', sandbox || 'workspace-write', '--skip-git-repo-check', '-o', outFile];
      if (model) args.push('-m', model);
      const eff = mapEffort('codex', effort);
      if (eff) args.push('-c', `model_reasoning_effort=${eff}`);
      // codex 是唯一 headless 會逐行吐事件的家：解析 JSONL 成人話即時回報進度
      const onChunk = onProgress ? makeCodexProgress(onProgress) : null;
      const res = await runCli({ bin, args, shell: needsShell(bin), input: viaStdin ? prompt : null, env: process.env, cwd, timeoutMs, onChunk });
      return classifyCodex(res, outFile);
    },
  },

  grok: {
    name: 'grok',
    async run(prompt, { cwd, timeoutMs, model, effort }) {
      const bin = resolveGrokBin();
      // grok 怪癖：常只回「我要開始做了」就 EndTurn —— 根因是 headless 下工具卡權限審批。
      // 修法：--always-approve 放行工具（信任等級與 codex full-access / cursor --trust 一致）；
      // 回覆規則文字防護保留當第二道保險。
      const guarded = `${prompt}\n\n（回覆規則：把最終完整結果直接輸出在這一則回覆裡；不要以「我將要／先來」這類計畫描述作結。）`;
      // 大 prompt 改寫暫存檔走 --prompt-file，避開 Windows argv 上限
      let promptFile = null;
      const args = ['--always-approve', '--output-format', 'json'];
      if (guarded.length > ARGV_SAFE_LIMIT) {
        promptFile = join(tmpdir(), `grok-prompt-${process.pid}-${Date.now()}.md`);
        await writeFile(promptFile, guarded, 'utf8');
        args.unshift('--prompt-file', promptFile);
      } else {
        args.unshift('-p', guarded);
      }
      if (model) args.push('-m', model);
      const eff = mapEffort('grok', effort);
      if (eff) args.push('--reasoning-effort', eff);
      const res = await runCli({ bin, args, shell: needsShell(bin), env: process.env, cwd, timeoutMs });
      if (promptFile) { try { await unlink(promptFile); } catch { /* 清不掉就留給 tmp */ } }
      return classifyGrok(res);
    },
  },

  cursor: {
    name: 'cursor',
    async run(prompt, { cwd, timeoutMs, model, effort }) {
      const bin = resolveCursorBin();
      // --print 進 headless、--trust 避免 workspace 信任提示卡住
      const args = ['--print', '--output-format', 'json', '--trust'];
      // cursor 的 effort 只能內嵌在 model 字串（例 model[effort=high]）；沒指定 model 就忽略。
      // 使用者明確指定的 effort 要能覆蓋 model 字串裡既有的 [effort=…]，不可無聲丟棄。
      const eff = mapEffort('cursor', effort);
      let finalModel = model;
      if (model && eff) {
        finalModel = /\[effort=[^\]]*\]/i.test(model)
          ? model.replace(/\[effort=[^\]]*\]/i, `[effort=${eff}]`)
          : `${model}[effort=${eff}]`;
      }
      if (finalModel) args.push('--model', finalModel);
      const res = await runCli({
        bin, args,
        shell: needsShell(bin),
        input: prompt, // prompt 走 stdin，避開 .cmd + 特殊字元的引號問題
        env: process.env,
        cwd, timeoutMs,
      });
      return classifyCursor(res);
    },
  },
};

export function classifyClaude(res) {
  let json = null;
  try { json = JSON.parse(res.stdout.trim()); } catch { /* 非 JSON */ }
  if (json && json.type === 'result') {
    if (json.is_error === false) {
      // modelUsage 的 key 就是本次實際使用的模型 id（例 claude-opus-4-8[1m]）
      const actualModel = json.modelUsage ? Object.keys(json.modelUsage)[0] : undefined;
      return { status: 'ok', text: json.result, cost: json.total_cost_usd, usage: json.usage, actualModel, raw: res };
    }
    const msg = json.result || '';
    // 結構化欄位優先於字串比對
    if (json.api_error_status === 429 || LIMIT_RE.test(msg)) {
      return { status: 'limit', message: msg, resetAt: parseResetAt(msg), raw: res };
    }
    if (json.api_error_status === 401 || AUTH_RE.test(msg)) {
      return { status: 'auth', message: msg, raw: res };
    }
    return { status: 'error', message: msg, raw: res };
  }
  return fallbackClassify(res);
}

// codex --json 事件流 → 人話即時進度。回傳一個吃 stdout 片段的函式（跨 chunk buffer 行）。
// codex 是四家唯一在 headless 下逐行吐中間事件的家；其餘家算完才一次性給結果，無中間過程可串流。
export function makeCodexProgress(onProgress) {
  let buf = '';
  return (piece) => {
    buf += piece;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let ev; try { ev = JSON.parse(line); } catch { continue; }
      const msg = codexEventToText(ev);
      if (msg) onProgress(msg);
    }
  };
}
// 把單一 codex 事件翻成一句人話（認不得的事件回 null，不洗版）
// codex 真實結構：頂層 thread.started/turn.started/turn.completed；動作包在 item.started/item.completed，
// 內層 item.type = agent_message（說話）/ command_execution（執行命令）/ file_change（改檔）。
function codexEventToText(ev) {
  const t = ev.type || '';
  if (t === 'thread.started') return '🚀 codex 開始處理…';
  if (t === 'turn.started') return '⚙️ 開始推理…';
  if (t === 'turn.completed') return '✅ 完成';
  if (t === 'turn.failed') return '❌ 這輪失敗';
  if (t === 'item.started' || t === 'item.completed') {
    const it = ev.item || {};
    const itype = it.type || it.item_type || '';
    const done = t === 'item.completed';
    if (itype === 'agent_message') { const s = it.text || it.content; return s ? '💬 ' + oneLine(s) : null; } // 只在有內容時報（通常 completed 才有）
    if (itype === 'command_execution') {
      const c = oneLine(Array.isArray(it.command) ? it.command.join(' ') : (it.command || ''));
      const ec = it.exit_code;
      return done ? ('▶️ 命令完成' + (ec != null ? '（exit ' + ec + '）' : '') + '：' + c) : ('▶️ 執行命令：' + c);
    }
    if (itype === 'file_change') {
      const n = Array.isArray(it.changes) ? it.changes.length : 0;
      const files = Array.isArray(it.changes) ? it.changes.map((x) => x.path || x.file || '').filter(Boolean).join('、') : '';
      return done ? ('✏️ 已修改' + (n ? ' ' + n + ' 檔' : '') + (files ? '：' + oneLine(files) : '')) : '✏️ 修改檔案中…';
    }
    if (/reason/i.test(itype)) { const s = it.text || it.summary; return s ? '💭 ' + oneLine(s) : null; }
    return null;
  }
  return null;
}
function oneLine(s) { return String(s).replace(/\s+/g, ' ').slice(0, 140); }

export async function classifyCodex(res, outFile) {
  let limitMsg = null;
  let errMsg = null;
  let turnFailed = false;
  for (const line of res.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === 'turn.failed') turnFailed = true;
    if (ev.type === 'error' || ev.type === 'turn.failed') {
      const m = ev.message || (ev.error && ev.error.message) || '';
      if (LIMIT_RE.test(m)) limitMsg = m;
      else if (m && !errMsg) errMsg = m;
    }
  }
  try {
    if (limitMsg) return { status: 'limit', message: limitMsg, resetAt: parseResetAt(limitMsg), raw: res };

    // P0 修復（AUDIT #10）：turn.failed 存在就不是成功 —— 即使 -o 檔有內容
    // （codex 曾「回報完成卻未修改任何檔案」被記成 ok）
    if (turnFailed || errMsg) {
      const m = errMsg || 'codex turn failed（無錯誤訊息）';
      if (AUTH_RE.test(m)) return { status: 'auth', message: m, raw: res };
      return { status: 'error', message: m, raw: res };
    }

    // 逾時或非零 exit：不得因 -o 有內容而假成功，交給 fallbackClassify（timeout 分支可達）
    if (res.timedOut || res.code !== 0) {
      return fallbackClassify(res);
    }

    let text = '';
    try { text = (await readFile(outFile, 'utf8')).trim(); } catch { /* 沒產生 */ }
    if (text) return { status: 'ok', text, raw: res };
    return fallbackClassify(res);
  } finally {
    // P0 修復（AUDIT #12）：outFile 用完即刪，不在 tmpdir 洩漏
    try { await unlink(outFile); } catch { /* 不存在就算了 */ }
  }
}

export function classifyGrok(res) {
  const s = res.stdout.trim();
  let json = null;
  try { json = JSON.parse(s); }
  catch {
    const m = s.match(/\{[\s\S]*\}\s*$/); // 容錯：抓最後一個 JSON 物件（stderr 混入時）
    if (m) { try { json = JSON.parse(m[0]); } catch { /* ignore */ } }
  }
  if (json && typeof json.text === 'string' && json.text.length) {
    return { status: 'ok', text: json.text, stopReason: json.stopReason, raw: res };
  }
  return fallbackClassify(res);
}

// cursor-agent：優先抽常見結果欄位，抽不到再保守處理
export function classifyCursor(res) {
  const s = res.stdout.trim();
  let json = null;
  try { json = JSON.parse(s); }
  catch {
    for (const line of s.split(/\r?\n/).reverse()) { // 可能是 stream JSONL
      try {
        const o = JSON.parse(line);
        if (o && (o.result || o.text || o.response || o.content || o.message)) { json = o; break; }
      } catch { /* ignore */ }
    }
  }
  const text = json && (json.result || json.text || json.response || json.content || json.message);
  if (typeof text === 'string' && text.length) return { status: 'ok', text, raw: res };
  if (res.code === 0 && s && !LIMIT_RE.test(s) && !AUTH_RE.test(s)) return { status: 'ok', text: s, raw: res };
  return fallbackClassify(res);
}

// 沒有可辨識的成功輸出時，從 stdout+stderr 粗略歸類
export function fallbackClassify(res) {
  const blob = `${res.stdout}\n${res.stderr}`;
  if (LIMIT_RE.test(blob)) return { status: 'limit', message: firstLine(blob, LIMIT_RE), resetAt: parseResetAt(blob), raw: res };
  if (AUTH_RE.test(blob)) return { status: 'auth', message: firstLine(blob, AUTH_RE), raw: res };
  if (res.timedOut) return { status: 'error', message: `timeout（已強制終止整棵行程樹${res.truncated ? '，輸出截斷' : ''}）`, raw: res };
  if (res.spawnError) return { status: 'error', message: `spawn 失敗（未安裝或不在 PATH？）: ${res.stderr.slice(0, 160)}`, raw: res };
  return { status: 'error', message: (res.stderr || res.stdout).slice(0, 200) || 'no output', raw: res };
}

function firstLine(blob, re) {
  const line = blob.split(/\r?\n/).find((l) => re.test(l));
  return (line || blob).trim().slice(0, 200);
}
