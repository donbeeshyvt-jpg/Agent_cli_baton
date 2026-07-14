# Code Index — 碼庫地圖（雙語，省 token）

> 讀這份就懂各檔職責，不必開檔掃碼。改 `src/` 請同回合更新本檔。
> Responsibility (EN) + 職責（繁中）。

## src/

| File | Responsibility (EN) | 職責（繁中）| Key symbols |
|---|---|---|---|
| `cli.js` | Entry point: parse argv, resolve chain/strategy/model, print status, drive runTask | 進入點：解析參數、決定鏈/策略/model、印狀態、呼叫換手核心 | `parseArgs`, `parseModels` |
| `orchestrator.js` | Core failover: order by strategy, dispatch, classify, cooldown, next-man-up, live progress stream | 換手核心：依策略排序、派工、歸類、設冷卻、換下一家、即時進度串流 | `runTask` |
| `providers.js` | Four CLI adapters: resolve bin, build args, run headless, classify, codex JSONL→progress | 四家 adapter：找執行檔、組參數、headless 跑、歸類、codex 事件流翻人話 | `PROVIDERS`, `classifyClaude/Codex/Grok/Cursor`, `parseResetAt`, `makeCodexProgress` |
| `spawn.js` | Subprocess layer: spawn (Windows .cmd shell), stdin, env sanitize, timeout (taskkill /T), stream chunks | 子行程層：spawn、stdin 餵 prompt、清環境、逾時殺整棵進程樹、即時串流片段 | `runCli`, `sanitizedEnv`, `needsShell` |
| `state.js` | Persist cooldown/usage (atomic write, corrupt backup) + concurrency mutex + current MAP + live | 冷卻/用量持久化＋並發 mutex＋current MAP（並行多家）＋即時進度 | `loadState`, `updateState`, `setCooldown`, `recordUse`, `getCurrentMap`, `updateCurrentLive` |
| `log.js` | Append each call/handoff to docs/LOG.md (never throws) | 把每次呼叫/換手寫進 docs/LOG.md（絕不拋錯）| `appendLog` |
| `memory.js` | Shared-memory layer: inject docs records into prompt, write back handoff | 共享記憶層：派工注入接力紀錄、回合末寫回交接 | `composeDispatchPrompt`, `recordDispatchResult` |
| `mission.js` | Mission mode: chief plans (per-provider fallback + huge-brief summarize) → gate → parallel scheduler (dep graph + deadlock settle) → auto-fix loop → forced review | 任務書模式：總指揮規劃（逐家降級＋超大 brief 摘要）→閘門→並行調度（依賴圖＋死鎖收斂）→自動修復→強制審查 | `buildPlanPrompt`, `planWithFallback`, `summarizeBriefIfHuge`, `parsePlan`, `executeMission`, `computeDeps`, `chainForTask` |
| `skills.js` | Self-contained skills: read bundled skills/, inject skill cores into every prompt | 技能自包含：讀專案內建 skills/、把技能核心注入每個 prompt（免安裝）| `bundledSkills`, `composeSkillBlock`, `SKILL_CORES` |
| `quota.js` | Local quota snapshot (codex real %, others cooldown/avg) for chief scheduling | 額度快照（codex 真實 %、其餘冷卻/平均耗時）給總指揮排程 | `codexQuota`, `getQuotaSnapshot`, `quotaNoteForChief` |
| `doctor.js` | Preflight: verify each CLI installed + logged in (zero quota) | 啟動前檢查：各家已安裝＋登入（讀本地憑證，零額度）| `runDoctor` |
| `server.js` | Web console backend: node:http + SSE, 127.0.0.1 only, busy lock, dispatch/chat/docs/skills/mission API | web 控制台後端：SSE 即時推播、只綁本機、單一寫者鎖、各種 API | `serve` |
| `web-ui.js` | Single-file frontend (no CDN/framework, XSS-safe via textContent, dark/light) | 單檔前端：狀態卡/派工表單/對話/紀錄/技能面板/即時進度摺疊 | `WEB_UI` |

## test/

| File | 職責（繁中）|
|---|---|
| `unit.test.mjs` | 42 條單元測試：四家歸類、parseResetAt、正則誤判、state 原子性、共享記憶、規劃降級 |

## config / root

| File | 職責（繁中）|
|---|---|
| `orchestrator.config.json` | 策略、鏈、各家 model/沙箱/冷卻/偏好角色 |
| `.orchestrator/state.json` | 執行期狀態（冷卻/用量），機器維護勿手改（已在 .gitignore）|
| `skills/` | 打包的技能（Agent OS / Loop / Record System / agentbaton 操作）|

## 已知脆弱點

- state 無跨行程檔鎖 → **單一寫者政策**（同時只跑一個 orchestrator）
- `needsShell` 對「完整路徑無副檔名」回 false
- `schemaVersion` 只有最小 migrate
- 即時串流只有 codex 支援（其餘家 headless 不吐中間過程）
