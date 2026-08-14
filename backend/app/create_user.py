"""Create or update a reviewer account.

    uv run python -m app.create_user alice
    uv run python -m app.create_user alice --password 'chosen-password'
    uv run python -m app.create_user alice --name 'Alice Rahman'

With no --password, a strong one is generated and printed once. There is no
self-registration endpoint: accounts for a console that approves fundraising
campaigns are created deliberately, not opted into.
"""

from __future__ import annotations

import argparse
import secrets
import sys

from dotenv import load_dotenv

load_dotenv()
load_dotenv(dotenv_path="../.env")

from . import auth, db  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("username")
    ap.add_argument("--password", help="omit to generate a strong one")
    ap.add_argument("--name", default="", help="display name shown in the console")
    args = ap.parse_args()

    db.migrate()

    password = args.password or secrets.token_urlsafe(12)
    auth.create_user(args.username, password, args.name)

    print(f"\nuser:     {args.username.strip().lower()}")
    if args.password:
        print("password: (the one you supplied)")
    else:
        print(f"password: {password}")
        print("\nThis is shown once and only the hash is stored. Save it now.")
    print(f"\n{auth.user_count()} account(s) exist.")
    db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
