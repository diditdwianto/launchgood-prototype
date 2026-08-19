export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export type Severity = "low" | "medium" | "high";
export type RiskTier = "low" | "medium" | "high";
export type Recommendation = "approve" | "manual_review" | "reject";
export type Decision = "approve" | "reject" | "escalate";

export type NextAction =
  | "none"
  | "verify_manually"
  | "request_more_information"
  | "reject_recommended";

export type EvidenceItem = {
  source: string;
  quote: string;
};

export type Flag = {
  type: string;
  severity: Severity;
  evidence: string;
  source: string;
  origin: "deterministic" | "model";
  // The evidence chain. `sources` has one entry for a settled single-source fact,
  // two or more when the finding compares claims across sources — which is what a
  // contradiction looks like as data.
  claim: string;
  sources: EvidenceItem[];
  reasoning: string;
  finding_confidence: number;
  uncertainty: string;
  contradiction: boolean;
  next_action: NextAction;
};

export type NodeTrace = {
  node: string;
  status: "ok" | "error" | "skipped";
  summary: string;
  duration_ms: number;
};

export type RiskReport = {
  campaign_id: string;
  flags: Flag[];
  // Null on unassisted-holdout campaigns: the model's output is stripped server-side
  // before the response is built, not hidden in the browser.
  recommendation: Recommendation | null;
  confidence: number | null;
  reasoning_summary: string | null;
  risk_score: number | null;
  risk_tier: RiskTier | null;
  sources_unavailable: string[];
  clamp_applied: string | null;
  trace: NodeTrace[];
};

export type Assessment =
  | { status: "ok"; report: RiskReport }
  | {
      status: "error";
      error: { code: string; message: string; trace: NodeTrace[] };
    };

export type QueueItem = {
  campaign_id: string;
  title: string;
  organizer_name: string;
  goal_usd: number;
  submitted_at: string;
  status: "ok" | "error";
  risk_score: number | null;
  risk_tier: RiskTier | null;
  recommendation: Recommendation | null;
  flag_count: number;
  decided: boolean;
  escalated: boolean;
  assisted: boolean;
};

export type CampaignImage = {
  id: string;
  fingerprint: string;
  geo_tag: string;
  captured_at: string;
};

export type Campaign = {
  campaign_id: string;
  title: string;
  organizer_name: string;
  organizer_type: "organization" | "individual";
  organizer_account_age_days: number;
  prior_campaigns_on_platform: number;
  goal_usd: number;
  claimed_location: string;
  category: string;
  submitted_at: string;
  body: string;
  images: CampaignImage[];
};

export type CampaignDetail = {
  campaign: Campaign;
  assessment: Assessment;
  evidence_bundle: string;
  assessed_at: string;
  scoring: string;
  decided: boolean;
  escalated: boolean;
  assisted: boolean;
  history: DecisionEntry[];
};

export type DecisionEntry = {
  campaign_id: string;
  ai_recommendation: Recommendation;
  ai_confidence: number;
  ai_risk_score: number;
  human_decision: Decision;
  outcome: "agreed" | "overrode" | "deferred";
  reviewer_note: string;
  decided_by: string;
  decided_at: string;
};

const TOKEN_KEY = "tc_token";

export const getToken = () =>
  typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY);

export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/** Thrown on 401 so callers can bounce to the login screen rather than
 *  rendering an error that is really just an expired session. */
export class Unauthorized extends Error {}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: { ...(init.headers ?? {}), ...authHeaders() },
  });
  if (res.status === 401) {
    clearToken();
    throw new Unauthorized("session expired");
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

const get = <T,>(path: string) => request<T>(path);

/** Render's free tier spins backends down after inactivity, so a cold instance
 *  can take tens of seconds to answer. Bound the wait rather than let fetch hang. */
export async function checkHealth(timeoutMs = 8000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/api/health`, {
      cache: "no-store",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function login(username: string, password: string) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (res.status === 401) throw new Error("Incorrect username or password.");
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = (await res.json()) as { token: string; user: { username: string } };
  setToken(data.token);
  return data;
}

export const getQueue = () =>
  get<{ items: QueueItem[]; scoring: string }>("/api/queue");

export const getCampaign = (id: string) =>
  get<CampaignDetail>(`/api/campaigns/${id}`);

export const getDecisions = () =>
  get<{
    entries: DecisionEntry[];
    total: number;
    agreement: string;
    deferred: number;
  }>("/api/decisions");

export const postDecision = (id: string, decision: Decision, reviewerNote: string) =>
  request(`/api/campaigns/${id}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision, reviewer_note: reviewerNote }),
  });

