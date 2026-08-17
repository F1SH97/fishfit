#!/usr/bin/env python3
"""Validate and write a WHOLE plan.json for ONE profile (the initial-plan path).

Phase B of the coach loop. Where ``apply_plan_patch.py`` edits an existing plan
incrementally, this replaces a profile's entire ``data/<profile>/plan.json`` in
one shot — the shape a coach produces when building a plan from scratch after
screening. It is the same deterministic, path-scoped, PR-gated contract: a plan
that is malformed, targets an unknown profile, or points outside the profile's
folder is rejected with a non-zero exit and nothing is written.

Two input forms are accepted (both carry the profile id, so the target path is
always computed from that id and can never touch another profile's files):

  1. Envelope (self-contained):
     { "profile": "jj", "plan": { "blockStart": ..., "currentWeek": ..., "weeks": [...] } }

  2. Bare plan + PROFILE env var (what the workflow uses — a profile *choice*
     input plus the pasted plan.json):
     PROFILE=jj  PLAN='{ "blockStart": ..., "currentWeek": ..., "weeks": [...] }'

The plan is read from the ``PLAN`` env var (or stdin) and a ``` ```json ``` fence
is tolerated. The written file is canonicalised (days ordered Mon→Sun, sessions
cleaned) so the PR diff is clean.
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
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
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


def clean_plan(plan) -> dict:
    """Validate a whole plan.json and return a canonicalised copy."""
    if not isinstance(plan, dict):
        fail("plan must be a JSON object")

    block = plan.get("blockStart")
    if not isinstance(block, str) or not DATE_RE.fullmatch(block.strip()):
        fail("plan.blockStart is required and must be a YYYY-MM-DD date")
    block = block.strip()

    weeks = plan.get("weeks")
    if not isinstance(weeks, list) or not weeks:
        fail("plan.weeks must be a non-empty list")

    cur = plan.get("currentWeek")
    if not isinstance(cur, int) or isinstance(cur, bool) or cur < 1 or cur > len(weeks):
        fail(f"plan.currentWeek must be an integer in 1..{len(weeks)}")

    clean_weeks = []
    for i, wk in enumerate(weeks, 1):
        if not isinstance(wk, dict):
            fail(f"week {i} must be an object")
        phase = wk.get("phase")
        if not isinstance(phase, str) or not phase.strip():
            fail(f"week {i}: phase is required (non-empty string)")
        quality = wk.get("quality", "")
        if not isinstance(quality, str):
            fail(f"week {i}: quality must be a string")
        days = wk.get("days")
        if not isinstance(days, dict):
            fail(f"week {i}: days must be an object")
        for day in days:
            if day not in DAYS:
                fail(f"week {i}: invalid day {day!r}")
        clean_days = {}
        for day in DAYS:  # canonical Mon->Sun order
            if day not in days:
                continue
            sessions = days[day]
            if not isinstance(sessions, list):
                fail(f"week {i} {day}: sessions must be a list")
            clean_days[day] = [clean_session(s) for s in sessions]
        clean_weeks.append({"phase": phase, "quality": quality, "days": clean_days})

    out: dict = {"blockStart": block, "currentWeek": cur, "weeks": clean_weeks}
    note = plan.get("_note")
    if isinstance(note, str) and note.strip():
        out = {"_note": note, **out}  # keep a placeholder/disclaimer note up top
    return out


def read_raw() -> str:
    raw = os.getenv("PLAN")
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
    return raw


def resolve_input() -> tuple[str, dict]:
    """Return (profile, plan_dict) from either the envelope or PROFILE+bare-plan form."""
    raw = read_raw()
    try:
        obj = json.loads(raw)
    except Exception as e:  # noqa: BLE001
        fail(f"input is not valid JSON: {e}")
    if not isinstance(obj, dict):
        fail("input must be a JSON object")

    profile_env = (os.getenv("PROFILE") or "").strip()
    if profile_env:
        # Bare plan; profile supplied out-of-band (the workflow's choice input).
        return profile_env, obj
    # Envelope form: { "profile": ..., "plan": {...} }
    profile = obj.get("profile")
    if not isinstance(profile, str):
        fail("no PROFILE env set and input has no string 'profile' field")
    plan = obj.get("plan")
    if not isinstance(plan, dict):
        fail("envelope must carry a 'plan' object (set PROFILE env for a bare plan)")
    return profile, plan


def main() -> int:
    profile, plan_in = resolve_input()

    if profile not in registry_profiles():
        fail(f"unknown profile: {profile!r} (not in data/profiles.json)")
    path = safe_plan_path(profile)

    plan = clean_plan(plan_in)

    path.write_text(json.dumps(plan, indent=2, ensure_ascii=False) + "\n")
    rel = path.relative_to(REPO)
    print(f"Wrote full plan to {rel} (profile {profile}, {len(plan['weeks'])} week(s)).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
