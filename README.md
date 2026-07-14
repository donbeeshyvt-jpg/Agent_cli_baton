# agentbaton

> 額度不夠跑完一整個專案？那就交給四家 CLI 接力做完。

你有沒有過這種經驗：一個專案做到一半，AI 額度突然沒了。進度卡在那，你只能等冷卻，或是開另一家從頭跟它解釋一遍前因後果。

這篇就來介紹 agentbaton 怎麼解決這件事：**讓 claude、codex、grok、cursor 四家 CLI 用各自的訂閱額度接力**，這家滿了下一家自動接手，而且接手的那家知道前面做到哪。

## 這東西到底在幹嘛

一句話：把「你一個人做不完的專案」拆給四家 AI 輪流做。

```
        你的任務
           ↓
    ┌─────────────┐
    │ agentbaton  │ ← 看誰還有額度、誰擅長這活
    └──────┬──────┘
           ↓ headless（無介面模式，程式直接叫它，不用你盯著）
  ┌────────┬────────┬────────┬────────┐
  ▼        ▼        ▼        ▼
claude   codex    grok    cursor
(訂閱)   (訂閱)   (訂閱)   (訂閱)
  └────────┴────────┴────────┴────────┘
           ↓ 讀寫
    docs/ 共享記憶（接力棒 🏃）
```

重點在最下面那層。四家 AI 不能互相對話（技術上塞不進彼此的腦袋），它們**共享的是檔案**：`docs/` 這本接力簿。

派工前系統自動把接力簿塞進 prompt，做完自動把「做了什麼、為什麼、動了哪些檔」寫回去。所以換手的那家一接手就知道前面發生什麼事，不用你再解釋一遍。

(這也是為什麼叫 baton，接力棒嘛)

## 為什麼是「接力」不是「省額度」

很多人第一眼會以為這是在省錢。不是喔！

沒有共享記憶的話，輪替只是「各做各的」，換一家就從零開始亂做。有了接力簿，才叫協作。**這層記憶才是心臟，額度輪替只是附加價值。**

