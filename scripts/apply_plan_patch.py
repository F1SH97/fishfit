#!/usr/bin/env python3
"""Apply a coach's structured plan-patch to ONE profile's plan.json.

This is the deterministic, path-scoped backbone of the coach loop: it takes a
validated JSON patch (produced by the weekly check-in) and edits only
data/<profile>/plan.json — it can never touch another profile's files. A patch
that is malformed, targets an unknown profile, or points outside the profile's
folder is rejected with a non-zero exit and nothing is written.

Patch shape:
{
  "profile": "cjf",
  "week": 8,
  "coachNote": "Easing Wednesday off the calf niggle.",
  "changes": [
    { "day": "Wed", "op": "replace", "index": 1,
      "session": {"kind":"easy","title":"Easy 40'","target":"Conversational","comp":"none"} },
    { "day": "Sat", "op": "add",
      "session": {"kind":"mobility","title":"Mobility 20'","target":"Gentle","comp":"none"} },
    { "day": "Tue", "op": "remove", "index": 0 }
  ]
}
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DATA = (REPO / "data").resolve()
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
PROFILE_RE = re.compile(r"[a-z0-9_-]{1,32}")
SESSION_KEYS = ("kind", "title", "target", "comp", "keystone")


def fail(msg: str) -> "NoReturn":  # type: ignore[valid-type]
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def registry_profiles() -> set[str]:
    try:
        reg = json.loads((DATA / "profiles.json").read_text())
        return set((reg.get("profiles") or {}).keys())
    except Exception as e:  # noqa: BLE001
        fail(f"cannot read data/profiles.json: {e}")


def safe_plan_path(profile: str) -> Path:
    """Resolve data/<profile>/plan.json, refusing anything that escapes the folder."""
    if not PROFILE_RE.fullmatch(profile):
        fail(f"invalid profile id: {profile!r}")
    base = (DATA / profile).resolve()
    if base.parent != DATA:
        fail("profile path escapes data/")
    plan = (base / "plan.json").resolve()
    if os.path.commonpath([str(plan), str(base)]) != str(base):
        fail("plan path escapes the profile folder")
    return plan


def clean_session(s) -> dict:
    if not isinstance(s, dict):
        fail("session must be an object")
    title = s.get("title")
    if not isinstance(title, str) or not title.strip():
        fail("session.title is required")
    for k in ("kind", "target", "comp"):
        if k in s and not isinstance(s[k], str):
            fail(f"session.{k} must be a string")
    out = {k: s[k] for k in SESSION_KEYS if k in s}
    out.setdefault("comp", "none")
    out.setdefault("kind", "easy")
    out.setdefault("target", "")
    if "keystone" in out:
        out["keystone"] = bool(out["keystone"])
    return out


def read_patch() -> dict:
    raw = os.getenv("PATCH")
    if not raw:
        raw = sys.stdin.read()
    raw = raw.strip()
    # tolerate a pasted ```json fenced block
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.lstrip().lower().startswith("json"):
            raw = raw.lstrip()[4:]
        raw = raw.strip()
    try:
        return json.loads(raw)
    except Exception as e:  # noqa: BLE001
        fail(f"patch is not valid JSON: {e}")


def main() -> int:
    patch = read_patch()
    if not isinstance(patch, dict):
        fail("patch must be a JSON object")

    profile = patch.get("profile")
    if not isinstance(profile, str):
        fail("patch.profile is required")
    if profile not in registry_profiles():
        fail(f"unknown profile: {profile!r} (not in data/profiles.json)")

    path = safe_plan_path(profile)
    if not path.exists():
        fail(f"no plan.json for profile {profile!r}")
    plan = json.loads(path.read_text())
    weeks = plan.get("weeks")
    if not isinstance(weeks, list) or not weeks:
        fail("plan has no weeks")

    week = patch.get("week")
    if not isinstance(week, int) or isinstance(week, bool) or week < 1 or week > len(weeks):
        fail(f"week must be an integer in 1..{len(weeks)}")

    changes = patch.get("changes", [])
    if not isinstance(changes, list):
        fail("changes must be a list")

    days = weeks[week - 1].setdefault("days", {})
    applied = 0
    for ch in changes:
        if not isinstance(ch, dict):
            fail("each change must be an object")
        day = ch.get("day")
        if day not in DAYS:
            fail(f"invalid day: {day!r}")
        op = ch.get("op", "replace")
        daylist = days.setdefault(day, [])
        if op == "add":
            daylist.append(clean_session(ch.get("session")))
        elif op == "remove":
            idx = ch.get("index")
            if not isinstance(idx, int) or isinstance(idx, bool) or idx < 0 or idx >= len(daylist):
                fail(f"remove index out of range for {day}")
            daylist.pop(idx)
        elif op == "replace":
            idx = ch.get("index", 0)
            if not isinstance(idx, int) or isinstance(idx, bool) or idx < 0 or idx >= len(daylist):
                fail(f"replace index out of range for {day}")
            daylist[idx] = clean_session(ch.get("session"))
        else:
            fail(f"unknown op: {op!r}")
        applied += 1

    if applied == 0:
        print("No changes in patch — nothing to apply.")
        return 0

    path.write_text(json.dumps(plan, indent=2) + "\n")
    rel = path.relative_to(REPO)
    print(f"Applied {applied} change(s) to {rel} (profile {profile}, week {week}).")
    note = patch.get("coachNote")
    if isinstance(note, str) and note.strip():
        print(f"Coach note: {note.strip()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
