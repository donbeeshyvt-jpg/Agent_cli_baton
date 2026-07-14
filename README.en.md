# agentbaton

> Ran out of quota halfway through a project? Hand it off to four CLIs and let them finish it together.

You know the feeling: you're halfway through a project and your AI subscription hits its limit. Progress stalls. You either wait for the cooldown, or open another CLI and re-explain everything from scratch.

agentbaton fixes that. It lets **claude, codex, grok, and cursor take turns using their own subscription quotas**. When one hits its limit, the next picks up automatically, and it already knows what happened before.

## What it actually does

In one line: it splits a project you can't finish alone across four AI CLIs.

```
        your task
           ↓
    ┌─────────────┐
    │ agentbaton  │ ← picks who has quota, who's good at this
    └──────┬──────┘
           ↓ headless (called programmatically, no babysitting)
  ┌────────┬────────┬────────┬────────┐
  ▼        ▼        ▼        ▼
claude   codex    grok    cursor
 (sub)    (sub)    (sub)    (sub)
  └────────┴────────┴────────┴────────┘
           ↓ read/write
    docs/ shared memory (the baton 🏃)
```

The bottom layer is the point. The four CLIs can't talk to each other (you physically can't fit one's context into another's). What they share is **files**: `docs/`, the relay notebook.

Before dispatch, the system injects that notebook into the prompt. After the job, it writes back what was done, why, and which files changed. So whoever picks up next knows the story without you re-explaining it.

(Hence the name: baton, as in a relay race.)

## Why "relay", not "save money"

Most people read this as a cost-saving trick. It isn't.

Without shared memory, rotation is just four CLIs doing their own thing badly. With the notebook, it becomes collaboration. **The memory layer is the heart. Quota rotation is the side effect.**

That memory protocol isn't something I invented. agentbaton ships with [Agent-LV.MAX record-system](https://github.com/donbeeshyvt-jpg/Agent-LV.MAX-record-system) built in (`AGENTS.md` as the single entry point + `docs/` as external memory). No separate install.

## Get it running

```bash
git clone https://github.com/donbeeshyvt-jpg/Agent_cli_baton.git
cd Agent_cli_baton

# Step 1: see which CLIs you have (costs zero quota)
node src/cli.js --doctor

# Step 2: open the console
node src/cli.js serve      # → http://127.0.0.1:7680
```

CLIs you don't have installed get skipped automatically. One or two is enough to run. Skip the web UI if you want:

```bash
node src/cli.js "translate the README into English"
```

It picks whoever has quota.

## How far it goes

Short answer: **you can hand it a full spec, and it will break the work down, dispatch it, run tasks in parallel, and verify its own output.**

Two runs that actually happened:

**Small**: a brief for 4 independent utility modules → the chief broke it into 6 tasks (4 implementations + verification + review) → four CLIs worked simultaneously → done in 3 minutes, 45 tests green.

**Large**: a 122KB .NET spec → 11 tasks → final verification returned "not met" → the system generated fix tasks on its own → three rounds later, 18/18 done, parser tests 190/190, a 165-concurrent seat-grab test 3/3.

(Being honest here: those three fix rounds happened because the system caught its own earlier steps reporting "harness in place" as if it were a passing test. It didn't nail it on the first try.)

## What it does

| Feature | In plain terms |
|---|---|
| Quota rotation | One hits its limit, the next takes over. Parses the reset time out of the error message to set the cooldown. |
| Shared memory | `docs/` as external brain. Injected on dispatch, written back on completion. No amnesia on handoff. |
| Parallel execution | Independent tasks run at once (measured wall clock = the slowest one, not the sum). |
| Mission mode | Give it a spec → chief breaks it down → **you approve** → parallel execution → final verification → auto-fix loop. |
| Web console | See who's doing what (codex even streams the commands it runs), quota burn, records. |
| Scheduling strategy | Balance quota evenly, or split by role (codex implements, claude reviews). |
| Self-contained skills | Agent OS, Loop, and Record System cores ship inside, injected into every prompt. |

## What you need

- **Node.js 18+** (zero dependencies, node built-ins only, clone and run)
- **At least one CLI**, logged into your own subscription:

| CLI | Install | Login |
|---|---|---|
| [Claude Code](https://claude.com/claude-code) | `npm i -g @anthropic-ai/claude-code` | `claude login` |
| [OpenAI Codex CLI](https://developers.openai.com/codex/cli) | official installer | `codex login` (ChatGPT subscription) |
| [Grok CLI](https://x.ai) | official installer | `grok login` (SuperGrok subscription) |
| [Cursor CLI](https://cursor.com/cli) | `curl https://cursor.com/install -fsS \| bash` | `cursor-agent login` |

This runs on each vendor's **subscription** (the OAuth login kind), not API billing. Child processes deliberately strip `ANTHROPIC_API_KEY` and friends from the environment so you don't get billed by accident.

## Common commands

```bash
node src/cli.js --status                    # quota, cooldown, usage per CLI
node src/cli.js "task"                       # dispatch (balanced pick by default)
node src/cli.js "task" --only grok           # name grok specifically (bypasses cooldown)
node src/cli.js "task" --chain implement     # implementation chain (codex first)
node src/cli.js "task" --dry-run             # see who'd get it, zero side effects
node src/cli.js "task" --simulate-limit codex,claude   # fake those two being full, test failover
```

Full interface reference (every flag, the Web API, config, the shared-memory protocol) lives in `skills/Agentbaton_Skill/SKILL.md`. Worth skimming on your first run.

## How failover decides

| What the CLI returns | What the system does |
|---|---|
| Success | Log it to `docs/LOG.md`, write the handoff, return the result |
| Quota exhausted (`usage limit`, `429`, `try again at ...`) | Parse the reset time, set a cooldown, move to the next |
| Auth problem (`401`, not logged in) | Short cooldown, flag for manual fix, move on |
| Other errors, timeouts | Log it, move on (on Windows it runs `taskkill /T` on the whole process tree, so no orphans keep burning your quota) |

## Things to know

**Run only one at a time.** State has no cross-process file lock. Two instances will clobber each other's cooldowns.

**Don't nest it inside Claude Code.** The claude branch will 401 (the host's managed auth interferes). Run it from your own clean terminal.

**Live progress only works for codex.** Its headless mode (`--json`) streams events line by line, so you can watch which commands it runs and which files it touches. claude, grok, and cursor only return once they're done. That's how their headless modes work, not a bug.

## Your responsibility

This tool **drives CLIs you already logged into and burns your own subscription quota**. Before using it, make sure what you're doing complies with each vendor's terms of service:

- Subscriptions are typically for personal use. Don't resell, share accounts, or run jobs for other people.
- This tool doesn't circumvent any quota limit. It just switches to **another subscription you own** when one runs out.
- Account issues caused by violating a vendor's terms are on you.

## Tests

```bash
node --test test/unit.test.mjs   # 42 tests
```

## License

[MIT](LICENSE). Fork it, change it, use it.

---

That's it. If you get it running, let me know what broke. I've only tested it on Windows so far. It should work elsewhere, but I haven't verified that.

[繁體中文](README.md)
