// 執行期狀態：記每家的冷卻時間（額度耗盡到何時）與用量計數（負載平衡用）。
// 存在 <cwd>/.orchestrator/state.json。
// P0 修復（docs/AUDIT.md）：
//   - 原子寫入：同目錄 tmp + renameSync，崩潰不留半寫 JSON
//   - 壞檔不清空：解析失敗先備份 .corrupt-* 再回空狀態，保留證據
//   - 單一寫者政策：orchestrator（runTask）是唯一寫者；未來 serve/watch 只讀
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, copyFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const STATE_DIR = '.orchestrator';
const STATE_FILE = 'state.json';
const SCHEMA_VERSION = 1;

function statePath(cwd) { return join(cwd, STATE_DIR, STATE_FILE); }

export function loadState(cwd) {
  const p = statePath(cwd);
  if (!existsSync(p)) return { schemaVersion: SCHEMA_VERSION, providers: {} };
  try {
    // 剝 UTF-8 BOM（PowerShell 5.1 / 舊記事本存檔會加，不剝 JSON.parse 會炸）
    const raw = readFileSync(p, 'utf8').replace(/^﻿/, '');
    const s = JSON.parse(raw);
    // 驗證要夠深：providers 必須是「純物件」（陣列會讓字串鍵在序列化時靜默蒸發）
    if (typeof s !== 'object' || s === null || Array.isArray(s)
      || typeof s.providers !== 'object' || s.providers === null || Array.isArray(s.providers)) {
      throw new Error('state 結構不符');
    }
    // 單一 provider 值必須是物件，否則 setCooldown 對 primitive 賦值會 TypeError
    for (const [k, v] of Object.entries(s.providers)) {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) delete s.providers[k];
    }
    if (!s.schemaVersion) s.schemaVersion = SCHEMA_VERSION; // 舊檔 migrate
    return s;
  } catch {
    // 壞檔不清空記憶：備份起來讓人查（否則會忘記誰在冷卻、下輪猛打已耗盡的家）
    try { copyFileSync(p, `${p}.corrupt-${Date.now()}`); } catch { /* 備份失敗也不擋 */ }
    return { schemaVersion: SCHEMA_VERSION, providers: {} };
  }
}

