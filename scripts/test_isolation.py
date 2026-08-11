#!/usr/bin/env python3
"""Isolation + validation tests for the coach plan-patch pipeline.

Proves that:
  * a patch for one profile edits ONLY that profile's plan.json,
  * a JJ patch never touches cjf files (and vice-versa),
  * malformed / out-of-range / path-escaping patches are rejected with no writes.

Runs apply_plan_patch.py as a subprocess (exactly as CI does), snapshotting and
restoring the real plan files around each case so the repo is left untouched.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DATA = REPO / "data"
APPLY = REPO / "scripts" / "apply_plan_patch.py"
PROFILES = ["cjf", "jj"]

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
