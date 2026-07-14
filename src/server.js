// agentbaton serve —— 本地 web 控制台的後端。
// 設計原則：
//   - 只綁 127.0.0.1（本機控制台，不對外）
//   - 零外部相依：node:http + SSE + fs.watch
//   - 單一寫者政策：同時只允許一個派工在跑（busy 鎖），與 CLI 手動派工共用 state
//   - 前端只是消費者：資料全部來自 state.json / current.json / docs/（唯一真相源）
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync, watch, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { runTask } from './orchestrator.js';
import { loadState, getCurrentMap, resetCurrent } from './state.js';
import { runDoctor } from './doctor.js';
import { appendChatTurn, readRecentChat } from './memory.js';
import { ensureWorkspaceScaffold, buildPlanPrompt, parsePlan, planWithFallback, ensureReviewTask, saveMission, loadMission, executeMission } from './mission.js';
import { resolveBins } from './providers.js';
import { runCli, needsShell } from './spawn.js';
import { getQuotaSnapshot, quotaNoteForChief } from './quota.js';
import { WEB_UI } from './web-ui.js';

const HOME = process.env.USERPROFILE || process.env.HOME || '';
const DOC_WHITELIST = ['LOG', 'DEV_LOG', 'HANDOFF', 'CONVERSATION_LOG', 'TASKS', 'PLAN', 'ROADMAP'];

