type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type AgentOutcomeStatus = "success" | "failed" | "cancelled" | "timeout" | "unknown";

export type AgentStepType =
  | "user_message"
  | "model_call"
  | "tool_call"
  | "retrieval"
  | "memory_read"
  | "memory_write"
  | "human_handoff"
  | "policy_check"
  | "external_action"
  | "runtime_event";

export interface AgentIdentity {
  name: string;
  version?: string;
  environment?: string;
}

export interface AgentTask {
  input: string | JsonValue;
  type?: string;
  customer_id?: string;
  thread_id?: string;
}

export interface AgentAuthority {
  scope?: string;
  allowed_actions?: string[];
  disallowed_actions?: string[];
  requires_handoff?: string[];
  [key: string]: JsonValue | undefined;
}

export interface AgentRunStep {
  step_id?: string;
  type: AgentStepType | string;
  timestamp?: string;
  name?: string;
  status?: "success" | "failed" | "cancelled" | "timeout" | "unknown" | string;
  input?: JsonValue;
  output?: JsonValue;
  error?: JsonValue;
  evidence_ref?: string;
}

export interface AgentOutcome {
  status: AgentOutcomeStatus | string;
  summary?: string;
  side_effects?: JsonValue[];
}

export interface AgentRunInput {
  run_id?: string;
  tenant_id?: string;
  trace_id?: string;
  conversation_id?: string;
  source_id?: string;
  started_at?: string;
  completed_at?: string;
  agent: AgentIdentity;
  task: AgentTask;
  context?: Record<string, JsonValue>;
  authority?: AgentAuthority;
  steps?: AgentRunStep[];
  outcome?: AgentOutcome;
  evidence?: Record<string, JsonValue>;
  metadata?: Record<string, JsonValue>;
}

export interface OlliveClientOptions {
  endpoint?: string | undefined;
  token?: string | undefined;
  tenantId?: string | undefined;
  defaultAgent?: string | AgentIdentity | undefined;
  defaultAuthority?: AgentAuthority | undefined;
  timeoutMs?: number | undefined;
  fetch?: typeof fetch | undefined;
  onDeliveryError?: ((error: unknown) => void) | undefined;
}

export interface StartRunInput {
  runId?: string;
  agent?: string | AgentIdentity;
  task: string | AgentTask;
  authority?: AgentAuthority;
  context?: Record<string, JsonValue>;
  evidence?: Record<string, JsonValue>;
  metadata?: Record<string, JsonValue>;
  outcome?: AgentOutcome;
}

export interface ModelCallInput {
  provider?: string;
  model?: string;
  name?: string;
  input?: JsonValue;
  output?: JsonValue;
  status?: AgentRunStep["status"];
  usage?: Record<string, JsonValue>;
  error?: JsonValue;
}

export interface ToolCallInput {
  name: string;
  input?: JsonValue;
  output?: JsonValue;
  status?: AgentRunStep["status"];
  error?: JsonValue;
}

export interface HandoffInput {
  reviewerRole?: string;
  decision?: string;
  reason?: string;
  status?: AgentRunStep["status"];
  output?: Record<string, JsonValue>;
}

export interface OlliveCreateRunResponse {
  run: Record<string, unknown>;
  evidence_packet?: Record<string, unknown>;
}

export class OlliveError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "OlliveError";
    this.status = status;
    this.details = details;
  }
}

export function createOlliveClient(options: OlliveClientOptions = {}): OlliveClient {
  return new OlliveClient(options);
}

export class OlliveClient {
  private readonly endpoint: string;
  private readonly token: string | undefined;
  private readonly tenantId: string | undefined;
  private readonly defaultAgent?: AgentIdentity;
  private readonly defaultAuthority: AgentAuthority | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly onDeliveryError: ((error: unknown) => void) | undefined;

