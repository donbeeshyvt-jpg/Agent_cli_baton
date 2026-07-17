// 棒後驗收分類器：抓「宣稱完成但沒真的做」的幻覺回報——這是 headless 派工最痛的坑。
// 核心洞察：headless CLI 會「宣稱做了 X」但沒真的做。解法不是問模型「你做完了嗎」（它會說做完了），
// 而是每棒完工後用一次便宜的分類器呼叫，把它自己編不出來的 harness-truth（機器鐵證）攤給它核對。
//
// harness-truth（agentbaton 自己量得到、CLI 編不出來的鐵證）：
//   - git diff --stat：這棒到底改了幾個檔、幾行（沒改就是沒改，模型騙不了）
//   - 該棒宣稱要跑的測試指令，是否真的出現在它的 stdout 裡
//   - docs/LOG.md 是否真的多了行
// 判定：DONE_VERIFIED / CLAIMED_NO_EVIDENCE / PARTIAL，附一句 evidence。
//
// 設計成「可選」（config.verify.enabled，預設關）：每棒多一次 headless 呼叫 = 多燒一點額度換幻覺攔截。
import { spawnSync } from 'node:child_process';
import { runTask } from './orchestrator.js';

// 蒐集 harness-truth：這棒實際造成的可驗證變化。純本機、零外部依賴（git 是系統既有工具）。
export function collectHarnessTruth(cwd, { claimText = '', sinceRef = null } = {}) {
  const truth = { gitAvailable: false, changedFiles: 0, changedLines: 0, diffStat: '', claimedCommands: [], commandsSeenInClaim: [] };
  // git diff --stat（有 git 才做；sinceRef 給定就比對到某個快照，否則比工作樹相對 HEAD）
  try {
    const args = sinceRef ? ['diff', '--stat', sinceRef] : ['diff', '--stat'];
    const res = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 10000 });
    if (res.status === 0 && typeof res.stdout === 'string') {
      truth.gitAvailable = true;
      truth.diffStat = res.stdout.trim().slice(0, 1200);
      // 末行通常是 "N files changed, M insertions(+), K deletions(-)"
      const m = truth.diffStat.match(/(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertion)?(?:.*?(\d+)\s+deletion)?/);
      if (m) {
        truth.changedFiles = parseInt(m[1], 10) || 0;
        truth.changedLines = (parseInt(m[2] || '0', 10) || 0) + (parseInt(m[3] || '0', 10) || 0);
      }
      // 關鍵：git diff --stat 不含「新建的 untracked 檔案」——實作類任務常是新增檔，
      // 只看 diff 會把「真的建了新檔」誤判成 0 變動（幻覺）。補 git status --porcelain 抓 untracked。
      try {
        const st = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd, encoding: 'utf8', timeout: 10000 });
        if (st.status === 0 && typeof st.stdout === 'string') {
          // 每行 "XY path"；'??' 開頭 = untracked 新檔。排除 .orchestrator/docs 這類骨架雜訊
          const lines = st.stdout.split(/\r?\n/).filter((l) => l.trim());
          const newFiles = lines.filter((l) => /^\?\?/.test(l)).map((l) => l.slice(3).trim())
            .filter((p) => !/^\.orchestrator\/|^docs\/|^AGENTS\.md$/.test(p));
          truth.untrackedFiles = newFiles.slice(0, 20);
          truth.changedFiles += newFiles.length; // 新檔也算「做了事」的鐵證
          if (newFiles.length && !truth.diffStat) truth.diffStat = `新增檔案：${newFiles.join('、').slice(0, 800)}`;
        }
      } catch { /* status 失敗就只靠 diff */ }
    }
  } catch { /* 沒 git 就算了，truth.gitAvailable 保持 false */ }
  // 從宣稱文字抓「它說要跑的指令」，之後可核對是否真出現在輸出（這裡先抓，核對邏輯在 prompt 層）
  const cmdMatches = String(claimText).match(/`([^`]{2,80})`|(?:npm|node|git|pytest|dotnet|cargo|go)\s+[\w\s./-]{1,60}/gi) || [];
  truth.claimedCommands = [...new Set(cmdMatches.map((c) => c.replace(/`/g, '').trim()))].slice(0, 8);
  return truth;
}

