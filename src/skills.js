// 技能自包含層 —— 讀專案內建的 skills/（Agent-LV.MAX 三技能），讓 mission 不靠本機安裝。
// 每個 CLI 派工時注入「已啟用技能」的核心程序；claude/codex 有原生技能系統會自己觸發，
// 但注入版保證任何機器、任何家都拿得到同一套紀律（就像商用 APP 的內建 system prompt）。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_DIR = join(PROJECT_ROOT, 'skills');

// 從 SKILL.md 的 YAML frontmatter 抽 description（折行值）
function extractDescription(md) {
  const m = md.match(/description:\s*>-?\s*\n([\s\S]*?)\n(?:\w+:|---)/);
  if (m) return m[1].replace(/^\s+/gm, '').replace(/\s*\n\s*/g, '').trim();
  const inline = md.match(/description:\s*(.+)/);
  return inline ? inline[1].trim() : '';
}

let cache = null;

/** 回傳專案內建技能清單 [{ name, dir, description }] */
export function bundledSkills() {
  if (cache) return cache;
  const out = [];
  try {
    if (existsSync(SKILLS_DIR)) {
      for (const entry of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const md = join(SKILLS_DIR, entry.name, 'SKILL.md');
        if (!existsSync(md)) continue;
        try {
          const desc = extractDescription(readFileSync(md, 'utf8'));
          out.push({ name: entry.name, dir: join(SKILLS_DIR, entry.name), description: desc });
        } catch { /* 讀不到就略過 */ }
      }
    }
  } catch { /* skills/ 不存在 */ }
  cache = out;
  return out;
}

// 三技能的核心程序（濃縮自打包版，注入給所有家）——這是「內建 system prompt」的實體。
export const SKILL_CORES = {
  Agent_OS_Skill: [
    '【Agent OS（12 角色作業系統）核心】',
    '先解碼真意（使用者要的是「結果」不是字面）→ 判斷你此刻的角色（規劃/研究/實作/除錯/審查/驗收）→',
    '以該角色標準工作：拆解任務、最小變更實作、系統化除錯、以證據驗收、結論先行地綜合。不確定標假設、不幻覺。',
  ].join('\n'),
  Loop_Engineering_Skill: [
    '【Loop 迴圈工程判斷】若本任務符合兩項以上：(a)會重複發生 (b)單次做完沒意義 (c)需跨次持續驗證推進——',
    '先產出「迴圈規格」（觸發/每輪步驟/停止條件/人類閘門）寫進 docs/，再執行第一輪；不要當一次性處理。',
  ].join('\n'),
  Record_System_Skill: [
    '【Record System 紀錄紀律】AGENTS.md 是唯一入口；開工前讀 docs/（CONVERSATION_LOG Active Summary + HANDOFF + TASKS）接續進度、不掃碼庫。',
    '完工必在回覆末尾輸出「[交接]」段：做了什麼＋動了哪些檔＋證據＋下一步。沒寫交接＝下一家失憶＝失敗。',
  ].join('\n'),
};

/**
 * 組出「已啟用技能」注入區塊。
 * @param roleHint 本任務角色（給 Agent OS 判斷用）
 * @param native   該家是否有原生技能系統（claude/codex）→ 額外指向打包路徑
 */
export function composeSkillBlock({ roleHint = 'implement', native = false } = {}) {
  const skills = bundledSkills();
  const lines = ['=== 已啟用技能（本專案內建，Agent-LV.MAX 三件套）==='];
  lines.push(SKILL_CORES.Agent_OS_Skill + `\n本任務角色建議：${roleHint}。`);
  lines.push(SKILL_CORES.Loop_Engineering_Skill);
  lines.push(SKILL_CORES.Record_System_Skill);
  if (native && skills.length) {
    const list = skills.map((s) => `${s.name}（skills/${s.name}/SKILL.md）`).join('、');
    lines.push(`若需完整程序，本專案 skills/ 內建：${list}——可自行讀取。也可用你已安裝的同名技能。`);
  }
  lines.push('思考中若判斷有其他技能用得上，自行決定是否使用（像商用大模型 APP 的內建判斷）。');
  lines.push('=== 技能區塊結束 ===');
  return lines.join('\n\n');
}