這套記憶協定不是我隨便發明的，是內建了 [Agent-LV.MAX record-system](https://github.com/donbeeshyvt-jpg/Agent-LV.MAX-record-system) 這套現成的協作紀錄系統（`AGENTS.md` 唯一入口 + `docs/` 外接記憶），裝好就有，不用另外安裝。

## 先跑起來看看

```bash
git clone https://github.com/donbeeshyvt-jpg/Agent_cli_baton.git
cd Agent_cli_baton

# 第一步：看看你哪幾家能用（這步完全不花額度）
node src/cli.js --doctor

# 第二步：開控制台
node src/cli.js serve      # → http://127.0.0.1:7680
```

沒裝的家會自動跳過，只有一兩家也能跑。不想開網頁就直接：

```bash
node src/cli.js "幫我把 README 翻成英文"
```

系統自己會挑一家有額度的去做。

## 它能做到什麼程度

先說結論：**可以把一份完整規格書丟給它，讓它自己拆任務、分派、並行做完、還會自我驗收。**

這是實際跑過的兩個例子：

**小的**：4 個獨立工具模組的規劃書 → 總指揮拆成 6 個任務（4 個實作 + 驗收 + 審查）→ 四家同時開工 → 3 分鐘後全部完成、45 個測試全綠。

**大的**：一份 122KB 的 .NET 規格書 → 拆成 11 個任務 → 跑完總驗收判「未達成」→ 系統自動生修復任務 → 跑了三輪 → 18/18 完成，解析器測試 190/190、165 人併發搶座位測試 3/3 通過。

(這裡要老實講：那三輪修復是它自己抓出「前面幾棒把 harness 落地當成通過」的假綠，才生的修復任務。不是一次就成)

## 主要功能

| 功能 | 白話說就是 |
|---|---|
| 訂閱輪替 | 這家額度滿了自動換下一家，會讀錯誤訊息裡的重置時間去設冷卻 |
| 共享記憶 | `docs/` 當外接大腦，派工注入、完工寫回，換手不失憶 |
| 並行執行 | 沒有互相依賴的任務同時做（實測牆鐘 = 最慢那家，不是相加） |
| 任務書模式 | 給規劃書 → 總指揮拆任務 → **你按確認** → 並行做 → 總驗收 → 自動修復 |
| Web 控制台 | 看誰在做什麼（codex 還能逐行看它下了什麼命令）、額度消耗、紀錄 |
| 策略調度 | 均攤額度、或依角色分工（實作找 codex、審查找 claude） |
| 技能自包含 | 內建 Agent OS、Loop、Record System 三套技能核心，注入每個 prompt |

## 你需要準備什麼

- **Node.js 18 以上**（零外部套件，只用 node 內建模組，clone 完直接跑）
- **至少一家 CLI**，而且已經登入你自己的訂閱：

| CLI | 怎麼裝 | 怎麼登入 |
|---|---|---|
| [Claude Code](https://claude.com/claude-code) | `npm i -g @anthropic-ai/claude-code` | `claude login` |
| [OpenAI Codex CLI](https://developers.openai.com/codex/cli) | 官方安裝器 | `codex login`（ChatGPT 訂閱）|
| [Grok CLI](https://x.ai) | 官方安裝器 | `grok login`（SuperGrok 訂閱）|
| [Cursor CLI](https://cursor.com/cli) | `curl https://cursor.com/install -fsS \| bash` | `cursor-agent login` |

吃的是各家**訂閱**（OAuth 登入那種），不是 API 計費。子行程會刻意把 `ANTHROPIC_API_KEY` 之類的環境變數清掉，確保走訂閱不走計費。

## 常用指令

```bash
node src/cli.js --status                    # 看各家額度、冷卻、用量
node src/cli.js "任務"                       # 派工（預設均攤選家）
node src/cli.js "任務" --only grok           # 指名 grok（繞過冷卻）
node src/cli.js "任務" --chain implement     # 用實作鏈（codex 先上）
node src/cli.js "任務" --dry-run             # 只看會派給誰，零副作用
node src/cli.js "任務" --simulate-limit codex,claude   # 假裝這兩家滿了，驗證換手
```

完整的接口說明（全部參數、Web API、設定檔、共享記憶協定）在 `skills/Agentbaton_Skill/SKILL.md`，第一次用建議先翻一下。

## 換手是怎麼判斷的

| CLI 回什麼 | 系統怎麼做 |
|---|---|
| 成功 | 記進 `docs/LOG.md`、寫回交接、回傳結果 |
| 額度滿（`usage limit`、`429`、`try again at ...`）| 解析重置時間設冷卻，換下一家 |
| 認證問題（`401`、沒登入）| 設短冷卻標記要人工處理，換下一家 |
| 其他錯誤、逾時 | 記錄，換下一家（Windows 會用 `taskkill /T` 殺掉整棵行程樹，不留孤兒繼續燒你額度）|

## 要注意的地方

**同時只能跑一個。** state 沒有跨行程檔鎖，你開兩個 agentbaton 會互蓋冷卻狀態。

**不要在 Claude Code 裡面巢狀跑。** claude 那家會 401（host 託管認證會打架），開你自己乾淨的終端機就正常。

**即時進度只有 codex 有。** 它的 headless 模式（`--json`）會逐行吐事件，所以你能看到它下了什麼命令、改了什麼檔。claude、grok、cursor 都是算完才給結果，這是它們 headless 的設計，不是壞掉。

## 使用者責任

這工具是**驅動你自己已經登入的 CLI、吃你自己的訂閱額度**。用之前請確認你的行為符合各家服務條款：

- 各家訂閱通常限個人使用，請不要拿去轉售、分享帳號、或代跑他人任務。
- 這工具不繞過任何額度限制，只是在額度耗盡時，換用**你自己的另一個訂閱**。
- 因為違反服務條款導致的帳號問題，使用者自負。

## 測試

```bash
node --test test/unit.test.mjs   # 42 條
```

## License

[MIT](LICENSE)．想改想拿去用都可以。

---

以上！有跑起來的話歡迎回報踩到什麼坑，我這邊只在 Windows 測過，其他系統應該能跑但沒實測。

[English](README.en.md)
