# SKILL.md — Universal Multi-Agent Development Orchestration Skill

## 0. Skill Identity

You are an AI coding agent working under a **harness-engineered, multi-agent, specification-driven, traceable, test-first software development workflow**.

This skill is an **Agent Collaboration, Record-Keeping & Project-Planning System** — it makes AI-assisted development continuable across sessions, agents, and tools, instead of one-shot and forgetful.

**The goal — complete doc handoff & token economy:** every step writes to `docs/` so a new agent can understand the project and safely continue **from docs alone**, never re-scanning the whole codebase. This is the point of everything below. (Sections 3.11, 40.)

**Three methodologies serve that goal:**

1. **Spec Kit — the backbone (WHAT, and in what order)** (github/spec-kit): Spec-Driven Development. Specifications are the source of truth — “code serves specifications.” Defines the canonical flow Constitution → Specify → Clarify → Plan → Tasks → Analyze → Implement and the artifacts each step produces. (Section 42.)
2. **Superpowers — the perspectives (HOW, expert lenses)** (obra/superpowers): composable expert skills (brainstorming, TDD, debugging, review, verification…) called at the right phase to perfect the project from many angles. (Section 41.)
3. **Harness Engineering — the guarantee (ENFORCE & remember)** (deusyu/harness-engineering): humans steer, agents execute (人類掌舵，智能體執行). Mechanical checks, docs-as-memory, and git-as-continuity make the other two reliable instead of hopeful. (Sections 1.5, 35–39.)

See Section 1.6 for the master flow that shows all three layers across the canonical order.

> **使用說明（繁體中文註解）：** 這是一套 **Agent 協作紀錄與規劃專案系統**。核心精神是「文件即交接」——讓接手的新 agent 只靠 `docs/` 就能理解專案、安全接續工作，不必掃描整個程式碼庫，大幅節省 token。本文件正文以英文撰寫，中文僅作補充註解之用。

Your purpose is not to “write code quickly.” Your purpose is to help plan, build, verify, document, index, version, and hand off a software system so that future AI agents and human developers can continue safely without relying on chat history.

Under this skill you do two jobs at once: you **execute** tasks, and you **build and maintain the harness** — the constraints, environment, mechanical checks, and external memory that let any agent (including a future you) execute safely without the original conversation. When in doubt, **strengthen the harness rather than rely on discipline or memory**. See Section 1.5 for the foundation.

*Naming: throughout, `SKILL.md` refers to **this** document. When you adopt it, save it at your project root as `SKILL.md` — the file tree (Section 4) and the startup protocol (Section 6) assume that filename. (This example file is named descriptively.)*

This skill is designed for:

- Cursor
- Claude Code
- Codex / OpenAI coding agents
- GitHub Copilot coding agents
- Gemini CLI
- OpenCode
- OpenClaw
- local or remote autonomous agents
- any LLM-based software development assistant

This skill applies to:

- greenfield projects
- existing repositories
- feature development
- bug fixing
- refactoring
- migrations
- UI work
- API/backend services
- bots and automation
- AI agent systems
- local tools
- full-stack products

---

## 1. Core Mission

The repository must maintain an external AI-readable memory system in `docs/`.

This memory system exists to prevent:

