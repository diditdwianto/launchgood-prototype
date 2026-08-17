"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import AppIntroModal from "@/components/AppIntroModal";
import QueueRail from "@/components/QueueRail";
import { clearToken, getToken } from "@/lib/api";

// Readable without signing in. "Under the hood" is here so the system can be
// inspected without being handed the keys to it — someone evaluating the design
// should not need an account to see how it works.
const PUBLIC_ROUTES = ["/login", "/under-the-hood"];

// Set by the login form right before it navigates away on success, and
// consumed here on the very next render — a plain "have they seen it" flag
// would stay tripped forever after the first login in a tab and silently
// swallow every login after that.
export const INTRO_PENDING_KEY = "tc_intro_pending";

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_ROUTES.includes(pathname);
  const isLogin = pathname === "/login";

  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    const token = getToken();
    setSignedIn(!!token);

    if (!token && !isPublic) {
      router.replace("/login");
      return;
    }
    if (token && isLogin) {
      router.replace("/");
      return;
    }
    if (token && sessionStorage.getItem(INTRO_PENDING_KEY)) {
      sessionStorage.removeItem(INTRO_PENDING_KEY);
      setShowIntro(true);
    }
    setReady(true);
  }, [isPublic, isLogin, pathname, router]);

  function signOut() {
    clearToken();
    setSignedIn(false);
    router.replace("/login");
  }

  // The queue rail needs data only a signed-in reviewer can fetch, so a public
  // page renders full width rather than beside an empty, permanently-401ing rail.
  const showRail = signedIn && !isPublic;

  return (
    <>
      <header className="border-line bg-panel flex items-center justify-between border-b px-7 py-3.5">
        <div className="flex items-baseline gap-2.5">
          <span className="bg-brand inline-block h-2.5 w-2.5 rounded-sm" />
          <Link
            href={signedIn ? "/" : "/under-the-hood"}
            className="text-base font-semibold tracking-tight"
          >
            Campaign Trust Copilot
          </Link>
          <span className="mono text-muted text-[11px] tracking-[0.08em] uppercase">
            reviewer console
          </span>
        </div>

        <nav className="text-muted flex items-center gap-5 text-[13px]">
          <Link
            href="/under-the-hood"
            className={`transition-colors ${
              pathname === "/under-the-hood"
                ? "text-brand-deep font-medium"
                : "hover:text-ink"
            }`}
          >
            Under the hood
          </Link>

          {signedIn ? (
            <>
              <Link href="/submit" className="hover:text-ink transition-colors">
                Submit a campaign
              </Link>
              <Link href="/decisions" className="hover:text-ink transition-colors">
                Decision log
              </Link>
              <Link
                href="/about"
                className={`transition-colors ${
                  pathname === "/about" ? "text-brand-deep font-medium" : "hover:text-ink"
                }`}
              >
                About me
              </Link>
              <button
                onClick={() => setShowIntro(true)}
                className="hover:text-ink cursor-pointer transition-colors"
              >
                Intro
              </button>
              <button
                onClick={signOut}
                className="hover:text-ink cursor-pointer transition-colors"
              >
                Sign out
              </button>
              <span className="bg-brand-tint text-brand-deep flex h-6.5 w-6.5 items-center justify-center rounded-full text-[11px] font-semibold">
                DD
              </span>
            </>
          ) : isLogin ? null : (
            <Link
              href="/login"
              className="bg-brand hover:bg-brand-deep rounded-lg px-3.5 py-1.5 font-semibold text-white transition-colors"
            >
              Sign in
            </Link>
          )}
        </nav>
      </header>

      {/* Nothing renders until the token check has run, so a protected page never
          flashes its shell before redirecting to login. */}
      {!ready ? null : showRail ? (
        <div className="grid grid-cols-[320px_1fr]">
          <QueueRail />
          <main className="h-[calc(100vh-57px)] overflow-y-auto">{children}</main>
        </div>
      ) : (
        <main className="h-[calc(100vh-57px)] overflow-y-auto">{children}</main>
      )}

      {showIntro ? <AppIntroModal onClose={() => setShowIntro(false)} /> : null}
    </>
  );
}