export async function serve({ cwd, config, port = 7680 }) {
  let busy = null;            // 進行中派工 { kind, task, startedAt }
  let lastDoctor = null;      // 最近一次 doctor 結果
  let lastResult = null;      // 最近一次派工結果摘要
  let missionStop = false;    // 任務書執行的停止旗標
  const sseClients = new Set();

  // 作業區路徑驗證：必須是存在的資料夾（使用者在網頁輸入的路徑）
  const validWorkdir = (p) => {
    if (!p || typeof p !== 'string') return null;
    const abs = resolve(p);
    try { if (existsSync(abs) && statSync(abs).isDirectory()) return abs; } catch { /* 無效路徑 */ }
    return null;
  };

  // 啟動前檢查（使用者需求：開啟前確認要啟用的都登入了、吃得到訂閱額度）
  lastDoctor = await runDoctor(config);
  resetCurrent(cwd); // 清掉上次崩潰/kill 遺留的幽靈「執行中」紀錄

  const broadcast = (type, data = {}) => {
    const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) { try { res.write(msg); } catch { sseClients.delete(res); } }
  };

  // 檔案變動 → 推播前端刷新（debounce 500ms）
  let debounceTimer = null;
  const notifyChange = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => broadcast('refresh'), 500);
  };
  for (const dir of [join(cwd, 'docs'), join(cwd, '.orchestrator')]) {
    try { if (existsSync(dir)) watch(dir, notifyChange); } catch { /* watch 失敗就靠手動刷新 */ }
  }

  const stateSnapshot = () => {
    const st = loadState(cwd);
    const now = new Date();
    const quota = getQuotaSnapshot(cwd, config);
    const curMapRaw = getCurrentMap(cwd); // 全部進行中（並行）：provider -> {task,model,startedAt}
    // 清幽靈：真在跑的任務不可能超過 timeout；startedAt 超過 timeout+緩衝的視為崩潰殘留，不顯示
    const ghostMs = (config.timeoutMs ?? 600000) + 120000; // timeout + 2 分緩衝
    const curMap = {};
    for (const [n, info] of Object.entries(curMapRaw)) {
      if (info && info.startedAt && (now - new Date(info.startedAt)) < ghostMs) curMap[n] = info;
    }
    const providers = Object.keys(config.providers || {}).map((name) => {
      const p = st.providers?.[name] || {};
      const cooling = Boolean(p.cooldownUntil) && new Date(p.cooldownUntil) > now;
      return {
        name,
        configModel: config.providers[name].model || null,
        cooling,
        cooldownUntil: cooling ? p.cooldownUntil : null,
        reason: cooling ? p.reason : null,
        uses: p.uses || 0,
        totalMs: p.totalMs || 0,           // 累計總消耗時間（額度消耗詳細）
        lastUsedAt: p.lastUsedAt || null,
        quota: quota[name] || null,
        running: curMap[name] || null, // 這家目前正在跑的任務（並行即時狀態）
      };
    });
    return {
      project: config.project || 'agentbaton',
      strategy: config.strategy || 'priority',
      chains: Object.keys(config.chains || {}),
      providers,
      current: curMap,
      busy: busy ? { ...busy } : null,
      doctor: lastDoctor,
      lastResult,
    };
  };

  // 各家可選模型清單：grok/cursor 用官方 models 指令動態抓（真實帳號清單）、
  // codex 讀 ~/.codex/config.toml、claude 讀 settings.json 別名＋常用清單。快取，?refresh=1 重抓。
  let modelsCache = null;
  const listModels = async (force = false) => {
    if (modelsCache && !force) return modelsCache;
    const bins = resolveBins();
    const out = {
      claude: { default: 'opus', options: ['opus', 'sonnet', 'haiku', 'claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5'], note: '別名 opus/sonnet/haiku 會解析成你方案的最新版' },
      codex: { default: null, options: [], note: '預設讀自 ~/.codex/config.toml；可自行填其他 id' },
      grok: { default: null, options: [], note: '清單來自 grok models（帳號即時）' },
      cursor: { default: 'auto', options: [], note: '清單來自 cursor-agent models（帳號即時）；auto=Cursor 路由器' },
    };
    try {
      const s = JSON.parse(readFileSync(join(HOME, '.claude', 'settings.json'), 'utf8'));
      if (s.model) out.claude.default = s.model;
    } catch { /* 沒設定就用 opus */ }
    try {
      const t = readFileSync(join(HOME, '.codex', 'config.toml'), 'utf8');
      const m = t.match(/^model\s*=\s*"([^"]+)"/m);
      if (m) { out.codex.default = m[1]; out.codex.options = [m[1]]; }
    } catch { /* 讀不到就留空 */ }
    try {
      const r = await runCli({ bin: bins.grok, args: ['models'], shell: needsShell(bins.grok), timeoutMs: 20000 });
      for (const line of r.stdout.split(/\r?\n/)) {
        const m = line.match(/^\s*([*-])\s+(\S+?)(?:\s+\(default\))?\s*$/);
        if (m) { out.grok.options.push(m[2]); if (m[1] === '*' || /\(default\)/.test(line)) out.grok.default = m[2]; }
      }
    } catch { /* grok 清單抓不到就留空 */ }
    try {
      const r = await runCli({ bin: bins.cursor, args: ['models'], shell: needsShell(bins.cursor), timeoutMs: 30000 });
      for (const line of r.stdout.split(/\r?\n/)) {
        const m = line.match(/^\s*(\S+)\s+-\s+(.+)$/);
        if (m && !/^Available/i.test(m[1]) && !/^Tip:/i.test(line)) {
          out.cursor.options.push(m[1]);
          if (/\(current, default\)/.test(line)) out.cursor.default = m[1];
        }
      }
    } catch { /* cursor 清單抓不到就留 auto */ }
    modelsCache = out;
    return out;
  };

  // 技能面板：掃各家已安裝的 skills（讀 SKILL.md 的 name/description）
  const listSkills = () => {
    const out = [];
    const scan = (dir, owner) => {
      try {
        if (!existsSync(dir)) return;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const skillMd = join(dir, entry.name, 'SKILL.md');
          let description = '';
          try {
            if (existsSync(skillMd)) {
              const head = readFileSync(skillMd, 'utf8').slice(0, 2000);
              description = (head.match(/^description:\s*([\s\S]*?)(?=\n\w+:|\n---)/m) || [])[1]
                || (head.match(/^description:\s*(.+)$/m) || [])[1] || '';
              description = description.replace(/^\s*[>|][-+]?\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 160); // 去掉 YAML 折行記號

            }
          } catch { /* 讀不到描述就留白 */ }
          out.push({ name: entry.name, owner, description });
        }
      } catch { /* 目錄讀取失敗略過 */ }
    };
    scan(join(cwd, 'skills'), '內建（自包含）'); // 專案打包的 Agent-LV.MAX 三技能
    scan(join(HOME, '.claude', 'skills'), 'claude');
    scan(join(cwd, '.claude', 'skills'), 'claude（專案）');
    scan(join(HOME, '.codex', 'skills'), 'codex');
    return out;
  };

  const readDoc = (name) => {
    if (!DOC_WHITELIST.includes(name)) return null; // 白名單擋路徑跳脫
    const p = join(cwd, 'docs', `${name}.md`);
    if (!existsSync(p)) return '';
    const t = readFileSync(p, 'utf8');
    return t.length > 120000 ? `…（前段省略）\n${t.slice(-120000)}` : t;
  };

  const readBody = (req, limit = 1024 * 1024) => new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (d) => {
      body += d;
      if (body.length > limit) { reject(new Error('body 過大')); req.destroy(); }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

  const json = (res, code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  };

  // 派工共用入口（表單派工與對話都走這，共用 busy 鎖）
  const dispatch = async ({ kind, prompt, chain, strategy, only, models, effort, memory }) => {
    if (busy) throw Object.assign(new Error('已有任務進行中（單一寫者政策）'), { code: 409 });
    busy = { kind, task: String(prompt).slice(0, 140), startedAt: new Date().toISOString() };
    broadcast('busy', busy);
    try {
      let chainList;
      let chainName;
      if (only && only.length) { chainList = only; chainName = `only:${only.join('+')}`; }
      else {
        chainName = chain && config.chains[chain] ? chain : config.defaultChain;
        chainList = config.chains[chainName] || config.chains[config.defaultChain];
      }
      const out = await runTask({
        cwd, prompt, chain: chainList, config,
        models: models || {},
        strategy: only && only.length ? 'priority' : strategy || config.strategy,
        effort: effort || null,
        force: Boolean(only && only.length),
        memory: memory !== false,
      });
      lastResult = { kind, chain: chainName, chosen: out.chosen, ms: out.ms, model: out.model, at: new Date().toISOString(), attempts: out.attempts };
      return out;
    } finally {
      busy = null;
      broadcast('busy', null);
      broadcast('refresh');
    }
  };

  const server = createServer(async (req, res) => {
    req.setTimeout(0); // 派工可能跑數分鐘，不讓 HTTP 逾時砍掉
    let url;
    try { url = new URL(req.url, `http://127.0.0.1:${port}`); }
    catch { return json(res, 400, { error: 'bad url' }); } // 畸形 request-target 不可懸掛 socket
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        // no-store：避免瀏覽器快取舊版 JS（改版後重新整理就一定拿到新頁）
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, must-revalidate' });
        res.end(WEB_UI);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, stateSnapshot());
      if (req.method === 'GET' && url.pathname === '/api/doctor') {
        lastDoctor = await runDoctor(config);
        return json(res, 200, lastDoctor);
      }
      if (req.method === 'GET' && url.pathname === '/api/skills') return json(res, 200, { skills: listSkills() });
      if (req.method === 'GET' && url.pathname === '/api/models') return json(res, 200, await listModels(url.searchParams.has('refresh')));
      if (req.method === 'GET' && url.pathname === '/api/docs') {
        const content = readDoc(url.searchParams.get('name') || '');
        if (content === null) return json(res, 400, { error: '不在白名單' });
        return json(res, 200, { content });
      }
      if (req.method === 'GET' && url.pathname === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write('event: hello\ndata: {}\n\n');
        sseClients.add(res);
        const hb = setInterval(() => {
          try { res.write(': hb\n\n'); }
          catch { clearInterval(hb); sseClients.delete(res); } // 心跳寫失敗就收掉，不留殭屍計時器
        }, 25000);
        req.on('close', () => { clearInterval(hb); sseClients.delete(res); });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/dispatch') {
        const b = JSON.parse(await readBody(req) || '{}');
        if (!b.task || !String(b.task).trim()) return json(res, 400, { error: '任務不可為空' });
        const out = await dispatch({
          kind: 'dispatch',
          prompt: String(b.task),
          chain: b.chain, strategy: b.strategy,
          only: Array.isArray(b.only) ? b.only.filter((s) => typeof s === 'string') : (b.only ? [String(b.only)] : []),
          models: typeof b.models === 'object' && b.models ? b.models : {},
          effort: b.effort, memory: b.memory,
        });
        return json(res, 200, { ok: Boolean(out.chosen), ...out });
      }
      // ── 資料夾瀏覽（給「作業區」點選用；只列目錄，不讀任何檔案內容）──
      if (req.method === 'GET' && url.pathname === '/api/fs/list') {
        const p = (url.searchParams.get('path') || '').trim();
        if (!p) {
          // 根層：列出存在的磁碟機
          const drives = [];
          for (let i = 65; i <= 90; i++) {
            const d = `${String.fromCharCode(i)}:\\`;
            try { if (existsSync(d)) drives.push({ name: d, path: d }); } catch { /* 無此磁碟 */ }
          }
          return json(res, 200, { path: '', parent: null, dirs: drives });
        }
        const abs = resolve(p);
        try {
          const dirs = readdirSync(abs, { withFileTypes: true })
            .filter((e) => e.isDirectory() && !e.name.startsWith('$') && e.name !== 'System Volume Information')
            .map((e) => ({ name: e.name, path: join(abs, e.name) }))
            .slice(0, 500); // 上限防巨型目錄
          const parentDir = dirname(abs);
          return json(res, 200, { path: abs, parent: parentDir === abs ? '' : parentDir, dirs });
        } catch (err) {
          return json(res, 400, { error: `無法讀取：${err.message}` });
        }
      }
      if (req.method === 'POST' && url.pathname === '/api/fs/mkdir') {
        const b = JSON.parse(await readBody(req) || '{}');
        const base = validWorkdir(b.base);
        const name = String(b.name || '').trim();
        if (!base) return json(res, 400, { error: '上層資料夾不存在' });
        if (!name || /[\\/:*?"<>|]/.test(name)) return json(res, 400, { error: '資料夾名稱不合法' });
        const p = join(base, name);
        try { mkdirSync(p); return json(res, 200, { ok: true, path: p }); }
        catch (err) { return json(res, 400, { error: err.message }); }
      }

      // ── 任務書（Mission）模式 ──────────────────────────────
      if (req.method === 'GET' && url.pathname === '/api/mission') {
        const wd = validWorkdir(url.searchParams.get('workdir'));
        if (!wd) return json(res, 400, { error: '作業區資料夾不存在' });
        return json(res, 200, { mission: loadMission(wd) });
      }
      if (req.method === 'POST' && url.pathname === '/api/mission/plan') {
        const b = JSON.parse(await readBody(req) || '{}');
        const wd = validWorkdir(b.workdir);
        if (!wd) return json(res, 400, { error: '作業區資料夾不存在（請填存在的絕對路徑）' });
        const planDoc = String(b.planDoc || '').trim();
        if (planDoc.length < 10) return json(res, 400, { error: '規劃書太短，請描述要做什麼' });
        if (busy) return json(res, 409, { error: '已有任務進行中' });
        const chief = config.providers[b.chief] ? b.chief : (config.chief || 'claude');
        const maxTasks = Math.min(Math.max(parseInt(b.maxTasks, 10) || config.mission?.maxTasks || 12, 1), 30);
        const created = ensureWorkspaceScaffold(wd, config.project); // 沒骨架自動建（使用者已確認）
        busy = { kind: 'mission-plan', task: `總指揮（${chief}）產出規劃單`, startedAt: new Date().toISOString() };
        broadcast('busy', busy);
        try {
          // 給總指揮的額度簡報：真實 %（codex）＋冷卻＋平均耗時 —— 避免指派給快滿的家、剛開工就換手
          const quotaNote = `\n${quotaNoteForChief(getQuotaSnapshot(cwd, config))}`;
          const prompt = buildPlanPrompt({ planDoc, config, quotaNote, maxTasks, chief });
          const chiefChain = [chief, ...Object.keys(config.providers)].filter((v, i, a) => a.indexOf(v) === i);
          // 規劃降級：短 timeout 逐家嘗試，某家卡住/失敗就換下一家（避免單一總指揮 headless 卡死整條 Mission）
          const planned = await planWithFallback({ cwd: wd, stateCwd: cwd, prompt, chain: chiefChain, config, effort: b.effort || null, maxTasks });
          if (planned.error) return json(res, 502, { error: `總指揮規劃失敗：${planned.error}`, attempts: planned.attempts });
          ensureReviewTask(planned.plan, config); // 強制審查：≥3 任務沒獨立審查就自動補（派非實作者）
          const mission = {
            ...planned.plan,
            chief, workdir: wd, plannedBy: planned.plannedBy,
            createdAt: new Date().toISOString(), status: 'planned',
          };
          saveMission(wd, mission); // 存檔＝閘門：等使用者按「開始執行」
          return json(res, 200, { ok: true, mission, scaffoldCreated: created });
        } finally {
          busy = null; broadcast('busy', null); broadcast('refresh');
        }
      }
      if (req.method === 'POST' && url.pathname === '/api/mission/start') {
        const b = JSON.parse(await readBody(req) || '{}');
        const wd = validWorkdir(b.workdir);
        if (!wd) return json(res, 400, { error: '作業區資料夾不存在' });
        const mission = loadMission(wd);
        if (!mission) return json(res, 404, { error: '這個作業區還沒有規劃單，先按「產生規劃單」' });
        if (busy) return json(res, 409, { error: '已有任務進行中' });
        missionStop = false;
        busy = { kind: 'mission', task: `執行任務書：${mission.goal.slice(0, 80)}`, startedAt: new Date().toISOString() };
        broadcast('busy', busy);
        // 背景執行（回應先回、進度走 SSE）；整段佔用 busy（單一寫者）
        (async () => {
          try {
            await executeMission({
              workdir: wd, stateCwd: cwd, config, mission,
              selectedIds: Array.isArray(b.selectedIds) && b.selectedIds.length ? b.selectedIds : null,
              effort: b.effort || null,
              onProgress: (m) => broadcast('mission', { status: m.status, tasks: m.tasks.map((t) => ({ id: t.id, status: t.status, doneBy: t.doneBy || null })) }),
              shouldStop: () => missionStop,
            });
          } catch (err) {
            console.error(`[mission] 執行例外: ${err && err.message}`);
          } finally {
            busy = null; broadcast('busy', null); broadcast('refresh');
          }
        })();
        return json(res, 200, { ok: true, started: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/mission/stop') {
        missionStop = true;
        return json(res, 200, { ok: true, stopping: true });
      }

      if (req.method === 'POST' && url.pathname === '/api/chat') {
        const b = JSON.parse(await readBody(req) || '{}');
        const message = String(b.message || '').trim();
        if (!message) return json(res, 400, { error: '訊息不可為空' });
        if (busy) return json(res, 409, { error: '已有任務進行中' }); // busy 先擋，免得孤兒訊息污染共享記憶
        appendChatTurn(cwd, { role: 'user', text: message }); // 落地（record-backed）
        const recent = readRecentChat(cwd, 3000);
        const prompt = [
          '你是 claude/codex/grok/cursor 輪替協作團隊的一員，使用者透過 web 控制台跟「團隊」對話。',
          '以下是最近的對話紀錄（含這則新訊息，已寫入 docs/CONVERSATION_LOG.md）：',
          '---', recent, '---',
          `請回覆使用者最新這則訊息：「${message}」`,
          '要求：繁體中文、直接回答、不要重複紀錄內容；若使用者給了新方向，在回覆末尾加一段 [交接] 摘要。',
        ].join('\n');
        const out = await dispatch({
          kind: 'chat', prompt,
          chain: b.chain, strategy: b.strategy,
          only: Array.isArray(b.only) ? b.only.filter((s) => typeof s === 'string') : (b.only ? [String(b.only)] : []),
          effort: b.effort, memory: true,
        });
        // 有回覆記回覆；沒有也記失敗標記，讓紀錄自洽（不留孤兒使用者訊息）
        if (out.chosen) appendChatTurn(cwd, { role: 'assistant', provider: out.chosen, text: out.result });
        else appendChatTurn(cwd, { role: 'assistant', provider: 'system', text: '（本輪所有家皆不可用，未取得回覆）' });
        return json(res, 200, { ok: Boolean(out.chosen), provider: out.chosen, model: out.model, reply: out.result, attempts: out.attempts });
      }
      json(res, 404, { error: 'not found' });
    } catch (err) {
      json(res, err.code === 409 ? 409 : 500, { error: (err && err.message) || String(err) });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve); // 只綁本機，不對外
  });
  return { server, port };
}
