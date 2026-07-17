// 統一的子行程執行層。
// 負責處理的雷點（對應 docs/AUDIT.md 的 P0）：
//   1. Windows 上 claude/cursor 是 .cmd shim（要走 shell），codex/grok 是真 .exe（不用）。
//   2. prompt 一律走 stdin 或 argv 陣列，避開引號/換行地獄。
//   3. stdin 掛 'error' 監聽吞 EPIPE —— 子行程提早關 stdin 不可打掛整支 orchestrator。
//   4. stdout/stderr 用 StringDecoder 逐塊解碼 —— 中文/emoji 切在 UTF-8 邊界不再變亂碼。
//   5. 逾時在 Windows 用 taskkill /T /F 殺整棵行程樹 —— 不留孤兒繼續燒訂閱額度。
//   6. 輸出設 20MB 上限 —— 失控 CLI 不會撐爆記憶體。
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

const MAX_BUF = 20 * 1024 * 1024; // 輸出上限 20MB，超過截斷並標記

/**
 * 執行一個 CLI 子行程，回傳 { code, signal, stdout, stderr, timedOut, truncated, spawnError, durationMs }。
 * 永不 reject —— 失敗都收斂成回傳物件，交給上層 classify。
 */
export function runCli({ bin, args = [], shell = false, input = null, env = null, cwd = null, timeoutMs = 180000, onChunk = null }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let child;
    try {
      // shell:true 時 Node 不會幫 bin 加引號 —— 路徑含空格（如 Program Files）會被 cmd 截斷，須自行包引號
      const binForSpawn = shell && /\s/.test(bin) && !/^".*"$/.test(bin) ? `"${bin}"` : bin;
      child = spawn(binForSpawn, args, {
        shell,
        cwd: cwd || process.cwd(),
        env: env || process.env,
        windowsHide: true,
      });
    } catch (err) {
      resolve({ code: -1, signal: null, stdout: '', stderr: String((err && err.message) || err), timedOut: false, truncated: false, spawnError: true, durationMs: 0 });
      return;
    }

    // 逐塊解碼器：跨 chunk 的多位元組 UTF-8 字元不會被切壞
    const outDec = new StringDecoder('utf8');
    const errDec = new StringDecoder('utf8');
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child); // Windows 殺整棵樹，不留孤兒
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      const piece = outDec.write(d);
      if (stdout.length < MAX_BUF) stdout += piece;
      else truncated = true;
      // 即時串流回呼（不傳 onChunk＝維持原行為）；回呼自身錯誤不可打斷子行程
      if (onChunk && piece) { try { onChunk(piece); } catch { /* 前端斷線等，忽略 */ } }
    });
    child.stderr.on('data', (d) => {
      if (stderr.length < MAX_BUF) stderr += errDec.write(d);
      else truncated = true;
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve({ code: -1, signal: null, stdout, stderr: `${stderr}\n${err.message}`, timedOut, truncated, spawnError: true, durationMs: Date.now() - startedAt });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      stdout += outDec.end();
      stderr += errDec.end();
      resolve({ code, signal: signal || null, stdout, stderr, timedOut, truncated, spawnError: false, durationMs: Date.now() - startedAt });
    });

    // prompt 走 stdin；先掛 error 監聽再寫，EPIPE 不冒成 uncaughtException
    if (child.stdin) {
      child.stdin.on('error', () => { /* 子行程提早關 stdin（EPIPE），安全忽略 */ });
      try {
        if (input != null) child.stdin.write(input);
        child.stdin.end();
      } catch { /* 同步例外也吞掉 */ }
    }
  });
}

/** Windows 用 taskkill /T /F 殺整棵行程樹；其他平台 SIGKILL */
function killTree(child) {
  try {
    if (process.platform === 'win32' && child.pid) {
      const tk = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      // spawn 的 ENOENT/EMFILE 是「非同步 error 事件」，不掛監聽會 uncaughtException 打掛整支協作器
      tk.on('error', () => { try { child.kill('SIGKILL'); } catch { /* 已結束 */ } });
    } else {
      child.kill('SIGKILL');
    }
  } catch {
    try { child.kill('SIGKILL'); } catch { /* 已結束 */ }
  }
}

/**
 * shell 判斷與「執行檔副檔名」解耦（AUDIT P0-9）：
 * - .cmd/.bat 一定要 shell（Node 18.20+/22 無法直接 spawn .cmd）
 * - Windows 上的裸名（無路徑分隔、非 .exe）也走 shell，讓 cmd.exe 做 PATHEXT 解析
 */
export function needsShell(bin) {
  if (/\.(cmd|bat)$/i.test(bin)) return true;
  if (process.platform === 'win32' && !/[\\/]/.test(bin) && !/\.exe$/i.test(bin)) return true;
  return false;
}

// A5（#9 防線）：共用的「參數值安全」驗證。
// .cmd 走 shell:true 時 Node 不跳脫 argv —— 含空白/shell 元字元的值會被 cmd 拆壞甚至注入。
// model/sandbox 等「來自 config 或使用者、會進 argv」的值，一律先過這關。放行常見合法字元（英數 . - + : / [ ] = ,）。
export function isSafeArgValue(v) {
  return typeof v === 'string' && v.length > 0 && v.length <= 200 && /^[\w.\-+:/[\]=,@]+$/.test(v);
}

// 產生「乾淨」的環境變數（給 claude 子行程）：
// - 清掉 ANTHROPIC_ 系列（session proxy base_url）與 CLAUDE_CODE_ session 標記 → 走使用者的訂閱登入
// - 但保留 CLAUDE_CODE_OAUTH_TOKEN（`claude setup-token` 產的無人值守訂閱憑證，AUDIT P0-8）
// - 補清 AWS_ / GOOGLE_ / VERTEX 等雲端憑證 → 防止走 Bedrock/Vertex 變 API 計費，違背「吃訂閱」
const ENV_KEEP = new Set(['CLAUDE_CODE_OAUTH_TOKEN']);
const ENV_STRIP = [/^CLAUDE/i, /^ANTHROPIC/i, /^AI_AGENT$/i, /^BAGGAGE$/i, /^CLAUDECODE$/i, /^AWS_/i, /^GOOGLE_/i, /^GCLOUD_/i, /^VERTEX/i, /^CLOUD_ML_REGION$/i];

export function sanitizedEnv() {
  const out = {};
  for (const [k, v] of Object.entries(process.env)) {
    // Windows 環境變數名不分大小寫：keep 比對用大寫，跟 /i 的 strip 對稱
    if (ENV_KEEP.has(k.toUpperCase())) { out[k] = v; continue; }
    if (ENV_STRIP.some((re) => re.test(k))) continue;
    out[k] = v;
  }
  return out;
}