// 回傳 true=已落地 / false=沒寫進去（讓 updateState 與呼叫端可觀測，不再無聲遺失）。
// 絕不拋錯（結果可能已燒完額度，crash 會把成果丟掉）；EPERM（被編輯器/防毒鎖）先重試一次。
export function saveState(cwd, state) {
  const dir = join(cwd, STATE_DIR);
  const p = statePath(cwd);
  const attempt = () => {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmp = `${p}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(state, null, 2)); // 同目錄 tmp + rename = 原子替換
    try { renameSync(tmp, p); } catch (err) { try { unlinkSync(tmp); } catch { /* 殘檔無害 */ } throw err; }
  };
  try { attempt(); return true; }
  catch (err1) {
    try { attempt(); return true; } // 重試一次（EPERM 常是瞬間鎖）
    catch (err2) {
      console.error(`[state] 寫入失敗兩次（本輪冷卻/用量未落地！可能重燒額度）: ${err2 && err2.message}`);
      return false;
    }
  }
}

export function isCoolingDown(state, name, now = new Date()) {
  const until = state.providers?.[name]?.cooldownUntil;
  return Boolean(until) && new Date(until) > now;
}

// cooldown 與 uses/lastUsedAt 共存：合併寫入，不互相蓋掉
export function setCooldown(state, name, until, reason) {
  state.providers = state.providers || {};
  const p = state.providers[name] || {};
  p.cooldownUntil = until instanceof Date ? until.toISOString() : until;
  p.reason = reason ? String(reason).replace(/\s+/g, ' ').slice(0, 200) : undefined;
  p.since = new Date().toISOString();
  state.providers[name] = p;
}

export function clearCooldown(state, name) {
  const p = state.providers?.[name];
  if (p) { delete p.cooldownUntil; delete p.reason; delete p.since; }
}

// 負載平衡＋回報用：記一次成功使用（次數、最後使用時間、累計耗時→算平均）
export function recordUse(state, name, now = new Date(), ms = null) {
  state.providers = state.providers || {};
  const p = state.providers[name] || {};
  p.uses = (p.uses || 0) + 1;
  p.lastUsedAt = now.toISOString();
  if (typeof ms === 'number' && ms > 0) p.totalMs = (p.totalMs || 0) + ms;
  state.providers[name] = p;
}

export function getUses(state, name) { return state.providers?.[name]?.uses || 0; }
export function getLastUsedAt(state, name) { return state.providers?.[name]?.lastUsedAt || ''; }

// ── 並發安全：原子更新 mutex ──────────────────────────────
// 並行派工時多個 runTask 會同時想改 state.json；若各自「load→改→save」整包寫回會遺失更新。
// updateState 用「同 stateCwd 序列化」的 promise 鏈，保證每次都是 fresh load→mutate→save，不互蓋。
const stateLocks = new Map();
export function updateState(stateCwd, mutateFn) {
  const prev = stateLocks.get(stateCwd) || Promise.resolve();
  const next = prev.catch(() => {}).then(async () => {
    const s = loadState(stateCwd);
    const r = await mutateFn(s);
    const ok = saveState(stateCwd, s);
    if (!ok) console.error('[state] updateState：本次變更未落地（saveState 回 false）');
    return r;
  });
  stateLocks.set(stateCwd, next);
  return next;
}

// ── 「目前誰在處理什麼」——改成 map（provider → {task,model,startedAt}），容納多家並行 ──
// 原子性來自「同步讀改寫、每次重讀磁碟」（單進程、讀寫間無 await，不會 lost update）——
// 不是 mutex。⚠️ 若日後把 setCurrent/clearCurrent 改成 async 或中間插入 await，會退化成 race，
// 屆時必須改走 updateState + tmp/rename。
const CURRENT_FILE = 'current.json';
function currentPath(cwd) { return join(cwd, STATE_DIR, CURRENT_FILE); }

export function getCurrentMap(cwd) {
  try {
    const o = JSON.parse(readFileSync(currentPath(cwd), 'utf8').replace(/^﻿/, '')); // 剝 UTF-8 BOM
    if (!o || typeof o !== 'object') return {};
    // 舊單筆格式判別改用「值是否為物件」，不靠脆弱的頂層 provider 鍵
    if (typeof o.startedAt === 'string' && typeof o.provider === 'string') return { [o.provider]: o };
    return o;
  } catch { return {}; }
}

function writeCurrentMap(cwd, map) {
  try {
    const dir = join(cwd, STATE_DIR);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (Object.keys(map).length === 0) { try { unlinkSync(currentPath(cwd)); } catch { /* 不存在 */ } return; }
    writeFileSync(currentPath(cwd), JSON.stringify(map, null, 2));
  } catch { /* 追蹤失敗不影響派工 */ }
}

export function setCurrent(cwd, info) {
  const map = getCurrentMap(cwd);
  map[info.provider] = { ...info, startedAt: new Date().toISOString() };
  writeCurrentMap(cwd, map);
}

export function clearCurrent(cwd, provider) {
  const map = getCurrentMap(cwd);
  if (provider) delete map[provider]; else return; // 需指定哪家（並行下不能全清）
  writeCurrentMap(cwd, map);
}

// 更新某家的即時進度（live）欄位，保留其他欄位（startedAt/label/detail）。
// 給即時串流用：codex 逐行事件翻成人話寫進來，前端輪詢/ SSE 顯示。
export function updateCurrentLive(cwd, provider, live) {
  const map = getCurrentMap(cwd);
  if (!map[provider]) return; // 這家已收尾就不寫（避免復活幽靈）
  map[provider] = { ...map[provider], live, liveAt: new Date().toISOString() };
  writeCurrentMap(cwd, map);
}

// 崩潰/kill 後 current.json 可能留幽靈「執行中」紀錄 —— 伺服器啟動時全清（此刻沒有任何任務在跑）
export function resetCurrent(cwd) { writeCurrentMap(cwd, {}); }

// 相容：回傳「任一個」進行中的（--status 舊用法）
export function getCurrent(cwd) {
  const map = getCurrentMap(cwd);
  const keys = Object.keys(map);
  return keys.length ? map[keys[0]] : null;
}
