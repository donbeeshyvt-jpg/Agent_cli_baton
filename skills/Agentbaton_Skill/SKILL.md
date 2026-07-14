---
name: agentbaton
description: >-
  agentbaton 多 CLI 訂閱輪替協作器的完整操作手冊：怎麼把一個做不完的專案，交給 claude / codex / grok /
  cursor 四家 CLI 用各自的訂閱額度接力做完。涵蓋全部接口——命令列參數、web 控制台、任務書模式、設定檔、
  共享記憶協定、Web API。觸發時機：第一次用 agentbaton、想知道怎麼派工、額度快用完想換手接力、
  要跑任務書讓多家並行、想知道某個參數幹嘛用、接手別人用 agentbaton 開發的專案。
---

# agentbaton 操作手冊

## 這東西在解決什麼問題

你的 AI 訂閱有額度上限。一個大專案跑到一半額度沒了，就卡住了。

agentbaton 的做法：**把任務交給四家 CLI 接力做**。claude 額度滿了自動換 codex，codex 滿了換 grok，全部滿了就等冷卻。它們透過 `docs/` 這本接力簿共享進度，所以**換手不失憶**——下一家知道前面做到哪。

**核心不是省額度，是接力不失憶。** 沒有共享記憶，輪替只是「各做各的」；有了它，才是協作。

## 30 秒上手

```bash
node src/cli.js --doctor     # 1. 檢查哪幾家能用（零額度消耗）
node src/cli.js serve        # 2. 開控制台 → http://127.0.0.1:7680
```

控制台就是完整入口：看額度、派工、跟團隊說話、跑任務書、看紀錄。不想開網頁的話：

```bash
node src/cli.js "幫我把 README 翻成英文"    # 直接派工，系統自己選家
```

---

## 接口一：命令列

### 基本

```bash
node src/cli.js "<任務>"                    # 派工（預設 balance 均攤選家）
node src/cli.js --status                    # 看各家額度/冷卻/用量
node src/cli.js --doctor                    # 檢查各家安裝＋登入（零額度）
node src/cli.js serve [--port 7680]         # 開 web 控制台
```

### 選家與策略

| 參數 | 作用 | 例子 |
|---|---|---|
| `--only <家>` | 指名某家當子代理（**繞過冷卻**）| `--only grok` |
| `--chain <鏈>` | 用某個角色鏈 | `--chain implement` |
| `--strategy <策略>` | `balance`（均攤）或 `priority`（依鏈順序）| `--strategy priority` |
| `--role <角色>` | 指定角色（影響鏈選擇）| `--role review` |

**四條內建鏈**（定義在 `orchestrator.config.json`，可改）：
- `default`：通用 → claude → codex → grok → cursor
- `implement`：寫程式優先 → codex 先上
- `review`：審查挑錯優先 → claude 先上
- `plan`：規劃設計優先 → claude 先上

**兩種策略的差別**：
- `balance`（均攤）：誰用得少誰先上，額度平均消耗。**預設**。
- `priority`（依鏈）：照鏈的順序，等於角色分工（實作找 codex、審查找 claude）。

### 模型與強度

```bash
node src/cli.js "..." --model grok-4.5                    # 全部家套同一個
node src/cli.js "..." --model claude=opus,grok=grok-4.5   # 分家指定
node src/cli.js "..." --effort high                       # 推理強度（low/medium/high）
```

不指定 `--model` 就用各家最新預設。`--effort` 會對映到各家的參數（claude `--effort`、grok `--reasoning-effort`、codex `model_reasoning_effort`、cursor 模型字串）。

### 測試與除錯（不燒額度）

```bash
node src/cli.js "..." --dry-run                    # 只看會派給誰，完全零副作用
node src/cli.js "..." --simulate-limit codex,claude # 假裝某幾家額度滿，驗證換手
node src/cli.js --clear-cooldown                   # 清掉所有冷卻狀態
node src/cli.js "..." --no-memory                  # 不注入共享記憶（純問答用）
node src/cli.js "..." --cwd /path/to/workspace     # 指定作業區（紀錄寫那邊）
```

`--cwd` 很重要：派工到別的專案時，**紀錄跟著那個專案走**，但額度狀態集中在 agentbaton 本體（額度是全域的）。

---

## 接口二：Web 控制台

