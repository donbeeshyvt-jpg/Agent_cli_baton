# Handoff — 交接

> **冷啟入口**。新 agent（或新的你）接手時先讀這份：現況是什麼、下一步做什麼、有什麼雷。
> 每個 substantive 回合結束要更新，否則下一家失憶。

Last updated: （尚未開始）

## Current State
（尚未開始。這裡寫：目前完成到哪、什麼能跑、什麼還沒做。）

## Last Completed Task
（無）

## Test Status
```bash
node --test test/unit.test.mjs   # 42 條單元測試
```

## Known Risks
- **單一寫者政策**：同時只跑一個 orchestrator（state 無跨行程檔鎖），同時開兩個會互蓋冷卻。
- **巢狀執行**：不要在另一個 Claude Code session 裡巢狀跑本工具的 claude 分支（host 託管認證會 401）。
- **即時串流**：只有 codex 的 headless（`--json`）逐行吐中間過程；claude/grok/cursor 算完才給結果。

## Next Safe Task
（無）

## Do Not Touch
- 各家 CLI 登入憑證（`~/.claude`、`~/.codex`、`~/.grok`、cursor）
- `.orchestrator/state.json`（機器維護的額度/冷卻狀態）

## Useful Commands
```bash
node src/cli.js --doctor      # 檢查各家安裝＋登入（零額度）
node src/cli.js --status      # 看各家額度/冷卻/用量
node src/cli.js serve         # web 控制台
node src/cli.js "任務"         # 均攤派工
node src/cli.js "任務" --only grok   # 指名某家
```

## Notes for Next Agent
從本檔 + `AGENTS.md` + `docs/PROJECT_VISION.md` + `docs/CONVERSATION_LOG.md`（Active Summary）+ `docs/CODE_INDEX.md` 上手，**不要掃整個碼庫**。