// 組驗收分類器的 prompt（餵鐵證，不問「你做完沒」）
export function buildVerifyPrompt({ task, claimText, truth }) {
  const truthLines = truth.gitAvailable
    ? [
        `git diff --stat（這棒實際的檔案變動，這是機器量的，無法造假）：`,
        truth.diffStat || '（無任何變動——工作樹跟先前一模一樣）',
        `→ 改了 ${truth.changedFiles} 個檔、約 ${truth.changedLines} 行`,
      ]
    : ['（此作業區非 git repo，拿不到檔案變動鐵證，請只依「宣稱內容是否具體可驗證」判斷）'];
  return [
    '你是嚴格的驗收稽核員。有個 CLI 剛「宣稱」完成了一個任務，你要判斷它是真做了還是幻覺回報。',
    '規則：不要相信宣稱的文字，只信下面的機器鐵證。宣稱說改了檔但鐵證顯示 0 檔變動 = 幻覺回報。',
    '',
    `=== 任務 ===\n${String(task).slice(0, 600)}`,
    '',
    `=== CLI 的宣稱 ===\n${String(claimText).slice(0, 1500)}`,
    '',
    `=== 機器鐵證（harness-truth）===\n${truthLines.join('\n')}`,
    '',
    '請只輸出一行 JSON（不要圍欄、不要多餘文字）：',
    '{"verdict":"DONE_VERIFIED|CLAIMED_NO_EVIDENCE|PARTIAL","confidence":0.0-1.0,"evidence":"一句話理由"}',
    '判準：實作/改檔類任務若鐵證顯示 0 檔變動但宣稱已完成 → CLAIMED_NO_EVIDENCE；鐵證與宣稱相符 → DONE_VERIFIED；部分相符 → PARTIAL。純規劃/審查/問答類任務本來就不一定改檔，看宣稱是否具體有據判 DONE_VERIFIED 或 PARTIAL。',
  ].join('\n');
}

// 3 階段容錯解析（strict → 去 code fence → 抓第一個平衡大括號），抄自 mission.parsePlan 的精神
export function parseVerdict(text) {
  const tryParse = (s) => { try { const o = JSON.parse(s); return o && o.verdict ? o : null; } catch { return null; } };
  let o = tryParse(String(text).trim());
  if (!o) { const fenced = String(text).replace(/```(?:json)?/gi, '').trim(); o = tryParse(fenced); }
  if (!o) {
    const start = String(text).indexOf('{');
    if (start >= 0) {
      let depth = 0, inStr = false, esc = false;
      for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
        if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { o = tryParse(text.slice(start, i + 1)); break; } }
      }
    }
  }
  if (!o) return null;
  const V = ['DONE_VERIFIED', 'CLAIMED_NO_EVIDENCE', 'PARTIAL'];
  if (!V.includes(o.verdict)) return null;
  const conf = Number(o.confidence);
  return { verdict: o.verdict, confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5, evidence: String(o.evidence || '').slice(0, 300) };
}

/**
 * 對一棒的完工結果做驗收分類。可選（config.verify.enabled）。
 * @returns { verdict, confidence, evidence, truth } 或 null（未啟用/失敗）
 * runFn 可注入（測試用），預設用真的 runTask。
 */
export async function verifyBar({ cwd, stateCwd, config, task, claimText, sinceRef = null, runFn = runTask }) {
  if (!config?.verify?.enabled) return null; // 預設關，明確開才跑
  try {
    const truth = collectHarnessTruth(cwd, { claimText, sinceRef });
    const prompt = buildVerifyPrompt({ task, claimText, truth });
    // 用便宜的一次呼叫：不注入共享記憶（memory:false，省 token）、走總指揮鏈或指定驗收家
    const chain = config.verify.provider ? [config.verify.provider] : [config.chief || 'claude', ...Object.keys(config.providers || {})].filter((v, i, a) => a.indexOf(v) === i);
    const out = await runFn({ cwd, stateCwd, prompt, chain, config, strategy: 'priority', memory: false, effort: 'low' });
    if (!out.chosen) return { verdict: 'PARTIAL', confidence: 0, evidence: '驗收呼叫失敗（所有家不可用）', truth };
    const parsed = parseVerdict(out.result);
    if (!parsed) return { verdict: 'PARTIAL', confidence: 0, evidence: '驗收回覆無法解析', truth };
    return { ...parsed, truth };
  } catch (err) {
    return { verdict: 'PARTIAL', confidence: 0, evidence: `驗收例外：${(err && err.message) || err}`, truth: null };
  }
}
