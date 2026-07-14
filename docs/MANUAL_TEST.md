# 手動測試指南

> 想親手確認 agentbaton 能跑？照這份走。

## 冒煙測試（零額度消耗，先確認裝置沒問題）

```bash
node --test test/unit.test.mjs   # 應：# pass 42 / # fail 0
node src/cli.js --doctor         # 檢查各家已安裝＋登入（讀本地憑證，不呼叫 API）
node src/cli.js --status         # 看各家額度/冷卻/用量
node src/cli.js "..." --dry-run  # 只看會派給誰，完全零副作用
```

## 測試換手邏輯（不燒真額度）

```bash
# 強制某幾家「假裝額度用完」，驗證會不會正確換下一家
node src/cli.js "說個 hello" --simulate-limit codex,claude
```

## 真實派工（會燒 1 次訂閱額度）

```bash
node src/cli.js "用一句話說明這個專案是什麼"          # balance 均攤選家
node src/cli.js "同上" --only grok                    # 指名 grok
node src/cli.js "同上" --chain implement              # 用實作角色鏈
```

驗收：回覆會寫進 `docs/LOG.md`（每次呼叫留痕）與 `docs/DEV_LOG.md`（交接紀錄）。

## Web 控制台（推薦，最完整）

```bash
node src/cli.js serve            # → http://127.0.0.1:7680
```

可測：
- **狀態卡**：各家即時額度/冷卻/用量（SSE 即時推播）
- **派工表單**：鏈/策略/指名/model 下拉/effort 滑桿
- **對話**：跟「團隊」說話，回覆寫回 `docs/CONVERSATION_LOG.md`
- **任務書**：填作業區+規劃書 → 總指揮拆任務 → 閘門確認 → 多家並行執行 → 總驗收
- **紀錄**：檢視 docs/ 的接力紀錄
- **技能面板**：掃描本機與內建技能

## 任務書全自動流程（會燒多次額度）

1. web 控制台 → 任務書分頁
2. 作業區填一個空資料夾（可用「瀏覽…」建新的）
3. 規劃書寫個小需求（例：「做一個 TODO CLI，支援新增/列出/完成/刪除 + 測試」）
4. 選總指揮（預設 claude）→ ①產生規劃單（**要按兩次確認**，防誤觸）
5. 檢查任務拆解 → ②開始執行（同樣按兩次）
6. 觀察多家並行執行、換手、總驗收報告

## 出問題時

- 看 `docs/LOG.md`（每次呼叫的狀態/錯誤）
- 看 `docs/HANDOFF.md`（現況與已知風險）
- 要全新重來：把 `.orchestrator/state.json` 內容換成 `{"providers":{},"schemaVersion":1}`
