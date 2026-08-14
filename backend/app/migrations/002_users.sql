-- Reviewer accounts.
--
-- No self-registration by design: this is an internal trust & safety console, and the
-- set of people allowed to approve campaigns is not something a stranger opts into.
-- Accounts are created out of band with `python -m app.create_user`.

CREATE TABLE IF NOT EXISTS users (
    username      TEXT PRIMARY KEY,
    -- scrypt, with a per-user salt. Stored as algorithm$n$r$p$salt$hash so the
    -- parameters travel with the hash and can be raised later without invalidating
    -- existing rows.
    password_hash TEXT        NOT NULL,
    display_name  TEXT        NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);
