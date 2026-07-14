# 計畫 (PLAN)

> 相關文件：[SCHEDULING.md](SCHEDULING.md) 調度設計 · [ROADMAP.md](ROADMAP.md) 完整製作規劃(含額度可視化/UI)

## 目標
用 claude / codex / grok / cursor 四家訂閱，在同一個專案上輪替協作；額度耗盡自動換手。

## 里程碑
- [x] M0 探明三家在本機的 headless 叫法與錯誤格式（claude/codex/grok 實測完成）
- [x] M1 orchestrator MVP：chain 選家 → 跑 → 偵測額度/認證 → 換手 → 寫日誌
- [x] M2 額度狀態持久化（.orchestrator/state.json，記冷卻到期時間）
- [x] M3 每家可指定 model（`--model` 或設定檔），不指定用各家最新預設
- [x] M4 第四家 cursor：`cursor-agent` 已裝、已登入、實測回真答案（預設 model 是 Cursor 的 Auto 路由）。**四家全部上線。**
- [x] M5 調度策略：balance(均攤,預設) / priority(依鏈) / `--only`(子代理直接叫,繞過冷卻)；用量計數 + auth 也設冷卻。見 docs/SCHEDULING.md
- [ ] M6 產出驗收：換手成功後確認「真的做到了」（codex 曾回報完成卻沒建檔）
- [ ] M7 接 `caut` 做「主動查剩餘額度」的預判（目前反應式）
- [ ] M8 worktree 隔離：多家並行改檔各自 git worktree，避免互踩

## 登入狀態（2026-07-11 皆已完成）
- **claude**：token 曾於 2026-05-30 過期 → `claude login` 已刷新（現為 Max）。✅
- **codex**：Logged in using ChatGPT，額度 23:25 後恢復。✅
- **grok**：SuperGrok 登入正常。✅
- **cursor**：`cursor-agent login` 已完成，實測回真答案。✅
- 提醒：剛裝好的 CLI 若在舊終端機視窗「無法辨識」，是 PATH 沒刷新——開新終端機即可。無人值守/CI 用 `claude setup-token`。

## 已知限制（誠實記錄）
- claude 別在另一個 Claude Code session 裡巢狀跑（會吃到 session 的 `ANTHROPIC_BASE_URL` proxy）；adapter 已清該環境變數，獨立終端機跑正常。
- codex 需 `--skip-git-repo-check`（非 git 目錄）；成功訊息路徑用 `-o` 檔讀取。
- 額度重置時間目前靠解析錯誤訊息字串（如 "try again at 11:25 PM"），解析不到就用設定的預設冷卻分鐘數。
