"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { getQueue, timeAgo, usd, type QueueItem } from "@/lib/api";
import { TierBadge } from "./ui";

export const QUEUE_CHANGED = "queue-changed";

export default function QueueRail() {
  const pathname = usePathname();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    getQueue()
      .then((d) => {
        setItems(d.items);
        setError(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(QUEUE_CHANGED, load);
    return () => window.removeEventListener(QUEUE_CHANGED, load);
  }, [load, pathname]);

  const pending = items.filter((i) => !i.decided);

  return (
    <aside className="border-line bg-panel h-[calc(100vh-57px)] overflow-y-auto border-r">
      <div className="border-line flex items-center justify-between border-b px-5 py-4">
        <h2 className="text-muted text-xs font-semibold tracking-[0.08em] uppercase">
          Pending review
        </h2>
        <span className="mono bg-brand-tint text-brand-deep rounded-full px-2 py-0.5 text-[11px]">
          {pending.length}
        </span>
      </div>

      {error ? (
        <p className="text-high px-5 py-6 text-sm">
          Cannot reach the assessment API. {error}
        </p>
      ) : null}

      {loaded && !error && pending.length === 0 ? (
        <p className="text-muted px-5 py-6 text-sm">
          Queue clear. Every submission has a logged decision.
        </p>
      ) : null}

      {pending.map((item) => {
        const active = pathname === `/review/${item.campaign_id}`;
        return (
          <Link
            key={item.campaign_id}
            href={`/review/${item.campaign_id}`}
            className={`border-line block border-b px-5 py-3.5 transition-colors ${
              active
                ? "bg-brand-tint border-l-brand border-l-[3px] pl-[17px]"
                : "hover:bg-ground"
            }`}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="mono text-muted text-[11px]">
                {item.campaign_id}
              </span>
              {item.status === "error" ? (
                <span className="bg-high-tint text-high rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                  Failed
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span className="mono text-muted text-[11px]">
                    {item.risk_score}
                  </span>
                  <TierBadge tier={item.risk_tier!}>{item.risk_tier}</TierBadge>
                </span>
              )}
            </div>
            <p className="mb-1 text-sm leading-snug font-medium">{item.title}</p>
            <p className="text-muted text-xs">
              {timeAgo(item.submitted_at)} · {usd(item.goal_usd)}
            </p>
          </Link>
        );
      })}
    </aside>
  );
}
