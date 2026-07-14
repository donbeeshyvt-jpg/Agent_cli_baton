// 把每次呼叫與換手寫進 docs/LOG.md —— 機器自動累積的執行日誌。
// P0 修復：appendLog 全包 try/catch —— LOG.md 被編輯器鎖住（EPERM/EBUSY）時
// 絕不能拋錯吃掉剛燒完額度的成功結果；寫不進就吐到 stderr。
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HEADER = `# 執行日誌 (LOG)

四家 CLI 的每次呼叫、額度換手、產出都記在這。是換手後接力的「交接棒」之一（機器寫）。
格式：\`時間\` **provider** → 狀態 · 說明

`;

export function appendLog(cwd, entry) {
  try {
    const dir = join(cwd, 'docs');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const file = join(dir, 'LOG.md');
    if (!existsSync(file)) writeFileSync(file, HEADER);

    const ts = new Date().toISOString();
    let line = `- \`${ts}\` **${entry.provider}** → \`${entry.status}\``;
    if (entry.model) line += ` · model=${entry.model}`;
    if (entry.ms != null) line += ` (${entry.ms}ms)`;
    if (entry.until) {
      const u = entry.until instanceof Date ? entry.until.toISOString() : entry.until;
      line += ` · 冷卻到 ${u}`;
    }
    if (entry.message) line += ` · ${String(entry.message).replace(/\s+/g, ' ').slice(0, 200)}`;

    let block = line + '\n';
    if (entry.status === 'ok' && entry.result) {
      const body = String(entry.result).slice(0, 4000).replace(/\r?\n/g, '\n  ');
      block += `  <details><summary>↳ 產出</summary>\n\n  ${body}\n\n  </details>\n`;
    }
    appendFileSync(file, block); // 單次 append，減少交錯
  } catch (err) {
    // 日誌失敗不可打斷派工結果（結果已經燒了額度）
    console.error(`[log] 寫入 docs/LOG.md 失敗（不影響結果）: ${err && err.message}`);
  }
}
