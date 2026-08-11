# fishfit — Build Checklist

Work top to bottom. Each item is tagged with the tool to use:
- **[CODE]** = Claude Code (build features, edit files, run tests, open PRs)
- **[PROJECT]** = a Claude Project (conversational: screening, goals, build a plan)
- **[YOU]** = a manual step only you can do (secrets, merges, eyeballing the live site)

Load this file together with `ROADMAP.md` and `docs/ARCHITECTURE.md` into your new
Claude Project / Claude Code session.

---

## Phase A — Personas (the coaches' brains)

- [ ] **[CODE]** Create `coaches/endurance-performance.md` and `coaches/prenatal.md`
      with sections: Role · Screening questions · Goal setting · How to shape a plan ·
      Output format (`plan.json` for a new plan, plan-patch for tweaks) · Guardrails.
- [ ] **[CODE]** In `prenatal.md`, hard-code the safety guardrails (reuse wording from
      the prenatal coach prompt in `app.js`): not medical advice, provider-clearance
      gate, talk-test not pace, warning signs, defer to provider, PR-only.
- [ ] **[PROJECT]** Create **two Claude Projects** ("Endurance Coach", "Prenatal Coach").
      Paste the matching `coaches/*.md` into each Project's custom instructions.
- [ ] **[YOU]** Whenever a persona file changes, re-paste it into the Project (keep the
      repo file as the source of truth).

### Starter screening questions (refine in the Projects)
- **Endurance:** current weekly volume & longest run; recent race times/PBs; goal race,
  date & target time; days/week available; access to gym/bike; injury history; hard-day
  preferences.
- **Prenatal (safety-first):** pregnancy confirmed? due date / trimester; **provider
  cleared to exercise?**; pre-pregnancy activity level; any symptoms/complications;
  comfortable activities; days/week; any provider restrictions.

## Phase B — Plan-building pipeline

- [ ] **[CODE]** Add a **"set full plan"** apply path (extend `apply_plan_patch.py` or a
      new `apply_full_plan.py` + a `workflow_dispatch`) that validates a whole `plan.json`
      and commits it **path-scoped** to one profile, opening a PR. (Initial plans need a
      full replace; the existing patch path only does incremental edits.)
- [ ] **[CODE]** Extend `scripts/test_isolation.py` to cover the full-plan path too.

## Phase C — Build the real initial plans

- [ ] **[PROJECT]** Endurance Coach: run the screening with Callum → output a full
      `plan.json`.
- [ ] **[PROJECT]** Prenatal Coach: run the screening with JJ → output a full `plan.json`
      (only progresses if provider-cleared; otherwise gentle/hold).
- [ ] **[YOU]** Put each plan into the repo via the apply Action (paste) → **merge the PR**.
- [ ] **[CODE]** Verify each dashboard renders the new plan (desktop + mobile).

## Phase D — Design / look & feel

- [ ] **[CODE]** JJ feminine theme: `data-theme="prenatal"` on the root + scoped palette
      in `styles.css` (softer accents, background, radii). Fully isolated from Callum's.
- [ ] **[YOU]** Pick the vibe (e.g. soft rose/plum, warm blush-light, or sage/rose).
- [ ] **[CODE]** Light tweaks to Callum's dashboard as desired (smaller scope).
- [ ] **[CODE]** Re-run responsive checks (no overflow, desktop + mobile) and screenshot.

## Phase E — Garmin data

- [ ] **[YOU]** Mint **JJ's** token (`scripts/garmin_auth.py`) → add secret
      `GARMINTOKENS_JJ`. (Callum's `GARMINTOKENS` already set.)
- [ ] **[YOU]** Actions → *Garmin data sync* → Run workflow → confirm `data/jj/garmin.json`
      goes live.
- [ ] **[YOU]** Confirm **GitHub Pages** is ON (Settings → Pages → Deploy from `main` / root).

## Phase F — Test (end-to-end)

- [ ] **[CODE]** Both dashboards render live data; check-in opens the right coach prompt.
- [ ] **[YOU]** On the live links, do a real check-in → apply a change → merge PR → see the
      dashboard update.
- [ ] **[CODE]** Confirm isolation: a JJ change never touches Callum's files (tests green).

## Phase G — Roll out & iterate

- [ ] **[YOU]** Start using it weekly: open your link, Sunday check-in, merge the PR.
- [ ] **[YOU/PROJECT]** JJ's real prenatal plan once pregnancy confirmed + provider-cleared.
- [ ] **[optional][CODE]** 6b automation: Claude Code in a GitHub Action produces the
      weekly patch unattended (needs a credential secret). Keep PR-review on.
- [ ] **[CODE]** Small UI/feature improvements over time, each as its own PR.

---

### Quick rule of thumb
- Talking, deciding, planning, screening, goal-setting → **Project**.
- Making it real in the app (code, design, files, tests, PRs) → **Claude Code**.
- Secrets, merges, and looking at the live site → **You**.
- The **repo** always holds the truth, so you can switch tools anytime.
