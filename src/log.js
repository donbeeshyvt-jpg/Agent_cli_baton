// 把每次呼叫與換手寫進 docs/LOG.md —— 機器自動累積的執行日誌。
// P0 修復：appendLog 全包 try/catch —— LOG.md 被編輯器鎖住（EPERM/EBUSY）時
// 絕不能拋錯吃掉剛燒完額度的成功結果；寫不進就吐到 stderr。
// LOG.md 依大小門檻自動輪替封存（解無上限增長），產出區塊頭尾剪裁（保留脈絡丟中段）。
import { appendFileSync, existsSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const HEADER = `# 執行日誌 (LOG)

四家 CLI 的每次呼叫、額度換手、產出都記在這。是換手後接力的「交接棒」之一（機器寫）。
格式：\`時間\` **provider** → 狀態 · 說明

`;

// LOG.md 超過此大小就把舊內容封存到 docs/log-archive/，LOG.md 只留 HEADER + 指標。可用環境變數覆寫。
export const LOG_ROTATE_BYTES = Number(process.env.AGENTBATON_LOG_ROTATE_BYTES) || 200_000;

// A3：產出區塊頭尾剪裁。超過門檻時只留開頭 + 結尾，中段以省略標記取代（保留脈絡、丟細節）。
const OUT_TRIM_THRESHOLD = 3200; // 超過才剪
const OUT_TRIM_HEAD = 1500;
const OUT_TRIM_TAIL = 1500;
export function trimOutput(text) {
  const s = String(text || '');
  if (s.length <= OUT_TRIM_THRESHOLD) return s;
  return `${s.slice(0, OUT_TRIM_HEAD)}\n\n  …（中段 ${s.length - OUT_TRIM_HEAD - OUT_TRIM_TAIL} 字略）…\n\n  ${s.slice(-OUT_TRIM_TAIL)}`;
}

// A2：若 LOG.md 超過門檻，把現有內容（去掉 HEADER）搬到 archive，LOG.md 重置成 HEADER + 指標行。
// 封存檔不自動刪除（刪除是破壞性動作），只累積在 docs/log-archive/，留給使用者之後清或做 Dream 鞏固。
function rotateIfHuge(dir, file) {
  try {
    if (!existsSync(file)) return;
    if (statSync(file).size < LOG_ROTATE_BYTES) return;
    const content = readFileSync(file, 'utf8');
    const body = content.startsWith(HEADER) ? content.slice(HEADER.length) : content;
    if (!body.trim()) return; // 只有 HEADER，沒東西可封存
    const archiveDir = join(dir, 'log-archive');
    if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveFile = join(archiveDir, `LOG-${stamp}.md`);
    writeFileSync(archiveFile, HEADER + body);
    writeFileSync(file, `${HEADER}> 前段紀錄已封存於 docs/log-archive/LOG-${stamp}.md\n\n`);
  } catch (err) {
    console.error(`[log] LOG.md 輪替失敗（不影響寫入）: ${err && err.message}`);
  }
}

export function appendLog(cwd, entry) {
  try {
    const dir = join(cwd, 'docs');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const file = join(dir, 'LOG.md');
    if (!existsSync(file)) writeFileSync(file, HEADER);
    rotateIfHuge(dir, file); // A2：寫入前先看要不要封存

    const ts = new Date().toISOString();
    let line = `- \`${ts}\` **${entry.provider}** → \`${entry.status}\``;
    if (entry.model) line += ` · model=${entry.model}`;
    if (entry.ms != null) line += ` (${entry.ms}ms)`;
    if (entry.until) {
      const u = entry.until instanceof Date ? entry.until.toISOString() : entry.until;
      line += ` · 冷卻到 ${u}`;
    }
    if (entry.message) line += ` · ${String(entry.message).replace(/\s+/g, ' ').slice(0, 200)}`;
    // B3/A4 弱信號標記：在 LOG 一眼看得到「這棒可疑」
    if (entry.degenerate) line += ' · ⚠️ 疑似空洞回報（無可驗證線索）';
    if (entry.suspectNoAction) line += ' · ⚠️ 零動作事件（僅文字回覆）';

    let block = line + '\n';
    if (entry.status === 'ok' && entry.result) {
      const body = trimOutput(entry.result).replace(/\r?\n/g, '\n  '); // A3：頭尾剪裁取代全頭截斷
      block += `  <details><summary>↳ 產出</summary>\n\n  ${body}\n\n  </details>\n`;
    }
    appendFileSync(file, block); // 單次 append，減少交錯
  } catch (err) {
    // 日誌失敗不可打斷派工結果（結果已經燒了額度）
    console.error(`[log] 寫入 docs/LOG.md 失敗（不影響結果）: ${err && err.message}`);
  }
}
