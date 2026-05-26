-- Ollive DB schema (Postgres)
-- Run as a migration. Uses gen_random_uuid() from pgcrypto.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- users (optional)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active|completed|cancelled|paused
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);

-- messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT,
  content_redacted BOOLEAN NOT NULL DEFAULT FALSE,
  tokens INTEGER DEFAULT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at ON messages(conversation_id, created_at);

-- traces
CREATE TABLE IF NOT EXISTS traces (
  trace_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  started_at BIGINT NOT NULL,
  completed_at BIGINT,
  latency_ms INTEGER,
  ttft_ms INTEGER,
  stream_duration_ms INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  estimated_cost_usd NUMERIC(12, 6),
  chunks_count INTEGER DEFAULT 0,
  avg_tokens_per_second NUMERIC(12, 2),
  temperature NUMERIC(6, 3),
  top_p NUMERIC(6, 3),
  max_tokens INTEGER,
  seed INTEGER,
  finish_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  provider_fallback TEXT,
  pii_detected BOOLEAN NOT NULL DEFAULT FALSE,
  interruption_reason TEXT,
  user_preview TEXT,
  assistant_preview TEXT,
  status TEXT NOT NULL DEFAULT 'queued', -- queued|streaming|success|cancelled|timeout|error
  raw_request_json JSONB,
  raw_response_json JSONB,
  request_payload_size INTEGER,
  response_payload_size INTEGER,
  message_count INTEGER,
  context_length INTEGER,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_traces_conversation_created_at ON traces(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_traces_provider_model ON traces(provider, model);
CREATE INDEX IF NOT EXISTS idx_traces_status ON traces(status);

-- trace events
CREATE TABLE IF NOT EXISTS trace_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id UUID NOT NULL REFERENCES traces(trace_id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  duration_ms INTEGER,
  payload JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_trace_events_trace_ts ON trace_events(trace_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_trace_events_type ON trace_events(type);

-- inference logs
CREATE TABLE IF NOT EXISTS inference_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id UUID REFERENCES traces(trace_id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT,
  start_ts TIMESTAMPTZ,
  end_ts TIMESTAMPTZ,
  latency_ms INTEGER,
  tokens_in INTEGER,
  tokens_out INTEGER,
  status TEXT DEFAULT 'ok', -- ok|error|cancelled
  error TEXT,
  redacted_input_preview TEXT,
  redacted_output_preview TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_infer_conversation_created_at ON inference_logs(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_infer_provider_model ON inference_logs(provider, model);
CREATE INDEX IF NOT EXISTS idx_infer_trace_id ON inference_logs(trace_id);

-- extracted metadata (key/value per inference log)
CREATE TABLE IF NOT EXISTS extracted_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inference_log_id UUID REFERENCES inference_logs(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_extracted_metadata_key ON extracted_metadata(key);

-- memories (optional)
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID, -- could be user id or conversation id
  type TEXT,
  summary TEXT,
  vector JSONB,
  source_log_id UUID REFERENCES inference_logs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memories_subject ON memories(subject_id);

-- Helpful GIN indexes for JSONB queries
CREATE INDEX IF NOT EXISTS idx_conversations_metadata_gin ON conversations USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_messages_metadata_gin ON messages USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_infer_raw_payload_gin ON inference_logs USING GIN (raw_payload);

-- Trigger to update conversations.updated_at on message insert
CREATE OR REPLACE FUNCTION touch_conversation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_messages_touch_conversation ON messages;
CREATE TRIGGER trg_messages_touch_conversation
AFTER INSERT ON messages
FOR EACH ROW EXECUTE PROCEDURE touch_conversation_updated_at();

