"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  dismissClarification,
  draftClarification,
  editClarification,
  listClarifications,
  sendClarification,
  type ClarificationRequest,
  type Flag,
} from "@/lib/api";
import { SectionLabel } from "./ui";

const STATUS_STYLE: Record<ClarificationRequest["status"], string> = {
  draft: "bg-medium-tint text-medium",
  sent: "bg-low-tint text-low",
  dismissed: "bg-panel text-muted border border-line",
};

/**
 * The human-in-the-loop moment the whole feature exists for: the model proposes
 * exactly what to ask the organizer, a reviewer reads and can edit every word, and
 * nothing is sent until that reviewer explicitly clicks Send. "Sent" only ever means
 * "a human approved this text" — no email is dispatched; see ASSUMPTIONS.md.
 */
export default function ClarificationPanel({
  campaignId,
  pendingFlag,
  onClose,
}: {
  campaignId: string;
  /** Set once, when opened from a flag's "Draft a request" button — the parent
   *  clears this back to null immediately after reading it (see FlagCard/the review
   *  page), so it functions as a one-shot instruction, not ongoing prop state. Null
   *  when opened from the plain history view with nothing pre-selected. */
  pendingFlag: Flag | null;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<ClarificationRequest[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [editing, setEditing] = useState<{ id: number; subject: string; body: string } | null>(
    null,
  );
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guards against firing the draft call twice for the same open — most notably
  // React StrictMode's deliberate double-invocation of effects in development, which
  // was silently costing two model calls and leaving an orphaned draft row per click
  // before this existed. Verified directly: two drafts with an identical drafted_at
  // timestamp to the second, from one click.
  const draftedRef = useRef(false);

  const load = useCallback(() => {
    listClarifications(campaignId)
      .then((d) => setHistory(d.clarifications))
      .catch((e) => setError(String(e)));
  }, [campaignId]);

  useEffect(() => load(), [load]);

  useEffect(() => {
    if (!pendingFlag || draftedRef.current) return;
    draftedRef.current = true;
    setError(null);
    setDrafting(true);
    const evidenceSummary =
      pendingFlag.sources.map((s) => `(${s.source}) "${s.quote}"`).join(" — ") ||
      pendingFlag.evidence;
    draftClarification(campaignId, pendingFlag.claim, evidenceSummary)
      .then((d) => {
        setEditing({
          id: d.clarification.id,
          subject: d.clarification.subject,
          body: d.clarification.body,
        });
        load();
      })
      .catch((e) => setError(String(e)))
      .finally(() => setDrafting(false));
    // pendingFlag is a fresh object each click even for the "same" flag, so this
    // effect is meant to fire on identity, not on a memoized dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFlag]);

  async function saveEdit() {
    if (!editing) return;
    setBusy(editing.id);
    try {
      await editClarification(editing.id, editing.subject, editing.body);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!editing) return;
    setBusy(editing.id);
    try {
      await saveEdit();
      await sendClarification(editing.id);
      setEditing(null);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    if (!editing) return;
    setBusy(editing.id);
    try {
      await dismissClarification(editing.id);
      setEditing(null);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border-brand bg-panel mb-6 rounded-lg border-l-[3px] px-4.5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-brand-deep text-[11px] font-semibold tracking-[0.08em] uppercase">
          Request more information
        </h2>
        <button onClick={onClose} className="text-muted hover:text-ink text-[12px]">
          Close
        </button>
      </div>

      {error ? <p className="text-high mb-3 text-[13px]">{error}</p> : null}

      {drafting ? (
        <p className="text-muted text-[13.5px]">Drafting from the model…</p>
      ) : !editing && !pendingFlag && history.length === 0 ? (
        <p className="text-muted mb-1 text-[13.5px] leading-relaxed">
          Nothing drafted yet. Expand a flag below and use its{" "}
          <span className="text-ink font-medium">
            &ldquo;Draft a request for more information&rdquo;
          </span>{" "}
          button — a request needs a specific claim and evidence to draft from.
        </p>
      ) : editing ? (
        <div className="mb-4">
          {pendingFlag ? (
            <p className="text-muted mb-2.5 text-[12.5px] leading-relaxed">
              About: <span className="text-ink italic">&ldquo;{pendingFlag.claim}&rdquo;</span>
            </p>
          ) : null}
          <label className="text-muted mb-1 block text-[10.5px] font-semibold tracking-wide uppercase">
            Subject
          </label>
          <input
            value={editing.subject}
            onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
            onBlur={saveEdit}
            className="border-line focus:border-brand mb-3 w-full rounded-lg border px-3 py-2 text-[13.5px] outline-none"
          />
          <label className="text-muted mb-1 block text-[10.5px] font-semibold tracking-wide uppercase">
            Message
          </label>
          <textarea
            value={editing.body}
            onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            onBlur={saveEdit}
            rows={5}
            className="border-line focus:border-brand mb-3 w-full resize-y rounded-lg border px-3 py-2 text-[13.5px] leading-relaxed outline-none"
          />
          <div className="flex items-center gap-2.5">
            <button
              onClick={send}
              disabled={busy === editing.id}
              title="Simulated — no email is actually sent. Marks this request as sent, by you, with a timestamp."
              className="bg-brand hover:bg-brand-deep rounded-full px-4 py-2 text-[12.5px] font-semibold text-white transition-colors disabled:opacity-40"
            >
              {busy === editing.id ? "Sending…" : "Send (simulated)"}
            </button>
            <button
              onClick={discard}
              disabled={busy === editing.id}
              className="border-line hover:bg-ground rounded-full border px-4 py-2 text-[12.5px] font-semibold transition-colors disabled:opacity-40"
            >
              Discard
            </button>
          </div>
        </div>
      ) : null}

      {history.length > 0 ? (
        <>
          <SectionLabel>History for this campaign</SectionLabel>
          <div className="border-line divide-line divide-y overflow-hidden rounded-lg border">
            {history
              .filter((h) => h.id !== editing?.id)
              .map((h) => (
                <div key={h.id} className="px-3.5 py-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-medium">{h.subject}</span>
                    <span
                      className={`${STATUS_STYLE[h.status]} rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase`}
                    >
                      {h.status}
                    </span>
                  </div>
                  <p className="text-muted mb-1.5 text-[12px] leading-relaxed">{h.body}</p>
                  <p className="mono text-muted text-[10.5px]">
                    drafted {h.drafted_at}
                    {h.status === "sent" ? ` · sent by ${h.sent_by} at ${h.sent_at}` : ""}
                  </p>
                </div>
              ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
