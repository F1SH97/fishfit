# PerformanceOS

A personal endurance dashboard (static HTML/CSS/JS, no build step), deployed via
GitHub Pages. It ships with demo fixtures and can display **live Garmin Connect
data** through a scheduled sync.

## Files

| File | Purpose |
|------|---------|
| `index.html`, `styles.css`, `app.js` | The dashboard (responsive: desktop + mobile). |
| `data/profiles.json` | Profile registry: who exists, display name, coach persona. |
| `data/<profile>/garmin.json` | Live Garmin data per profile (`cjf`, `jj`). `live:false` = demo fixtures. |
| `data/<profile>/profile.json` | Per-profile goals / persona state. |
| `scripts/fetch_garmin.py` | Headless fetch of Garmin metrics → `data/<PROFILE>/garmin.json`. |
| `scripts/garmin_auth.py` | One-time local login to mint a CI token. |
| `.github/workflows/garmin-sync.yml` | Scheduled job that runs the fetch and commits the data. |

Each person is a **profile** with its own `data/<profile>/` folder. The dashboard
picks a profile from the URL — `?u=cjf` (default) or `?u=jj` — and reads only that
profile's folder. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design.

## How the Garmin integration works

A static site (and a phone browser) can't talk to the [taxuspt/garmin_mcp](https://github.com/taxuspt/garmin_mcp)
server directly — MCP is a local stdio/SSE protocol for desktop AI clients, and
GitHub Pages can't run a server. So instead of calling the MCP live, this repo
reuses the **same library the MCP is built on** (`python-garminconnect`) inside a
GitHub Action: it fetches your metrics on a schedule, commits `data/garmin.json`,
and the dashboard loads that file. Same data, deployable on Pages, works on mobile.

If any sync fails or no token is set, the dashboard silently falls back to the
built-in demo fixtures, so the site never breaks.

## Enable live data (one-time)

1. **Mint a token locally** (never in CI, never commit it):
   ```bash
   pip install -r scripts/requirements.txt
   python scripts/garmin_auth.py        # enter email, password, MFA code
   ```
   Copy the long token string it prints.

2. **Add it as a repo secret:** Settings → Secrets and variables → Actions →
   *New repository secret*. Name: `GARMINTOKENS`, value: the token string.

3. **Run the sync:** Actions tab → *Garmin data sync* → *Run workflow* (it also
   runs daily at 06:15 UTC). It commits `data/garmin.json`, Pages redeploys, and
   the dashboard header switches to a green **Live** badge.

> Auth is **token-only**: your Garmin email/password are entered locally by
> `garmin_auth.py` to mint the token and are never stored in or referenced by
> GitHub. Tokens last ~1 year; re-run step 1 to refresh.

## ⚠️ Privacy note

If this repo is **public**, `data/garmin.json` (your health metrics) is publicly
readable, and so is anything on the Pages URL. Keep the repo **private**, or only
sync coarse metrics, if that matters to you. See the PR description for details.
