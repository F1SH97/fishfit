#!/usr/bin/env python3
"""One-time local login to mint a Garmin token string for CI.

Run this ONCE on your own machine (never in CI, never commit the output):

    pip install -r scripts/requirements.txt
    python scripts/garmin_auth.py

You'll be prompted for your Garmin email, password and (if enabled) an MFA code.
On success it prints a long token string. Copy it and save it as a GitHub Actions
secret named GARMINTOKENS:

    Repo -> Settings -> Secrets and variables -> Actions -> New repository secret
    Name:  GARMINTOKENS
    Value: <the printed string>

The token lets the sync workflow read your data without ever storing your password
in GitHub. Tokens expire after roughly a year (or when you change your password);
re-run this to refresh. Treat the string like a password — it grants full access to
your Garmin account.
"""
from __future__ import annotations

import getpass
import sys
import warnings

warnings.filterwarnings("ignore")

try:
    from garminconnect import Garmin
except ImportError:
    sys.exit("garminconnect not installed. Run: pip install -r scripts/requirements.txt")


def main() -> int:
    email = input("Garmin email: ").strip()
    password = getpass.getpass("Garmin password: ")

    api = Garmin(email, password, prompt_mfa=lambda: input("MFA code: ").strip())
    print("Logging in to Garmin Connect…", file=sys.stderr)
    api.login()

    token = api.client.dumps()
    print("\n===== GARMINTOKENS (save as a GitHub Actions secret) =====\n")
    print(token)
    print("\n===== end — do not share or commit this =====", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
