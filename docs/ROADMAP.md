# 製作規劃（ROADMAP）

> 2026-07-11 多代理工作流（審計 + 研究 + 綜合 + 批判）產出，已納入批判的排序修正。
> 現況：功能完整、42 條單元測試綠、四家實戰驗證通過（見 docs/MANUAL_TEST.md 自行驗證）。

## 技術選型

**核心不換語言**：維持 Node.js(ESM)、`child_process` 驅動真 CLI，缺口用**最小相依**補（相依預算要明列，見下方待決）。分四層：

| 層 | 選型 | 說明 |
|----|------|------|
| 核心/後端 | 現有 spawn/providers/orchestrator/state/log 六檔 | spawn.js 升級成「UI 地基」：串流回呼 onStdout、AbortSignal、回傳耗時；state 改原子寫+檔鎖 |
| 額度層 | `node:fs` 讀本地 log（零原生相依、**零遠端呼叫**）| 四家一律讀各自本地 session 紀錄估用量；claude OAuth API 列為 **off-by-default 選配**（見風險）|
| CLI | 手寫 arg parser 但硬化 | 未知旗標報錯、`--help/--json/--timeout/--clear-cooldown`、單一 `agentbaton` bin + 子命令 |
| UI/可視化 | **本地 web 儀表板為主** + Ink TUI 伴隨 | 見下方 UI 方案 |

## 額度可視化 + 預告（你問的重點）

**現況**：只有 `--status` 顯示冷卻時間 + 成功用量次數，**沒有**真正的剩餘額度%/燃燒率/預計耗盡。以下是設計。

**兩層互補**：
- **真相層（現有，最終裁決）**：解析 CLI 撞牆訊息 + 重置時間設冷卻。保證撞牆後正確換手。**預測層永不覆蓋它。**
- **預測層（新增，提早換手）**：主動輪詢本地檔/API 算 burn rate，**先只顯示（display-only）**，確認預測準了再開「主動軟降級」開關。

**各家資料源（決策：一律讀本地 LOG，不打任何遠端 API → 零帳號風險）**：
- **claude**：讀 `~/.claude` 的本地 jsonl session log 算已用量（ccusage 那套做法），上限未知用 P90 估。
- **codex**：讀 `%USERPROFILE%\.codex\sessions\YYYY\MM\DD\rollout-*.jsonl` 的 `rate_limits.primary(5h)/secondary(週)` used_percent + resets_in_seconds。
- **grok / cursor**：讀 `~/.grok/sessions` / cursor 本地 session 檔估用量；讀不到就標「估算/未知」灰狀態，靠真相層。
- **選配（預設關）**：claude 官方 OAuth usage API `GET /api/oauth/usage` 能拿權威剩餘 %，但屬非公開端點+輪詢須≥180s+帳號風險 → 做成 off-by-default 開關，願意承擔才開。`caut --json` 亦可當統一外部探針（非相依）。

**演算法**：burn rate = 近窗 Δutil% / Δ分鐘；ETA 耗盡 = (100−util%)/burnRate；方案上限未知時用 claude-monitor 式 P90。**需最小樣本門檻 + 平滑**避免稀疏樣本觸發假預測。

**視覺**：每家一張卡（5h窗+週窗進度條、🔥 burn-rate 徽章、「預計耗盡 15:42」、reset 倒數）、換手時間軸、utilization 趨勢圖、狀態徽章 🟢健康/🟡即將耗盡/🔴冷卻/⚪未知。

**⚠️ 成本標示**：吃訂閱不是 API 計費，usage 的美元數字是**名目消耗量**不是實際花費，UI 要標清楚免得誤會被收錢。

## UI 介面方案：選哪個、參考哪個

**主介面 = 嵌入式本地 web 儀表板**（不選系統匣，因為最好的匣工具 CodexBar/ClaudeBar 全是 macOS-Swift，Node 跨平台匣庫畫不出儀表板）。
- `agentbaton serve`：`node:http` + SSE + `fs.watch`/chokidar 監看 state.json/events.jsonl 即時推；前端**先單一自帶 HTML + uPlot**（零建置），之後可 graduate 成 Vite+React+Tailwind。
- **參考範本**：主範本 **TokenTracker**（Win 系統匣+本地 dashboard，localhost:7680，多家進度條+趨勢圖）；最小後端看 **TokenDash**（Express+Zod 讀 session 檔）；「單一版本化 state 供任何前端消費」的解耦哲學看 **claude-monitor**。

**伴隨 = Ink TUI**（`agentbaton watch`）：前景終端即時狀態列（誰在跑/誰冷卻/倒數），Anthropic 自己在 Claude Code 用的同套技術。**獨立進程跑，絕不和 headless 派工共用 stdout**（否則互相打架）。

**關鍵**：orchestrator 只吐**單一版本化 state**（唯一真相源），web/TUI/tray 都只是消費者，可並存可替換。先補 `--json` 輸出當共同接口。

## 參考專案（借鑑什麼）