```bash
node src/cli.js serve   # → http://127.0.0.1:7680（只綁本機）
```

### 五個分頁

| 分頁 | 幹嘛用 |
|---|---|
| **派工** | 表單派工：鏈/策略/指名/各家模型/強度滑桿 |
| **對話** | 跟「團隊」說話，回覆寫進 `docs/CONVERSATION_LOG.md`（換手的家會讀）|
| **任務書** | 給規劃書 → 總指揮拆任務 → 閘門確認 → 多家並行執行 → 總驗收 |
| **紀錄** | 檢視 `docs/` 的接力紀錄（LOG / DEV_LOG / HANDOFF / TASKS…）|
| **技能** | 掃描本機與內建的技能 |

### 頂部即時狀態

- **大橫幅**：現在誰在跑什麼（可點開看完整任務內容 + 即時進度）
- **各家狀態卡**：model、成功次數、平均耗時、累計時間、最後執行、額度 %（codex 有真實 %）
- 執行中的家會亮藍框 + 轉圈，點開看它正在做什麼

> **即時進度只有 codex 有**：它的 headless（`--json`）會逐行吐事件（執行什麼命令、改什麼檔、exit code）。claude/grok/cursor 算完才給結果，這是 headless 模式的限制，不是壞掉。

---

## 接口三：任務書模式（重頭戲）

**這是「額度不夠跑完整個專案」的正解**：給它一份規劃書，它自己拆任務、分派給多家並行做、額度滿自動換手、最後總驗收。

### 怎麼跑

1. 控制台 → **任務書**分頁
2. **作業區資料夾**：填一個空資料夾（可用「瀏覽…」建新的）
3. **規劃書**：貼上需求，或「匯入檔案」載入 `.md`（支援超大規格書，>20KB 會自動摘要）
4. **總指揮**：預設 claude（可改）
5. **任務上限**：防無限拆解的硬上限
6. 按 **①產生規劃單**（要按**兩次**確認，防誤觸）→ 總指揮用 Agent OS 思考拆任務
7. 檢查任務清單（可勾選要跑哪些）→ 按 **②開始執行**（同樣兩次）
8. 看多家並行執行 → 總驗收 → 若未達成會自動生修復任務，**停在閘門等你放行**

### 它會自動做的事

- **建 Record System 骨架**：作業區自動生 `AGENTS.md` + `docs/`（共享記憶）
- **依賴圖調度**：沒依賴的任務並行跑，審查/測試等實作完才跑
- **每家一次一任務**：避免同一家開兩個行程互踩
- **調度層換手**：某家滿了，任務自動退回改派別家
- **強制審查**：≥3 個任務會自動補一個獨立審查（派給非主要實作者）
- **自動修復循環**：總驗收判「未達成」→ 把缺口轉成修復任務 → **等你按閘門**（最多 2 輪，防失控）

### 規劃降級（防卡死）

總指揮 headless 對大規格容易懸著不收尾。系統會：短 timeout（3 分）逐家嘗試 → 某家卡住/回垃圾就換下一家 → 全滅才明確報錯。

---

## 接口四：設定檔 `orchestrator.config.json`

```jsonc
{
  "project": "agentbaton",
  "defaultChain": "default",
  "strategy": "balance",        // balance 均攤 / priority 依鏈
  "timeoutMs": 600000,          // 單次派工逾時（10 分）
  "chief": "claude",            // 任務書的總指揮
  "mission": { "maxTasks": 12 },// 總指揮最多拆幾個任務
  "chains": {
    "default":   ["claude", "codex", "grok", "cursor"],
    "implement": ["codex", "cursor", "grok", "claude"],
    "review":    ["claude", "grok", "codex", "cursor"],
    "plan":      ["claude", "grok", "cursor", "codex"]
  },
  "providers": {
    "claude": {
      "cooldownMinutes": 300,   // 解析不到重置時間時的預設冷卻
      "sandbox": null,
      "model": null,            // null = 用該家最新預設
      "preferredRoles": ["plan", "review"]
    },
    "codex": {
      "sandbox": "danger-full-access",  // Windows 沙箱元件缺失時要用這個
      "preferredRoles": ["implement", "test"]
    }
    // grok / cursor 同理
  }
}
```

