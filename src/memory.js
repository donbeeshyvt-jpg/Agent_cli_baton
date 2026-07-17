// 共享記憶層 —— 本專案的心臟（見 docs/PROJECT_VISION.md）。
// 四家 CLI 不共享 context window，共享的是 docs/ 這本接力簿（file-resident memory）。
// 本模組做兩件事：
//   1. composeDispatchPrompt：派工前把接力紀錄（CONVERSATION_LOG Active Summary、
//      HANDOFF 現況/下一步、TASKS 進行中）注入 prompt → 接手的家不失憶。
//   2. recordDispatchResult：做完把「誰做了什麼 + [交接] 摘要」寫回 docs/DEV_LOG.md
//      並更新 HANDOFF.md 的 Last Completed Task → 下一家（或下一次）接得上。
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

function readIf(p, cap = 8000) {
  try { if (existsSync(p)) return readFileSync(p, 'utf8').slice(0, cap); } catch { /* 讀不到就算了 */ }
  return '';
}

// 取 "## 標題" 到下一個 "## " 之間的段落
function extractSection(text, heading, cap = 1600) {
  if (!text) return '';
  const re = new RegExp(`##\\s*${heading}[\\s\\S]*?(?=\\n## |$)`, 'i');
  const m = text.match(re);
  return m ? m[0].slice(0, cap).trim() : '';
}

// A1：交接快照會腐壞，策展規則不會。
// 只對 HANDOFF 的 Last Completed Task 時間戳做時效檢查——太舊就提醒下一棒先核對現狀，
// 降低「帶著過期假設疊加幻覺」的風險。>此時數即警告，可用環境變數覆寫。
export const HANDOFF_STALE_HOURS = Number(process.env.AGENTBATON_STALE_HOURS) || 24;
export function staleWarning(handoffText, now = new Date()) {
  if (!handoffText) return '';
  // 從 "## Last Completed Task" 下一行抓 ISO 時間戳（recordDispatchResult 寫入的同格式）
  const m = handoffText.match(/## Last Completed Task\s*\n\s*(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
  if (!m) return '';
  const ts = new Date(m[1]);
  if (Number.isNaN(ts.getTime())) return '';
  const ageHours = (now - ts) / 3600000;
  if (ageHours <= HANDOFF_STALE_HOURS) return '';
  return `⚠️ 交接紀錄已 ${ageHours.toFixed(1)} 小時未更新。開工前請先核對現狀（git status、相關檔案是否與描述一致）再動手，避免疊加過期假設。`;
}

/** 組出「共享記憶 + 協作守則 + 任務」的完整派工 prompt */
export function composeDispatchPrompt(cwd, task) {
  const docs = join(cwd, 'docs');
  const conv = readIf(join(docs, 'CONVERSATION_LOG.md'), 16000);
  const handoff = readIf(join(docs, 'HANDOFF.md'), 10000);
  const tasks = readIf(join(docs, 'TASKS.md'), 8000);

  const pieces = [
    extractSection(conv, 'Active Summary', 2000),
    extractSection(handoff, 'Current State', 900),
    extractSection(handoff, 'Next Safe Task', 900),
    extractSection(tasks, '進行中', 700),
  ].filter(Boolean);

  if (!pieces.length) return task; // 沒有紀錄（非 Record System 專案）就原樣派工

  const stale = staleWarning(handoff); // A1：交接太舊就在最前面插警語
  if (stale) pieces.unshift(stale);

  return [
    '=== 共享記憶（多 CLI 協作接力紀錄）===',
    '你是 claude/codex/grok/cursor 輪替協作團隊的一員。先讀以下接力紀錄，接續前面的進度，不要重做、不要偏離使用者方向。',
    '',
    pieces.join('\n\n'),
    '=== 共享記憶結束 ===',
    '',
    '完成任務後，請在回覆的最後加一段以「[交接]」開頭的摘要：你做了什麼、動了哪些檔案、下一步建議 —— 讓下一家 CLI 能無縫接手。',
    '',
    '=== 本次任務 ===',
    task,
  ].join('\n');
}

/** web 對話：把一來一往寫進 CONVERSATION_LOG.md（record-backed 說話的持久層）。失敗絕不拋錯。 */
export function appendChatTurn(cwd, { role, provider, text }) {
  try {
    const p = join(cwd, 'docs', 'CONVERSATION_LOG.md');
    if (!existsSync(p)) return;
    const ts = new Date().toISOString();
    const who = role === 'user' ? '使用者（web）' : `${provider || 'agent'} 回覆`;
    // 跳脫內文裡的 markdown 標題行 —— 防止 CLI 回覆內含「### … — WEB — …」偽造成獨立聊天訊息（顯示層欺騙）
    const body = String(text || '').trim().slice(0, 2000)
      .split(/\r?\n/).map((l) => (/^#{1,6}\s/.test(l) ? `\\${l}` : l)).join('\n');
    appendFileSync(p, `\n### ${ts} — WEB — ${who}\n${body}\n`);
  } catch (err) {
    console.error(`[memory] CONVERSATION_LOG 寫入失敗: ${err && err.message}`);
  }
}

/** web 對話：取最近的對話尾巴（給接手的家看上下文；粗略但有效） */
export function readRecentChat(cwd, cap = 3000) {
  try {
    const p = join(cwd, 'docs', 'CONVERSATION_LOG.md');
    if (!existsSync(p)) return '';
    const t = readFileSync(p, 'utf8');
    return t.length > cap ? t.slice(-cap) : t;
  } catch { return ''; }
}

/** 回合末把結果寫回共享記憶（DEV_LOG 追加 + HANDOFF 更新）。失敗絕不拋錯。 */
export function recordDispatchResult(cwd, { provider, task, result }) {
  const ts = new Date().toISOString();
  const docs = join(cwd, 'docs');
  // 1) DEV_LOG.md 追加一筆（機器可讀的接力事件）
  try {
    const devlog = join(docs, 'DEV_LOG.md');
    if (!existsSync(devlog)) {
      writeFileSync(devlog, '# Dev Log — 每次派工做了什麼（orchestrator 自動寫 + agent 可補充）\n\n');
    }
    const handoffNote = String(result || '').match(/\[交接\][\s\S]{0,1000}/);
    const entry = [
      `## ${ts} — ${provider}`,
      `**任務**：${String(task).replace(/\s+/g, ' ').slice(0, 240)}`,
      handoffNote ? handoffNote[0].trim() : `**產出摘要**：${String(result || '').replace(/\s+/g, ' ').slice(0, 320)}`,
      '',
    ].join('\n');
    appendFileSync(devlog, `${entry}\n`);
  } catch (err) {
    console.error(`[memory] DEV_LOG 寫入失敗（不影響結果）: ${err && err.message}`);
  }
  // 2) HANDOFF.md 更新 Last Completed Task 與時間戳
  try {
    const hp = join(docs, 'HANDOFF.md');
    if (existsSync(hp)) {
      let h = readFileSync(hp, 'utf8');
      if (/## Last Completed Task\n/.test(h)) {
        h = h.replace(/## Last Completed Task\n[\s\S]*?(?=\n## )/, `## Last Completed Task\n${ts} — ${provider}：${String(task).replace(/\s+/g, ' ').slice(0, 180)}\n\n`);
      }
      h = h.replace(/^Last updated: .*$/m, `Last updated: ${ts.slice(0, 10)}`);
      writeFileSync(hp, h);
    }
  } catch (err) {
    console.error(`[memory] HANDOFF 更新失敗（不影響結果）: ${err && err.message}`);
  }
}
