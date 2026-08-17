"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { login } from "@/lib/api";
import { INTRO_PENDING_KEY } from "@/components/Shell";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      sessionStorage.setItem(INTRO_PENDING_KEY, "1");
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-57px)] items-center justify-center px-6">
      <form
        onSubmit={submit}
        className="bg-panel border-line w-full max-w-[380px] rounded-xl border px-7 py-7"
      >
        <div className="mb-1 flex items-baseline gap-2">
          <span className="bg-brand inline-block h-2.5 w-2.5 rounded-sm" />
          <h1 className="text-[17px] font-semibold tracking-tight">
            Reviewer sign in
          </h1>
        </div>
        <p className="text-muted mb-6 text-[13px] leading-relaxed">
          This console approves and rejects live fundraising campaigns. Accounts
          are created by an administrator; there is no self-registration.
        </p>

        <label className="text-muted mb-1.5 block text-[11px] font-semibold tracking-[0.06em] uppercase">
          Username
        </label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          className="border-line focus:border-brand mb-4 w-full rounded-lg border px-3.5 py-2.5 text-[14px] outline-none"
        />

        <label className="text-muted mb-1.5 block text-[11px] font-semibold tracking-[0.06em] uppercase">
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="border-line focus:border-brand mb-5 w-full rounded-lg border px-3.5 py-2.5 text-[14px] outline-none"
        />

        {error ? (
          <p className="bg-high-tint text-high mb-4 rounded-lg px-3 py-2.5 text-[13px]">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy || !username || !password}
          className="bg-brand hover:bg-brand-deep w-full rounded-full py-2.5 text-[14px] font-semibold text-white transition-colors disabled:opacity-40"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
