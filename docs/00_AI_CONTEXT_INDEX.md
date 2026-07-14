# 00 · AI Context Index — 文件索引與怎麼跑

Last updated: 2026-07-11

## 怎麼跑（現況）
- 需求：Node.js ≥18；四家 CLI 已登入各自訂閱。
- 指令：
  - `node src/cli.js --status` — 四家額度/冷卻/用量
  - `node src/cli.js "任務"` — 均攤派工（balance）
  - `node src/cli.js "任務" --chain implement --strategy priority` — 角色分工
  - `node src/cli.js "任務" --only grok` — 子代理直接叫
- 設定：`orchestrator.config.json`（策略/鏈/model/冷卻）。

## 文件地圖（讀這些，別掃碼庫）
| 檔 | 是什麼 |
|---|---|
| `PROJECT_VISION.md` | 為什麼做（共享記憶接力協作）|
| `CONVERSATION_LOG.md` | 對話接力（Active Summary = 使用者方向）|
| `HANDOFF.md` | 現況 + 下一個安全任務 |
| `TASKS.md` | 任務板（待人工/待辦/完成）|
| `CODE_INDEX.md` | 碼庫地圖（省 token，雙語）|
| `GOLDEN_RULES.md` | 必守鐵律 |
| `ROADMAP.md` | 完整製作規劃（v1 = web 控制台）|
| `SCHEDULING.md` | 額度調度設計 |
| `PLAN.md` | 里程碑 |
| `LOG.md` | orchestrator 執行日誌（機器自動寫）|

## Do Not Touch
- 各家登入憑證：`~/.claude`、`~/.codex`、`~/.grok`、cursor 的 session/auth。
- `.orchestrator/state.json`（執行期狀態，機器維護，勿手改）。
- 任何 API key / 雲端憑證 —— 本專案吃訂閱，不走 API 計費。
