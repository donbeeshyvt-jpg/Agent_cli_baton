# Dev Log — 每次派工做了什麼

> orchestrator 派工成功後自動追加；agent 也可補充細節。
> 記「做了什麼 + 為什麼 + 動了哪些檔 + 證據」，下一家才接得住。

格式：
```
## YYYY-MM-DD — <provider>
**任務**：<派工內容摘要>
[交接]
- **做了什麼**：
- **動了哪些檔案**：
- **證據**：（測試結果 / 命令輸出 / exit code）
- **下一步建議**：
```

---

（尚無紀錄）

## 2026-07-17 — claude（主對話手改親驗）— 可靠性強化：8 項擴充落地
**背景**：針對六個已知坑做系統性可靠性強化（幻覺防線+紀錄治理），設計參考成熟 coding agent 的公開規格。**設計移植非程式碼移植**（語言不同），維持零外部依賴。
[交接]
- **做了什麼（A1-A5 + B1/B3/B4，皆親跑驗證）**：
  - A1 交接過期警語（memory.js staleWarning）：HANDOFF >24h 注入前加警語，提醒下一棒核對現狀 → 對準幻覺回報坑
  - A2 LOG 自動輪替（log.js rotateIfHuge）：>200KB 封存到 docs/log-archive/，只留 HEADER+指標 → 對準無上限增長坑
  - A3 產出頭尾剪裁（log.js trimOutput）：>3200 字改頭1500+尾1500，中段略去
  - A4 codex 零動作標記（providers.js classifyCodex）：成功但零 command_execution/file_change → suspectNoAction 旗標
  - A5 參數安全驗證（spawn.js isSafeArgValue + cli.js validateConfig）：sandbox 補白名單、config 補 schema warn+skip → 對準 #9 shell 跳脫坑
  - B1 棒後驗收分類器（新模組 verify.js）：每棒完工餵 git diff harness-truth 鐵證，判 DONE_VERIFIED/CLAIMED_NO_EVIDENCE/PARTIAL，判幻覺標 unverified 狀態送總驗收。config.verify.enabled 開關（預設關）→ **直接對準最痛的幻覺回報坑**
  - B3 劣化輸出偵測（providers.js isDegenerateReport）：剝空殼語句後 <200 字且無可驗證線索判劣化
  - B4 冷卻/重試分級（orchestrator.js + state.js）：暫態錯誤同家原地短重試（指數退避+抖動）、冷卻依 failStreak 指數化 → 對準冷卻太粗坑
- **動了哪些檔案**：src/{memory,log,providers,spawn,orchestrator,state,mission,cli}.js、新增 src/verify.js、orchestrator.config.json（verify 開關）、test/unit.test.mjs（+12 測試）、docs/ROADMAP.md（擴充計劃）、docs/CODE_INDEX.md。
- **驗證**：54/54 單元測試綠；實跑 --status/serve/config 驗證正常；真派 codex 製作任務（slug.js）產出真檔、實跑測試 3/3 綠、B4 failStreak 欄位運作；B1 在真實 git 作業區實測——正確算出 0 檔變動、把鐵證攤進 prompt、parseVerdict 容錯解析成功。零簡體字。
- **明確不做**（ROADMAP 有記）：向量搜尋記憶（違反零依賴）、核心層 sandbox（管不到外部 CLI）、Rust crate 直搬、TUI 元件。worktree 隔離（C1）列大工程另議。

## 2026-07-17 — claude — 實戰驗證 + B1 untracked bug 修復
**背景**：用任務書模式真跑一個 EventBus 工具庫專案，驗證總指揮(Agent OS)分配 + 新機制應用。
[交接]
- **總指揮表現**：73s 拆 9 任務，依賴圖精準（3 核心並行/測試依實作/雙審查收斂），自主識別 API 契約風險。角色分工+balance 換手（#3 派 codex 實際 grok 做）都正常。
- **抓到並修好的 bug**：B1 collectHarnessTruth 只用 `git diff --stat`，抓不到「untracked 新建檔」——實作類任務常是新增檔，被誤判成 0 變動（幻覺）。修法：補 `git status --porcelain --untracked-files=all` 抓 untracked，排除 .orchestrator/docs 骨架雜訊。第一次跑時三家真實作全被誤標 unverified，修後重跑 9/9 正確 done。
- **產出真實性**：EventBus 庫 40/40 測試綠、零依賴，總驗收親驗「✅ 達成」附實測證據。
- **動了哪些檔**：src/verify.js（untracked 修復）、test/unit.test.mjs（+1 測試，共 55）。
- **教訓**：實戰測試抓到單元測試測不到的 bug（tmpdir 非 git，測不到 untracked 場景）。呼應專案核心：不信任回報、要實跑鐵證。