  constructor(options: OlliveClientOptions = {}) {
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new Error("Ollive requires a fetch implementation. Use Node 18+, a browser runtime, or pass options.fetch.");
    }
    this.endpoint = (options.endpoint ?? "http://localhost:8001").replace(/\/+$/, "");
    this.token = options.token;
    this.tenantId = options.tenantId;
    this.defaultAgent = normalizeAgent(options.defaultAgent ?? "unknown-agent");
    this.defaultAuthority = options.defaultAuthority;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.fetchImpl = fetchImpl;
    this.onDeliveryError = options.onDeliveryError;
  }

  async startRun(input: StartRunInput): Promise<OlliveRunHandle> {
    const payload: AgentRunInput = {
      run_id: input.runId ?? newId("run"),
      started_at: new Date().toISOString(),
      agent: normalizeAgent(input.agent ?? this.defaultAgent ?? "unknown-agent"),
      task: normalizeTask(input.task),
      steps: [],
      outcome: input.outcome ?? { status: "unknown" },
      evidence: {
        source: "ollive-js",
        redaction_applied: false,
        ...input.evidence,
      },
    };
    if (this.tenantId) payload.tenant_id = this.tenantId;
    if (input.context) payload.context = input.context;
    const authority = input.authority ?? this.defaultAuthority;
    if (authority) payload.authority = authority;
    if (input.metadata) payload.metadata = input.metadata;
    const response = await this.createRun(payload);
    return new OlliveRunHandle(this, payload, response);
  }

  async createRun(payload: AgentRunInput): Promise<OlliveCreateRunResponse> {
    const normalized: AgentRunInput = {
      ...payload,
      run_id: payload.run_id ?? newId("run"),
      started_at: payload.started_at ?? new Date().toISOString(),
      agent: normalizeAgent(payload.agent),
      task: normalizeTask(payload.task),
      authority: payload.authority ?? this.defaultAuthority ?? {},
      steps: payload.steps ?? [],
      outcome: payload.outcome ?? { status: "unknown" },
      evidence: {
        source: "ollive-js",
        redaction_applied: false,
        ...(payload.evidence ?? {}),
      },
      metadata: payload.metadata ?? {},
    };
    const tenantId = payload.tenant_id ?? this.tenantId;
    if (tenantId) normalized.tenant_id = tenantId;
    if (payload.trace_id) normalized.trace_id = payload.trace_id;
    if (payload.conversation_id) normalized.conversation_id = payload.conversation_id;
    if (payload.source_id) normalized.source_id = payload.source_id;
    if (payload.completed_at) normalized.completed_at = payload.completed_at;
    return this.request<OlliveCreateRunResponse>("/v1/runs", {
      method: "POST",
      body: JSON.stringify(normalized),
    });
  }

  async recordStep(runId: string, step: AgentRunStep): Promise<OlliveCreateRunResponse> {
    return this.request<OlliveCreateRunResponse>(`/v1/runs/${encodeURIComponent(runId)}/events`, {
      method: "POST",
      body: JSON.stringify({
        steps: [
          {
            step_id: step.step_id ?? newId("step"),
            timestamp: step.timestamp ?? new Date().toISOString(),
            status: step.status ?? "unknown",
            input: step.input ?? {},
            output: step.output ?? {},
            ...step,
          },
        ],
      }),
    });
  }

  async recordModelCall(runId: string, input: ModelCallInput): Promise<OlliveCreateRunResponse> {
    return this.recordStep(runId, modelCallStep(input));
  }

  async recordToolCall(runId: string, input: ToolCallInput): Promise<OlliveCreateRunResponse> {
    return this.recordStep(runId, toolCallStep(input));
  }

  async recordHandoff(runId: string, input: HandoffInput): Promise<OlliveCreateRunResponse> {
    return this.recordStep(runId, handoffStep(input));
  }

  async endRun(runId: string, outcome: AgentOutcome): Promise<OlliveCreateRunResponse> {
    const current = await this.getRun(runId);
    const payload = apiRunToInput(current);
    return this.createRun({
      ...payload,
      completed_at: new Date().toISOString(),
      outcome,
    });
  }

  async getRun(runId: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/v1/runs/${encodeURIComponent(runId)}`, {
      method: "GET",
    });
  }

  async getEvidencePacket(runId: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/v1/runs/${encodeURIComponent(runId)}/evidence-packet`, {
      method: "GET",
    });
  }

  fireAndForget(promise: Promise<unknown>): void {
    promise.catch((error) => {
      if (this.onDeliveryError) {
        this.onDeliveryError(error);
      }
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    if (this.token) {
      headers.set("x-ollive-token", this.token);
    }
    try {
      const response = await this.fetchImpl(`${this.endpoint}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
      const text = await response.text();
      const data = parseJson(text);
      if (!response.ok) {
        throw new OlliveError(`Ollive request failed with HTTP ${response.status}`, response.status, data);
      }
      return data as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class OlliveRunHandle {
  readonly runId: string;
  readonly created: OlliveCreateRunResponse;
  private readonly client: OlliveClient;
  private readonly payload: AgentRunInput;

  constructor(client: OlliveClient, payload: AgentRunInput, created: OlliveCreateRunResponse) {
    this.client = client;
    this.payload = payload;
    this.created = created;
    this.runId = payload.run_id ?? "";
  }

  async step(step: AgentRunStep): Promise<OlliveCreateRunResponse> {
    const normalized = {
      step_id: step.step_id ?? newId("step"),
      timestamp: step.timestamp ?? new Date().toISOString(),
      status: step.status ?? "unknown",
      input: step.input ?? {},
      output: step.output ?? {},
      ...step,
    };
    this.payload.steps = [...(this.payload.steps ?? []), normalized];
    return this.client.recordStep(this.runId, normalized);
  }

  modelCall(input: ModelCallInput): Promise<OlliveCreateRunResponse> {
    return this.step(modelCallStep(input));
  }

  toolCall(input: ToolCallInput): Promise<OlliveCreateRunResponse> {
    return this.step(toolCallStep(input));
  }

  handoff(input: HandoffInput): Promise<OlliveCreateRunResponse> {
    return this.step(handoffStep(input));
  }

  externalAction(input: ToolCallInput): Promise<OlliveCreateRunResponse> {
    return this.step({
      ...toolCallStep(input),
      type: "external_action",
    });
  }

  async end(outcome: AgentOutcome): Promise<OlliveCreateRunResponse> {
    this.payload.completed_at = new Date().toISOString();
    this.payload.outcome = outcome;
    return this.client.createRun(this.payload);
  }

  packet(): Promise<Record<string, unknown>> {
    return this.client.getEvidencePacket(this.runId);
  }
}

function modelCallStep(input: ModelCallInput): AgentRunStep {
  const step: AgentRunStep = {
    step_id: newId("step"),
    type: "model_call",
    timestamp: new Date().toISOString(),
    name: input.name ?? "model_call",
    status: input.status ?? (input.error ? "failed" : "success"),
    input: {
      provider: input.provider ?? "unknown",
      model: input.model ?? "unknown",
      payload: input.input ?? {},
    },
    output: {
      result: input.output ?? {},
      usage: input.usage ?? {},
    },
  };
  if (input.error !== undefined) step.error = input.error;
  return step;
}

function toolCallStep(input: ToolCallInput): AgentRunStep {
  const step: AgentRunStep = {
    step_id: newId("step"),
    type: "tool_call",
    timestamp: new Date().toISOString(),
    name: input.name,
    status: input.status ?? (input.error ? "failed" : "success"),
    input: input.input ?? {},
    output: input.output ?? {},
  };
  if (input.error !== undefined) step.error = input.error;
  return step;
}

function handoffStep(input: HandoffInput): AgentRunStep {
  return {
    step_id: newId("step"),
    type: "human_handoff",
    timestamp: new Date().toISOString(),
    name: "human_handoff",
    status: input.status ?? "success",
    output: {
      reviewer_role: input.reviewerRole ?? "reviewer",
      decision: input.decision ?? "reviewed",
      reason: input.reason ?? "",
      ...(input.output ?? {}),
    },
  };
}

function normalizeAgent(agent: string | AgentIdentity): AgentIdentity {
  if (typeof agent === "string") {
    return { name: agent };
  }
  return agent;
}

function normalizeTask(task: string | AgentTask): AgentTask {
  if (typeof task === "string") {
    return { input: task };
  }
  return task;
}

function parseJson(text: string): unknown {
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function newId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${random.replace(/-/g, "")}`;
}

function apiRunToInput(run: Record<string, unknown>): AgentRunInput {
  const runId = String(run.run_id ?? "");
  const agentName = String(run.agent_name ?? "unknown-agent");
  const payload: AgentRunInput = {
    run_id: runId,
    agent: {
      name: agentName,
    },
    task: {
      input: asJson(run.task_input),
    },
    context: asRecord(run.context),
    authority: asRecord(run.authority) as AgentAuthority,
    steps: Array.isArray(run.steps) ? (run.steps as AgentRunStep[]) : [],
    outcome: asRecord(run.outcome) as unknown as AgentOutcome,
    evidence: asRecord(run.evidence),
    metadata: asRecord(run.metadata),
  };
  const tenantId = asOptionalString(run.tenant_id);
  const traceId = asOptionalString(run.trace_id);
  const conversationId = asOptionalString(run.conversation_id);
  const startedAt = asOptionalString(run.started_at);
  const completedAt = asOptionalString(run.completed_at);
  const agentVersion = asOptionalString(run.agent_version);
  const environment = asOptionalString(run.environment);
  const taskType = asOptionalString(run.task_type);
  if (tenantId) payload.tenant_id = tenantId;
  if (traceId) payload.trace_id = traceId;
  if (conversationId) payload.conversation_id = conversationId;
  if (startedAt) payload.started_at = startedAt;
  if (completedAt) payload.completed_at = completedAt;
  if (agentVersion) payload.agent.version = agentVersion;
  if (environment) payload.agent.environment = environment;
  if (taskType) payload.task.type = taskType;
  return payload;
}

function asOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  return String(value);
}

function asJson(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    Array.isArray(value) ||
    typeof value === "object"
  ) {
    return value as JsonValue;
  }
  return String(value);
}

function asRecord(value: unknown): Record<string, JsonValue> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, JsonValue>;
  }
  return {};
}
