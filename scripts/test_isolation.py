#!/usr/bin/env python3
"""Isolation + validation tests for the coach plan pipeline.

Covers BOTH apply paths — the incremental plan-patch (Phase 6a) and the
full-plan replace (Phase B) — and proves that:
  * a change for one profile edits ONLY that profile's plan.json,
  * a JJ change never touches cjf files (and vice-versa),
  * malformed / out-of-range / path-escaping inputs are rejected with no writes.

Runs apply_plan_patch.py and apply_full_plan.py as subprocesses (exactly as CI
does), snapshotting and restoring the real plan files around each case so the
repo is left untouched.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DATA = REPO / "data"
APPLY = REPO / "scripts" / "apply_plan_patch.py"
APPLY_FULL = REPO / "scripts" / "apply_full_plan.py"
PROFILES = ["cjf", "jj"]

# A minimal, valid full plan used by the full-plan (Phase B) tests.
VALID_PLAN = {
    "blockStart": "2026-09-07",
    "currentWeek": 1,
    "weeks": [
        {"phase": "Base", "quality": "Easy movement", "days": {
            "Mon": [{"kind": "easy", "title": "FULLPLAN test walk", "target": "Conversational", "comp": "none"}],
            "Sun": [{"kind": "rest", "title": "Rest", "target": "Recovery", "comp": "none"}],
        }},
    ],
}

failures: list[str] = []


def snapshot() -> dict[str, str]:
    return {p: (DATA / p / "plan.json").read_text() for p in PROFILES}


def restore(snap: dict[str, str]) -> None:
    for p, txt in snap.items():
        (DATA / p / "plan.json").write_text(txt)


def run(patch: dict | str) -> subprocess.CompletedProcess:
    raw = patch if isinstance(patch, str) else json.dumps(patch)
    return subprocess.run(
        [sys.executable, str(APPLY)],
        env={"PATCH": raw, "PATH": __import__("os").environ.get("PATH", "")},
        capture_output=True, text=True,
    )


def run_full(plan: dict | str, profile: str | None = None) -> subprocess.CompletedProcess:
    """Run apply_full_plan.py. If `profile` is given, pass it via the PROFILE env
    (bare-plan form, as the workflow does); otherwise `plan` is the envelope."""
    raw = plan if isinstance(plan, str) else json.dumps(plan)
    env = {"PLAN": raw, "PATH": __import__("os").environ.get("PATH", "")}
    if profile is not None:
        env["PROFILE"] = profile
    return subprocess.run(
        [sys.executable, str(APPLY_FULL)],
        env=env, capture_output=True, text=True,
    )


def check(name: str, cond: bool, detail: str = "") -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f" — {detail}" if not cond and detail else ""))
    if not cond:
        failures.append(name)


def changed_profiles(before: dict[str, str]) -> set[str]:
    now = snapshot()
    return {p for p in PROFILES if now[p] != before[p]}


def main() -> int:
    snap = snapshot()
    try:
        # 1. A valid cjf patch edits ONLY cjf
        before = snapshot()
        r = run({"profile": "cjf", "week": 8, "coachNote": "test",
                 "changes": [{"day": "Wed", "op": "replace", "index": 1,
                              "session": {"kind": "easy", "title": "TEST easy 40'", "target": "Conversational", "comp": "none"}}]})
        ch = changed_profiles(before)
        check("valid cjf patch succeeds", r.returncode == 0, r.stderr)
        check("cjf patch changes ONLY cjf", ch == {"cjf"}, f"changed={ch}")
        check("cjf patch actually wrote the session", "TEST easy 40'" in (DATA / "cjf" / "plan.json").read_text())
        restore(snap)

        # 2. A valid jj patch edits ONLY jj (never cjf)
        before = snapshot()
        r = run({"profile": "jj", "week": 1,
                 "changes": [{"day": "Thu", "op": "replace", "index": 0,
                              "session": {"kind": "easy", "title": "JJ gentle walk", "target": "Easy", "comp": "none"}}]})
        ch = changed_profiles(before)
        check("valid jj patch succeeds", r.returncode == 0, r.stderr)
        check("jj patch changes ONLY jj (cjf untouched)", ch == {"jj"}, f"changed={ch}")
        restore(snap)

        # 3. Rejections — each must exit non-zero AND change nothing
        bad_cases = {
            "unknown profile": {"profile": "ghost", "week": 1, "changes": []},
            "path-escape profile": {"profile": "../cjf", "week": 1, "changes": []},
            "week out of range": {"profile": "cjf", "week": 999, "changes": [{"day": "Mon", "op": "remove", "index": 0}]},
            "invalid day": {"profile": "cjf", "week": 1, "changes": [{"day": "Funday", "op": "remove", "index": 0}]},
            "replace index OOB": {"profile": "cjf", "week": 1, "changes": [{"day": "Mon", "op": "replace", "index": 99, "session": {"title": "x"}}]},
            "session missing title": {"profile": "cjf", "week": 1, "changes": [{"day": "Mon", "op": "add", "session": {"kind": "easy"}}]},
            "not json": "this is not json",
            "unknown op": {"profile": "cjf", "week": 1, "changes": [{"day": "Mon", "op": "nuke", "index": 0}]},
        }
        for name, patch in bad_cases.items():
            before = snapshot()
            r = run(patch)
            ch = changed_profiles(before)
            check(f"reject: {name}", r.returncode != 0 and ch == set(), f"rc={r.returncode} changed={ch}")
            restore(snap)

        # 4. Fenced ```json block is tolerated
        before = snapshot()
        fenced = "```json\n" + json.dumps({"profile": "cjf", "week": 2,
                 "changes": [{"day": "Sun", "op": "replace", "index": 0,
                              "session": {"kind": "rest", "title": "Rest (fenced test)", "target": "Recovery", "comp": "none"}}]}) + "\n```"
        r = run(fenced)
        check("fenced ```json block accepted", r.returncode == 0 and changed_profiles(before) == {"cjf"}, r.stderr)
        restore(snap)

        # ---- Full-plan replace path (Phase B) ----
        print("  -- full-plan path --")

        # 5. A valid cjf full plan (envelope form) replaces ONLY cjf
        before = snapshot()
        r = run_full({"profile": "cjf", "plan": VALID_PLAN})
        ch = changed_profiles(before)
        check("valid cjf full plan succeeds", r.returncode == 0, r.stderr)
        check("cjf full plan changes ONLY cjf", ch == {"cjf"}, f"changed={ch}")
        check("cjf full plan actually wrote the plan", "FULLPLAN test walk" in (DATA / "cjf" / "plan.json").read_text())
        restore(snap)

        # 6. A valid jj full plan (bare plan + PROFILE env, as the workflow runs it)
        #    edits ONLY jj — never cjf
        before = snapshot()
        r = run_full(VALID_PLAN, profile="jj")
        ch = changed_profiles(before)
        check("valid jj full plan (PROFILE env) succeeds", r.returncode == 0, r.stderr)
        check("jj full plan changes ONLY jj (cjf untouched)", ch == {"jj"}, f"changed={ch}")
        restore(snap)

        # 7. Rejections — each must exit non-zero AND change nothing
        good_days = {"Mon": [{"kind": "easy", "title": "ok", "target": "x", "comp": "none"}]}
        full_bad = {
            "unknown profile": ({"profile": "ghost", "plan": VALID_PLAN}, None),
            "path-escape profile (env)": (VALID_PLAN, "../cjf"),
            "no profile anywhere": (VALID_PLAN, None),
            "envelope missing plan": ({"profile": "cjf"}, None),
            "empty weeks": ({"profile": "cjf", "plan": {"blockStart": "2026-09-07", "currentWeek": 1, "weeks": []}}, None),
            "currentWeek out of range": ({"profile": "cjf", "plan": {"blockStart": "2026-09-07", "currentWeek": 9, "weeks": [{"phase": "Base", "quality": "x", "days": good_days}]}}, None),
            "bad blockStart": ({"profile": "cjf", "plan": {"blockStart": "next week", "currentWeek": 1, "weeks": [{"phase": "Base", "quality": "x", "days": good_days}]}}, None),
            "invalid day key": ({"profile": "cjf", "plan": {"blockStart": "2026-09-07", "currentWeek": 1, "weeks": [{"phase": "Base", "quality": "x", "days": {"Funday": []}}]}}, None),
            "session missing title": ({"profile": "cjf", "plan": {"blockStart": "2026-09-07", "currentWeek": 1, "weeks": [{"phase": "Base", "quality": "x", "days": {"Mon": [{"kind": "easy"}]}}]}}, None),
            "week missing phase": ({"profile": "cjf", "plan": {"blockStart": "2026-09-07", "currentWeek": 1, "weeks": [{"quality": "x", "days": good_days}]}}, None),
            "not json": ("this is not json", None),
        }
        for name, (payload, prof) in full_bad.items():
            before = snapshot()
            r = run_full(payload, profile=prof)
            ch = changed_profiles(before)
            check(f"reject full-plan: {name}", r.returncode != 0 and ch == set(), f"rc={r.returncode} changed={ch}")
            restore(snap)

        # 8. Fenced ```json full plan is tolerated
        before = snapshot()
        fenced = "```json\n" + json.dumps({"profile": "jj", "plan": VALID_PLAN}) + "\n```"
        r = run_full(fenced)
        check("fenced ```json full plan accepted", r.returncode == 0 and changed_profiles(before) == {"jj"}, r.stderr)
        restore(snap)

    finally:
        restore(snap)

    print()
    if failures:
        print(f"FAILED: {len(failures)} case(s): {failures}")
        return 1
    print("ALL ISOLATION TESTS PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
