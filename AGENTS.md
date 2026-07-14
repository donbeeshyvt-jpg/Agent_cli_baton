# AGENTS.md — Single Entry for ALL Agent Tools

> 所有 agent 工具（Claude Code / Cursor / Codex / Grok / Gemini / Aider / 本地 LLM / 純人類）的唯一入口。
> Every agent reads THIS file + docs/ first. Map, not manual — point to deeper docs, don't inline everything.

## What this project is（一句話）
一套 **多 CLI 訂閱輪替協作器**：用 orchestrator headless 驅動 claude / codex / grok / cursor 四家真實 CLI，吃各自訂閱額度，哪家到了自動換手，**四家透過這份 `docs/` 共享記憶接力、共同開發同一個專案**。
→ 深入動機看 `docs/PROJECT_VISION.md`。

## 🧠 核心：共享記憶就是這份 docs/（不是共享 context window）
四家不共享對話上下文（技術上塞不進彼此的 model）。它們**共享的是「檔案記憶」**——`docs/` 這本接力簿。這是本專案的心臟，不是附屬功能：
- **每次派工/對話前**：接手的那家先讀 `docs/CONVERSATION_LOG.md`(Active Summary) + `HANDOFF.md` + `TASKS.md`，才知道做到哪、要幹嘛。
- **每次做完**：把「做了什麼 + 為什麼 + 證據」寫回 `docs/`。沒寫回 = 下一家失憶。
- orchestrator 派工時**必須把上述紀錄注入 prompt**，並在回合結束更新紀錄。這是輪替能「協作」而非「各做各的」的唯一原因。

## You MUST keep docs in sync as you work（隨時記錄/更新）
改了程式或使用者給新方向，**同一回合**就更新：
- `docs/CODE_INDEX.md` — 任何 src/ 變動後（碼庫地圖，省 token）
- `docs/DEV_LOG.md` — 做了什麼 + 為什麼
- `docs/CONVERSATION_LOG.md` Active Summary — 最新使用者方向（換手記憶）
- `docs/HANDOFF.md` — 讓下一家冷啟就能接
- `docs/LOG.md` — orchestrator 自動累積的每次呼叫/換手紀錄（機器寫）

## Start here（照順序讀，然後停）
1. 動機與初衷：`docs/PROJECT_VISION.md`
2. 怎麼跑 / 現況 / 檔案地圖：`docs/00_AI_CONTEXT_INDEX.md`
3. 現在做到哪 + 交接：`docs/HANDOFF.md`、`docs/TASKS.md`
4. 對話狀態（使用者方向）：`docs/CONVERSATION_LOG.md`（Active Summary + 最近幾筆）
5. 碼庫地圖（省 token）：`docs/CODE_INDEX.md`
6. 必守規則：`docs/GOLDEN_RULES.md`
7. 製作規劃：`docs/ROADMAP.md`；調度設計：`docs/SCHEDULING.md`；手動測試：`docs/MANUAL_TEST.md`
8. **本工具怎麼操作**（全部接口）：`skills/Agentbaton_Skill/SKILL.md`

## Onboarding rule（token economy）
先讀上面的 docs，**不要掃整個程式碼庫**。docs 答不出的問題，代表 doc 不完整——去補它，別繞著它掃碼。

## Code & doc conventions
- 識別符英文、**註解繁體中文**（例：`// 處理額度換手`）。
- `docs/CODE_INDEX.md` 雙語（`Responsibility (EN)` + `職責（繁中）`）。
- **零簡體字**——docs 與 code 皆是。

## Directory ownership
| Dir | Purpose | May edit? |
|---|---|---|
| `docs/` | 外接記憶 / 交接（共享大腦）| yes, keep current |
| `src/` | orchestrator 本體 | yes |
| `.orchestrator/` | 執行期狀態（冷卻/用量，機器維護）| 勿手改 |

## Do not touch without approval
- 各家 CLI 的登入憑證（`~/.claude`、`~/.codex`、`~/.grok`、cursor）、`.env`、任何 `docs/00_AI_CONTEXT_INDEX.md` 標為 do-not-touch 的項目。

## 非小改動要走：規劃 → 確認 → 執行
任何非小修小改，先產出規劃（在 `docs/ROADMAP.md`），給使用者確認、記進 `docs/HANDOFF.md` 後才動手。中途改範圍回到迷你確認循環，不要悄悄擴張。