**要改什麼**：
- 只有兩家 CLI？把 `chains` 裡沒裝的家刪掉即可（沒裝的也會自動跳過）
- 想讓某家專做某事 → 調 `preferredRoles` 與 `chains` 順序
- 任務常逾時 → 調大 `timeoutMs`

---

## 接口五：共享記憶協定（`docs/`）

**這是心臟。** 四家不共享對話上下文，共享的是這幾個檔：

| 檔案 | 誰寫 | 幹嘛用 |
|---|---|---|
| `CONVERSATION_LOG.md` | web 對話自動寫 | 使用者方向（Active Summary 是重點）|
| `HANDOFF.md` | agent 寫 | **冷啟入口**：現況 + 下一步 + 有什麼雷 |
| `DEV_LOG.md` | orchestrator 自動寫 | 每次派工做了什麼 + 證據 |
| `LOG.md` | orchestrator 自動寫 | 每次呼叫/換手的機器紀錄 |
| `TASKS.md` | agent 寫 | 還有什麼要做（懸念）|
| `CODE_INDEX.md` | agent 維護 | 碼庫地圖（省 token，不用掃碼）|

**運作方式**：
- **派工前**：`memory.js` 自動把上面的紀錄注入 prompt → 接手的家知道前面做到哪
- **完工後**：自動把結果寫回 `DEV_LOG` / `HANDOFF` → 下一家接得住

**鐵律**：agent 完工要在回覆末尾寫 `[交接]` 段（做了什麼 + 動了哪些檔 + 證據 + 下一步）。**沒寫交接 = 下一家失憶 = 失敗。**

---

## 接口六：Web API（進階/自動化）

控制台後端提供這些 endpoint（只綁 `127.0.0.1`）：

| Endpoint | 方法 | 用途 |
|---|---|---|
| `/api/state` | GET | 各家狀態 + 額度 + 誰在跑什麼 |
| `/api/events` | GET | SSE 即時推播 |
| `/api/dispatch` | POST | 派工 |
| `/api/chat` | POST | 對話（寫進共享記憶）|
| `/api/mission/plan` | POST | 產生規劃單 |
| `/api/mission/start` | POST | 執行任務書 |
| `/api/mission/stop` | POST | 停止 |
| `/api/docs?name=LOG` | GET | 讀 docs（白名單）|
| `/api/models` | GET | 各家可用模型清單 |
| `/api/skills` | GET | 技能清單 |
| `/api/doctor` | GET | 重新檢查登入 |
| `/api/fs/list` `/api/fs/mkdir` | GET/POST | 資料夾瀏覽/建立（任務書選作業區用）|

---

## 內建技能

`skills/` 打包了這幾套，**免安裝**，`skills.js` 會把核心注入每個派工 prompt：

- **Agent OS**：12 角色作業系統（解碼真意 → 判斷角色 → 以該角色標準工作）
- **Loop Engineering**：迴圈工程判斷（該不該把任務迴圈化）
- **Record System**：紀錄紀律（開工讀 docs、完工寫交接）
- **agentbaton**（本檔）：操作手冊

claude/codex 有原生技能系統，注入區塊會額外指向 `skills/` 讓它們自己讀完整版。

---

## 常見狀況

**Q：只裝了一兩家 CLI 能用嗎？**
可以。沒裝的家會被自動跳過，不影響其他家。

**Q：額度全滿了會怎樣？**
任務會標 `failed` 並記原因（不會假裝成功），冷卻到期後可重跑。

**Q：怎麼知道任務真的做完了，不是幻覺回報？**
系統有「證據鐵律」：審查/測試任務被要求附**實際命令輸出 + exit code**，宣稱實測必須有證據。任務書模式還有總驗收層會實跑複驗。

**Q：可以同時開兩個 agentbaton 嗎？**
❌ 不行。**單一寫者政策**——state 沒有跨行程檔鎖，同時開兩個會互蓋冷卻狀態。

**Q：在 Claude Code 裡面跑會怎樣？**
claude 那家會 401（host 託管認證干擾）。在**自己乾淨的終端機**跑就正常。

**Q：紀錄寫到哪去了？**
`--cwd` 指到哪，`docs/` 就寫哪（紀錄跟著專案走）。額度狀態則永遠集中在 agentbaton 本體的 `.orchestrator/`。
