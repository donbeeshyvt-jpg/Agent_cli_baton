// 啟動前檢查（preflight）：確認要啟用的每一家 CLI 都「裝了、登入了、吃得到訂閱額度」。
// 原則：只用便宜的檢查——讀本地憑證檔、各家的 status/models 子命令——不燒任何模型額度。
// 用法：node src/cli.js --doctor；未來 `agentbaton serve` 啟動時自動先跑一次。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCli, needsShell } from './spawn.js';
import { resolveBins } from './providers.js';

const HOME = process.env.USERPROFILE || process.env.HOME || '';

// 各家檢查器：回傳 { ok, warn, detail }
const CHECKS = {
  // claude：讀本地 OAuth 憑證（離線、零額度）
  async claude(bin) {
    const credPath = join(HOME, '.claude', '.credentials.json');
    if (!existsSync(credPath)) return { ok: false, detail: '找不到 ~/.claude/.credentials.json' };
    try {
      const o = JSON.parse(readFileSync(credPath, 'utf8')).claudeAiOauth || {};
      if (!o.accessToken) return { ok: false, detail: '憑證檔存在但沒有 token' };
      const expired = o.expiresAt && o.expiresAt < Date.now();
      if (expired) return { ok: true, warn: true, detail: `訂閱 ${o.subscriptionType || '?'}；token 已過期，首次呼叫會嘗試自動刷新，若 401 請重跑 claude login` };
      return { ok: true, detail: `訂閱 ${o.subscriptionType || '?'}；token 有效至 ${new Date(o.expiresAt).toLocaleString()}` };
    } catch (e) { return { ok: false, detail: `憑證讀取失敗: ${e.message}` }; }
  },
  // codex：官方 status 子命令（本地、零額度）
  async codex(bin) {
    const res = await runCli({ bin, args: ['login', 'status'], shell: needsShell(bin), timeoutMs: 15000 });
    const out = `${res.stdout}\n${res.stderr}`;
    if (/not logged in/i.test(out)) return { ok: false, detail: '未登入' };
    if (/logged in/i.test(out)) return { ok: true, detail: out.trim().split(/\r?\n/)[0].slice(0, 80) };
    return { ok: false, detail: (out.trim() || '無回應').slice(0, 100) };
  },
  // grok：讀本地 ~/.grok/auth.json（離線、零額度）。
  // 注意：`grok models` 會誤報 "not authenticated"（它走的認證路徑跟聊天 relay 不同），別用它判斷。
  async grok(bin) {
    const authPath = join(HOME, '.grok', 'auth.json');
    if (!existsSync(authPath)) return { ok: false, detail: '找不到 ~/.grok/auth.json' };
    try {
      const entries = Object.values(JSON.parse(readFileSync(authPath, 'utf8')) || {});
      const cred = entries.find((e) => e && (e.key || e.refresh_token));
      if (!cred) return { ok: false, detail: 'auth.json 存在但沒有憑證' };
      const exp = cred.expires_at ? new Date(cred.expires_at) : null;
      const expired = exp && !Number.isNaN(exp.getTime()) && exp < new Date();
      if (expired && !cred.refresh_token) return { ok: false, detail: '憑證過期且無 refresh_token' };
      return {
        ok: true,
        warn: Boolean(expired),
        detail: `已登入（${cred.auth_mode || 'oauth'}${cred.email ? `，${String(cred.email).slice(0, 3)}…` : ''}）${expired ? '；token 過期但有 refresh_token 可自動刷新' : ''}`,
      };
    } catch (e) { return { ok: false, detail: `auth.json 讀取失敗: ${e.message}` }; }
  },
  // cursor：官方 status 子命令（本地、零額度）
  async cursor(bin) {
    const res = await runCli({ bin, args: ['status'], shell: needsShell(bin), timeoutMs: 15000 });
    const out = `${res.stdout}\n${res.stderr}`;
    if (/not logged in/i.test(out)) return { ok: false, detail: '未登入' };
    if (res.spawnError) return { ok: false, detail: '無法啟動（未安裝？）' };
    return { ok: true, detail: (out.trim().split(/\r?\n/).find((l) => l.trim()) || '已登入').slice(0, 80) };
  },
};

const FIX = {
  claude: 'claude login',
  codex: 'codex login',
  grok: 'grok login',
  cursor: 'cursor-agent login',
};

/** 對 config.providers 裡啟用的每一家做檢查；回傳 { allOk, results } */
export async function runDoctor(config) {
  const bins = resolveBins();
  const enabled = Object.keys(config.providers || {}).filter((n) => CHECKS[n]);
  const results = await Promise.all(enabled.map(async (name) => {
    const bin = bins[name];
    // 執行檔存在性：絕對路徑直接查檔；裸名交給實際呼叫去判斷
    if (/[\\/]/.test(bin) && !existsSync(bin)) {
      return { name, ok: false, detail: `執行檔不存在：${bin}`, fix: `安裝 ${name} CLI` };
    }
    try {
      const r = await CHECKS[name](bin);
      return { name, ...r, fix: r.ok ? null : FIX[name] };
    } catch (e) {
      return { name, ok: false, detail: `檢查失敗: ${e.message}`, fix: FIX[name] };
    }
  }));
  return { allOk: results.every((r) => r.ok), results };
}
