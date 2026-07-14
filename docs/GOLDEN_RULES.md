# Golden Rules — 必守鐵律

Last updated: 2026-07-11

## 記憶 / 交接（本專案心臟）
1. **讀紀錄再動手**：任何一家 CLI 接手，先讀 `CONVERSATION_LOG`(Active Summary) + `HANDOFF` + `TASKS`，不掃碼庫。
2. **做完寫回紀錄**：同一回合更新 `HANDOFF` / `DEV_LOG` / `CONVERSATION_LOG`；改 src/ 就更新 `CODE_INDEX`。沒寫回 = 下一家失憶 = 破壞協作。
3. orchestrator 派工時**必須把上述紀錄注入 provider 的 prompt**，並在回合末更新。這是輪替變協作的唯一機制。

## 額度 / 安全
4. **吃訂閱不是 API**：子行程走各家登入憑證，**絕不帶 API key / 雲端憑證**（會變計費、違背初衷）。
5. **額度檢查一律讀本地 LOG**，不打遠端 API（零帳號風險）。OAuth API 若要用，做成預設關的選配。
6. 個人自用、適量：不轉售 / 不分享帳號 / 不對外當服務。

## 證據 / 完成定義
7. **沒證據不算完成**：codex 曾「回報完成卻沒建檔」——完成要看真實產出/測試，不看 CLI 有沒有正常結束。
8. **大改動先規劃再執行**：非小改動先在 ROADMAP 產出規劃、使用者確認、記進 HANDOFF 後才寫碼。中途改範圍回到迷你確認。
9. **保護已通過的 MVP**：每個 phase 後重跑三段換手 smoke test。

## 語言 / 一致性
10. 識別符英文、註解繁體中文；`CODE_INDEX` 雙語；**零簡體字**。