1. AI forgetting the project purpose.
2. Context-window loss causing repeated explanations.
3. Multiple agents duplicating or conflicting with each other.
4. Agents scanning the whole repository every time and wasting tokens.
5. Agents modifying unrelated files.
6. “Fix one bug, create three bugs” behavior.
7. Fake completion without tests.
8. Missing logs, missing rollback information, and untraceable changes.
9. Infinite scope expansion.
10. Agent drift: slowly changing the product into something the user did not ask for.
11. Rules that live only in prose and silently rot — “文件會腐爛，lint 規則不會” (docs decay, lint rules don't).
12. Monolithic instruction files that bloat context, resist maintenance, and cannot be mechanically verified.

When this skill is active, the agent must always preserve:

```text
Project purpose → Requirements → Architecture → Feature spec → Plan → Tasks → Mechanical checks (lint + structural tests) → Code → Tests → Logs → Code index → Handoff
```

---

## 1.5 Harness Engineering Foundation — Humans Steer, Agents Execute

This skill is built on **Harness Engineering** (deusyu/harness-engineering): the engineer's primary job is to design the *constraints and environment* in which agents generate and run code, not to type every line. **人類掌舵，智能體執行** — humans steer, agents execute.

The `docs/` system in this skill is the **external memory**; the rules below are the **harness** that keeps agents inside the lines. Six core principles govern everything:

1. **Repository as Source of Truth** — “不在倉庫裡的東西，對智能體不存在” (what isn't in the repo doesn't exist to agents). Every decision, standard, plan, and constraint must be a versioned artifact. Slack threads, mental models, and chat history do not count.

2. **Map, Not Manual** — `AGENTS.md` is a ~100-line *map* that points to deeper docs via progressive disclosure, not an encyclopedia. Monolithic instruction files fail three ways: they bloat context, rot under maintenance, and cannot be mechanically verified. Each major directory gets its own small `AGENTS.md`. (See 3.10 and Section 4.)

3. **Mechanical Enforcement Over Documentation** — “文件會腐爛，lint 規則不會” (docs decay, lint rules don't). Invariants are guarded by custom linters and structural tests, not by hoping the agent read the doc. Every check failure must embed its repair instruction so the agent can self-correct. (See 3.9 and Section 35.)

4. **Agent-Readable Code & Tech** — optimize for AI reasoning: prefer “boring,” stable-API technologies with broad training coverage; sometimes reimplement a small subset rather than wrap opaque upstream behavior. (See Section 38.)

5. **Throughput Changes Merge Philosophy** — when agent output far exceeds human review attention, fast correction-by-rerun often beats heavy gatekeeping; keep PRs small and short-lived. (See Section 39.)

6. **Entropy Management = Garbage Collection** — agents replicate existing patterns, good and bad, so encode “golden rules” into the repo and run background passes that scan for drift and open refactor work. Tech debt is “高息貸款” — high-interest debt that compounds. (See Section 37.)

Execution itself follows the **Ralph Wiggum Loop** (Section 36): fresh context each iteration, gate on results (backpressure) not prescribed steps, treat the plan as disposable, use disk as state and git as memory, steer with signals not scripts, and stay out of the loop once the harness is sound.

**Practical rule for this skill:** whenever you would write a rule as prose in `docs/`, ask “can I make this a lint rule, a structural test, or a check script instead?” If yes, do **both** — prose to explain, mechanism to enforce.

---

## 1.6 The Three Layers and the Master Flow

This skill composes three methodologies in service of one goal. Read this once; it is the map for everything else.

- **Goal — Docs-first handoff & token economy.** Every phase ends by writing to `docs/`. A new agent onboards by reading a small, curated set of docs, not by scanning the codebase. (Sections 3.11, 40.)
- **Layer 1 — Spec Kit (backbone):** the canonical order and artifacts; the spec is the source of truth. (Section 42.)
- **Layer 2 — Superpowers (perspectives):** the expert lens for each phase. (Section 41.)
- **Layer 3 — Harness (guarantee):** mechanical checks + docs-as-memory keep it honest. (Sections 1.5, 35–39.)

### Master Flow (the correct order, top to bottom)

| # | Phase | Spec Kit backbone | Superpowers lens | Harness gate | Writes to docs |
|---|---|---|---|---|---|
| 0 | Intake | — | — | no blind scan; build index | `00_AI_CONTEXT_INDEX`, `CODE_INDEX` |
| 1 | Constitution | `/constitution` | — | rules → mechanical checks | `AGENTS`, `GOLDEN_RULES`, `project-rules` |
| 2 | Specify | `/specify` | brainstorming | `[NEEDS CLARIFICATION]` marks | `features/NNN/spec.md` |
| 3 | Clarify | `/clarify` | brainstorming | conservative defaults logged | `spec.md` Clarifications |
| 4 | Plan | `/plan` | writing-plans | simplicity / anti-abstraction gates | `plan.md`, `data-model`, `contracts/` |
| 5 | Tasks | `/tasks` | writing-plans | trace IDs per task | `tasks.md` |
| 5.5 | Analyze | `/analyze` | — | cross-artifact consistency (no code yet) | analysis note in `tasks.md` |
| 5.6 | **User-Approval Gate** | — | brainstorming + multi-perspective | **STOP — present bundle, wait for "approved", log `APPROVED-NNN`** (Section 3.14 / 13.2) | `REQUEST_LOG.md` (timestamped approval) |
| 6 | Isolate | — | using-git-worktrees | `.env.test`, baseline checks; verify `core.hooksPath` set | branch / worktree |
| 7 | Implement | `/implement` | TDD, subagent-driven | RED→GREEN→REFACTOR, checks pass | code, tests, `DEV_LOG` |
| 8 | Verify | `/checklist` | verification-before-completion | user-perspective + checks pass | `SELF_CHECK`, `TEST_REPORT` |
| 9 | Record | — | — | docs / index / handoff complete | `CODE_INDEX`, `TASKS`, `HANDOFF`, `CONVERSATION_LOG.md` Active Summary refreshed (Section 3.15) |
| — | Review | — | requesting-/receiving-code-review | two-stage: spec, then quality | `REVIEW_QUEUE` |
| — | Finish | `/taskstoissues` | finishing-a-development-branch | commit; optional PR | `MERGE_PLAN`, commit |

**Order rules:** never implement before Analyze; never Analyze before Tasks; never end a phase without writing its docs. The doc write at the end of each phase is what makes the next agent's onboarding cheap (Section 40), and the per-phase lens is how feature work pulls in professional perspectives on demand (Section 41).

---

## 2. Activation Conditions

Use this skill whenever the user asks to:

- build a project
- plan a system
- create a software architecture
- add a feature
- fix a bug
- refactor code
- migrate data or framework versions
- create tests
- create CI/CD
- prepare Git or GitHub workflow
- coordinate multiple AI agents
- create or update project documentation
- create an AI-collaborative development workflow
- continue work from previous AI context
- reduce token usage during development
- prevent agents from forgetting project goals

If the user asks for immediate code, still create or update the minimal spec, task, verification plan, and docs first.

---

## 3. Non-Negotiable Rules

### 3.1 Spec Before Code

Do not implement until the current project or feature has at least:

- project goal
- user-facing use cases
- non-goals
- constraints
- acceptance criteria
- affected files/modules
- test strategy
- rollback strategy
- documentation update targets

If any item is missing, create the minimal version before coding.

### 3.2 One Task, One Verifiable Result

Every development step must have:

- task ID
- goal
- input context
- files to read
- files to modify
- forbidden files/actions
- implementation steps
- verification command or manual test
- user-perspective test
- rollback note
- docs to update
- suggested commit message

Do not bundle unrelated changes into one task.

### 3.3 Evidence Over Claims

Never claim success without evidence.

Valid evidence includes:

- tests passed
- type check passed
- lint passed
- build passed
- app starts
- API request/response verified
- UI flow verified from user perspective
- logs updated
- docs updated
- code index updated
- commit created

If a command was not run, state that it was not run.

### 3.4 Docs Are Persistent Agent Memory

The `docs/` folder is the project’s long-term memory for AI collaboration.

Chat history is temporary. `docs/` is authoritative.

If `docs/` is missing, create it before major implementation.

### 3.5 Code Index Before Full Repository Scan

Before reading large files, check:

```text
docs/CODE_INDEX.md
```

If missing or stale, update it.

Reading the index costs a few thousand tokens; blind-scanning the repository costs tens of thousands and still drifts. Fixing a stale index is always cheaper than scanning around it (see Section 40).

The code index must summarize modules, responsibilities, public APIs, dependencies, tests, and risks. It must not copy full source code.

### 3.6 Test Isolation

All testing must happen in a safe environment:

- feature branch or git worktree
- `.env.test` or equivalent
- test database or disposable data
- mock external services by default
- no production credentials
- no destructive action without explicit approval

### 3.7 Version Control Discipline

Each completed verifiable task should produce a commit.

Use Conventional Commits.

Examples:

```text
feat(auth): add login validation
fix(api): handle invalid token response
docs(agent): update code index after task 004
test(user): add registration flow coverage
refactor(core): split task runner service
chore(ci): add test workflow
```

Push only when the user or project rules explicitly expect remote versioning.

Never push directly to `main` unless explicitly instructed.

### 3.8 Multi-Agent Continuity

Every new agent must start by reading the required context files.

A new agent must not rely on chat history or previous assistant memory.

The repository must always contain enough information for another AI to continue safely.

### 3.9 Mechanical Enforcement Over Documentation

Prefer mechanisms over prose. A rule that matters must be guarded by something that fails loudly:

- a custom lint rule
- a structural / consistency test (e.g. `scripts/check-consistency.sh`, `tests/structural/`)
- a CI gate
- a pre-commit or pre-merge check

Rules:

- “文件會腐爛，lint 規則不會” — docs decay, lint rules don't. If an invariant can be checked mechanically, it must be, not just written in `docs/`.
- Every mechanical check must emit a **repair instruction** in its failure message so any agent can self-correct without external context.
- Centralize boundary enforcement; leave implementation details to local autonomy.
- Never weaken or delete a check to make it pass. Fix the cause, or change the rule deliberately and record it in `docs/DECISION_LOG.md`.
- An invariant you discover mid-task should become a check before the task is called complete.

### 3.10 Map, Not Manual

`AGENTS.md` and each directory-level `AGENTS.md` are navigational maps (~100 lines), not exhaustive manuals.

- Point to deeper docs; do not inline everything.
- Use progressive disclosure: a new agent reads the map first, then loads only the docs relevant to the current task.
- Monolithic instruction files are forbidden as the primary interface — they bloat context, rot, and cannot be mechanically verified.

### 3.11 Docs-First Navigation = Token Economy

A new agent must onboard from docs, not by scanning the whole codebase.

- Read the map and indexes first (`AGENTS.md` → `00_AI_CONTEXT_INDEX.md` → `HANDOFF.md` → `TASKS.md` → `CODE_INDEX.md`), then open only the few source files the current task needs.
- Never blind-scan the repository to “understand it.” If the docs can't answer a question, the docs are incomplete — fix them (cheap), don't scan around them (expensive).
- Keeping docs complete and current is what makes handoff and token savings real. An out-of-date `CODE_INDEX.md` silently forces the next agent back into expensive scanning. (See Section 40.)

### 3.12 Traditional Chinese Comments & Bilingual Code Index

Code produced under this skill defaults to **Traditional Chinese (繁體中文) comments**, with English identifiers (function/variable/class names) and English commit messages. Mixed-language comments are fine when an English term has no good 繁中 equivalent.

`docs/CODE_INDEX.md` is **bilingual by default**: every module/file row carries both an English `Responsibility` and a 繁中 `職責（繁中）` description; per-file detail blocks (when present) include the same pair. The 繁中 column lets Mandarin-thinking AI agents understand the project in fewer tokens than English-only prose — directly serving the docs-first token economy (Section 40) — and provides English↔繁中 redundancy that disambiguates either side.

Rules:

- Default comment language: 繁體中文. English identifiers, English commits, 繁體中文 comments.
- `docs/CODE_INDEX.md` module map MUST include the `職責（繁中）` column (see Section 18).
- Never use Simplified Chinese in code, comments, or any doc. If pasting from elsewhere, convert.
- A project may override this convention in its constitution if a different language is required; record the decision in `docs/DECISION_LOG.md`.
- Back this with a mechanical check (Section 35) that fails if the CODE_INDEX bilingual format is missing.

### 3.13 Hook-Enforced Doc Sync — No More “Please Remember to Update the Docs”

Docs only stay current if agents are **mechanically forced** to sync them. Telling each new agent “don't forget to update CODE_INDEX” doesn't scale across sessions, tools, or autonomous runs — agents will edit code and leave the index stale. Use a three-layer hook strategy:

| Layer | Fires on | What it does | Strength |
|---|---|---|---|
| **Edit-time reminder** | every `Edit` / `Write` / `MultiEdit` on `src/` | inline reminder to update CODE_INDEX + DEV_LOG | soft (informational) |
| **Commit-time gate** | `git commit` | **BLOCKS** the commit if `src/` changed but `docs/CODE_INDEX.md` was not also staged | hard (universal) |
| **Background drift** | manual or CI run | `scripts/check-consistency.*` detects index/code freshness drift | periodic |

Implementation (the generator wires all three on a fresh scaffold):

- **Edit-time**:
  - Claude Code: `.claude/settings.json` `PostToolUse` hook on `Edit|Write|MultiEdit` runs `scripts/post-edit-reminder.*` — emits a one-line reminder when the edited path is under `src/`. Example wiring:
    ```json
    {
      "hooks": {
        "PostToolUse": [{
          "matcher": "Edit|Write|MultiEdit",
          "hooks": [{ "type": "command",
                      "command": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/post-edit-reminder.ps1" }]
        }]
      }
    }
    ```
  - Cursor: `.cursor/rules/sync-docs-on-src-edit.mdc` with `globs: ["src/**/*"]` — auto-applies a reminder rule when editing `src/` files. Example frontmatter:
    ```mdc
    ---
    description: Sync CODE_INDEX/DEV_LOG when editing src/
    globs: ["src/**/*"]
    alwaysApply: false
    ---
    ```
- **Commit-time**: `scripts/git-hooks/pre-commit` (bash) + `pre-commit.ps1` (PowerShell). Install once after clone: `git config core.hooksPath scripts/git-hooks`.
- **Background**: `scripts/check-consistency.*` includes an index-vs-code freshness check (see the structural-tests / freshness list in Section 35.1).

Rules:

- The commit-time hook is the hard gate; the edit-time reminders just save agents from running into the gate.
- Never weaken or remove the pre-commit hook. If you must bypass once, use `--no-verify` and log the bypass in `docs/ENTROPY_LOG.md` per Section 37 — the bypass is now a tracked liability, not a forgotten one.
- The hook must be installable in **one command** after `git clone` so any new contributor or agent gets enforced immediately.
- Every code-touching task is incomplete until docs sync passes locally (Section 27 / 34).

### 3.14 User-Approval Before Code — Multi-Angle Plan, Then Confirm, Then Build

For any non-trivial work, follow the canonical flow and **explicitly stop for user approval** of the planning bundle before any implementation begins. No code may be written from an unapproved plan.

The flow:

1. **Multi-angle decomposition** of the user's request — apply the perspective lenses in Section 41 (UX, architecture, data, security, testing, performance, accessibility) plus brainstorming clarifications.
2. **Planning bundle** in `docs/features/NNN-*/` — `spec.md` (what & why, acceptance criteria) + `plan.md` (technical approach, risks, rollout) + `tasks.md` (broken-down, traceable).
3. **`/analyze` mechanical consistency** across spec ↔ plan ↔ tasks (Section 13.1).
4. **User-Approval Gate** (Section 13.2) — present the bundle to the user, list explicit open questions, and **wait for explicit approval** ("approved" / "proceed" / equivalent) before Phase 6 (isolation) or Phase 7 (implementation).
5. Implementation only after approval; record the approval in `docs/REQUEST_LOG.md` with a timestamp and an `APPROVED-NNN` ID.

Rules:

- Implementation tasks may not start until the user-approval record exists in `REQUEST_LOG.md`.
- For tiny one-off fixes, the agent may shortcut to a one-line confirmation ("OK to apply this 3-line fix?") and still log the approval.
- Scope changes during implementation pause for re-approval (mini approval cycle), never silent expansion.
- Reinforced by Section 27 / 34 completion gates.

### 3.15 Conversation-Log Sync — Agents Know Where the Conversation Is

The doc system already captures **code state** (`CODE_INDEX.md`) and **task state** (`TASKS.md`, `HANDOFF.md`). It must also capture **conversation state** — what the user has been saying, what they've corrected, what they've approved — so a fresh agent can pick up not just where the code is, but **where the user's thinking is**.

`docs/CONVERSATION_LOG.md` is auto-appended by a Claude Code `UserPromptSubmit` hook on every user message:

- Timestamped excerpt of each prompt → mechanical append (no agent involvement, no chance to forget).
- `Active Summary` block at the top (rolling, ~10 lines) — the agent updates it at the end of every substantive turn (Section 27 / 34 gate).
- Corrections / constraints get promoted to `docs/REQUEST_LOG.md` with timestamps for the durable record.

So when a new agent starts, reading `CONVERSATION_LOG.md` + `HANDOFF.md` + `CODE_INDEX.md` reveals: code state, task state, **and** user conversation state. No more "tell me what we were discussing".

Rules:

- The conversation-log must be appended **every substantive turn**, by one of two paths: (a) the Claude Code `UserPromptSubmit` hook (auto), OR (b) the `scripts/log-prompt-manual.{ps1,sh}` script run by any other tool's agent / by the user themselves. The auto-hook is an optimization (Section 3.16) — the manual fallback is the contract. Never silently skip both.
- `Active Summary` stays under ~10 lines (rolling, not a transcript).
- Sensitive content: truncate inline; rely on conversation transcript outside the repo for full text.
- New agent's startup protocol (Section 6) MUST include reading `CONVERSATION_LOG.md`.
- Stale-log signal: `check-consistency.*` warns if the newest `CONV-NNN` timestamp is older than 24h while `src/` has recent changes — that's the mechanical reminder for non-Claude tools.

### 3.16 Tool-Agnostic Operation — One Entry: `AGENTS.md`

This skill works with **any agent tool** — Claude Code, Cursor, OpenAI Codex CLI, Gemini CLI, Aider, GitHub Copilot Coding Agent, local LLMs via shell, plain humans. There is **one entry file: `AGENTS.md`.** Every agent reads `AGENTS.md` + `docs/` first; there are **no per-vendor instruction files**.

Why one entry: per-vendor instruction files (`CLAUDE.md`, `GEMINI.md`, `copilot-instructions.md`, …) are just restatements of "read `AGENTS.md`." They rot and split the source of truth. `AGENTS.md` is the emerging cross-tool standard (OpenAI Codex reads it natively; Cursor and others increasingly do) — so this skill ships **only** `AGENTS.md` and lets each tool be pointed at it.

| Layer | Mechanism | Scope |
|---|---|---|
| **Single source of truth** | `AGENTS.md` (root) + `docs/*` + this SKILL | Every agent reads `AGENTS.md` first. The only place rules live. |
| **Universal enforcement** | `scripts/check-consistency.{sh,ps1}` + `scripts/git-hooks/pre-commit` + CI (`.github/workflows/`) | Fires for any committer on any OS, regardless of tool. The hard guarantee — may never be skipped. |
| **Functional config (auto, not a 2nd source of truth)** | `.claude/settings.json` (hooks); `.cursor/rules/*.mdc` (globs); `.aider.conf.yml` (`read:` list) | Makes a specific tool auto-load `AGENTS.md` or auto-run the doc-sync reminder. Contains **no rules of its own**. |
| **Manual fallback** | `scripts/log-prompt-manual.{sh,ps1}` | Any tool without a `UserPromptSubmit` hook runs this once per turn to keep `CONVERSATION_LOG.md` fresh. |

How each tool finds `AGENTS.md`:

- **OpenAI Codex CLI / Cursor** → read `AGENTS.md` natively / via rules. Nothing extra shipped.
- **Aider** → `.aider.conf.yml` `read:` list preloads `AGENTS.md` + key docs (functional config, not a rules copy).
- **Claude Code** → keeps `.claude/settings.json` (hooks only). Point it at `AGENTS.md` in your first message (the Section 29 prompt does this). If you specifically want startup auto-load, add a one-line `CLAUDE.md` saying "Read AGENTS.md" — but the default ships only `AGENTS.md`.
- **Gemini CLI / GitHub Copilot Coding Agent / local LLM / plain shell** → first instruction is "read `AGENTS.md`"; CI + pre-commit enforce the hard rules regardless of whether the tool auto-loaded anything.

Rules:

- `AGENTS.md` is the ONLY source of truth. Functional config files may make a tool *load* `AGENTS.md` or *run* a check, but MUST NOT contain their own copy of the rules.
- The pre-commit hook + `check-consistency` + CI are the only enforcement that may not be skipped. They are tool-agnostic.
- Adding a new tool = teach it (by its native config or by the first prompt) to read `AGENTS.md`. The rules and docs never change per tool.
- `AGENTS.md` must declare itself the universal entry in its header (the mechanical check verifies this).

---

## 4. Required Project File Structure

Create or maintain this structure:

```text
project-root/
├── SKILL.md
├── AGENTS.md
├── README.md
├── .cursor/
│   └── rules/
│       └── project-rules.mdc
├── .github/
│   └── workflows/
│       └── ci.yml
├── docs/
│   ├── 00_AI_CONTEXT_INDEX.md
│   ├── 01_DEVELOPMENT_WORKFLOW.md
│   ├── 02_SPEC_KIT_MAPPING.md
│   ├── 03_TRACEABILITY_LOG.md
│   ├── 04_TESTING_ISOLATION.md
│   ├── 05_GIT_VERSION_CONTROL.md
│   ├── 06_CODE_INDEX_GUIDE.md
│   ├── PROJECT_VISION.md
│   ├── REQUEST_LOG.md
│   ├── INTENT_TRACE.md
│   ├── ARCHITECTURE.md
│   ├── REQUIREMENTS.md
│   ├── API.md
│   ├── DATA_MODEL.md
│   ├── TASKS.md
│   ├── DEV_LOG.md
│   ├── DECISION_LOG.md
│   ├── GOLDEN_RULES.md
│   ├── ENTROPY_LOG.md
│   ├── CONVERSATION_LOG.md

│   ├── SELF_CHECK.md
│   ├── TEST_REPORT.md
│   ├── CODE_INDEX.md
│   ├── AGENT_SESSIONS.md
│   ├── HANDOFF.md
│   └── features/
│       └── 001-feature-name/
│           ├── spec.md
│           ├── plan.md
│           ├── tasks.md
│           ├── test-report.md
│           └── handoff.md
├── templates/
├── tests/
│   └── structural/          # structural / invariant tests (harness guardrails)
└── scripts/
    ├── check-consistency.sh        # mechanical consistency checks; failures print repair steps
    ├── post-edit-reminder.*        # called by Claude Code PostToolUse hook (Section 3.13)
    ├── log-user-prompt.*           # called by Claude Code UserPromptSubmit hook (Section 3.15)
    ├── install-hooks.*             # one-shot hook installer
    ├── git-hooks/
    │   ├── pre-commit              # bash: blocks commit if src/ changed without docs/CODE_INDEX.md
    │   └── pre-commit.ps1          # PowerShell variant (same logic)
    └── lint-rules/                 # custom lint rules with embedded repair instructions
```

After clone, run the one-shot installer: `scripts/install-hooks.*` (sets `core.hooksPath` and marks the bash hook executable). Also commit `.claude/settings.json` (PostToolUse + UserPromptSubmit hooks) and `.cursor/rules/sync-docs-on-src-edit.mdc` so every agent gets the edit-time reminder and the conversation-log auto-append automatically (Sections 3.13, 3.15).

Per the **Map, Not Manual** principle, `AGENTS.md` at the root is a ~100-line map; every major directory (e.g. `src/`, `docs/`, `tests/`) may carry its own small `AGENTS.md` pointing only to what an agent needs there. Do not centralize all instructions into one giant file.

If the project is small, the agent may create a reduced version, but these files are always required:

```text
docs/00_AI_CONTEXT_INDEX.md
docs/PROJECT_VISION.md
docs/REQUEST_LOG.md
docs/INTENT_TRACE.md
docs/ARCHITECTURE.md
docs/REQUIREMENTS.md
docs/TASKS.md
docs/DEV_LOG.md
docs/SELF_CHECK.md
docs/TEST_REPORT.md
docs/CODE_INDEX.md
docs/HANDOFF.md
docs/GOLDEN_RULES.md
docs/CONVERSATION_LOG.md      # auto-appended by UserPromptSubmit hook (Section 3.15)
AGENTS.md                     # the ~100-line map (Map, Not Manual)
scripts/check-consistency.sh  # at least one mechanical check
scripts/install-hooks.*       # one-shot hook installer (Section 3.13)
scripts/git-hooks/pre-commit  # commit-time doc-sync gate (Section 3.13)
```

The harness files (`docs/GOLDEN_RULES.md`, `scripts/check-consistency.sh`, `tests/structural/`) may start minimal, but a project is not safe for autonomous agents until at least one real invariant is enforced mechanically, not only described in prose.

---

## 5. Source of Truth Priority

When information conflicts, follow this priority:

1. Explicit user instruction in current task
2. `SKILL.md`
3. `AGENTS.md`
4. `docs/00_AI_CONTEXT_INDEX.md`
5. Current feature spec under `docs/features/*/spec.md`
6. Current feature plan under `docs/features/*/plan.md`
7. `docs/TASKS.md`
8. `docs/CODE_INDEX.md`
9. Existing code
10. Chat history

If code and docs disagree, inspect code and update docs or flag the mismatch.

---

## 6. Required Agent Startup Protocol

At the start of every new session, every agent must read in this order:

```text
1. SKILL.md
2. AGENTS.md
3. docs/PROJECT_VISION.md
4. docs/REQUEST_LOG.md
5. docs/INTENT_TRACE.md
6. docs/00_AI_CONTEXT_INDEX.md
7. docs/HANDOFF.md
8. docs/TASKS.md
9. docs/CODE_INDEX.md
10. docs/CONVERSATION_LOG.md   (Active Summary block + last ~10 entries — Section 3.15)
11. current feature folder under docs/features/
12. git status
13. recent commits
14. `git config --get core.hooksPath` — must return `scripts/git-hooks` (Section 3.13); if empty, run `scripts/install-hooks.*` before any code work.
15. Tool detection (Section 3.16): if running outside Claude Code, run `scripts/log-prompt-manual.*` once per substantive turn to maintain `CONVERSATION_LOG.md` (the auto-hook only fires in Claude Code). Universal enforcement (pre-commit + check-consistency) works regardless of tool.
```

If optional parallel workstreams are active, also read:

```text
13. docs/WORKSTREAMS.md
14. docs/AGENT_SESSIONS.md
15. docs/INTER_AGENT_REQUESTS.md
16. docs/TEST_MATRIX.md
17. docs/QA_FINDINGS.md
18. docs/REVIEW_QUEUE.md
19. docs/MERGE_PLAN.md
20. docs/CONFLICT_LOG.md
```

Always also read `docs/GOLDEN_RULES.md`, and run the mechanical checks (e.g. `scripts/check-consistency.sh`) so the state summary reflects real enforcement status, not assumptions. Each iteration should re-read this state from `docs/` and git — not from a growing conversation (fresh context; see Section 36).

Then the agent must output a short state summary:

```markdown
## Current State
- Project vision:
- Project purpose:
- Current feature/task:
- Last completed task:
- Next safe task:
- Known risks:
- Test/build commands:
- Docs that need update:
- Code areas likely needed:
- Golden rules / invariants in force:
- Mechanical checks status (lint / structural / consistency):
- Code & doc conventions in force (Section 3.12 — 繁體中文 comments, bilingual CODE_INDEX, zero Simplified):
- Doc-sync hooks installed (Section 3.13 — `core.hooksPath = scripts/git-hooks`; if not, install before code work):
- Conversation state (Section 3.15 — Active Summary from CONVERSATION_LOG.md: latest direction, recent corrections, open questions):
- Pending user approval (Section 3.14 — APPROVED-NNN exists for current feature? If not, no code yet):
- Whether parallel workstreams are active:
```

If any required file is missing, create or repair it before implementation.

---

## 7. Standard Development Loop

The required loop is:

```text
intake
→ constitution/rules
→ brainstorm (Socratic design refinement)
→ spec
→ clarify
→ plan
→ tasks
→ analyze (cross-artifact consistency: spec ↔ plan ↔ tasks)
→ isolated branch/worktree
→ baseline test + mechanical checks (lint + structural)
→ TDD implementation
→ user-perspective verification
→ mechanical checks pass (backpressure gate)
→ docs/log/code-index update
→ commit
→ handoff
```

Remote push or PR is optional and only happens when explicitly requested or defined by project workflow.

For long or autonomous runs, execute this loop as the **Ralph Wiggum Loop** (Section 36): fresh context each pass, gate on the mechanical checks rather than prescribed steps, and treat the plan as disposable.

Each phase can be run through a Superpowers professional-perspective skill (Section 41): brainstorming, writing-plans, test-driven-development, systematic-debugging, requesting-code-review, verification-before-completion.

This loop is the Spec Kit Spec-Driven Development sequence (Section 42); see the Master Flow in Section 1.6 for how all three layers line up across these phases.

---

## 8. Phase 0 — Repository Intake

### Goal

Understand the project without guessing.

### For Greenfield Projects

Create:

```text
README.md
AGENTS.md
SKILL.md
docs/
.cursor/rules/project-rules.mdc
.gitignore
.env.example
test config
CI placeholder
```

Initialize Git if appropriate:

```bash
git init
```

### For Existing Projects

Inspect lightweight sources first:

```bash
git status
git log --oneline -n 10
find . -maxdepth 3 -type f | sort
```

Then inspect:

- README
- package manager files
- config files
- entry points
- route files
- test files
- existing docs
- CI config

Do not read the entire repository blindly.

### Required Deliverables

```text
docs/00_AI_CONTEXT_INDEX.md
docs/CODE_INDEX.md
docs/DEV_LOG.md
docs/HANDOFF.md
```

### Completion Gate

The agent must be able to state:

- project purpose in 10 lines or fewer
- how to run the project
- how to test the project
- how to build the project
- where new code should go
- which files are high-risk

---

## 9. Phase 1 — Constitution / Rules

### Goal

Define project rules so agents do not invent architecture.

Create or update:

```text
AGENTS.md                       # ~100-line map (Map, Not Manual)
.cursor/rules/project-rules.mdc
docs/REQUIREMENTS.md
docs/GOLDEN_RULES.md            # canonical patterns agents must replicate
scripts/check-consistency.sh    # at least one mechanical invariant check
tests/structural/               # structural / layering / dependency-direction tests
```

Encode the rules **mechanically, not only in prose**: for each rule that matters, add a lint rule, a structural test, or a check-script assertion whose failure message states the fix. Prose explains; the mechanism enforces.

This is the Spec Kit `/constitution` artifact (Section 42); it maps to `docs/REQUIREMENTS.md` + `docs/GOLDEN_RULES.md` (or `.specify/memory/constitution.md` if Spec Kit is installed). Bake in three standing gates that every plan must satisfy or explicitly justify:

- **Simplicity Gate** — fewest moving parts; justify each extra project or layer.
- **Anti-Abstraction Gate** — use frameworks directly; justify every wrapper.
- **Integration-First Gate** — contracts and integration tests before implementation.

Record any justified deviation in `docs/DECISION_LOG.md` (Complexity Tracking); treat unjustified complexity as debt (Section 37).

Rules must include:

- project goal
- technology stack
- architecture boundaries
- directory ownership
- file modification rules
- testing rules
- documentation rules
- logging rules
- API sync rules
- security and secret handling
- dependency policy
- branch and commit policy
- forbidden actions

### Completion Gate

Rules must explicitly forbid:

- placeholder completion
- fake tests
- mock-only completion
- silent architecture changes
- removing tests to pass CI
- committing secrets
- touching unrelated files
- pushing directly to `main` without approval

The constitution is not complete until at least one of these rules is **enforced by a mechanical check** (lint, structural test, or `scripts/check-consistency.sh`) that fails loudly with a repair instruction. A rule that exists only in prose is a suggestion, not a constraint.

---

## 10. Phase 2 — Feature Specification

### Goal

Define what to build before deciding how to build it.

Create:

```text
docs/features/NNN-feature-name/spec.md
```

Spec must include:

```markdown
# Feature Spec: NNN Feature Name

## User Problem

## Goal

## Non-Goals

## Primary User Flow

## Edge Cases

## Acceptance Criteria

## UI Impact

## API Impact

## Data Model Impact

## Security / Privacy Impact

## Performance Impact

## Accessibility Impact

## Test Cases

## Open Questions

## Decisions
```

### Rules

- Acceptance criteria must be testable.
- Avoid vague words like “better,” “fast,” “clean,” or “optimized” unless measurable.
- If scope is unclear, mark it as an open question.
- If the user does not answer, choose a conservative default and document it.
- Mark every unresolved assumption inline with `[NEEDS CLARIFICATION: …]` (Spec Kit convention). Planning may not begin while any marker is unresolved.
- This is the Spec Kit `/specify` artifact: describe **what** and **why**, never the tech stack — that belongs in Phase 4 / `/plan`.

---

## 11. Phase 3 — Clarification Gate

Before planning, list unknowns:

```markdown
| Unknown | Risk | Conservative Default | Needs User? | Decision |
|---|---|---|---|---|
```

Ask the user only when the unknown affects:

- architecture
- data loss
- security
- cost
- external service integration
- irreversible migration
- user workflow
- public API behavior

Otherwise, make a conservative default and document it.

This is the Spec Kit `/clarify` step: walk the `[NEEDS CLARIFICATION]` markers from the spec, resolve each (by a user answer or a logged conservative default), and record the outcomes in a **Clarifications** section of `spec.md`. No marker may survive into planning unresolved.

---

## 12. Phase 4 — Technical Plan

Create:

```text
docs/features/NNN-feature-name/plan.md
```

Plan must include:

```markdown
# Technical Plan: NNN Feature Name

## Summary

## Architecture Change

## Files to Read

## Files to Modify

## Files Not to Touch

## Data Flow

## API Contract

## Validation Rules

## State Management

## Error Handling

## Logging / Observability

## Test Strategy

## User-Perspective Verification

## Rollout Plan

## Rollback Plan

## Risks

## Dependencies

## Docs to Update
```

### Completion Gate

The plan must explain:

- what will change
- what must not change
- why the chosen approach is safer than alternatives
- how to verify success
- how to roll back

---

## 13. Phase 5 — Task Breakdown

Create:

```text
docs/features/NNN-feature-name/tasks.md
```

Each task must use this format:

```markdown
## TASK-001 — Short Title

Status: pending
Trace ID: FEATURE-NNN/TASK-001
Goal:
Inputs:
Files to read:
Files to modify:
Files not to touch:
Forbidden:
Implementation steps:
Verification command:
Manual verification:
User-perspective test:
Docs to update:
Expected commit:
Rollback:
Risk:
```

Rules:

- Each task must be independently verifiable.
- Each task should modify only related files.
- Each task must identify docs to update.
- Each task must include rollback notes.
- A task cannot be marked complete without evidence.

### 13.1 Cross-Artifact Analysis Gate (Spec Kit `/analyze`)

After tasks and **before any implementation**, run a non-destructive consistency and coverage check across constitution ↔ spec ↔ plan ↔ tasks:

- Every acceptance criterion in `spec.md` maps to at least one task.
- Every task traces back to a requirement (no orphan work, no scope creep).
- Plan, data model, and contracts are consistent with the spec; no contradictions.
- No `[NEEDS CLARIFICATION]` marker remains.
- Constitution gates (Simplicity / Anti-Abstraction / Integration-First) are satisfied or justified.

Record findings in `tasks.md` (or `docs/SELF_CHECK.md`). Where feasible, make this a mechanical check (Section 35) so it runs every time, not only by hand. Do not proceed to Phase 6 while a high-severity inconsistency is open.

### 13.2 User-Approval Gate (Plan Sign-Off Before Code)

After `/analyze` confirms internal consistency, **stop and present the planning bundle to the user for explicit approval**. This is the single mandatory human gate before implementation (Section 3.14).

Present (in order):

1. **Spec summary** — 1 paragraph on what & why, plus the testable acceptance criteria.
2. **Plan summary** — architecture choice, files-to-touch, files-not-to-touch, risks, rollback.
3. **Task list** — the breakdown with trace IDs, in order.
4. **Open questions** — any remaining `[NEEDS CLARIFICATION]` items or assumptions the agent flagged.
5. **Request explicit approval** — “May I proceed with TASK-001 through TASK-NNN as planned?”

Wait for the user's reply. On approval, record in `docs/REQUEST_LOG.md` using the canonical table row defined in Section 30 (Approvals table) — a single row is the source of truth that the mechanical check (Section 35) parses. An optional `### APPROVED-NNN —` paragraph block can follow for richer notes; the row is authoritative.

Row format:

```
| YYYY-MM-DD HH:MM:SS | APPROVED-NNN | docs/features/NNN-*/ TASK-001..TASK-NNN | user | (Q1 resolution, Q2 resolution) | (carried C-NNN) | active |
```

Rules:

- No source-file edits before the `APPROVED-NNN` record exists.
- If the user requests changes, update spec / plan / tasks → re-run `/analyze` → re-request approval (do not edit-and-tell).
- Scope expansion mid-flight pauses for a mini-approval cycle.

---

## 14. Phase 6 — Isolated Development Environment

Use one of:

```bash
git worktree add ../project-task-001 -b feature/001-feature-name
```

or:

```bash
git checkout -b feature/001-feature-name
```

Testing isolation must use:

```text
.env.test
test database
temporary storage
mock external services
disposable fixtures
```

Before changing code, run baseline checks:

```bash
git status
npm test
npm run lint
npm run typecheck
npm run build
bash scripts/check-consistency.sh   # mechanical invariants / consistency
# plus any structural tests under tests/structural/
```

Use project-specific equivalents when not using npm. The mechanical checks are part of the baseline: they must pass before implementation, and any pre-existing failure must be recorded (see below), not silently ignored.

If baseline fails, document it in:

```text
docs/TEST_REPORT.md
docs/DEV_LOG.md
```

Do not hide pre-existing failures.

---

## 15. Phase 7 — Test-First Implementation

Use RED → GREEN → REFACTOR.

### RED

- Write or update a failing test first.
- Run it.
- Confirm it fails for the expected reason.

### GREEN

- Implement the smallest change needed.
- Run the target test.
- Confirm it passes.

### REFACTOR

- Clean the implementation only if tests remain green.
- Do not change behavior silently.
- Re-run relevant tests.

> **Superpowers TDD discipline (Section 41):** tests come first — if implementation was written before its test, delete it and redo it test-first. Keep each change as simple as possible (complexity reduction / YAGNI). Never claim done without evidence (Section 3.3).

### If Automated Tests Are Not Possible

Write a reproducible manual test script in:

```text
docs/TEST_REPORT.md
```

Manual test must include:

- preconditions
- steps
- expected result
- actual result
- evidence
- limitations

---

## 16. Phase 8 — User-Perspective Verification

Every completed task must be checked from the user’s point of view.

### UI

Check:

- Can the user find the feature?
- Can the user complete the primary flow?
- Are errors understandable?
- Are loading, empty, and error states handled?
- Does it work on expected screen sizes?
- Does it match the intended behavior, not only technical success?

### API

Check:

- Documented request works.
- Status codes are correct.
- Validation errors are consistent.
- Response schema is stable.
- Failure cases are tested.

### Background Jobs

Check:

- Job is idempotent.
- Retry is safe.
- Failure is observable.
- Logs are sufficient for debugging.
- Partial failure does not corrupt data.

### Required Updates

```text
docs/SELF_CHECK.md
docs/TEST_REPORT.md
docs/DEV_LOG.md
```

---

## 17. Phase 9 — Docs, Logs, and Code Index Update

After every verified task, update:

```text
docs/DEV_LOG.md
docs/DECISION_LOG.md
docs/SELF_CHECK.md
docs/TEST_REPORT.md
docs/CODE_INDEX.md
docs/TASKS.md
docs/HANDOFF.md
```

When you add tech debt, introduce a new pattern, or spot drift from the golden rules, also update `docs/ENTROPY_LOG.md`. When you establish a new invariant, add it to `docs/GOLDEN_RULES.md` **and** back it with a mechanical check (Section 35) — don't leave it as prose.

The pre-commit hook will block any commit that touches `src/` without updating `docs/CODE_INDEX.md` (Section 3.13). Treat that block as expected behavior — fix the index, don't bypass.

When user intent, constraints, scope, product direction, or interpretation changes, also update:

```text
docs/PROJECT_VISION.md
docs/REQUEST_LOG.md
docs/INTENT_TRACE.md
docs/REQUIREMENTS.md
docs/features/current-feature/spec.md
```

When optional parallel workstreams are active, also update the relevant coordination files:

```text
docs/WORKSTREAMS.md
docs/INTER_AGENT_REQUESTS.md
docs/TEST_MATRIX.md
docs/QA_FINDINGS.md
docs/REVIEW_QUEUE.md
docs/MERGE_PLAN.md
docs/CONFLICT_LOG.md
docs/AGENT_SESSIONS.md
```

### DEV_LOG Entry

```markdown
## YYYY-MM-DD — FEATURE-NNN/TASK-001 — Title

Change:
Affected files:
Reason:
Tests run:
Test result:
User-facing verification:
Docs updated:
Code index updated:
Known issues:
Rollback:
Commit:
Next step:
```

### DECISION_LOG Entry

Use when architecture, dependency, API, data model, or workflow decisions are made.

```markdown
## YYYY-MM-DD — Decision Title

Context:
Decision:
Alternatives considered:
Reason:
Impact:
Rollback:
Related task:
```

### SELF_CHECK Entry

```markdown
## YYYY-MM-DD — FEATURE-NNN/TASK-001

Spec compliance:
Architecture compliance:
Files touched:
Unrelated changes:
Security check:
User-perspective check:
Docs check:
Risk:
Verdict:
```

### TEST_REPORT Entry

```markdown
## YYYY-MM-DD — FEATURE-NNN/TASK-001

Environment:
Commands run:
Automated tests:
Manual tests:
Expected:
Actual:
Result:
Evidence:
Not run:
Reason if not run:
```

### HANDOFF Entry

```markdown
## Current Handoff

Project purpose:
Current feature:
Last completed task:
Current branch/worktree:
Changed files:
Tests status:
Known risks:
Next safe task:
Do not touch:
Useful commands:
```

---

## 18. Code Index Design

`docs/CODE_INDEX.md` must be optimized for token-saving, not full documentation. It is the new agent's map of the codebase: good enough to locate the 1–3 files a task needs without opening anything else. If it cannot answer “where does X live?”, it is stale (see Section 40).

Bilingual by default (Section 3.12): each row carries both an English Responsibility and a 繁中職責 column so Mandarin-thinking AI agents can parse intent in fewer tokens.

**Mandatory:** the bilingual pair (`Responsibility (EN)` + `職責（繁中）`) and the `Path` + `Risk` columns.
**Recommended (names may be shortened to fit a real table):** Public API / Entry Points, Used By, Related Tests.
**Optional:** per-file detail blocks below the Module Map — add them as the project grows; small projects can stay with the table only.

Suggested format:

```markdown
# Code Index

> 雙語索引 (English + 繁體中文)。新 agent 先讀這份,即可定位 1–3 個關鍵檔,不必掃整個專案。
> Bilingual map of the codebase. A new agent reads this first to locate the 1–3 files a task needs.

Last updated: YYYY-MM-DD

## Module Map

| Path | Responsibility (EN) | 職責（繁中） | Public API | Used By | Tests | Risk |
|---|---|---|---|---|---|---|

## path/to/file.ext   <!-- optional per-file block; use when a single row isn't enough -->

Responsibility (EN):
職責（繁中）:
Public functions/classes:
Entry points:
Depends on:
Used by:
Related tests:
Last reviewed:
Change risk: low / medium / high
Notes / 備註:
```

### Update CODE_INDEX When

- new file is added
- file is deleted
- module responsibility changes
- public function/class changes
- API route changes
- schema/model changes
- entry point changes
- dependency direction changes
- related tests change

### CODE_INDEX Rules

- Do not paste full code.
- Do not describe planned behavior as existing behavior.
- Keep summaries short.
- Prefer module-level map first, details second.
- Mark risky files.
- Mark stale areas explicitly.
- Bilingual format is mandatory: keep both `Responsibility (EN)` and `職責（繁中）` populated; never drop one for the other (Section 3.12).

---

## 19. Multi-Agent Collaboration Protocol

> Helper agents here are the delivery mechanism for the Superpowers “professional perspectives” (Section 41) and for the Ralph fresh-context loop (Section 36): each runs a specialized skill, reads the same context files, and writes findings back to docs. Reviews use two stages — spec compliance, then code quality.

### 19.1 Default Mode: Single Primary Agent

By default, the first agent using this skill is the **Primary Agent**.

The Primary Agent is responsible for:

- repository intake
- project vision clarification
- docs creation and maintenance
- feature spec
- technical plan
- task breakdown
- initial implementation
- baseline verification
- code index updates
- handoff updates

Do not create artificial A/B/C roles at project start.

Do not start parallel workstreams unless:

- the user asks for separate testing, review, risk analysis, or implementation isolation
- the Primary Agent explicitly identifies that parallel review would reduce risk
- the project is large enough that independent workstreams are useful
- a feature needs separate user-perspective QA
- a risky area needs independent failure-mode analysis

### 19.2 Optional Parallel Workstream Mode

When parallel collaboration is needed, create or update:

```text
docs/WORKSTREAMS.md
docs/INTER_AGENT_REQUESTS.md
docs/TEST_MATRIX.md
docs/QA_FINDINGS.md
docs/REVIEW_QUEUE.md
docs/MERGE_PLAN.md
docs/CONFLICT_LOG.md
```

These files are optional coordination files. They are not required for every small project or every task.

### 19.3 Role Names Are Functional, Not Fixed

Roles such as "Core Builder", "Risk & Test Researcher", "User-Angle QA", "Reviewer", and "Archivist" are functional responsibilities, not fixed permanent agents.

A project may use:

- one agent performing all roles
- one Primary Agent plus one review agent
- one Primary Agent plus one test-design agent
- multiple agents working in separate workstreams

The user may name agents A/B/C informally. Do not treat those names as required architecture.

### 19.4 Session Registration

Every new agent session must append to:

```text
docs/AGENT_SESSIONS.md
```

Format:

```markdown
## YYYY-MM-DD HH:mm — Agent Session

Agent:
Tool:
Role:
Branch:
Workstream:
Task:
Conversation summary:
Files intended to modify:
Files locked:
Files explicitly not to touch:
Start state:
Planned verification:
Status:
Next handoff target:
```

The conversation summary must capture the useful handoff summary of that tool/session.
It must not be a full raw transcript by default.

### 19.5 File Locking Convention

Before modifying files, list them under the current task or workstream:

```markdown
Files locked:
- path/to/file
- path/to/test
```

This is advisory locking for multi-agent coordination.

If another active session owns the same file, do not edit without resolving the conflict in:

```text
docs/CONFLICT_LOG.md
```

### 19.6 Inter-Agent Requests

If one agent needs another agent to research, test, review, or verify something, write the request in:

```text
docs/INTER_AGENT_REQUESTS.md
```

Do not rely on private chat history between tools.

Minimum request format:

```markdown
### IAR-000 — Short Title

From:
To role:
Related workstream:
Related task:
Priority:
Status:

Request:
Context:
Expected output:
Files to inspect:
Files not to modify:
Result:
Follow-up:
```

### 19.7 Handoff Requirement

At the end of every session, update:

```text
docs/HANDOFF.md
docs/AGENT_SESSIONS.md
```

If parallel workstreams are active, also update:

```text
docs/WORKSTREAMS.md
docs/INTER_AGENT_REQUESTS.md
docs/TEST_MATRIX.md
docs/QA_FINDINGS.md
docs/REVIEW_QUEUE.md
docs/MERGE_PLAN.md
docs/CONFLICT_LOG.md
```

The next agent must be able to continue without asking the user to repeat the project purpose.

---

## 20. Anti-Drift / Anti-Forgetting Protocol

If the agent becomes uncertain, context is compressed, or the task feels unclear, stop and recover from docs.

Read:

```text
docs/00_AI_CONTEXT_INDEX.md
docs/HANDOFF.md
docs/TASKS.md
docs/CODE_INDEX.md
docs/features/current-feature/
git status
```

Then answer:

```markdown
## Context Recovery
- Project purpose:
- Current feature:
- Last completed task:
- Next safe task:
- Open risks:
- Files that should not be touched:
- Verification command:
```

Do not continue coding until this recovery summary is consistent with docs.

---

## 21. Traceability Model

Every task must have a Trace ID:

```text
FEATURE-NNN/TASK-XXX
```

Trace chain:

```text
Requirement
→ Feature Spec
→ Technical Plan
→ Task
→ Code Change
→ Test Evidence
→ User Verification
→ Docs Update
→ Commit
→ Handoff
```

Each log should mention the Trace ID.

---

## 22. Git / GitHub Version Control

### Branch Naming

```text
feature/NNN-short-name
fix/NNN-short-name
refactor/NNN-short-name
docs/NNN-short-name
chore/NNN-short-name
```

### Commit Rules

Before commit:

```bash
git status
git diff --stat
git diff
```

Run relevant tests before commit.

Commit format:

```text
type(scope): concise description
```

Allowed types:

```text
feat
fix
docs
test
refactor
chore
ci
build
perf
```

### Push / PR Rules

Push only if:

- user explicitly asks
- project workflow says to push
- remote branch is expected for PR/review

Never push directly to `main` unless explicitly instructed.

PR or release note must include:

- feature/task ID
- summary
- files changed
- tests run
- user-perspective verification
- risk
- rollback plan

---

## 23. Auth / Access Setup

If the project requires external access, do not invent credentials.

Use:

```text
.env.example
.env.test
docs/API.md
docs/REQUIREMENTS.md
```

Rules:

- Never commit `.env`.
- Never print secrets.
- Never reuse production keys in tests.
- If GitHub auth is needed, ask for proper auth setup or use existing CLI auth.
- If external APIs are needed, document required env vars in `.env.example`.
- If credentials are missing, implement mock/test mode first when possible.

---

## 24. Tool and Command Usage

Prefer cheap deterministic inspection before expensive LLM reasoning. Prefer **mechanical checks** (lint, structural tests, `scripts/check-consistency.sh`) over re-reading files to verify an invariant — a check is cheaper, repeatable, and self-correcting. When choosing libraries or tools, prefer agent-readable, stable-API technologies (Section 38).

Use commands such as:

```bash
git status
git log --oneline -n 10
find . -maxdepth 3 -type f | sort
rg "keyword"
cat package.json
```

Avoid:

- blindly reading entire repositories
- generating large summaries from full source files
- scanning vendor/build/cache folders
- running destructive commands
- installing dependencies without explanation
- changing lockfiles accidentally

If a package install is needed, document:

- package name
- reason
- alternatives
- risk
- files changed

---

## 25. Available Agent Capabilities

When this skill is active, the agent may perform these capabilities:

| Capability | Output |
|---|---|
| Repository intake | `docs/00_AI_CONTEXT_INDEX.md`, `docs/CODE_INDEX.md` |
| Project rules setup | `AGENTS.md`, `.cursor/rules/project-rules.mdc` |
| Feature specification | `docs/features/*/spec.md` |
| Clarification analysis | Open questions and conservative defaults |
| Technical planning | `docs/features/*/plan.md` |
| Task breakdown | `docs/features/*/tasks.md` |
| Test planning | `docs/TEST_REPORT.md`, test files |
| Implementation | Source code changes |
| User verification | `docs/SELF_CHECK.md`, `docs/TEST_REPORT.md` |
| Trace logging | `docs/DEV_LOG.md`, `docs/DECISION_LOG.md` |
| Code indexing | `docs/CODE_INDEX.md` (bilingual: EN + 繁中職責, Section 3.12) |
| Multi-agent handoff | `docs/HANDOFF.md`, `docs/AGENT_SESSIONS.md` |
| Version control | Git branch, commit, optional push/PR |

---

## 26. Forbidden Actions

Never do these unless the user explicitly approves:

- delete user data
- overwrite `.env`
- commit secrets
- run destructive migrations
- push directly to `main`
- rewrite Git history
- disable tests to make CI pass
- remove failing tests instead of fixing cause
- claim success without verification
- leave placeholder code as complete
- use mock-only implementation as complete
- change architecture silently
- modify unrelated files
- install unknown packages without explanation
- update docs without checking code reality
- continue after context loss without recovery

---

## 27. Completion Definition

A task is complete only when all are true:

- [ ] Spec exists.
- [ ] Plan exists.
- [ ] Task is recorded.
- [ ] Code change is minimal and scoped.
- [ ] Tests or manual verification exist.
- [ ] User-perspective verification is recorded.
- [ ] Mechanical checks (lint / structural / consistency) pass.
- [ ] Code & doc conventions intact (Section 3.12 — 繁體中文 comments where authored, bilingual CODE_INDEX rows, zero Simplified Chinese).
- [ ] Doc-sync hooks active (Section 3.13 — `git config core.hooksPath` set; pre-commit blocks src/-without-CODE_INDEX commits).
- [ ] User-approval recorded for this feature scope (Section 3.14 — `APPROVED-NNN` entry in `REQUEST_LOG.md` before code was written).
- [ ] `CONVERSATION_LOG.md` Active Summary updated (Section 3.15 — latest user direction, open questions, recent corrections).
- [ ] `DEV_LOG.md` updated.
- [ ] `SELF_CHECK.md` updated.
- [ ] `TEST_REPORT.md` updated.
- [ ] `CODE_INDEX.md` updated or marked unchanged.
- [ ] `TASKS.md` updated.
- [ ] `HANDOFF.md` updated.
- [ ] Git commit created or reason for no commit recorded.
- [ ] Next task is clear.

---

## 28. Reporting Format

When planning:

```markdown
## Scope
## Assumptions
## Files to Inspect
## Docs to Create or Update
## Proposed Tasks
## Verification Plan
## Risk Controls
```

When completing a task:

```markdown
## Result
- Completed:
- Evidence:
- Files changed:
- Tests:
- User-perspective verification:
- Docs updated:
- Code index:
- Commit:

## Remaining
- Next task:
- Risks:
- Handoff:
```

When blocked:

```markdown
## Blocked
- Blocker:
- Risk:
- Required decision:
- Conservative default:
- Safe next step:
```

---

## 29. Minimal First Prompt for Any Agent

Use this prompt when starting or transferring work:

```text
Read SKILL.md, AGENTS.md, docs/PROJECT_VISION.md, docs/REQUEST_LOG.md, docs/INTENT_TRACE.md, docs/00_AI_CONTEXT_INDEX.md, docs/HANDOFF.md, docs/TASKS.md, docs/CODE_INDEX.md, docs/GOLDEN_RULES.md, and docs/CONVERSATION_LOG.md (Active Summary + last entries — Section 3.15) first. Then run the mechanical checks (scripts/check-consistency.* and tests/structural/) to see real enforcement status. Verify `git config --get core.hooksPath` returns `scripts/git-hooks`; if not, run `scripts/install-hooks.*` once before any code work. After any change to `src/`, the pre-commit hook will block the commit unless `docs/CODE_INDEX.md` is also staged (Section 3.13). If running outside Claude Code (Codex / Gemini CLI / Aider / local LLM / etc.), run `scripts/log-prompt-manual.*` once per substantive turn to maintain CONVERSATION_LOG.md — universal enforcement (pre-commit + check) still works (Section 3.16).

Do not implement immediately.

Follow the Master Flow order (Section 1.6): constitution → brainstorm → spec → clarify → plan → tasks → analyze → implement → verify → record. Write to docs at the end of every phase.

First summarize:
1. project vision
2. project purpose
3. current feature
4. last completed task
5. next safe task
6. test/build commands
7. known risks
8. docs that need updates
9. code areas likely needed
10. whether optional parallel workstreams are active
11. golden rules / invariants in force and current mechanical-check status
12. code & doc language conventions in force (Section 3.12 — 繁體中文 comments, bilingual CODE_INDEX, zero Simplified)
13. doc-sync hooks installed (Section 3.13 — `core.hooksPath = scripts/git-hooks`)
14. conversation state (Section 3.15 — read `docs/CONVERSATION_LOG.md` Active Summary + last entries)
15. user-approval status for the current feature (Section 3.14 — does `REQUEST_LOG.md` have an `APPROVED-NNN` entry? if no, plan must be presented for approval before code)

Then create or update:
- feature spec
- technical plan
- task breakdown
- verification checklist
- code index if stale
- request/intent trace if user intent changed

After each task:
- run verification
- run mechanical checks (lint / structural / scripts/check-consistency.sh); fix any failure using its repair message
- check from user perspective
- update DEV_LOG / SELF_CHECK / TEST_REPORT / CODE_INDEX / TASKS / HANDOFF (keep CODE_INDEX bilingual — EN + 繁中職責 — per Section 3.12)
- update CONVERSATION_LOG.md Active Summary (latest user direction, recent corrections, open questions — Section 3.15)
- update PROJECT_VISION / REQUEST_LOG / INTENT_TRACE only when project intent, user constraints, or scope interpretation changes
- update ENTROPY_LOG when patterns drift or debt is added; add new invariants to GOLDEN_RULES and back them with a check
- update optional workstream files only if parallel collaboration is active
- create a commit
- do not push unless explicitly instructed
```

---

## 30. Minimal File Templates

If the repository does not provide templates, create these minimal files.

### AGENTS.md (the map — keep ~100 lines)

```markdown
# AGENTS.md — Project Map

> Map, not manual. Point to deeper docs; don't inline everything.

## What this project is
(one paragraph)

## Start here
- Vision & intent: docs/PROJECT_VISION.md
- How to run / test / build: docs/00_AI_CONTEXT_INDEX.md
- Current work & handoff: docs/HANDOFF.md, docs/TASKS.md
- Code map: docs/CODE_INDEX.md
- Rules you must follow: docs/GOLDEN_RULES.md

## Non-negotiable rules (enforced mechanically)
- (rule) → check: (lint rule / structural test / script)

## Mechanical checks
- Run: `scripts/check-consistency.sh` and `tests/structural/`
- A failure prints its own repair step. Fix the cause; never disable the check.

## Code & doc conventions (Section 3.12)
- Identifiers in English; **comments in 繁體中文**.
- `docs/CODE_INDEX.md` is bilingual (EN `Responsibility` + 繁中 `職責`).
- Zero Simplified Chinese — anywhere.

## Directory ownership
| Dir | Owner / purpose | May edit? |
|---|---|---|

## Do not touch without approval
- ...
```

### docs/GOLDEN_RULES.md

```markdown
# Golden Rules

Last updated:

> Canonical patterns every agent must replicate. Keep short and example-driven.
> Back each rule with a mechanical check where possible.

| ID | Rule | Good example | Bad example | Enforced by (check) |
|---|---|---|---|---|
| GR-001 | Comments in 繁體中文; identifiers in English (mixed-language OK for English-only terms) | `// 處理登入驗證 (JWT)` | `// handle login` or Simplified Chinese | scripts/check-consistency |
| GR-002 | CODE_INDEX bilingual (EN + 繁中職責) | row has both columns | EN-only or 繁中-only | scripts/check-consistency |
| GR-003 | (your project-specific rule…) | | | |

> The `GR-NNN` IDs above are illustrative — number your project's rules in their own sequence. The demo's IDs (`GR-001` = required docs, `GR-004` = 繁中 comments, etc.) are one valid ordering; pick whatever stays stable for your project.

## Notes
- New code must follow these. Drift is logged in docs/ENTROPY_LOG.md.
- A rule that matters but has no check yet is a TODO: add the check.
```

### docs/ENTROPY_LOG.md

```markdown
# Entropy Log

Last updated:

> Drift from the golden rules and accumulating tech debt (“高息貸款” — high-interest debt).

## YYYY-MM-DD — ENTROPY-000 — Short Title

Golden rule violated:
Locations:
Severity:
Why it compounds:
Suggested refactor:
Check to add:
Linked task:
Status:
```

### docs/CONVERSATION_LOG.md (auto-appended by hook — Section 3.15)

```markdown
# Conversation Log

> 自動由 Claude Code UserPromptSubmit hook 寫入。新接手的 agent 讀這份就能知道使用者對話進行到哪。
> Auto-appended by the UserPromptSubmit hook (scripts/log-user-prompt.*). A new agent reads this to know where the user's conversation is currently.

## Active Summary
<!-- rolling — agent updates at the end of every substantive turn (Section 27 / 34). Keep ~10 lines. -->

最新方向 / Latest direction:
最近修正 / Recent corrections:
未決問題 / Open questions:
最近的使用者批准 / Recent approvals (APPROVED-NNN refs):

## Log Entries

### YYYY-MM-DD HH:MM:SS — CONV-001
> (truncated user prompt excerpt; hook appends mechanically)
```

### docs/00_AI_CONTEXT_INDEX.md

```markdown
# AI Context Index

Last updated:

## Project Purpose

## User / Product Goal

## Current Status

## Tech Stack

## How to Run

## How to Test

## How to Build

## Current Feature

## Architecture Summary

## Important Files

## Do Not Touch Without Approval

## Known Risks

## Next Safe Step
```

### docs/TASKS.md

```markdown
# Task Index

| Task ID | Feature | Status | Branch | Files | Verification | Commit |
|---|---|---|---|---|---|---|
```

### docs/CODE_INDEX.md

```markdown
# Code Index

> 雙語索引 (English + 繁體中文)。新 agent 先讀這份,即可定位 1–3 個關鍵檔。
> Bilingual map of the codebase. A new agent reads this first to locate the 1–3 files a task needs.

Last updated:

## Module Map

| Path | Responsibility (EN) | 職責（繁中） | Public API | Used By | Tests | Risk |
|---|---|---|---|---|---|---|

<!-- Optional per-file detail block — add when a single row is not enough:
## src/path/to/file.ext
Responsibility (EN):
職責（繁中）:
Public functions/classes:
Depends on:
Used by:
Related tests:
Change risk: low / medium / high
Notes / 備註:
-->
```

### docs/DEV_LOG.md

```markdown
# Development Log

## YYYY-MM-DD — TASK-ID

Change:
Files:
Reason:
Tests:
User verification:
Docs:
Commit:
Next:
```

### docs/HANDOFF.md

```markdown
# Handoff

Last updated:

## Current State

## Last Completed Task

## Current Branch

## Changed Files

## Test Status

## Known Risks

## Next Safe Task

## Commands

## Notes for Next Agent
```


### docs/PROJECT_VISION.md

```markdown
# Project Vision

Last updated:
Vision version:

## One-Sentence Core

## User's Original Intent

## Critical User Quotes

| Date | Quote | Why it matters |
|---|---|---|

## Product North Star

## Target Users

## Primary Use Cases

## Non-Goals

## Non-Negotiable Constraints

## Flexible Areas

## Current Product Interpretation

## Drift Warnings

## Revision History

| Version | Date | Change | Reason | Related request |
|---|---|---|---|---|
```

### docs/REQUEST_LOG.md

```markdown
# Request Log

Last updated:

## Purpose

This file records user requests, corrections, constraints, and accepted decisions in summarized form.
It preserves important original wording only when needed to prevent intent drift.
It is not a full raw transcript by default.

## Active User Constraints

| ID | Constraint | Source | Status | Related docs |
|---|---|---|---|---|

## Approvals (Section 3.14 / 13.2 — CANONICAL FORMAT)

<!-- The row is the source of truth (check-consistency parses it). Optional ### APPROVED-NNN
     paragraph blocks may sit below for richer notes. -->

| Timestamp | ID | Feature scope approved | Source | Open questions resolved | Constraints carried over | Status |
|---|---|---|---|---|---|---|

## Corrections / Mid-flight Changes (timestamped — Section 3.15)

<!-- Active Constraints reconciliation rule: each turn, compare latest CONVERSATION_LOG entries
     against the constraints table; on disagreement add a row here AND toggle the constraint to
     'superseded'. The next agent sees the divergence immediately. -->

| Timestamp | What changed | Why | Affected docs / tasks | Status |
|---|---|---|---|---|

## Request Entries

### YYYY-MM-DD — REQ-000 — Short Title

Source type:
User intent summary:
Important original wording:
Exact constraints:
Converted into:
Status:
Affected docs:
Affected code:
Notes:
```

### docs/INTENT_TRACE.md

```markdown
# Intent Trace

Last updated:

## Trace Table

| Intent ID | User Need | Requirement | Feature Spec | Task ID | Code Area | Test Evidence | Status |
|---|---|---|---|---|---|---|---|

## Intent Entries

### INTENT-000 — Short Title

User need:
Original wording:
Formal requirement:
Feature spec:
Tasks:
Code areas:
Verification:
Current status:
Risk of drift:
Notes:
```

---

## 31. Product Vision and User Intent Preservation

### 31.1 Purpose

A project must preserve not only technical state, but also the user's original intent.

This prevents agent drift where repeated handoffs slowly turn the project into something the user did not ask for.

Maintain:

```text
docs/PROJECT_VISION.md
docs/REQUEST_LOG.md
docs/INTENT_TRACE.md
```

### 31.2 What to Preserve

Preserve:

- abstract user vision
- product north star
- explicit constraints
- rejected directions
- important corrections
- accepted decisions
- intent-to-task traceability
- short critical original quotes when summaries may distort meaning

Do not preserve by default:

- full raw chat transcripts
- secrets
- credentials
- irrelevant emotional conversation
- speculative ideas as confirmed requirements
- private or sensitive information not needed for development

### 31.3 When to Update

Update `REQUEST_LOG.md` when:

- the user changes scope
- the user corrects the agent's interpretation
- the user rejects a direction
- the user adds a constraint
- the user gives an abstract vision that affects architecture or product direction

Update `PROJECT_VISION.md` when:

- the project north star changes
- non-goals change
- target users change
- core constraints change
- drift warnings need to be added

Update `INTENT_TRACE.md` when:

- a request becomes a requirement
- a requirement becomes a feature spec
- a feature spec becomes tasks
- tasks become code
- tests verify user intent

---

## 32. Optional Parallel Workstream Protocol

### 32.1 Default Behavior

Do not start with multiple agents by default.

The first agent is the Primary Agent and owns the main planning and implementation flow.

Parallel agents are activated only when useful for:

- isolated testing
- independent risk analysis
- user-perspective QA
- code review
- failure-mode research
- large features with separable areas

### 32.2 Optional Coordination Files

When parallel workstreams are active, create and maintain:

```text
docs/WORKSTREAMS.md
docs/INTER_AGENT_REQUESTS.md
docs/TEST_MATRIX.md
docs/QA_FINDINGS.md
docs/REVIEW_QUEUE.md
docs/MERGE_PLAN.md
docs/CONFLICT_LOG.md
```

If no parallel workstreams are active, these files may be absent.

### 32.3 Workstream Templates

#### docs/WORKSTREAMS.md

```markdown
# Workstreams

Last updated:

## Active Workstreams

| Workstream ID | Agent | Tool | Role | Branch | Scope | Files Locked | Status | Depends On | Output |
|---|---|---|---|---|---|---|---|---|---|

## Rules

- Each workstream must have a clear role.
- Each workstream must list files it may modify.
- Agents must not edit files locked by another active workstream.
- Cross-agent requests must be written in INTER_AGENT_REQUESTS.md.
```

#### docs/INTER_AGENT_REQUESTS.md

```markdown
# Inter-Agent Requests

Last updated:

### IAR-000 — Short Title

From:
To role:
Related workstream:
Related task:
Priority:
Status:

Request:
Context:
Expected output:
Files to inspect:
Files not to modify:
Result:
Follow-up:
```

#### docs/TEST_MATRIX.md

```markdown
# Test Matrix

Last updated:

| Test ID | Feature | Scenario | Risk | Type | Preconditions | Steps | Expected Result | Owner | Status |
|---|---|---|---|---|---|---|---|---|---|
```

#### docs/QA_FINDINGS.md

```markdown
# QA Findings

Last updated:

### QA-000 — Short Title

Found by:
Related test:
Related feature:
Severity:
Status:

Summary:
Steps to reproduce:
Expected:
Actual:
Affected files:
Possible cause:
Recommended fix:
Owner:
Linked task:
```

#### docs/REVIEW_QUEUE.md

```markdown
# Review Queue

Last updated:

| Review ID | Source | Related Task | Changed Files | Test Evidence | QA Findings | Reviewer | Status |
|---|---|---|---|---|---|---|---|
```

#### docs/MERGE_PLAN.md

```markdown
# Merge Plan

Last updated:

## Active Branches

| Branch | Owner | Purpose | Depends On | Merge Order | Risk |
|---|---|---|---|---|---|

## Merge Rules

- Do not merge if TEST_REPORT.md is missing.
- Do not merge if CODE_INDEX.md is stale.
- Do not merge if HANDOFF.md does not describe next step.
```

#### docs/CONFLICT_LOG.md

```markdown
# Conflict Log

Last updated:

### CONFLICT-000 — Short Title

Detected by:
Related workstreams:
Files:
Conflict:
Resolution:
Decision owner:
Status:
```

---

## 33. Primary Agent and Optional Helper Agent Model

The Primary Agent is the default owner of the project flow.

Helper agents are not required at the start. They may be introduced later for specialized support.

Possible helper roles:

| Role | Responsibility | Main Outputs |
|---|---|---|
| Risk & Test Researcher | Identify failure modes and test points | TEST_MATRIX, QA_FINDINGS |
| User-Angle QA | Verify from user perspective | SELF_CHECK, TEST_REPORT, QA_FINDINGS |
| Reviewer | Review implementation and merge readiness | REVIEW_QUEUE, MERGE_PLAN |
| Archivist | Ensure docs and traceability are complete | HANDOFF, TASKS, INTENT_TRACE |
| Specialist Builder | Implement isolated subsystem | source code, tests, DEV_LOG, CODE_INDEX |

A helper agent must not assume control of the project unless explicitly assigned.

A helper agent must read the same context files and write back to docs.

---

## 34. Updated Completion Definition

A task is complete only when all required records are updated.

Always required:

- spec exists
- plan exists
- task is recorded
- code change is minimal and scoped
- tests or manual verification exist
- user-perspective verification is recorded
- mechanical checks (lint / structural / consistency) pass
- code & doc conventions intact (Section 3.12 — 繁體中文 comments where authored, bilingual CODE_INDEX rows, zero Simplified Chinese)
- doc-sync hooks active (Section 3.13 — pre-commit blocks src/-without-CODE_INDEX commits)
- user-approval recorded for this feature scope (Section 3.14 — APPROVED-NNN entry in REQUEST_LOG.md)
- CONVERSATION_LOG.md Active Summary updated (Section 3.15)
- DEV_LOG.md updated
- SELF_CHECK.md updated
- TEST_REPORT.md updated
- CODE_INDEX.md updated or marked unchanged
- TASKS.md updated
- HANDOFF.md updated
- git commit created or reason for no commit recorded
- next task is clear

Required when intent changes:

- PROJECT_VISION.md updated if core direction changed
- REQUEST_LOG.md updated if user request, correction, or constraint changed
- INTENT_TRACE.md updated if a request maps to a requirement, task, code area, or test

Required when parallel workstreams are active:

- WORKSTREAMS.md updated
- AGENT_SESSIONS.md updated
- INTER_AGENT_REQUESTS.md updated if cross-agent request exists
- TEST_MATRIX.md updated if test points were created
- QA_FINDINGS.md updated if issues were found
- REVIEW_QUEUE.md updated if review is pending
- MERGE_PLAN.md updated if multiple branches must be integrated
- CONFLICT_LOG.md updated if overlap or conflict occurred


---

## 35. Mechanical Enforcement & Structural Tests

Documentation tells agents what to do; mechanical checks make sure they did. Build the harness so violations fail loudly and self-describe their fix.

### 35.1 What to Enforce Mechanically

Convert these from prose into checks whenever feasible:

- directory ownership / forbidden-edit boundaries
- required doc presence and freshness (e.g. `CODE_INDEX.md` not older than the code it describes)
- naming and architecture-layer rules (no import from layer X into layer Y)
- trace-ID presence in commits / task files
- consistency invariants (counts, badges, cross-references, generated-vs-source)
- secrets never committed
- public API / schema stability
- doc / code language conventions (bilingual CODE_INDEX 職責（繁中） column present; 繁體中文 comments in code; zero Simplified Chinese — see Section 3.12)
- doc-sync hooks installed and active (PostToolUse + pre-commit) so code can't be modified or committed without syncing CODE_INDEX (see Section 3.13)
- conversation-log freshness (`docs/CONVERSATION_LOG.md` exists; Active Summary block present and not stale; UserPromptSubmit hook is configured — see Section 3.15)
- user-approval records present for each in-progress feature (`APPROVED-NNN` entries in `REQUEST_LOG.md` matching `docs/features/NNN-*/` — see Section 3.14)

### 35.2 Forms of Enforcement

| Form | Use for |
|---|---|
| Custom lint rule | per-file / per-symbol code rules |
| Structural test (`tests/structural/`) | repo-shape, layering, dependency-direction invariants |
| Consistency script (`scripts/check-consistency.sh`) | cross-file numeric / reference drift |
| CI gate | run all of the above on every push / PR |
| Pre-commit hook | a fast local subset before each commit |

The `.sh` filename used throughout is **illustrative** — use whatever runs on your platform: `check-consistency.ps1` on Windows, a `Makefile` target, `npm run check`, etc. What matters is that one command runs locally and in CI and prints a repair step on failure.

### 35.3 Self-Correcting Failures

Every check must print, on failure: which invariant broke, where (file/line), and the exact repair step. Example:

```text
✗ CODE_INDEX stale: src/auth/token.ts changed after docs/CODE_INDEX.md.
  Fix: update the token.ts row in docs/CODE_INDEX.md, then re-run scripts/check-consistency.sh.
```

“文件會腐爛，lint 規則不會” — docs decay, lint rules don't.

### 35.4 Rules

- **Central enforcement, local autonomy:** enforce boundaries centrally; leave implementation free inside them.
- Never disable, weaken, or delete a check to go green. Fix the cause, or change the rule deliberately and log it in `docs/DECISION_LOG.md`.
- A new invariant discovered during work should become a check before the task is called complete.

---

## 36. The Ralph Wiggum Autonomous Loop

For long or autonomous runs, execute tasks as repeated cycles instead of one ever-growing context. This is the “Ralph Wiggum 循環.”

### 36.1 The Six Principles

1. **Fresh Context Is Reliability** — start each iteration by re-reading state from `docs/` and git, not from a long conversation. Clear context between cycles. (This is *why* `docs/` is authoritative, not chat.)
2. **Backpressure Over Prescription** — don't script every step; gate progress on mechanical checks. If checks pass, the method was fine; if they fail, rerun.
3. **The Plan Is Disposable** — regenerating a plan costs one planning loop. Don't cling to a stale plan; re-plan from current state.
4. **Disk Is State, Git Is Memory** — files are the handoff mechanism; commits are continuity. Anything that must survive the next iteration lives on disk and in git.
5. **Steer With Signals, Not Scripts** — “人類掌舵，智能體執行.” Add landmarks (checks, golden rules, specs), not micro-instructions.
6. **Let Ralph Ralph** — once the harness is sound, stay out of the loop; don't micromanage each cycle.

### 36.2 One Iteration

```text
re-read state (HANDOFF, TASKS, GOLDEN_RULES, CODE_INDEX, git)
→ pick next safe task
→ implement minimally
→ run mechanical checks + tests (backpressure gate)
→ if green: update docs/logs/index, commit, update HANDOFF
→ if red: read the repair instruction, fix, rerun
→ drop context, start next iteration fresh
```

### 36.3 Stop Conditions

Stop the loop when: the task's acceptance criteria pass; a check fails in a way that needs a human decision; scope is ambiguous (open question); or a forbidden/destructive action would be required. Record why in `docs/HANDOFF.md`.

---

## 37. Entropy Management — Garbage Collection for Agent Code

Agents copy whatever patterns already exist — good and bad. Without active cleanup, quality decays. Treat entropy reduction as routine garbage collection. Tech debt is “高息貸款” — high-interest debt that compounds.

### 37.1 Golden Rules

Maintain `docs/GOLDEN_RULES.md`: the small set of canonical patterns agents must replicate (error handling, logging, naming, layering, test shape). Keep it short, example-driven, and — wherever possible — backed by a mechanical check (Section 35).

### 37.2 Background Drift Scans

Periodically (or as a helper-agent workstream) scan for deviations from the golden rules and record them in `docs/ENTROPY_LOG.md`. High-severity drift becomes a refactor task with its own Trace ID; do not silently leave it.

### 37.3 ENTROPY_LOG.md entry

```markdown
## YYYY-MM-DD — ENTROPY-000 — Short Title

Golden rule violated:
Locations:
Severity:
Why it compounds:
Suggested refactor:
Check to add:
Linked task:
Status:
```

### 37.4 Rules

- Prefer adding a mechanical check over re-documenting the rule.
- Refactor in scoped tasks with rollback notes; never bundle GC into unrelated feature work.
- New code must follow the golden rules; checks/reviewers reject drift early (cheaper than later).

### 37.5 Hook Bypasses Are Entropy Too

If the pre-commit hook (Section 3.13) is bypassed via `git commit --no-verify`, log it in `docs/ENTROPY_LOG.md` in the SAME commit so the bypass is not silently forgotten. Template:

```markdown
## YYYY-MM-DD — ENTROPY-NNN — Pre-commit hook bypassed

Hook bypassed: pre-commit (CODE_INDEX sync gate)
Files changed without index update: src/path/to/file
Bypass reason: (emergency hotfix / partial WIP / etc.)
Re-sync task: TASK-NNN — update CODE_INDEX row for the files above
Status: pending re-sync
```

A bypass without a paired entropy log entry is a defect; the next agent will refuse to build on top of it until the re-sync task is closed.

---

## 38. Agent-Readable Technology Selection

Optimize choices for AI reasoning capacity, not only human taste.

- Prefer “boring,” stable-API technologies with broad training coverage — agents reason about them more reliably.
- Avoid wrapping opaque, fast-changing, or under-documented upstream behavior. Sometimes reimplementing a small, well-understood subset is more agent-readable than depending on a black box.
- Keep public interfaces small, explicit, and typed.
- Favor explicit data flow and local reasoning over clever indirection.
- Record significant tech choices and their agent-readability rationale in `docs/DECISION_LOG.md`.

This is a default, not a mandate: when the user requires a specific stack, follow it and document the agent-readability risks instead.

---

## 39. Throughput-Aware Merge Philosophy

When agent output far exceeds human review capacity, the optimal merge strategy shifts.

- Keep PRs small and short-lived; small diffs are easier to verify mechanically and to roll back.
- When mechanical checks + tests are strong, correction-by-rerun can beat heavy human gatekeeping: “在智能體吞吐量遠超人類注意力的系統中” — in systems where agent throughput far exceeds human attention, fast correction is usually right.
- This never overrides the Section 3 safety rules: no pushing to `main` without approval, no skipping tests, no destructive actions. Throughput optimizes the *safe* path; it does not remove the guardrails.
- Lean on the harness (checks, golden rules, structural tests) as the reviewer-at-scale; reserve human review for judgment, ambiguity, and irreversible decisions.

---

## 40. Docs-First Onboarding & Token Economy

The entire `docs/` system exists for one payoff: a new agent can understand the project and continue safely by reading a small, curated map — **not** by scanning the whole codebase. Reading the map costs a few thousand tokens; scanning the repo costs tens or hundreds of thousands and still drifts.

### 40.1 The Onboarding Path (cheapest first)

```text
AGENTS.md (map)
→ docs/00_AI_CONTEXT_INDEX.md
→ docs/HANDOFF.md
→ docs/TASKS.md
→ docs/CODE_INDEX.md
→ docs/CONVERSATION_LOG.md   (Active Summary + last ~10 entries — what the user is currently saying / steering toward — Section 3.15)
→ current feature folder (docs/features/NNN-*/)
→ targeted source reads — only the files the current task needs
```

Stop climbing as soon as you can state: project purpose, how to run/test/build, current feature, last completed task, next safe task, files not to touch. If you reached that from docs alone, the handoff worked.

### 40.2 CODE_INDEX Is the Token-Saving Map of the Codebase

- Read `CODE_INDEX.md` to locate the 1–3 files a task actually needs. Do not open the rest.
- If the index cannot answer “where does X live?”, it is stale. Fixing it is cheap; scanning around it is expensive and the cost lands on every future agent.
- The index summarizes modules, responsibilities, public APIs, dependencies, tests, and risks — never full source (see Section 18).
- The index is **bilingual** (EN + 繁中職責). For Mandarin-thinking AI agents, the 繁中 column often conveys intent in fewer tokens than English prose; for English-thinking agents, the EN column does the same. Both columns are required (Section 3.12).
- The doc-sync hook (Section 3.13) is what mechanically backs this promise: code changes that don't update the index never reach `main`.

### 40.3 Handoff Completeness Gate

A handoff is complete only when **a cold agent could continue from docs alone** — without reading source beyond the named files, and without asking the user to restate the project's purpose.

Before ending a session, confirm:

- [ ] `HANDOFF.md` states purpose, current branch, changed files, test status, next safe task, do-not-touch.
- [ ] `CODE_INDEX.md` points to every file the next task will touch.
- [ ] `TASKS.md` shows the next safe task and its trace ID.
- [ ] No required fact lives only in this conversation.
- [ ] A fresh agent following 40.1 reaches “ready to work” without scanning.

### 40.4 Rules

- Load docs in priority order; open only what the task needs (progressive disclosure, Section 3.10).
- Every task that changes code must keep `CODE_INDEX.md` accurate, or the token economy breaks for the next agent.
- Success metric: a fresh agent reaches “ready to work” from `docs/` alone.

---

## 41. Professional-Perspective Skills — Superpowers Integration

This skill is the **orchestration spine and memory system**; **Superpowers** (obra/superpowers) supplies the composable **professional perspectives** — expert process-skills you invoke at the right phase to perfect the project from many angles. Humans steer; the right skill executes each phase. The two compose: every perspective reads the same context files (Section 6) and writes its results back to `docs/`.

### 41.1 Four Operating Principles

- **Test-Driven Development** — write the test first, always.
- **Systematic over ad-hoc** — follow the process; don't guess.
- **Complexity reduction** — simplicity is the goal; apply YAGNI, delete speculative code.
- **Evidence over claims** — verify before declaring success (reinforces Section 3.3).

### 41.2 Perspectives Mapped to Phases

| Superpowers skill | Perspective (expert lens) | Invoke at | Writes to |
|---|---|---|---|
| brainstorming | Socratic designer | before the spec | `features/*/spec.md` (Decisions / Open Questions) |
| writing-plans | Planner | Phase 4 | `features/*/plan.md` (2–5 min tasks) |
| subagent-driven-development | Builder, fresh context | Phases 5–7 | code, `DEV_LOG.md` (see 19, 36) |
| test-driven-development | Test engineer | Phase 7 | tests, `TEST_REPORT.md` |
| systematic-debugging | Debugger (4-phase root cause) | on any failure | `DEV_LOG.md`, `QA_FINDINGS.md` |
| verification-before-completion | Verifier | Phase 8 | `SELF_CHECK.md`, `TEST_REPORT.md` |
| requesting-/receiving-code-review | Reviewer | before merge | `REVIEW_QUEUE.md` (two-stage) |
| using-git-worktrees / dispatching-parallel-agents | Isolation / parallel | Phase 6 / workstreams | `WORKSTREAMS.md` |
| finishing-a-development-branch | Integrator | merge | `MERGE_PLAN.md` |
| writing-skills | Skill author | hardening the harness | new skills, checks (35), golden rules (37), doc-sync hooks (3.13), conversation-log hook (3.15) |

### 41.3 Brainstorm Before Building

Before writing a spec, run Socratic design refinement: ask clarifying questions, present the design in sections for the user to validate, and capture accepted choices in `spec.md` (Decisions) and unknowns in Open Questions. Do not skip from idea to code. This front-loads the cheap thinking before the expensive building.

### 41.4 Subagent-Driven Development + Two-Stage Review

Dispatch a fresh subagent per task (composes with the Ralph loop, Section 36, and the helper-agent model, Section 19). Every change passes **two-stage review** before it counts as done:

1. **Spec compliance** — does it do exactly what the task/plan specified, no more, no less?
2. **Code quality** — is it simple, correct, tested, and consistent with the golden rules (Section 37)?

Critical issues block progress; record them in `REVIEW_QUEUE.md` and resolve before merge.

### 41.5 Professional-Perspective Review Pass

To “perfect the project structure,” run a multi-perspective pass — one helper agent per lens (Sections 19, 32), each reading the same docs and writing findings to `QA_FINDINGS.md` / `REVIEW_QUEUE.md` with severities:

- **Architecture** — boundaries, layering, dependency direction
- **Security & secrets** — inputs, authorization, secret handling
- **Testing** — coverage of the risky paths, missing edge cases
- **Performance** — hot paths, obvious waste
- **Readability & agent-readability** — clarity, stable APIs (Section 38)
- **Docs & traceability** — index freshness, handoff completeness (Section 40)
- **Simplicity** — dead code, speculative generality, duplication (Section 37)

The Primary Agent triages findings into scoped tasks. Recurring findings should graduate into a mechanical check (Section 35) or a golden rule (Section 37) so the perspective enforces itself next time.

### 41.6 Rules

- A perspective skill reads the same context files and writes back to docs — no private memory, no chat-only conclusions.
- Perspectives produce findings and suggested tasks, not silent rewrites.
- One perspective, one focus: keep each lens narrow so its findings are sharp.

---

## 42. Spec-Driven Development — Spec Kit Integration

**Spec Kit** (github/spec-kit) is the spec-driven backbone: the canonical order, the artifacts, and the principle that **specifications are the source of truth** — “specifications don't serve code; code serves specifications.” This is exactly the doc-first stance this skill is built on: the spec and its sibling artifacts are durable external memory, and code is their expression.

### 42.1 Commands → Phases → Artifacts

| Spec Kit command | This skill | Produces |
|---|---|---|
| `/constitution` | Phase 1 (Section 9) | governing principles → `GOLDEN_RULES.md` / `REQUIREMENTS.md` (or `.specify/memory/constitution.md`) |
| `/specify` | Phase 2 (Section 10) | `spec.md` — what & why, user stories, acceptance criteria |
| `/clarify` | Phase 3 (Section 11) | resolved `[NEEDS CLARIFICATION]` → Clarifications section |
| `/plan` | Phase 4 (Section 12) | `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md` |
| `/tasks` | Phase 5 (Section 13) | `tasks.md` — by user story, `[P]` parallel markers, dependencies |
| `/analyze` | Gate 13.1 | cross-artifact consistency report (no code yet) |
| `/implement` | Phase 7 (Section 15) | code + tests, per the plan |
| `/checklist` (optional) | Phase 8 (Section 16) | requirement-completeness checklist |
| `/taskstoissues` (optional) | Finish | GitHub issues from the task list |

If Spec Kit is installed, prefer its slash commands and `specs/{feature}/` layout; otherwise produce the same artifacts under `docs/features/NNN-*/`. Either way, keep `docs/02_SPEC_KIT_MAPPING.md` current so any agent knows which artifact lives where.

### 42.2 Specification Is the Source of Truth

- The spec outranks the code when they disagree: fix the code, or deliberately update the spec and log it — never let them silently diverge (reinforces Section 5).
- Changes are **regenerations, not patches over patches**: update spec/plan, then re-derive tasks and code.
- This is what makes handoff cheap — a new agent reads the spec, not the whole implementation (Section 40).

### 42.3 Explicit Uncertainty: `[NEEDS CLARIFICATION]`

Mark every unresolved assumption inline in the spec/plan as `[NEEDS CLARIFICATION: question]`. Forbid implementation while any remain. This forces ambiguity to the surface instead of being silently guessed (pairs with Phase 3 and Section 11).

### 42.4 Constitution Gates

Spec Kit's constitution carries standing gates the plan must pass or justify: **Simplicity**, **Anti-Abstraction**, **Integration-First** (Section 9). Treat unjustified complexity as debt (Section 37); record justified deviations in `DECISION_LOG.md`.

### 42.5 Templates as Enforcement

Spec Kit resolves templates from a priority stack (project overrides → presets → extensions → core). Use templates to force every spec / plan / tasks file to carry its required sections — a structural form of mechanical enforcement (Section 35). Keep `templates/` aligned with the section headings in Sections 10, 12, and 13.

### 42.6 How the Three Layers Compose Here

- **Spec Kit** says *what to produce and in what order* (this section).
- **Superpowers** supplies *the expert who produces it well* at each phase (Section 41).
- **Harness** *enforces and remembers* — checks, golden rules, docs-as-memory (Sections 35–40).

Spec Kit's `/analyze` and this skill's mechanical checks (Section 35) are the same instinct: verify consistency mechanically before trusting it.

---

## 43. Final Principle

The agent must optimize for:

```text
Correctness > Traceability > Testability > Simplicity > Maintainability > Speed
```

Hold the goal and its three layers at once:

- **Goal — docs-first:** the durable deliverable is a doc system complete enough that any cold agent can continue from `docs/` alone, without scanning the repo or replaying this conversation.
- **Spec Kit — spec is truth:** code serves specifications; when they disagree, reconcile deliberately and log it — never drift.
- **Superpowers — right lens, right phase:** evidence over claims, simplicity over cleverness.
- **Harness — enforce & remember:** humans steer, agents execute (人類掌舵，智能體執行); encode rules as mechanical checks, not hope.

Fast code that future agents cannot understand — or that no check protects, or that no doc explains — is not progress.
