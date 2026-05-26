export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";

export type ConversationSummary = {
  id: string;
  title?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type Message = {
  id: string;
  role: string;
  content: string;
  content_redacted?: boolean;
  created_at?: string | null;
};

export type Trace = {
  trace_id: string;
  conversation_id: string;
  message_id: string;
  session_id: string;
  provider: string;
  model: string;
  started_at: number;
  completed_at?: number | null;
  latency_ms?: number | null;
  ttft_ms?: number | null;
  stream_duration_ms?: number | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  estimated_cost_usd?: number | null;
  chunks_count?: number | null;
  avg_tokens_per_second?: number | null;
  temperature?: number | null;
  top_p?: number | null;
  max_tokens?: number | null;
  seed?: number | null;
  finish_reason?: string | null;
  retry_count?: number | null;
  provider_fallback?: string | null;
  pii_detected?: boolean | null;
  interruption_reason?: string | null;
  user_preview?: string | null;
  assistant_preview?: string | null;
  status?: "queued" | "streaming" | "success" | "cancelled" | "timeout" | "error" | string;
  raw_request_json?: unknown;
  raw_response_json?: unknown;
  request_payload_size?: number | null;
  response_payload_size?: number | null;
  message_count?: number | null;
  context_length?: number | null;
  created_at?: number | null;
  events_count?: number | null;
};

export type TraceEvent = {
  id: string;
  trace_id: string;
  type:
    | "request_started"
    | "provider_connected"
    | "first_token"
    | "chunk"
    | "stream_paused"
    | "stream_resumed"
    | "stream_completed"
    | "tool_call"
    | "tool_result"
    | "retry"
    | "warning"
    | "pii_redacted"
    | "cancelled"
    | "timeout"
    | "error"
    | string;
  timestamp: number;
  duration_ms?: number | null;
  payload: Record<string, unknown>;
};

export type TraceMetadataEntry = { key: string; value?: string | null; created_at?: string | number | null };

export type TraceDetail = {
  trace: Trace;
  events: TraceEvent[];
  conversation?: ConversationSummary | null;
  messages: Message[];
  inference_log?: InferenceLog | null;
  extracted_metadata?: TraceMetadataEntry[];
};

export type InferenceLog = {
  id: string;
  conversation_id?: string | null;
  message_id?: string | null;
  provider?: string | null;
  model?: string | null;
  start_ts?: string | null;
  end_ts?: string | null;
  latency_ms?: number | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
  status?: string | null;
  error?: string | null;
  redacted_input_preview?: string | null;
  redacted_output_preview?: string | null;
  raw_payload?: unknown;
  created_at?: string | null;
  extracted_metadata?: Array<{ key: string; value?: string | null; created_at?: string | number | null }>;
};

export type MetricsOverview = {
  requests_today?: number;
  avg_latency_ms?: number;
  error_rate?: number;
  tokens_processed?: number;
  active_conversations?: number;
  paused_conversations?: number;
  cancelled_conversations?: number;
  completed_conversations?: number;
  status_breakdown?: Array<{ status?: string | null; count?: number }>;
  provider_breakdown?: Array<{ provider?: string | null; count?: number }>;
  recent_errors?: Array<Record<string, unknown>>;
};

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}