| 專案 | 借什麼 |
|------|--------|
| **willynikes2/agent-orchestrator** | 失敗分類→復原對應表 taxonomy、per-role 失敗鏈、`@provider` 直接定址 |
| **caut** | 唯一跨平台 CLI + robot JSON 的統一預測探針（Win cookie 弱，grok/cursor 仍靠真相層）|
| **Anthropic OAuth usage API + codex rollout 檔** | 權威本地額度來源（見上方資料源）|
| **claude-monitor + ccusage** | 預測演算法（burn rate、Projected、P90 上限）、單一 state 解耦哲學 |
| **TokenTracker + TokenDash** | Windows web 儀表板主範本 |
| **Ink** | TUI 狀態列 |
| awslabs/CAO、oh-my-claudecode | （後續）可檢索記憶層、control/data-plane 分離 |

## Roadmap（已按批判重排；v1 = Phase 0–2）

**先凍結契約**（動 state.js 之前）：定 `state.json` 目標 schema（含 `schemaVersion` + migrate）+ `--json` 輸出契約，避免 state.js 返工兩次。

- ~~**Phase 0 — 止血**~~ ✅ **已完成**：state 原子寫+鎖、setCooldown 立即存、stdin EPIPE、UTF-8 亂碼、Windows tree-kill、regex 收緊、sanitizedEnv 修 OAuth token、dry-run 副作用、classifyCodex 假成功。**同批補脆弱邏輯的 node:test**（classify/parseResetAt/merge）。
- **Phase 1 — 資料地基（2-3 天）**：parseResetAt 擴充（epoch/ISO/相對）、統一 classifier 回傳 usage/cost、`events.jsonl` 事件流、state schema 擴充 + `schemaVersion` migrate、CLI 硬化 + `agentbaton` 子命令骨架、**收集 grok/cursor 真實 limit 樣本→fixtures**。
- **Phase 2 — 額度預測層（3-5 天）**：**單例跨重啟節流的 poller**（claude OAuth 探針 + codex 本地探針，探針掛了優雅降級回真相層）、burn rate/ETA/P90、`--status` 升級顯示 utilization/reset/預計耗盡。**先 display-only**。
- **▲ v1 交付點**：Phase 0–2 用真實工作量驗證後，再承諾可視化堆疊。
- **Phase 3 — Web 控制台 MVP（3-5 天）**：`agentbaton serve` + SSE + 單一 HTML+uPlot。**使用者確認的需求（2026-07-11）**：
  1. **啟動先跑 doctor**（已實作 `--doctor`）：檢查要啟用的每家已安裝＋登入，沒過就顯示修法、不開派工。
  2. **即時狀態**：⏳「哪家 [model] 正在處理什麼任務」（資料源 `.orchestrator/current.json`，已實作）＋各家額度/冷卻/用量卡＋狀態徽章。
  3. **紀錄檢視器**：LOG / DEV_LOG / HANDOFF / CONVERSATION_LOG 即時捲動。
  4. **派工表單**：任務輸入、鏈/策略選擇、`--only` 指名、**model 下拉**（各家可選型號）、**effort 強度滑桿**（Faster↔Smarter）。
  5. **effort 對應表**（實測過旗標存在）：claude `--effort <level>`（low/medium/high/xhigh/max）；grok `--reasoning-effort <EFFORT>`；codex `-c model_reasoning_effort=<level>`（argv 直傳**不要帶引號**——引號是 shell 層的東西）；cursor 走 model 字串內嵌 `model[effort=high]`（會覆蓋既有 [effort=…]）。不支援的家自動忽略。
  6. 主動軟降級用 flag 閘控（先觀察成效再開）。
- **Phase 4 — 產品化打磨**：測試套件補齊、打包 npm bin、config schema 驗證、config 友善錯誤。
- **Phase 5 — 借鑑編排升級**：taxonomy 形式化、role 前綴觸發、（延後）可檢索記憶層 SQLite。
- **Phase 6 — 進階/選配**：worktree 隔離並行、系統匣、tri-model synthesis。

## 關鍵風險（批判補充，必讀）

1. ~~claude usage API 風險~~ → **已決策規避**：預設四家一律讀本地 LOG、不打遠端 API，此帳號/429 風險預設不存在。僅在使用者主動開 OAuth API 選配時才適用（屆時：非公開端點可能被封+觸 ToS+輪詢≥180s 否則永久 429，須單例持久化節流 poller + 探針掛了優雅降級回真相層）。
2. **本地 log 格式會隨 CLI 改版變動** → 讀本地檔的唯一風險是「解析器要跟版本」（是 bug，不是封號）；各家 parser 要容錯、讀不到就退回真相層，不可讓 dispatch 壞掉。
3. **grok/cursor 半支艦隊**：無遙測 + 偵測脆 → 這兩家最容易換手失敗，投資要補（見 Phase 1 樣本收集）。
4. **taskkill /T /F 副作用**：強殺會讓 codex 來不及 flush session 檔 → 探針讀到半寫檔；truncated 輸出的 classifier 行為要定義（別重試重複燒額度）。
5. **併發**：多寫者下計數器 `+1` 會 lost update → counters 改由 events.jsonl 推導。
6. **serve 安全**：localhost 綁定別誤綁 0.0.0.0、message 渲染防 XSS。

## 待決（動工前拍板）

- **准入相依清單**：chokidar/uPlot/Ink/proper-lockfile 要不要引？（`fs.watch` + `fs.openSync('wx')` 可零相依替代）
- **單一寫者政策**：orchestrator 是唯一寫者，還是 serve/poller 也寫？（決定鎖複雜度）
- **決策優先序表**：`@provider` 定址 / role 鏈 / 預測跳過 / cooldown / balance 疊在一起時聽誰的？
