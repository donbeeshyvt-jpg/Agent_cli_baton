---
name: record-system-dev
description: >-
  Agent 協作紀錄與規劃專案系統：讓 AI 開發可接力、不跑偏、省 token。AGENTS.md 唯一入口 + docs/ 外接記憶
  （對話紀錄、交接、任務、批准制），讓 AI 開發可連續、可追溯、換 agent 不失憶。觸發時機：長期維護專案、
  多 agent/多工具協作、規格導向開發、需要可追溯交接、接手既有大型專案、建立開發治理骨架。
---

# Record System Skill｜Agent 協作紀錄與規劃專案系統

## 使用方式

載入本技能後，**先完整閱讀同目錄下的 `UNIVERSAL_MULTI_AGENT_DEV_SKILL.md`**（完整程序規格），再依情境參考 `README.md`。

## 快速啟動（接手既有專案）

1. 讀 `AGENTS.md` 與 `docs/` 下的 PROJECT_VISION、00_AI_CONTEXT_INDEX、HANDOFF、TASKS、CODE_INDEX、GOLDEN_RULES、CONVERSATION_LOG（Active Summary）。
2. 跑 `check-consistency` 確認機械檢查狀態。
3. 摘要現況，接續 HANDOFF 的下一個安全任務。**不要掃描整個程式碼庫。**

## 新建專案治理骨架

執行同目錄的 `建立開發環境.ps1` 一鍵產生 docs/ 治理結構，或參考 `示範開發環境/`。
