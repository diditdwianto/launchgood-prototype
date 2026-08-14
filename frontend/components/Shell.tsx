"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import QueueRail from "@/components/QueueRail";
import { clearToken, getToken } from "@/lib/api";

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token && !isLogin) {
      router.replace("/login");
      return;
    }
    if (token && isLogin) {
      router.replace("/");
      return;
    }
    setChecked(true);
  }, [isLogin, pathname, router]);

  function signOut() {
    clearToken();
    router.replace("/login");
  }

  return (
    <>
      <header className="border-line bg-panel flex items-center justify-between border-b px-7 py-3.5">
        <div className="flex items-baseline gap-2.5">
          <span className="bg-brand inline-block h-2.5 w-2.5 rounded-sm" />
          <Link href="/" className="text-base font-semibold tracking-tight">
            Campaign Trust Copilot
          </Link>
          <span className="mono text-muted text-[11px] tracking-[0.08em] uppercase">
            reviewer console
          </span>
        </div>

        {isLogin ? null : (
          <nav className="text-muted flex items-center gap-5 text-[13px]">
            <Link href="/submit" className="hover:text-ink transition-colors">
              Submit a campaign
            </Link>
            <Link href="/decisions" className="hover:text-ink transition-colors">
              Decision log
            </Link>
            <button
              onClick={signOut}
              className="hover:text-ink cursor-pointer transition-colors"
            >
              Sign out
            </button>
            <span className="bg-brand-tint text-brand-deep flex h-6.5 w-6.5 items-center justify-center rounded-full text-[11px] font-semibold">
              DD
            </span>
          </nav>
        )}
      </header>

      {/* Nothing renders until the token check has run, so a protected page never
          flashes its shell before redirecting to login. */}
      {!checked ? null : isLogin ? (
        children
      ) : (
        <div className="grid grid-cols-[320px_1fr]">
          <QueueRail />
          <main className="h-[calc(100vh-57px)] overflow-y-auto">{children}</main>
        </div>
      )}
    </>
  );
}
