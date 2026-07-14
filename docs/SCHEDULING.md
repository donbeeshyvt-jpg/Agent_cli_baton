# 額度調度設計（SCHEDULING）

> 這份是「怎麼查額度、怎麼輪替調度」的設計與決策記錄。2026-07-11 與使用者確認。

## 一、我們用的是哪個專案

**自己從零打造的 `agentbaton`**（就在本 repo）。參考了 `willynikes2/agent-orchestrator` 的 next-man-up failover 設計，但**沒用它的碼**，改成四家：`claude / codex / grok / cursor`（**不含 gemini**）。四家都以 headless 模式被當「可替換的手」呼叫，透過 `AGENTS.md` + `docs/` 共享狀態接力。

四家皆已實測上線（2026-07-11，balance 均攤四家各 1 次通過）。

## 二、怎麼查額度：反應式（reactive）

**不預先查、撞到才知道。** 流程：

```
派工 → 讀該家 CLI 的 stdout/stderr
     → 比對額度關鍵字（providers.js 的 LIMIT_RE：usage limit / rate limit / 429 / try again at…）
   撞到 → 解析重置時間（如 "try again at 11:25 PM"）→ 寫進 .orchestrator/state.json 的 cooldownUntil → 換手
   沒撞到 → 視為有額度，正常使用（成功則 uses+1）
下一次派工 → cooldownUntil 未到的直接 skip，不浪費呼叫
```

- **好處**：準（撞到就是真沒了）、零外部依賴。
- **壞處**：每次「發現沒額度」浪費一次呼叫。
- **未來選項（proactive）**：接 `caut`(coding_agent_usage_tracker) 在派工前先查剩餘額度/重置時間，沒額度直接跳過。決議：**先用反應式**，之後再評估加。

## 三、怎麼調度：策略可切、可當子代理

調度＝`策略(strategy)` 決定「順序怎麼排」，`鏈(chain)` 決定「候選有誰、角色偏好順序」。

| 策略 | 行為 | 怎麼用 |
|------|------|--------|
| **balance**（預設）| 未冷卻的候選依「使用次數少→多」排前面，均攤四家額度 | 設定檔 `strategy:"balance"` 或 `--strategy balance` |
| **priority** | 依鏈的原順序（搭配角色鏈＝角色分工）| `--strategy priority` |
| **子代理 `--only`** | 只叫指定的一或多家，依序、且**繞過冷卻強制執行** | `--only grok` / `--only codex,grok` |

- **角色分工**：靠選對鏈達成——`plan/review→claude 優先`、`implement→codex 優先`（見 orchestrator.config.json 的 chains），配 `--strategy priority`。
- **子代理概念**：每家都能用 `--only <家>` 當獨立 agent 直接叫，互不干擾。
- **冷卻**：額度耗盡用解析到的重置時間；認證/未登入設 ≤60 分冷卻（免得每次先撞沒登入的家）；`--only` 可強制繞過重試（登入後用）。

## 四、決策記錄（2026-07-11）

- 預設 **balance 均攤**；可隨時切 priority／角色鏈／`--only` 子代理。
- 額度偵測先用 **反應式**。
- codex 沙箱設 `danger-full-access`（本機缺 Windows 沙箱元件，且為自己信任的專案）。

## 五、待辦（下一步規劃）

- [ ] **產出驗收**：codex 曾「回報完成卻沒建檔」（沙箱問題）。要在換手成功後驗證「真的做到了」，不只看 CLI 有沒有正常結束。
- [ ] proactive 額度查詢（caut）。
- [ ] 並行：多家同時做不同任務，用 git worktree 隔離避免互踩。
- [ ] 加權 balance：均攤時把角色偏好一起考慮（目前 balance 純看使用次數）。