export const reassess = (id: string) =>
  request(`/api/campaigns/${id}/reassess`, { method: "POST" });

export type NewCampaign = {
  title: string;
  organizer_name: string;
  organizer_type: "organization" | "individual";
  goal_usd: number;
  claimed_location: string;
  category: string;
  body: string;
  organizer_account_age_days: number;
  prior_campaigns_on_platform: number;
};

export const submitCampaign = (campaign: NewCampaign) =>
  request<{ campaign: Campaign }>("/api/campaigns", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(campaign),
  });

/** EventSource cannot set an Authorization header, so the streaming route also
 *  accepts the token as a query param. */
export const streamUrl = (id: string) =>
  `${API_BASE}/api/campaigns/${id}/assess/stream?token=${encodeURIComponent(getToken() ?? "")}`;

export const FLAG_LABELS: Record<string, string> = {
  org_not_verified: "Organization not verified",
  duplicate_content: "Duplicate content",
  high_ask_no_track_record: "High ask, no track record",
  inconsistent_claims: "Inconsistent claims",
  suspicious_media: "Suspicious media",
  other: "Other concern",
};

export const usd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

export function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 0)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export type ModelTelemetry = {
  model: string;
  provider: string;
  position: number;
  active: boolean;
  exhausted: boolean;
  configured: boolean;
  metered: boolean;
  note: string;
  pricing: { input_per_mtok: number; output_per_mtok: number } | null;
  limits: {
    tokens_per_minute?: string;
    tokens_remaining_this_minute?: string;
    requests_remaining?: string;
    tokens_reset_in?: string;
    tokens_per_day?: number;
    tokens_used_today?: number;
  };
  usage: { calls: number; prompt: number; completion: number; usd: number };
};

export type Telemetry = {
  provider: string;
  chain: ModelTelemetry[];
  schema_capable_models: string[];
  totals: {
    models_used: Record<string, number>;
    calls: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_usd: number;
    usd_per_call: number;
    avg_seconds: number;
  };
  search: { provider: string; live: boolean };
  registries: { name: string; covers_example: string }[];
  database: string;
  scoring: string;
  training: {
    decisive_labels: number;
    approve: number;
    reject: number;
    escalate: number;
    target_labels: number;
    target_minority: number;
    assisted_labels: number;
    unassisted_labels: number;
    unknown_labels: number;
  };
  captured_at: string;
  signed_in: boolean;
  probe_available: boolean;
};

export const getTelemetry = (probe = false) =>
  get<Telemetry>(`/api/telemetry${probe ? "?probe=1" : ""}`);

export type ClarificationRequest = {
  id: number;
  campaign_id: string;
  claim: string;
  subject: string;
  body: string;
  status: "draft" | "sent" | "dismissed";
  drafted_at: string;
  sent_at: string | null;
  sent_by: string | null;
};

export const draftClarification = (campaignId: string, claim: string, evidenceSummary: string) =>
  request<{ clarification: ClarificationRequest }>(`/api/campaigns/${campaignId}/clarification`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ claim, evidence_summary: evidenceSummary }),
  });

export const listClarifications = (campaignId: string) =>
  get<{ clarifications: ClarificationRequest[] }>(`/api/campaigns/${campaignId}/clarification`);

export const editClarification = (id: number, subject: string, body: string) =>
  request<{ clarification: ClarificationRequest }>(`/api/clarification/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subject, body }),
  });

export const sendClarification = (id: number) =>
  request<{ clarification: ClarificationRequest }>(`/api/clarification/${id}/send`, {
    method: "POST",
  });

export const dismissClarification = (id: number) =>
  request<{ clarification: ClarificationRequest }>(`/api/clarification/${id}/dismiss`, {
    method: "POST",
  });
