// 額度快照 —— 給總指揮與儀表板看的「各家還剩多少、平均多快」。
// 原則：只讀本地檔（零遠端 API、零帳號風險）。
//   codex : ~/.codex/sessions 的 rollout-*.jsonl 內含官方 rate_limits（5h 窗與週窗的 used_percent + resets_at）→ 真實 %
//   claude/grok/cursor : 沒有本地 % 來源 → 誠實回報「未知」，改用冷卻狀態＋成功次數＋平均耗時當參考
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadState } from './state.js';

const HOME = process.env.USERPROFILE || process.env.HOME || '';

/** 從 codex 本地 rollout 檔撈最新一筆 rate_limits（掃最近幾天、由新到舊） */
export function codexQuota(baseDir = join(HOME, '.codex', 'sessions')) {
  try {
    if (!existsSync(baseDir)) return null;
    // sessions/YYYY/MM/DD/rollout-*.jsonl —— 收集後依檔名（含時間戳）新到舊
    const files = [];
    for (const y of readdirSync(baseDir)) {
      const yDir = join(baseDir, y);
      try {
        for (const m of readdirSync(yDir)) {
          const mDir = join(yDir, m);
          for (const d of readdirSync(mDir)) {
            const dDir = join(mDir, d);
            for (const f of readdirSync(dDir)) if (f.startsWith('rollout-') && f.endsWith('.jsonl')) files.push(join(dDir, f));
          }
        }
      } catch { /* 非目錄層級，跳過 */ }
    }
    files.sort((a, b) => b.localeCompare(a)); // 檔名含 ISO 時間戳，字典序=時間序
    for (const file of files.slice(0, 12)) { // 最多翻 12 個檔，夠新即可
      let lines;
      try { lines = readFileSync(file, 'utf8').split(/\r?\n/); } catch { continue; }
      for (let i = lines.length - 1; i >= 0; i--) { // 由檔尾往回找最新一筆
        if (!lines[i].includes('"primary":{')) continue;
        try {
          const j = JSON.parse(lines[i]);
          const rl = j.payload?.rate_limits ?? j.payload?.info?.rate_limits ?? j.rate_limits;
          if (!rl || !rl.primary) continue;
          const toDate = (sec) => (sec ? new Date(sec * 1000) : null);
          return {
            plan: rl.plan_type || null,
            fiveHour: { usedPct: rl.primary.used_percent, resetsAt: toDate(rl.primary.resets_at), windowMinutes: rl.primary.window_minutes },
            weekly: rl.secondary ? { usedPct: rl.secondary.used_percent, resetsAt: toDate(rl.secondary.resets_at), windowMinutes: rl.secondary.window_minutes } : null,
            asOf: j.timestamp ? new Date(j.timestamp) : null,
            source: 'codex rollout（官方本地紀錄）',
          };
        } catch { /* 這行壞了就往上找 */ }
      }
    }
    return null;
  } catch { return null; }
}

/** 窗口是否已重置（重置時間已過 → 舊的 % 不可信，視為可用） */
function windowView(w, now) {
  if (!w || w.usedPct == null) return null;
  const reset = w.resetsAt && w.resetsAt > now ? w.resetsAt : null;
  return {
    usedPct: reset ? w.usedPct : 0,          // 已過重置點 → 視為歸零（舊資料標記）
    remainingPct: reset ? Math.max(0, 100 - w.usedPct) : 100,
    resetsAt: reset ? reset.toISOString() : null,
    stale: !reset,                            // true = 已重置，% 是重置前的舊值
  };
}

/** 全家額度快照：真實 %（有來源的家）＋ 冷卻/用量/平均耗時（所有家） */
export function getQuotaSnapshot(stateCwd, config) {
  const state = loadState(stateCwd);
  const now = new Date();
  const out = {};
  for (const name of Object.keys(config.providers || {})) {
    const p = state.providers?.[name] || {};
    const cooling = Boolean(p.cooldownUntil) && new Date(p.cooldownUntil) > now;
    out[name] = {
      cooling,
      cooldownUntil: cooling ? p.cooldownUntil : null,
      uses: p.uses || 0,
      avgMs: p.uses && p.totalMs ? Math.round(p.totalMs / p.uses) : null, // 平均耗時（回報用）
      fiveHour: null, weekly: null, plan: null, quotaSource: null,
    };
  }
  const cq = codexQuota();
  if (cq && out.codex) {
    out.codex.fiveHour = windowView(cq.fiveHour, now);
    out.codex.weekly = windowView(cq.weekly, now);
    out.codex.plan = cq.plan;
    out.codex.quotaSource = cq.source;
  }
  return out;
}

/** 給總指揮規劃 prompt 用的中文額度簡報（避免「剛開工就要換手」的指派） */
export function quotaNoteForChief(snapshot) {
  const lines = [];
  for (const [name, q] of Object.entries(snapshot)) {
    const bits = [];
    if (q.cooling) bits.push(`🔴 冷卻中（至 ${new Date(q.cooldownUntil).toLocaleString()}，先別指派）`);
    else bits.push('🟢 可用');
    if (q.fiveHour) {
      bits.push(q.fiveHour.stale
        ? '5h窗已重置（額度應為滿）'
        : `5h窗已用 ${q.fiveHour.usedPct}%（剩 ${q.fiveHour.remainingPct}%，${q.fiveHour.usedPct >= 85 ? '⚠️ 快滿，避免指派長任務' : '正常'}）`);
      if (q.weekly && !q.weekly.stale) bits.push(`週窗已用 ${q.weekly.usedPct}%`);
    } else if (!q.cooling) {
      bits.push('剩餘%無本地來源（未知）');
    }
    if (q.avgMs) bits.push(`平均耗時 ${Math.round(q.avgMs / 1000)}s/任務`);
    bits.push(`累計成功 ${q.uses} 次`);
    lines.push(`- ${name}：${bits.join('；')}`);
  }
  return lines.join('\n');
}
