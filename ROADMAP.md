# fishfit — Roadmap & Handoff

**New here / starting a fresh session?** Read this file, then `docs/ARCHITECTURE.md`
(the technical design) and `CHECKLIST.md` (the step-by-step to work through). Those
three files are all a new Claude Project or Claude Code session needs to be current.

---

## Where we are today (already built & working)

- **Two dashboards, one codebase**, chosen by URL:
  `/?u=cjf` (Callum — performance) and `/?u=jj` (JJ — prenatal, with safety guardrails).
- **Live Garmin data** per profile via a daily GitHub Action (token-only auth).
- **Plans are data**, not code: `data/<profile>/plan.json` drives each dashboard.
- **Weekly check-in** button opens a coach pre-filled with that profile's data.
- **Coach apply loop (human-in-the-loop):** a validated, path-scoped patch →
  Pull Request → you merge → dashboard updates. Isolation is enforced in code and
  covered by CI tests (`scripts/test_isolation.py`).

Everything runs on **GitHub Pages + GitHub Actions** — no server, no database.

---

## The goal of this phase

Two **coach personas** that can (1) **build an initial training plan** from a short
set of screening questions + goals, and (2) **adjust the plan weekly** from check-ins —
each persona unique so it builds the right *kind* of plan:

- **`endurance-performance`** (Callum) — get faster, periodised toward a goal race.
- **`prenatal`** (JJ) — gentle, stage-aware, safety-first (not medical advice;
  provider-clearance gate; talk-test not pace; warning-signs aware).

---

## The tool model (important) — the repo is the shared brain

You will use **two Claude tools**, and they hand off to each other **through this repo** —
they never need to talk to each other directly:

```
            reads persona + data              reads/edits code, personas, plans
   ┌──────────────────────────┐        ┌────────────────────────────────────┐
   │      Claude PROJECT       │        │            Claude CODE              │
   │  (conversational)         │        │  (builds features, automates)       │
   │  • screening questions    │        │  • dashboard look/feel + functions  │
   │  • goal setting           │        │  • wire the apply/PR pipeline       │
   │  • BUILD the plan.json     │        │  • run tests, open PRs              │
   └────────────┬─────────────┘        └──────────────────┬─────────────────┘
                │  outputs a plan / patch                   │  commits changes
                ▼                                           ▼
        ┌───────────────────────────── GITHUB REPO (source of truth) ─────────────────────────────┐
        │  coaches/<persona>.md   data/<profile>/{plan,profile,garmin}.json   app.js/styles.css   │
        │  scripts/ (apply + tests)   .github/workflows/ (sync, apply, tests)                      │
        └──────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Claude Project** = the *conversational coach*: intake questions, goal setting,
  and producing a plan (as `plan.json`, or a plan-patch for tweaks). One Project
  per persona so its instructions stay pure.
- **Claude Code** = the *builder*: dashboard design/feel, new functionality, wiring,
  tests, and opening PRs.
- **The repo is the memory.** Neither tool holds the authoritative plan or persona —
  the files do. So you can move Project → Code → Project freely; each one just reads
  the latest files.

### Where the coaching personas live
In the repo as **`coaches/endurance-performance.md`** and **`coaches/prenatal.md`** —
plain-language instruction files (role, screening questions, how to shape a plan,
output format, guardrails). This is the single source of truth. Because plans are
data (not hardcoded), the persona file + the data files are everything a coach needs.

### How the Project stays in sync with the persona files
When you set up a Project, **paste the persona file into the Project's custom
instructions** (and re-paste if you edit it), or connect the repo so it reads the
file live. Either way the canonical copy is the file in `coaches/`.

### The full round-trip (Project → Code → Project)
1. **Project** runs the screening for a profile → outputs a `plan.json` (initial) or a
   plan-patch (weekly tweak).
2. That output enters the repo via the **Apply** path (paste into the *Apply coach
   patch* Action, or have **Claude Code** commit it) → opens a **PR** → you merge.
3. **Claude Code** does any code/design work in the repo and opens its own PRs.
4. Next time, the **Project** reads the now-updated files and continues — nothing to
   re-explain, because the repo carried the state.

---

## Ordered plan (see `CHECKLIST.md` for the tickable version)

1. **Repo** — renamed to `fishfit`. ✅ (Pages + secrets + tokens carried over.)
2. **Handoff docs** — this file + `CHECKLIST.md` + `docs/ARCHITECTURE.md`. ✅
3. **Write the two coach personas** — `coaches/*.md` (intake questions, plan shaping,
   guardrails). *(Claude Code to scaffold the files; refine wording in a Project.)*
4. **Add a "set full plan" apply path** — the current pipeline does incremental
   patches; initial plan-building needs to commit a whole `plan.json` (validated,
   path-scoped, PR-gated). *(Claude Code.)*
5. **Run screening → build real initial plans** for Callum and JJ. *(Project per
   persona; you answer; output committed via the apply path.)*
6. **Design/feel updates** — JJ feminine theme + light tweaks to both. *(Claude Code.)*
7. **Connect Garmin tokens** — add JJ's `GARMINTOKENS_JJ`; confirm Pages on. *(You.)*
8. **Test** — end-to-end on the live site: both dashboards, syncs, check-in, apply,
   isolation. *(Claude Code drives; you eyeball the live links.)*
9. **Roll out** — use it weekly (open links, Sunday check-in, merge the PR).
10. **(Optional) 6b automation** (Claude Code in an Action to produce patches
    unattended), then **monitor & iterate** with small changes over time.

---

## Open decisions
- **6b runner** for full automation: Claude Code in a GitHub Action (recommended),
  a Cowork Routine, or the Anthropic API — plus one credential as a secret.
  Not needed for the human-in-the-loop version.
- **JJ's real plan** stays the gentle placeholder until her pregnancy is confirmed
  and she is provider-cleared.

## Safety (prenatal — non-negotiable)
Not a medical device. The prenatal persona and dashboard must keep: the
not-medical-advice disclaimer, the provider-clearance gate, talk-test (not pace),
the warning-signs list, and PR-reviewed changes. Guideline-grounded; provider
oversight always required.
