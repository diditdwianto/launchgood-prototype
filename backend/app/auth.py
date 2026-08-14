"""Username/password auth for the reviewer console.

Deliberately small: stdlib only, no auth framework, no self-registration. The console
approves and rejects fundraising campaigns, so the set of people who can reach it is
not something a stranger should be able to join. Accounts are created out of band
with `python -m app.create_user`.

Passwords are hashed with scrypt (stdlib `hashlib`), salted per user, and the
parameters are stored alongside the hash so they can be raised later without
invalidating existing rows. Comparison is constant-time.

Sessions are stateless signed tokens rather than cookies, because the frontend and
backend are deployed on different origins and cross-site cookies are a fight not worth
having for a prototype. Known tradeoff: the token lives in the browser, so it is
readable by any script running on the page. Acceptable here — see ASSUMPTIONS.md.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time

from fastapi import Header, HTTPException

from . import db

logger = logging.getLogger(__name__)

SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
TOKEN_TTL_SECONDS = 12 * 60 * 60

_fallback_secret: str | None = None


def _secret() -> str:
    """Signing key. Generated per process if unset, which is fine locally and wrong in
    production — so it warns, loudly, once."""
    global _fallback_secret
    configured = os.environ.get("auth_secret")
    if configured:
        return configured
    if _fallback_secret is None:
        _fallback_secret = secrets.token_urlsafe(32)
        logger.warning(
            "auth_secret is not set; generated an ephemeral one. Sessions will be "
            "invalidated on restart and will not work across multiple instances. "
            "Set auth_secret in production."
        )
    return _fallback_secret


# ------------------------------------------------------------------- passwords


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=32
    )
    return "$".join(
        [
            "scrypt",
            str(SCRYPT_N),
            str(SCRYPT_R),
            str(SCRYPT_P),
            base64.b64encode(salt).decode(),
            base64.b64encode(digest).decode(),
        ]
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, n, r, p, salt_b64, hash_b64 = stored.split("$")
        if algorithm != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode(),
            salt=base64.b64decode(salt_b64),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(base64.b64decode(hash_b64)),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest, base64.b64decode(hash_b64))


# ---------------------------------------------------------------------- tokens


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64url(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def issue_token(username: str) -> str:
    payload = _b64url(
        json.dumps({"sub": username, "exp": int(time.time()) + TOKEN_TTL_SECONDS}).encode()
    )
    signature = hmac.new(_secret().encode(), payload.encode(), hashlib.sha256).digest()
    return f"{payload}.{_b64url(signature)}"


def read_token(token: str) -> str | None:
    """Returns the username, or None if the token is forged, malformed, or expired."""
    try:
        payload, signature = token.split(".")
    except ValueError:
        return None

    expected = hmac.new(_secret().encode(), payload.encode(), hashlib.sha256).digest()
    # Constant-time: a fast reject on the first differing byte leaks signature bytes.
    if not hmac.compare_digest(expected, _unb64url(signature)):
        return None

    try:
        claims = json.loads(_unb64url(payload))
    except (ValueError, json.JSONDecodeError):
        return None

    if claims.get("exp", 0) < time.time():
        return None
    return claims.get("sub")


# ----------------------------------------------------------------------- users


def authenticate(username: str, password: str) -> dict | None:
    with db.connect() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username = %s", (username.strip().lower(),)
        ).fetchone()

    # Hash even when the user does not exist, so a missing account and a wrong
    # password take the same time and cannot be told apart by timing.
    stored = row["password_hash"] if row else hash_password("_")
    ok = verify_password(password, stored)
    if not row or not ok:
        return None

    with db.connect() as conn:
        conn.execute(
            "UPDATE users SET last_login_at = now() WHERE username = %s", (row["username"],)
        )
    return {"username": row["username"], "display_name": row["display_name"]}


def create_user(username: str, password: str, display_name: str = "") -> None:
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO users (username, password_hash, display_name) VALUES (%s, %s, %s)"
            " ON CONFLICT (username) DO UPDATE SET"
            "   password_hash = EXCLUDED.password_hash,"
            "   display_name = EXCLUDED.display_name",
            (username.strip().lower(), hash_password(password), display_name),
        )


def user_count() -> int:
    with db.connect() as conn:
        return conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]


# ------------------------------------------------------------------ dependency


def current_user(authorization: str = Header(default="")) -> str:
    prefix = "bearer "
    if not authorization.lower().startswith(prefix):
        raise HTTPException(status_code=401, detail="not authenticated")
    username = read_token(authorization[len(prefix) :].strip())
    if username is None:
        raise HTTPException(status_code=401, detail="invalid or expired session")
    return username
