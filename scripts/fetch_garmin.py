#!/usr/bin/env python3
"""Fetch live Garmin Connect metrics and write data/garmin.json for the dashboard.

This is the deployable equivalent of the taxuspt/garmin_mcp server: it reuses the
same underlying `python-garminconnect` library that the MCP is built on, but runs
headless in CI (GitHub Actions) instead of as an interactive MCP server, because a
static GitHub Pages site cannot speak the MCP protocol or reach a local server.

Auth is token-only by design: the GARMINTOKENS env var holds a garth token
string minted once locally by scripts/garmin_auth.py (which handles MFA at that
step). No Garmin email or password is ever read here or stored in CI.

The script is defensive: every metric is fetched in isolation, so a single failing
endpoint never aborts the run. If authentication itself fails it exits non-zero so
the workflow does NOT overwrite a previously good data file.
"""
from __future__ import annotations

import json
import os
import sys
import warnings
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

warnings.filterwarnings("ignore")  # silence garth deprecation noise in CI logs

try:
    from garminconnect import Garmin
except ImportError:  # pragma: no cover
    print("ERROR: garminconnect not installed. Run: pip install -r scripts/requirements.txt", file=sys.stderr)
    sys.exit(2)

OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "garmin.json"
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def log(msg: str) -> None:
    print(f"[garmin-sync] {msg}", file=sys.stderr)


def authenticate() -> Garmin:
    """Return a logged-in Garmin client, or raise. Token-only — no password path."""
    tokens = os.getenv("GARMINTOKENS")
    if tokens and len(tokens.strip()) > 512:
        log("Authenticating with stored garth tokens (GARMINTOKENS).")
        api = Garmin()
        api.login(tokens.strip())
        return api

    raise SystemExit(
        "No GARMINTOKENS found. Mint one locally with scripts/garmin_auth.py and "
        "store it as the GARMINTOKENS secret. (Email/password auth is intentionally "
        "not supported here so no credentials are stored in GitHub.)"
    )


def safe(fn, *args, default=None, label=""):
    """Call an API method, swallowing any error and logging it."""
    try:
        return fn(*args)
    except Exception as e:  # noqa: BLE001 - one bad endpoint must not kill the run
        log(f"skip {label or getattr(fn, '__name__', 'call')}: {e}")
        return default


def first_num(d, *keys):
    """Return the first present, non-null numeric value among nested keys."""
    if not isinstance(d, dict):
        return None
    for k in keys:
        v = d.get(k)
        if isinstance(v, (int, float)):
            return v
    return None


