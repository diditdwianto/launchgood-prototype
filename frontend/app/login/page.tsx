"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { checkHealth, login } from "@/lib/api";
import { INTRO_PENDING_KEY } from "@/components/Shell";

const RETRY_SECONDS = 30;

type BackendStatus = "checking" | "ready" | "down";

function HourglassIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M5 22h14" />
      <path d="M5 2h14" />
      <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
      <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const [retryIn, setRetryIn] = useState(RETRY_SECONDS);
  const [retryTrigger, setRetryTrigger] = useState(0);

  // Probe the backend on mount, and again each time the countdown effect
  // below bumps retryTrigger after a failed attempt.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBackendStatus("checking");
      const ok = await checkHealth();
      if (cancelled) return;
      setBackendStatus(ok ? "ready" : "down");
      setRetryIn(RETRY_SECONDS);
    })();
    return () => {
      cancelled = true;
    };
  }, [retryTrigger]);

  // Ticks the retry countdown while the backend is down, then triggers a re-probe.
  useEffect(() => {
    if (backendStatus !== "down") return;
    if (retryIn <= 0) {
      setRetryTrigger((n) => n + 1);
      return;
    }
    const timer = setTimeout(() => setRetryIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [backendStatus, retryIn]);

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
    <div className="flex min-h-[calc(100vh-57px)] flex-col items-center justify-center gap-5 px-6">
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
          disabled={busy || !username || !password || backendStatus !== "ready"}
          className="bg-brand hover:bg-brand-deep w-full rounded-full py-2.5 text-[14px] font-semibold text-white transition-colors disabled:opacity-40"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {backendStatus !== "ready" ? (
        <div
          className={`border-line w-full max-w-[380px] rounded-xl border px-7 py-6 text-center ${
            backendStatus === "down" ? "bg-medium-tint" : "bg-panel"
          }`}
        >
          <HourglassIcon
            className={`mx-auto h-10 w-10 ${
              backendStatus === "down" ? "text-medium" : "text-ink animate-pulse"
            }`}
          />
          <p
            className={`mono mt-3 text-[13px] font-semibold tracking-tight ${
              backendStatus === "down" ? "text-medium" : "text-ink"
            }`}
          >
            {backendStatus === "checking"
              ? "Checking backend service…"
              : "Backend is sleeping…"}
          </p>
          <p
            className={`mono mt-1.5 text-[12px] leading-relaxed ${
              backendStatus === "down" ? "text-medium" : "text-muted"
            }`}
          >
            {backendStatus === "checking"
              ? "Contacting backend service…"
              : `Waking up the backend, this may take up to one minute. Retrying in ${retryIn}s…`}
          </p>
        </div>
      ) : null}
    </div>
  );
}