def fmt_time(sec):
    """Format seconds as h:mm:ss (>= 1h) or m:ss, matching how Garmin shows times."""
    sec = int(round(sec))
    h, m, s = sec // 3600, (sec % 3600) // 60, sec % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def fetch(api: Garmin) -> dict:
    today = date.today()
    iso = today.isoformat()
    metrics: dict[str, str] = {}
    scores: dict[str, float] = {}

    # ---- VO2 max ---------------------------------------------------------
    mm = safe(api.get_max_metrics, iso, label="max_metrics")
    if isinstance(mm, list) and mm:
        mm = mm[0]
    if isinstance(mm, dict):
        gm = mm.get("generic") or {}
        vo2 = first_num(gm, "vo2MaxPreciseValue", "vo2MaxValue")
        if vo2:
            metrics["vo2"] = f"{round(vo2, 1)}"

    # ---- Training status: VO2 + acute load -------------------------------
    ts = safe(api.get_training_status, iso, label="training_status")
    if isinstance(ts, dict):
        latest = ts.get("mostRecentVO2Max") or {}
        generic = (latest.get("generic") or {}) if isinstance(latest, dict) else {}
        vo2 = first_num(generic, "vo2MaxPreciseValue", "vo2MaxValue")
        if vo2 and "vo2" not in metrics:
            metrics["vo2"] = f"{round(vo2, 1)}"
        load_block = ts.get("mostRecentTrainingLoadBalance") or {}
        acute = None
        if isinstance(load_block, dict):
            for prof in (load_block.get("metricsTrainingLoadBalanceDTOMap") or {}).values():
                acute = first_num(prof, "acuteTrainingLoad")
                if acute:
                    break
        if acute:
            metrics["load"] = f"{round(acute)}"

    # ---- HRV -------------------------------------------------------------
    hrv = safe(api.get_hrv_data, iso, label="hrv")
    if isinstance(hrv, dict):
        summ = hrv.get("hrvSummary") or {}
        v = first_num(summ, "lastNightAvg", "weeklyAvg")
        if v:
            metrics["hrv"] = f"{round(v)}"

    # ---- Sleep score -----------------------------------------------------
    sleep = safe(api.get_sleep_data, iso, label="sleep")
    if isinstance(sleep, dict):
        dto = sleep.get("dailySleepDTO") or {}
        scores_obj = dto.get("sleepScores") or {}
        overall = scores_obj.get("overall") or {}
        v = first_num(overall, "value")
        if v:
            metrics["sleep"] = f"{round(v)}"

    # ---- Resting HR ------------------------------------------------------
    rhr = safe(api.get_rhr_day, iso, label="rhr")
    if isinstance(rhr, dict):
        allm = rhr.get("allMetrics", {}).get("metricsMap", {}) if isinstance(rhr.get("allMetrics"), dict) else {}
        series = allm.get("WELLNESS_RESTING_HEART_RATE") or []
        if series and isinstance(series, list):
            v = first_num(series[0], "value")
            if v:
                metrics["rhr"] = f"{round(v)}"

    # ---- Body Battery + weight (daily stats) -----------------------------
    stats = safe(api.get_stats_and_body, iso, label="stats_and_body")
    if isinstance(stats, dict):
        bb = first_num(stats, "bodyBatteryMostRecentValue", "bodyBatteryHighestValue")
        if bb:
            metrics["battery"] = f"{round(bb)}"
        wt = first_num(stats, "weight")  # grams
        if wt:
            metrics["weight"] = f"{round(wt / 1000, 1)}"
        rhr_v = first_num(stats, "restingHeartRate")
        if rhr_v and "rhr" not in metrics:
            metrics["rhr"] = f"{round(rhr_v)}"

    # ---- Training readiness score ---------------------------------------
    tr = safe(api.get_training_readiness, iso, label="training_readiness")
    if isinstance(tr, list) and tr:
        tr = tr[0]
    if isinstance(tr, dict):
        v = first_num(tr, "score")
        if v:
            scores["readiness"] = round(v)

    # ---- Race predictions (Garmin's projected finish times) --------------
    predictions: dict[str, object] = {}
    rp = safe(api.get_race_predictions, label="race_predictions")
    if isinstance(rp, list) and rp:
        rp = rp[-1]
    if isinstance(rp, dict):
        k10 = first_num(rp, "raceTime10K", "time10K", "raceTime10k")
        k5 = first_num(rp, "raceTime5K", "time5K", "raceTime5k")
        if k10 and 900 < k10 < 12000:
            predictions["k10"] = round(k10)
            predictions["band"] = [round(k10 * 0.975), round(k10 * 1.025)]
        if k5 and 600 < k5 < 6000:
            predictions["k5"] = round(k5)

    # ---- Personal records: 5 km / 10 km bests ----------------------------
    # Garmin personal-record typeIds: 3 = 5 km, 4 = 10 km; value is time in seconds.
    pr = safe(api.get_personal_record, label="personal_record")
    if isinstance(pr, list):
        for rec in pr:
            if not isinstance(rec, dict):
                continue
            tid = rec.get("typeId")
            val = first_num(rec, "value")
            if not val:
                continue
            if tid == 3 and 600 <= val <= 3600:
                metrics["pb5"] = fmt_time(val)
            elif tid == 4 and 1200 <= val <= 7200:
                metrics["pb10"] = fmt_time(val)

    # ---- Recent running activities --------------------------------------
    runs = []
    weekly_km = 0.0
    weekly_sec = 0.0
    acts = safe(api.get_activities, 0, 20, label="activities", default=[]) or []
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    for a in acts if isinstance(acts, list) else []:
        try:
            atype = ((a.get("activityType") or {}).get("typeKey") or "").lower()
            if "running" not in atype and atype not in ("track_running", "trail_running", "treadmill_running"):
                continue
            dist_m = a.get("distance") or 0
            dur_s = a.get("duration") or 0
            dist_km = round(dist_m / 1000, 1)
            start = a.get("startTimeGMT") or a.get("startTimeLocal") or ""
            dt = None
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S"):
                try:
                    dt = datetime.strptime(start, fmt)
                    break
                except ValueError:
                    continue
            # weekly rollup
            if dt and dt.replace(tzinfo=timezone.utc) >= week_ago:
                weekly_km += dist_m / 1000
                weekly_sec += dur_s
            if len(runs) < 5 and dist_km > 0:
                pace_sec = round(dur_s / dist_km) if dist_km else 0
                label = f"{DAYS[dt.weekday()]} {dt.day} {MON[dt.month - 1]}" if dt else ""
                runs.append({
                    "date": label,
                    "type": (a.get("activityName") or "Run")[:24],
                    "dist": dist_km,
                    "paceSec": pace_sec,
                    "hr": round(a.get("averageHR") or 0) or None,
                    "tag": "",
                })
        except Exception as e:  # noqa: BLE001
            log(f"skip activity: {e}")

    if weekly_km > 0:
        metrics["wdist"] = f"{round(weekly_km)}"

    out = {
        "live": True,
        "syncedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "Garmin Connect",
        "metrics": metrics,
        "scores": scores,
        "predictions": predictions,
        "runs": runs,
    }
    return out


def main() -> int:
    try:
        api = authenticate()
    except SystemExit as e:
        log(str(e))
        return 1
    except Exception as e:  # noqa: BLE001
        log(f"Authentication failed: {e}")
        return 1

    data = fetch(api)
    n = len(data["metrics"]) + len(data["scores"]) + len(data["runs"]) + len(data["predictions"])
    if n == 0:
        log("Authenticated but fetched zero data points; leaving existing file untouched.")
        return 1

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(data, indent=2) + "\n")
    log(f"Wrote {OUT_PATH} ({len(data['metrics'])} metrics, "
        f"{len(data['scores'])} scores, {len(data['runs'])} runs).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
