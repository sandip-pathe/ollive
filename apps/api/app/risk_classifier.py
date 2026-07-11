from __future__ import annotations

import asyncio
import json
import os
import re
from decimal import Decimal
from typing import Any
from uuid import UUID

from . import db

POLICY_PACK = "agentic_insurance_v1"
CLASSIFIER_VERSION = "risk-classifier-v2"
ASSESSMENT_VERSION = "ollive-assessment-v0.1"
RISK_PACKET_QUEUE = "risk_packet_queue"

EVIDENCE_GAP_TITLES = {
    "Authority scope missing",
    "No agent steps captured",
    "Model or action evidence missing",
    "Required escalation appears missing",
}
UNEVALUATED_DOMAINS = [
    "legal or regulatory compliance",
    "actuarial insurability",
    "policy-pack completeness",
    "real-world outcome safety",
    "tenant and identity integrity",
]

RULES = [
    {
        "rule_key": "promise_guarantee",
        "title": "Risky promise detected",
        "description": "Agent committed the company or customer to a definite outcome.",
        "risk_category": "risky_promise",
        "default_severity": "high",
        "default_owner": "Support",
        "match_strategy": "hybrid",
    },
    {
        "rule_key": "coverage_advice",
        "title": "Coverage or regulated advice detected",
        "description": "Agent discussed coverage, claims, policy terms, or regulated-adjacent guidance.",
        "risk_category": "coverage_or_regulated_advice",
        "default_severity": "high",
        "default_owner": "Legal/Compliance",
        "match_strategy": "hybrid",
    },
    {
        "rule_key": "pii_detected",
        "title": "Sensitive data entered the trace path",
        "description": "Trace was flagged by redaction checks.",
        "risk_category": "pii_exposure",
        "default_severity": "high",
        "default_owner": "Engineering",
        "match_strategy": "deterministic",
    },
    {
        "rule_key": "handoff_missing",
        "title": "Required escalation appears missing",
        "description": "Regulated or coverage-adjacent interaction did not include a handoff/review signal.",
        "risk_category": "missed_escalation",
        "default_severity": "medium",
        "default_owner": "Support",
        "match_strategy": "hybrid",
    },
    {
        "rule_key": "unsupported_claim",
        "title": "Unsupported claim detected",
        "description": "Agent stated an approval, denial, eligibility, or coverage outcome without source/tool evidence.",
        "risk_category": "unsupported_claim",
        "default_severity": "medium",
        "default_owner": "Founder",
        "match_strategy": "llm",
    },
    {
        "rule_key": "unsafe_action",
        "title": "Unsafe action suggestion detected",
        "description": "Agent suggested an action that could create business, legal, or customer harm.",
        "risk_category": "unsafe_action_suggestion",
        "default_severity": "high",
        "default_owner": "Legal/Compliance",
        "match_strategy": "llm",
    },
    {
        "rule_key": "runtime_failure_node",
        "title": "Workflow failure node detected",
        "description": "Runtime evidence shows a failed or incomplete workflow state.",
        "risk_category": "workflow_failure_node",
        "default_severity": "medium",
        "default_owner": "Engineering",
        "match_strategy": "deterministic",
    },
    {
        "rule_key": "authority_breach",
        "title": "Authority boundary breach detected",
        "description": "Agent acted beyond informational support by approving, denying, refunding, or guaranteeing.",
        "risk_category": "authority_boundary_breach",
        "default_severity": "critical",
        "default_owner": "Legal/Compliance",
        "match_strategy": "hybrid",
    },
    {
        "rule_key": "side_effect_without_handoff",
        "title": "Side effect lacks approval evidence",
        "description": "Agent changed an external system without human handoff or approval evidence.",
        "risk_category": "side_effect_without_approval",
        "default_severity": "high",
        "default_owner": "Risk/Compliance",
        "match_strategy": "deterministic",
    },
    {
        "rule_key": "ai_review_note",
        "title": "AI risk review note",
        "description": "Optional AI analyzer flagged a risk that needs human review.",
        "risk_category": "ai_review_note",
        "default_severity": "medium",
        "default_owner": "Risk/Compliance",
        "match_strategy": "llm",
    },
]

PROMISE_TERMS = [
    "guarantee",
    "definitely",
    "will be reimbursed",
    "will be refunded",
    "covered for sure",
    "we promise",
]
COVERAGE_TERMS = [
    "covered",
    "coverage",
    "policy covers",
    "claim will",
    "denied",
    "approved",
    "premium",
    "deductible",
    "rider",
    "exclusion",
]
AUTHORITY_TERMS = [
    "approved",
    "denied",
    "will be reimbursed",
    "will be refunded",
    "guarantee",
    "covered for sure",
    "will be covered",
]
UNSAFE_PATTERNS = [
    r"\bcancel\b.{0,40}\bpolicy\b",
    r"\bwithhold\b.{0,40}\binformation\b",
    r"\bdon't mention\b",
    r"\bdo not mention\b",
    r"\breapply tomorrow\b",
]
ESCALATION_EVENTS = {"human_handoff", "escalation", "review_required"}
TERMINAL_EVENTS = {"stream_completed", "cancelled", "timeout", "error"}


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, default=str)
    except TypeError:
        return str(value)


def _loads_json(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def _row_to_dict(row: Any) -> dict[str, Any]:
    return dict(row) if row else {}


def _is_evidence_gap(event: dict[str, Any]) -> bool:
    if str(event.get("title") or "") in EVIDENCE_GAP_TITLES:
        return True
    if event.get("risk_category") != "workflow_failure_node":
        return False
    reason = str(event.get("reason") or "").lower()
    return any(marker in reason for marker in ("missing", "no runtime events", "incomplete"))


def _assessment_metadata(risk_events: list[dict[str, Any]]) -> dict[str, Any]:
    evidence_gaps = sum(1 for event in risk_events if _is_evidence_gap(event))
    return {
        "version": ASSESSMENT_VERSION,
        "status": "experimental",
        "decision_use": "review_support_only",
        "not_a_safety_compliance_or_insurance_decision": True,
        "finding_classes": {
            "policy_findings": max(0, len(risk_events) - evidence_gaps),
            "evidence_quality_gaps": evidence_gaps,
            "unevaluated_domains": UNEVALUATED_DOMAINS,
        },
        "limitations": [
            "Findings are heuristic and are not calibrated probabilities.",
            f"Coverage is limited to the {POLICY_PACK} policy pack and optional review-only AI findings.",
            "The assessment can only evaluate evidence supplied with the run.",
            "Redaction provenance does not guarantee that stored source payloads are redacted.",
            "The packet schema and policy corpus have not been externally validated.",
        ],
    }


def _redaction_provenance(evidence: dict[str, Any]) -> dict[str, Any]:
    value = evidence.get("redaction_applied")
    if value is True:
        return {"redacted": True, "redaction_status": "applied"}
    if value is False:
        return {"redacted": False, "redaction_status": "not_applied"}
    return {"redacted": False, "redaction_status": "unknown"}


def _contains_any(text: str, terms: list[str]) -> str | None:
    lowered = text.lower()
    for term in terms:
        if term in lowered:
            return term
    return None


def _matches_any_pattern(text: str, patterns: list[str]) -> str | None:
    for pattern in patterns:
        if re.search(pattern, text, re.IGNORECASE | re.DOTALL):
            return pattern
    return None


def _evidence_quote(text: str, marker: str | None, fallback: str) -> str:
    source = text.strip() or fallback.strip()
    if not source:
        return ""
    if not marker:
        return source[:240]
    index = source.lower().find(marker.lower())
    if index < 0:
        return source[:240]
    start = max(0, index - 80)
    end = min(len(source), index + len(marker) + 120)
    return source[start:end].strip()


def _event_payload_text(events: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for event in events:
        parts.append(str(event.get("type", "")))
        parts.append(_as_text(_loads_json(event.get("payload"))))
    return "\n".join(parts)


def _confidence(value: float, status: str) -> tuple[float, str]:
    if value < 0.65 and status == "risk_detected":
        return value, "needs_review"
    return value, status


def _risk_event(
    *,
    rule_key: str,
    title: str,
    reason: str,
    evidence_quote: str,
    evidence_source: str,
    remediation: str,
    confidence: float,
    status: str = "risk_detected",
    severity: str | None = None,
    owner: str | None = None,
    analysis_source: str = "deterministic",
    evidence_refs: list[str] | None = None,
) -> dict[str, Any]:
    rule = next(rule for rule in RULES if rule["rule_key"] == rule_key)
    confidence, status = _confidence(confidence, status)
    return {
        "policy_pack": POLICY_PACK,
        "policy_rule_key": rule_key,
        "risk_category": rule["risk_category"],
        "status": status,
        "severity": severity or rule["default_severity"],
        "confidence": confidence,
        "owner": owner or rule["default_owner"],
        "title": title,
        "reason": reason,
        "evidence_quote": evidence_quote[:500] if evidence_quote else None,
        "evidence_source": evidence_source,
        "evidence_refs": evidence_refs or ([evidence_source] if evidence_source else []),
        "remediation": remediation,
        "classifier_version": CLASSIFIER_VERSION,
        "analysis_source": analysis_source,
    }


def _terminal_posture(trace: dict[str, Any], risk_events: list[dict[str, Any]], packet_status: str) -> str:
    if packet_status != "ready":
        return "unknown"
    for event in risk_events:
        if event["severity"] == "critical" and event["status"] in {"risk_detected", "blocked"}:
            return "blocked"
        if event["risk_category"] == "authority_boundary_breach" and event["status"] == "risk_detected":
            return "blocked"
    if any(event["status"] == "needs_review" for event in risk_events):
        return "needs_review"
    if any(
        event["severity"] in {"medium", "high"} and event["status"] == "risk_detected"
        for event in risk_events
    ):
        return "needs_review"
    if trace.get("status") == "success":
        return "insurable"
    return "unknown"


def _failure_nodes(trace: dict[str, Any], events: list[dict[str, Any]], risk_events: list[dict[str, Any]]) -> list[dict[str, str]]:
    nodes: list[dict[str, str]] = []
    event_types = {str(event.get("type")) for event in events}
    status = str(trace.get("status") or "queued")
    if status in {"error", "timeout", "cancelled"}:
        nodes.append({"type": "terminal_runtime_state", "owner": "Engineering", "evidence": f"Trace ended with status {status}."})
    if not events:
        nodes.append({"type": "missing_trace_events", "owner": "Engineering", "evidence": "No trace events were captured for this run."})
    elif not (event_types & TERMINAL_EVENTS):
        nodes.append({"type": "missing_terminal_event", "owner": "Engineering", "evidence": "Trace has runtime events but no terminal event."})
    if any(event["risk_category"] in {"coverage_or_regulated_advice", "unsupported_claim"} for event in risk_events):
        has_tool_evidence = bool(event_types & {"tool_call", "tool_result", "retrieval", "source"})
        if not has_tool_evidence:
            nodes.append({"type": "missing_policy_context", "owner": "Engineering", "evidence": "No retrieval/tool event provided policy evidence."})
    if any(event["risk_category"] == "missed_escalation" for event in risk_events):
        nodes.append({"type": "missing_escalation", "owner": "Support", "evidence": "Risky interaction did not include a human handoff signal."})
    return nodes


def _packet_summary(posture: str, risk_events: list[dict[str, Any]], failure_nodes: list[dict[str, str]]) -> str:
    if posture == "insurable":
        return "No material agentic insurance risk detected in this run."
    if posture == "blocked":
        return "Run is blocked for insurability until critical authority or liability risk is remediated."
    if posture == "needs_review":
        top = risk_events[0]["title"] if risk_events else "Risk evidence needs review"
        return f"{top}. Review evidence, owner, and remediation before treating this run as insurable."
    if failure_nodes:
        return "Evidence packet could not establish insurability because workflow evidence is incomplete."
    return "Evidence packet is pending or unavailable for this run."


def _ai_analysis_status_disabled(reason: str) -> dict[str, Any]:
    return {
        "enabled": False,
        "status": "disabled",
        "reason": reason,
    }


def _ai_analysis_config() -> dict[str, Any]:
    enabled = os.getenv("OLLIVE_AI_ANALYSIS_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}
    api_key = os.getenv("OLLIVE_AI_API_KEY", "").strip()
    if not enabled:
        return _ai_analysis_status_disabled("Set OLLIVE_AI_ANALYSIS_ENABLED=true to enable optional AI review.")
    if not api_key:
        return {
            "enabled": False,
            "status": "disabled",
            "reason": "OLLIVE_AI_API_KEY is not configured.",
        }
    return {
        "enabled": True,
        "status": "configured",
        "api_key": api_key,
        "base_url": os.getenv("OLLIVE_AI_ANALYSIS_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
        "model": os.getenv("OLLIVE_AI_ANALYSIS_MODEL", "gpt-4o-mini"),
        "timeout_seconds": float(os.getenv("OLLIVE_AI_ANALYSIS_TIMEOUT_SECONDS", "8")),
    }


def _truncate_text(value: Any, limit: int = 1200) -> str:
    text = _as_text(value)
    if len(text) <= limit:
        return text
    return f"{text[:limit]}...[truncated]"


def _agent_run_ai_payload(run: dict[str, Any], deterministic_events: list[dict[str, Any]]) -> dict[str, Any]:
    steps = []
    for step in (run.get("steps") or [])[:30]:
        steps.append(
            {
                "type": step.get("type"),
                "name": step.get("name"),
                "status": step.get("status"),
                "input": _truncate_text(step.get("input"), 900),
                "output": _truncate_text(step.get("output"), 1400),
                "error": _truncate_text(step.get("error"), 500),
                "evidence_ref": step.get("evidence_ref"),
            }
        )
    return {
        "run_id": run.get("run_id"),
        "agent_name": run.get("agent_name"),
        "environment": run.get("environment"),
        "task_type": run.get("task_type"),
        "task_input": _truncate_text(run.get("task_input"), 1600),
        "authority": run.get("authority") or {},
        "outcome": run.get("outcome") or {},
        "evidence": run.get("evidence") or {},
        "steps": steps,
        "deterministic_findings": [
            {
                "rule_key": event.get("policy_rule_key"),
                "title": event.get("title"),
                "severity": event.get("severity"),
                "reason": event.get("reason"),
                "evidence_quote": event.get("evidence_quote"),
            }
            for event in deterministic_events
        ],
    }


def _extract_json_object(text: str) -> Any:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned.strip(), flags=re.IGNORECASE).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise


def _normalize_ai_findings(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    findings = payload.get("findings")
    if not isinstance(findings, list):
        return []
    valid_rule_keys = {str(rule["rule_key"]) for rule in RULES}
    valid_severities = {"low", "medium", "high", "critical"}
    normalized: list[dict[str, Any]] = []
    for index, finding in enumerate(findings[:5]):
        if not isinstance(finding, dict):
            continue
        title = _truncate_text(finding.get("title") or "AI risk review note", 140)
        reason = _truncate_text(finding.get("reason") or "Optional AI analyzer marked this run for review.", 500)
        evidence_quote = _truncate_text(finding.get("evidence_quote") or reason, 500)
        remediation = _truncate_text(finding.get("remediation") or "Review the run evidence and decide whether to add a deterministic rule.", 500)
        rule_key = str(finding.get("rule_key") or "ai_review_note")
        if rule_key not in valid_rule_keys:
            rule_key = "ai_review_note"
        severity = str(finding.get("severity") or "")
        if severity not in valid_severities:
            severity = None
        try:
            confidence = float(finding.get("confidence", 0.65))
        except (TypeError, ValueError):
            confidence = 0.65
        confidence = max(0.0, min(confidence, 0.95))
        normalized.append(
            _risk_event(
                rule_key=rule_key,
                title=title,
                reason=reason,
                evidence_quote=evidence_quote,
                evidence_source="ai_analyzer",
                remediation=remediation,
                confidence=confidence,
                status="needs_review",
                severity=severity,
                owner=str(finding.get("owner") or "Risk/Compliance"),
                analysis_source="ai",
                evidence_refs=[str(finding.get("evidence_ref") or f"ai_finding:{index}")],
            )
        )
    return normalized


async def _maybe_analyze_agent_run_with_ai(
    run: dict[str, Any],
    deterministic_events: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    config = _ai_analysis_config()
    if not config.get("enabled"):
        return [], config

    body = {
        "model": config["model"],
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are Ollive's optional AI risk reviewer for agentic insurance observability. "
                    "Return JSON only. Add review findings when the run shows trust, auditability, "
                    "accountability, authority, missing-evidence, or side-effect risk. Do not mark unknown "
                    "evidence as safe. Do not override deterministic findings."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "instructions": {
                            "schema": {
                                "findings": [
                                    {
                                        "rule_key": "one of the known Ollive policy rule keys, or ai_review_note",
                                        "title": "short title",
                                        "severity": "low|medium|high|critical",
                                        "confidence": 0.0,
                                        "owner": "Engineering|Risk/Compliance|Legal/Compliance|Support|Founder",
                                        "reason": "why this needs review",
                                        "evidence_quote": "short quote from supplied run evidence",
                                        "remediation": "specific next action",
                                        "evidence_ref": "step or field reference if available",
                                    }
                                ]
                            },
                            "allowed_rule_keys": [rule["rule_key"] for rule in RULES],
                            "max_findings": 5,
                        },
                        "agent_run": _agent_run_ai_payload(run, deterministic_events),
                    },
                    default=str,
                ),
            },
        ],
    }
    try:
        import httpx

        async with httpx.AsyncClient(timeout=config["timeout_seconds"]) as client:
            response = await client.post(
                f"{config['base_url']}/chat/completions",
                headers={
                    "Authorization": f"Bearer {config['api_key']}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        ai_events = _normalize_ai_findings(_extract_json_object(content))
        return ai_events, {
            "enabled": True,
            "status": "used",
            "model": config["model"],
            "base_url": config["base_url"],
            "findings": len(ai_events),
        }
    except Exception as exc:
        return [], {
            "enabled": True,
            "status": "error",
            "model": config["model"],
            "base_url": config["base_url"],
            "error": str(exc)[:300],
        }


def _merge_risk_events(
    deterministic_events: list[dict[str, Any]],
    ai_events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    merged = list(deterministic_events)
    seen = {
        (
            event.get("policy_rule_key"),
            event.get("title"),
            event.get("evidence_quote"),
        )
        for event in merged
    }
    for event in ai_events:
        key = (event.get("policy_rule_key"), event.get("title"), event.get("evidence_quote"))
        if key in seen:
            continue
        merged.append(event)
        seen.add(key)
    return merged


async def ensure_risk_schema(pool) -> None:
    async with pool.acquire() as conn:
        await _ensure_risk_schema_conn(conn)


async def _ensure_risk_schema_conn(conn) -> None:
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS agent_policy_rules (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          policy_pack TEXT NOT NULL,
          rule_key TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          risk_category TEXT NOT NULL,
          default_severity TEXT NOT NULL,
          default_owner TEXT NOT NULL,
          match_strategy TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE(policy_pack, rule_key)
        );
        CREATE TABLE IF NOT EXISTS agent_risk_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          trace_id UUID REFERENCES traces(trace_id) ON DELETE CASCADE,
          run_id TEXT,
          conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
          message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
          policy_rule_id UUID REFERENCES agent_policy_rules(id) ON DELETE SET NULL,
          policy_pack TEXT NOT NULL,
          risk_category TEXT NOT NULL,
          status TEXT NOT NULL,
          severity TEXT NOT NULL,
          confidence NUMERIC(5, 4) NOT NULL,
          owner TEXT NOT NULL,
          title TEXT NOT NULL,
          reason TEXT NOT NULL,
          evidence_quote TEXT,
          evidence_source TEXT NOT NULL,
          evidence_refs JSONB NOT NULL DEFAULT '[]',
          remediation TEXT NOT NULL,
          classifier_version TEXT NOT NULL,
          analysis_source TEXT NOT NULL DEFAULT 'deterministic',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        ALTER TABLE agent_risk_events ALTER COLUMN trace_id DROP NOT NULL;
        ALTER TABLE agent_risk_events ADD COLUMN IF NOT EXISTS run_id TEXT;
        ALTER TABLE agent_risk_events ADD COLUMN IF NOT EXISTS evidence_refs JSONB NOT NULL DEFAULT '[]';
        ALTER TABLE agent_risk_events ADD COLUMN IF NOT EXISTS analysis_source TEXT NOT NULL DEFAULT 'deterministic';
        CREATE INDEX IF NOT EXISTS idx_agent_risk_events_trace_id ON agent_risk_events(trace_id);
        CREATE INDEX IF NOT EXISTS idx_agent_risk_events_run_id ON agent_risk_events(run_id);
        CREATE INDEX IF NOT EXISTS idx_agent_risk_events_category ON agent_risk_events(risk_category);
        CREATE INDEX IF NOT EXISTS idx_agent_risk_events_status ON agent_risk_events(status);
        CREATE INDEX IF NOT EXISTS idx_agent_risk_events_analysis_source ON agent_risk_events(analysis_source);
        CREATE TABLE IF NOT EXISTS evidence_packets (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          trace_id UUID REFERENCES traces(trace_id) ON DELETE CASCADE,
          run_id TEXT,
          conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
          status TEXT NOT NULL,
          insurability_posture TEXT NOT NULL,
          summary TEXT NOT NULL,
          packet_json JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        ALTER TABLE evidence_packets ALTER COLUMN trace_id DROP NOT NULL;
        ALTER TABLE evidence_packets ADD COLUMN IF NOT EXISTS run_id TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_packets_trace_id ON evidence_packets(trace_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_packets_run_id ON evidence_packets(run_id);
        """
    )
    for rule in RULES:
        await conn.execute(
            """
            INSERT INTO agent_policy_rules (
              policy_pack, rule_key, title, description, risk_category,
              default_severity, default_owner, match_strategy
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT (policy_pack, rule_key) DO UPDATE SET
              title=EXCLUDED.title,
              description=EXCLUDED.description,
              risk_category=EXCLUDED.risk_category,
              default_severity=EXCLUDED.default_severity,
              default_owner=EXCLUDED.default_owner,
              match_strategy=EXCLUDED.match_strategy
            """,
            POLICY_PACK,
            rule["rule_key"],
            rule["title"],
            rule["description"],
            rule["risk_category"],
            rule["default_severity"],
            rule["default_owner"],
            rule["match_strategy"],
        )


async def mark_evidence_packet_pending(conn, trace_id: UUID) -> None:
    await _ensure_risk_schema_conn(conn)
    trace = await conn.fetchrow("SELECT trace_id, conversation_id FROM traces WHERE trace_id=$1", trace_id)
    if not trace:
        return
    await conn.execute(
        """
        INSERT INTO evidence_packets (
          trace_id, conversation_id, status, insurability_posture, summary, packet_json
        ) VALUES ($1,$2,'pending','unknown','Evidence packet generation is pending.',$3)
        ON CONFLICT (trace_id) DO UPDATE SET
          status='pending',
          insurability_posture='unknown',
          summary='Evidence packet generation is pending.',
          updated_at=now()
        """,
        trace_id,
        trace["conversation_id"],
        json.dumps(
            {
                "assessment": _assessment_metadata([]),
                "policy_pack": POLICY_PACK,
                "classifier_version": CLASSIFIER_VERSION,
            }
        ),
    )


def classify_trace(trace: dict[str, Any], events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    user_text = _as_text(trace.get("user_preview"))
    assistant_text = _as_text(trace.get("assistant_preview"))
    event_text = _event_payload_text(events)
    corpus = "\n".join([user_text, assistant_text, event_text])
    event_types = {str(event.get("type")) for event in events}
    risk_events: list[dict[str, Any]] = []

    promise_marker = _contains_any(assistant_text, PROMISE_TERMS)
    coverage_marker = _contains_any(assistant_text, COVERAGE_TERMS)
    user_coverage_marker = _contains_any(user_text, COVERAGE_TERMS)
    authority_marker = _contains_any(assistant_text, AUTHORITY_TERMS)
    unsafe_marker = _matches_any_pattern(assistant_text, UNSAFE_PATTERNS)

    if promise_marker:
        risk_events.append(
            _risk_event(
                rule_key="promise_guarantee",
                title="Risky promise detected",
                reason="The assistant used commitment language that may create a customer-facing obligation.",
                evidence_quote=_evidence_quote(assistant_text, promise_marker, corpus),
                evidence_source="assistant_message",
                remediation="Require non-binding language or human approval before promises about reimbursement, refunds, approvals, or coverage.",
                confidence=0.9,
            )
        )

    if coverage_marker:
        risk_events.append(
            _risk_event(
                rule_key="coverage_advice",
                title="Coverage or regulated advice detected",
                reason="The assistant discussed coverage, claims, policy terms, or regulated-adjacent guidance without proving authority.",
                evidence_quote=_evidence_quote(assistant_text, coverage_marker, corpus),
                evidence_source="assistant_message",
                remediation="Require policy context retrieval and licensed/human review before coverage guidance.",
                confidence=0.82,
            )
        )
    elif user_coverage_marker:
        risk_events.append(
            _risk_event(
                rule_key="coverage_advice",
                title="Coverage question needs review",
                reason="The user asked for coverage or policy guidance, so the agent response should be reviewed for authority boundaries.",
                evidence_quote=_evidence_quote(user_text, user_coverage_marker, corpus),
                evidence_source="user_message",
                remediation="Route coverage-related questions through a policy-aware workflow or human review.",
                confidence=0.6,
            )
        )

    if trace.get("pii_detected"):
        risk_events.append(
            _risk_event(
                rule_key="pii_detected",
                title="Sensitive data entered the trace path",
                reason="The trace was flagged by redaction checks, which is a trust and auditability concern.",
                evidence_quote="PII flag was true on the trace.",
                evidence_source="runtime",
                remediation="Show redaction category and avoid storing raw sensitive payloads in evidence packets.",
                confidence=0.95,
            )
        )

    if (coverage_marker or user_coverage_marker or promise_marker) and not (event_types & ESCALATION_EVENTS):
        risk_events.append(
            _risk_event(
                rule_key="handoff_missing",
                title="Required escalation appears missing",
                reason="Coverage or promise risk appeared without a human handoff, escalation, or review-required event.",
                evidence_quote="No human_handoff, escalation, or review_required trace event was found.",
                evidence_source="trace_event",
                remediation="Emit a review_required or human_handoff event for regulated, coverage, or commitment-bearing interactions.",
                confidence=0.72,
            )
        )

    has_tool_evidence = bool(event_types & {"tool_call", "tool_result", "retrieval", "source"})
    if (coverage_marker or authority_marker) and not has_tool_evidence:
        risk_events.append(
            _risk_event(
                rule_key="unsupported_claim",
                title="Unsupported claim detected",
                reason="The assistant asserted coverage, approval, denial, or eligibility without source/tool evidence in the trace.",
                evidence_quote=_evidence_quote(assistant_text, coverage_marker or authority_marker, corpus),
                evidence_source="assistant_message",
                remediation="Attach source policy/tool evidence to the run before treating the answer as reliable.",
                confidence=0.7,
            )
        )

    if unsafe_marker:
        risk_events.append(
            _risk_event(
                rule_key="unsafe_action",
                title="Unsafe action suggestion detected",
                reason="The assistant suggested an action that may create business, legal, or customer harm.",
                evidence_quote=_evidence_quote(assistant_text, None, assistant_text),
                evidence_source="assistant_message",
                remediation="Block or escalate unsafe action recommendations before they reach customers.",
                confidence=0.82,
            )
        )

    if authority_marker:
        risk_events.append(
            _risk_event(
                rule_key="authority_breach",
                title="Authority boundary breach detected",
                reason="The assistant appeared to approve, deny, refund, reimburse, guarantee, or bind coverage beyond informational support.",
                evidence_quote=_evidence_quote(assistant_text, authority_marker, corpus),
                evidence_source="assistant_message",
                remediation="Constrain the agent to informational support and require human approval for binding decisions.",
                confidence=0.88,
            )
        )

    status = str(trace.get("status") or "queued")
    missing_terminal = bool(events) and not (event_types & TERMINAL_EVENTS)
    if status in {"error", "timeout", "cancelled"} or not events or missing_terminal or not assistant_text:
        reason = "Runtime evidence shows a failed or incomplete workflow state."
        if status in {"error", "timeout", "cancelled"}:
            reason = f"Trace ended with status {status}."
        elif not events:
            reason = "No runtime events were captured for this trace."
        elif missing_terminal:
            reason = "Trace events are missing a terminal event."
        elif not assistant_text:
            reason = "Trace is missing assistant response evidence."
        risk_events.append(
            _risk_event(
                rule_key="runtime_failure_node",
                title="Workflow failure node detected",
                reason=reason,
                evidence_quote=reason,
                evidence_source="runtime",
                remediation="Complete the trace lifecycle and record terminal state before trusting this run.",
                confidence=0.9,
            )
        )

    return risk_events


def _run_step_text(steps: list[dict[str, Any]], step_types: set[str] | None = None) -> str:
    parts: list[str] = []
    for step in steps:
        if step_types and str(step.get("type")) not in step_types:
            continue
        parts.append(_as_text(step.get("input")))
        parts.append(_as_text(step.get("output")))
        parts.append(_as_text(step.get("error")))
    return "\n".join(part for part in parts if part)


def _project_run_to_trace(run: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    steps = run.get("steps") or []
    user_text = _as_text(run.get("task_input"))
    assistant_text = _run_step_text(steps, {"model_call", "external_action"})
    event_rows = []
    for step in steps:
        event_rows.append(
            {
                "id": step.get("id") or step.get("step_id"),
                "type": step.get("type"),
                "timestamp": step.get("timestamp"),
                "payload": {
                    "name": step.get("name"),
                    "status": step.get("status"),
                    "input": step.get("input"),
                    "output": step.get("output"),
                    "error": step.get("error"),
                    "evidence_ref": step.get("evidence_ref"),
                },
            }
        )
    outcome = run.get("outcome") or {}
    evidence = run.get("evidence") or {}
    if outcome.get("status") in {"success", "failed", "cancelled", "timeout"}:
        event_rows.append(
            {
                "id": f"{run.get('run_id')}:outcome",
                "type": "stream_completed" if outcome.get("status") == "success" else outcome.get("status"),
                "timestamp": run.get("completed_at"),
                "payload": outcome,
            }
        )
    trace_like = {
        "trace_id": run.get("trace_id") or run.get("run_id"),
        "conversation_id": run.get("conversation_id"),
        "message_id": None,
        "status": outcome.get("status") or run.get("outcome_status") or "unknown",
        "user_preview": user_text,
        "assistant_preview": assistant_text or _as_text(outcome.get("summary")),
        "pii_detected": bool(evidence.get("pii_detected")),
    }
    return trace_like, event_rows


def classify_agent_run(run: dict[str, Any]) -> list[dict[str, Any]]:
    trace_like, events = _project_run_to_trace(run)
    risk_events = classify_trace(trace_like, events)
    steps = run.get("steps") or []
    authority = run.get("authority") or {}
    step_types = {str(step.get("type")) for step in steps}

    if not authority:
        risk_events.append(
            _risk_event(
                rule_key="runtime_failure_node",
                title="Authority scope missing",
                reason="The run did not include authority scope, allowed actions, disallowed actions, or handoff requirements.",
                evidence_quote="AgentRun.authority was empty.",
                evidence_source="agent_run",
                remediation="Send authority scope with each run so Ollive can detect boundary breaches.",
                confidence=0.86,
                status="needs_review",
                severity="medium",
                owner="Engineering",
            )
        )
    if not steps:
        risk_events.append(
            _risk_event(
                rule_key="runtime_failure_node",
                title="No agent steps captured",
                reason="The run had no ordered steps, so Ollive cannot inspect model calls, tools, handoffs, or side effects.",
                evidence_quote="AgentRun.steps was empty.",
                evidence_source="agent_run",
                remediation="Record at least one user/task step and one model, tool, or outcome step.",
                confidence=0.94,
                severity="high",
                owner="Engineering",
            )
        )
    elif "model_call" not in step_types and "external_action" not in step_types:
        risk_events.append(
            _risk_event(
                rule_key="runtime_failure_node",
                title="Model or action evidence missing",
                reason="The run did not include a model_call or external_action step.",
                evidence_quote="No model_call or external_action step was captured.",
                evidence_source="agent_run",
                remediation="Record model calls and external actions before treating the run as observable.",
                confidence=0.82,
                status="needs_review",
                severity="medium",
                owner="Engineering",
            )
        )
    if "external_action" in step_types and "human_handoff" not in step_types:
        external_action_text = _run_step_text(steps, {"external_action"})
        risk_events.append(
            _risk_event(
                rule_key="side_effect_without_handoff",
                title="Side effect lacks approval evidence",
                reason="The run recorded an external action but did not include a human handoff, review, or approval step.",
                evidence_quote=_evidence_quote(external_action_text, None, external_action_text)
                or "External action was recorded without human_handoff.",
                evidence_source="agent_run_step",
                remediation="Emit a human_handoff or approval step before external actions that mutate customer, claim, policy, payment, or ticket state.",
                confidence=0.88,
                severity="high",
                owner="Risk/Compliance",
                evidence_refs=[
                    str(step.get("step_id") or step.get("id") or "external_action")
                    for step in steps
                    if str(step.get("type")) == "external_action"
                ],
            )
        )
    return risk_events


def _agent_run_failure_nodes(run: dict[str, Any], risk_events: list[dict[str, Any]]) -> list[dict[str, str]]:
    trace_like, events = _project_run_to_trace(run)
    nodes = _failure_nodes(trace_like, events, risk_events)
    authority = run.get("authority") or {}
    steps = run.get("steps") or []
    step_types = {str(step.get("type")) for step in steps}
    if not authority:
        nodes.append(
            {
                "type": "missing_authority_scope",
                "owner": "Engineering",
                "evidence": "No authority scope was supplied with this run.",
            }
        )
    if not steps:
        nodes.append(
            {
                "type": "missing_agent_steps",
                "owner": "Engineering",
                "evidence": "No agent steps were supplied with this run.",
            }
        )
    if "external_action" in step_types and "human_handoff" not in step_types:
        nodes.append(
            {
                "type": "side_effect_without_handoff",
                "owner": "Risk/Compliance",
                "evidence": "The run recorded an external action but no human handoff or approval step.",
            }
        )
    return nodes


async def generate_evidence_packet(conn, trace_id: UUID) -> dict[str, Any]:
    await _ensure_risk_schema_conn(conn)
    trace_row = await conn.fetchrow("SELECT * FROM traces WHERE trace_id=$1", trace_id)
    if not trace_row:
        raise ValueError("Trace not found")
    trace = _row_to_dict(trace_row)
    events = [
        _row_to_dict(row)
        for row in await conn.fetch(
            "SELECT id, trace_id, type, timestamp, duration_ms, payload FROM trace_events WHERE trace_id=$1 ORDER BY timestamp ASC",
            trace_id,
        )
    ]
    for event in events:
        event["payload"] = _loads_json(event.get("payload"))

    from .agent_runtime import fetch_agent_run, upsert_agent_run_from_trace

    run_id = await upsert_agent_run_from_trace(conn, trace, events)
    risk_events = classify_trace(trace, events)
    run = await fetch_agent_run(conn, run_id)
    ai_events, ai_status = await _maybe_analyze_agent_run_with_ai(run or {}, risk_events)
    risk_events = _merge_risk_events(risk_events, ai_events)
    failure_nodes = _failure_nodes(trace, events, risk_events)
    posture = _terminal_posture(trace, risk_events, "ready")
    summary = _packet_summary(posture, risk_events, failure_nodes)
    packet_json = {
        "assessment": _assessment_metadata(risk_events),
        "failure_nodes": failure_nodes,
        "audit_trail": {
            "policy_pack": POLICY_PACK,
            "classifier_version": CLASSIFIER_VERSION,
            "source_trace_events": len(events),
            "redacted": True,
            "redaction_status": "applied",
            "redaction_scope": "packet_previews_only",
            "llm_classifier": ai_status.get("status", "disabled"),
            "ai_analyzer": ai_status,
        },
    }

    async with conn.transaction():
        await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))", f"ollive:trace-packet:{trace_id}")
        await conn.execute("DELETE FROM agent_risk_events WHERE trace_id=$1", trace_id)
        rule_rows = await conn.fetch("SELECT id, rule_key FROM agent_policy_rules WHERE policy_pack=$1", POLICY_PACK)
        rule_ids = {row["rule_key"]: row["id"] for row in rule_rows}
        for event in risk_events:
            await conn.execute(
            """
                INSERT INTO agent_risk_events (
                  trace_id, run_id, conversation_id, message_id, policy_rule_id,
                  policy_pack, risk_category, status, severity, confidence,
                  owner, title, reason, evidence_quote, evidence_source,
                  evidence_refs, remediation, classifier_version, analysis_source
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
                """,
                trace_id,
                run_id,
                trace.get("conversation_id"),
                trace.get("message_id"),
                rule_ids.get(event["policy_rule_key"]),
                POLICY_PACK,
                event["risk_category"],
                event["status"],
                event["severity"],
                Decimal(str(event["confidence"])),
                event["owner"],
                event["title"],
                event["reason"],
                event["evidence_quote"],
                event["evidence_source"],
                json.dumps(event.get("evidence_refs") or []),
                event["remediation"],
                event["classifier_version"],
                event.get("analysis_source", "deterministic"),
            )
        await conn.execute(
            """
            INSERT INTO evidence_packets (
              trace_id, run_id, conversation_id, status, insurability_posture, summary, packet_json
            ) VALUES ($1,$2,$3,'ready',$4,$5,$6)
            ON CONFLICT (trace_id) DO UPDATE SET
              run_id=EXCLUDED.run_id,
              status='ready',
              insurability_posture=EXCLUDED.insurability_posture,
              summary=EXCLUDED.summary,
              packet_json=EXCLUDED.packet_json,
              updated_at=now()
            """,
            trace_id,
            run_id,
            trace.get("conversation_id"),
            posture,
            summary,
            json.dumps(packet_json),
        )

    return await get_evidence_packet(conn, trace_id)


async def generate_agent_run_evidence_packet(conn, run_id: str) -> dict[str, Any]:
    await _ensure_risk_schema_conn(conn)
    from .agent_runtime import fetch_agent_run

    run = await fetch_agent_run(conn, run_id)
    if not run:
        raise ValueError("AgentRun not found")
    risk_events = classify_agent_run(run)
    ai_events, ai_status = await _maybe_analyze_agent_run_with_ai(run, risk_events)
    risk_events = _merge_risk_events(risk_events, ai_events)
    failure_nodes = _agent_run_failure_nodes(run, risk_events)
    trace_like, events = _project_run_to_trace(run)
    posture = _terminal_posture(trace_like, risk_events, "ready")
    summary = _packet_summary(posture, risk_events, failure_nodes)
    redaction_provenance = _redaction_provenance(run.get("evidence") or {})
    packet_json = {
        "assessment": _assessment_metadata(risk_events),
        "failure_nodes": failure_nodes,
        "audit_trail": {
            "policy_pack": POLICY_PACK,
            "classifier_version": CLASSIFIER_VERSION,
            "source_trace_events": len(events),
            "source_agent_steps": len(run.get("steps") or []),
            **redaction_provenance,
            "llm_classifier": ai_status.get("status", "disabled"),
            "ai_analyzer": ai_status,
            "run_source": run.get("source"),
        },
    }

    async with conn.transaction():
        await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))", f"ollive:run-packet:{run_id}")
        await conn.execute("DELETE FROM agent_risk_events WHERE run_id=$1", run_id)
        rule_rows = await conn.fetch("SELECT id, rule_key FROM agent_policy_rules WHERE policy_pack=$1", POLICY_PACK)
        rule_ids = {row["rule_key"]: row["id"] for row in rule_rows}
        for event in risk_events:
            await conn.execute(
                """
                INSERT INTO agent_risk_events (
                  trace_id, run_id, conversation_id, message_id, policy_rule_id,
                  policy_pack, risk_category, status, severity, confidence,
                  owner, title, reason, evidence_quote, evidence_source,
                  evidence_refs, remediation, classifier_version, analysis_source
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
                """,
                run.get("trace_id"),
                run_id,
                run.get("conversation_id"),
                None,
                rule_ids.get(event["policy_rule_key"]),
                POLICY_PACK,
                event["risk_category"],
                event["status"],
                event["severity"],
                Decimal(str(event["confidence"])),
                event["owner"],
                event["title"],
                event["reason"],
                event["evidence_quote"],
                event["evidence_source"],
                json.dumps(event.get("evidence_refs") or []),
                event["remediation"],
                event["classifier_version"],
                event.get("analysis_source", "deterministic"),
            )
        await conn.execute(
            """
            INSERT INTO evidence_packets (
              trace_id, run_id, conversation_id, status, insurability_posture, summary, packet_json
            ) VALUES ($1,$2,$3,'ready',$4,$5,$6)
            ON CONFLICT (run_id) DO UPDATE SET
              trace_id=EXCLUDED.trace_id,
              conversation_id=EXCLUDED.conversation_id,
              status='ready',
              insurability_posture=EXCLUDED.insurability_posture,
              summary=EXCLUDED.summary,
              packet_json=EXCLUDED.packet_json,
              updated_at=now()
            """,
            run.get("trace_id"),
            run_id,
            run.get("conversation_id"),
            posture,
            summary,
            json.dumps(packet_json),
        )
    return await get_agent_run_evidence_packet(conn, run_id)


async def mark_evidence_packet_error(conn, trace_id: UUID, message: str) -> None:
    await _ensure_risk_schema_conn(conn)
    trace = await conn.fetchrow("SELECT trace_id, conversation_id FROM traces WHERE trace_id=$1", trace_id)
    if not trace:
        return
    await conn.execute(
        """
        INSERT INTO evidence_packets (
          trace_id, conversation_id, status, insurability_posture, summary, packet_json
        ) VALUES ($1,$2,'error','unknown',$3,$4)
        ON CONFLICT (trace_id) DO UPDATE SET
          status='error',
          insurability_posture='unknown',
          summary=EXCLUDED.summary,
          packet_json=EXCLUDED.packet_json,
          updated_at=now()
        """,
        trace_id,
        trace["conversation_id"],
        message[:500],
        json.dumps(
            {
                "assessment": _assessment_metadata([]),
                "error": message[:500],
                "policy_pack": POLICY_PACK,
                "classifier_version": CLASSIFIER_VERSION,
            }
        ),
    )


async def generate_evidence_packet_background(trace_id: UUID) -> None:
    if db.pool is None:
        return
    async with db.pool.acquire() as conn:
        try:
            await generate_evidence_packet(conn, trace_id)
        except Exception as exc:
            await mark_evidence_packet_error(conn, trace_id, f"Evidence packet generation failed: {exc}")


def schedule_evidence_packet(trace_id: UUID) -> None:
    try:
        asyncio.create_task(generate_evidence_packet_background(trace_id))
    except RuntimeError:
        pass


async def get_evidence_packet(conn, trace_id: UUID) -> dict[str, Any]:
    await _ensure_risk_schema_conn(conn)
    packet = await conn.fetchrow(
        """
        SELECT id, trace_id, conversation_id, status, insurability_posture,
               run_id, summary, packet_json, created_at, updated_at
        FROM evidence_packets
        WHERE trace_id=$1
        """,
        trace_id,
    )
    if not packet:
        trace = await conn.fetchrow("SELECT trace_id, conversation_id FROM traces WHERE trace_id=$1", trace_id)
        if not trace:
            raise ValueError("Trace not found")
        await mark_evidence_packet_pending(conn, trace_id)
        packet = await conn.fetchrow(
            """
            SELECT id, trace_id, conversation_id, status, insurability_posture,
                   run_id, summary, packet_json, created_at, updated_at
            FROM evidence_packets
            WHERE trace_id=$1
            """,
            trace_id,
        )
        schedule_evidence_packet(trace_id)

    risk_rows = await conn.fetch(
        """
        SELECT id, trace_id, run_id, risk_category, status, severity, confidence, owner,
               title, reason, evidence_quote, evidence_source, evidence_refs,
               remediation, classifier_version, analysis_source, created_at
        FROM agent_risk_events
        WHERE trace_id=$1
        ORDER BY
          CASE severity
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
            ELSE 5
          END,
          confidence DESC,
          created_at ASC
        """,
        trace_id,
    )

    packet_dict = _row_to_dict(packet)
    packet_json = _loads_json(packet_dict.get("packet_json")) or {}
    risk_events = []
    for row in risk_rows:
        event = _row_to_dict(row)
        event["confidence"] = float(event["confidence"]) if event.get("confidence") is not None else 0
        event["evidence_refs"] = _loads_json(event.get("evidence_refs")) or []
        risk_events.append(event)

    audit_trail = packet_json.get("audit_trail") if isinstance(packet_json, dict) else None
    failure_nodes = packet_json.get("failure_nodes") if isinstance(packet_json, dict) else None
    assessment = packet_json.get("assessment") if isinstance(packet_json, dict) else None
    return {
        "packet": packet_dict,
        "risk_events": risk_events,
        "failure_nodes": failure_nodes or [],
        "assessment": assessment or _assessment_metadata(risk_events),
        "audit_trail": audit_trail
        or {
            "policy_pack": POLICY_PACK,
            "classifier_version": CLASSIFIER_VERSION,
            "source_trace_events": 0,
            "redacted": True,
            "redaction_status": "applied",
            "redaction_scope": "packet_previews_only",
        },
    }


async def get_agent_run_evidence_packet(conn, run_id: str) -> dict[str, Any]:
    await _ensure_risk_schema_conn(conn)
    packet = await conn.fetchrow(
        """
        SELECT id, trace_id, run_id, conversation_id, status, insurability_posture,
               summary, packet_json, created_at, updated_at
        FROM evidence_packets
        WHERE run_id=$1
        """,
        run_id,
    )
    if not packet:
        run = await conn.fetchrow("SELECT run_id, conversation_id, trace_id FROM agent_runs WHERE run_id=$1", run_id)
        if not run:
            raise ValueError("AgentRun not found")
        await conn.execute(
            """
            INSERT INTO evidence_packets (
              trace_id, run_id, conversation_id, status, insurability_posture, summary, packet_json
            ) VALUES ($1,$2,$3,'pending','unknown','Evidence packet generation is pending.',$4)
            ON CONFLICT (run_id) DO UPDATE SET
              status='pending',
              insurability_posture='unknown',
              summary='Evidence packet generation is pending.',
              updated_at=now()
            """,
            run["trace_id"],
            run_id,
            run["conversation_id"],
            json.dumps(
                {
                    "assessment": _assessment_metadata([]),
                    "policy_pack": POLICY_PACK,
                    "classifier_version": CLASSIFIER_VERSION,
                }
            ),
        )
        return await generate_agent_run_evidence_packet(conn, run_id)

    risk_rows = await conn.fetch(
        """
        SELECT id, trace_id, run_id, risk_category, status, severity, confidence, owner,
               title, reason, evidence_quote, evidence_source, evidence_refs,
               remediation, classifier_version, analysis_source, created_at
        FROM agent_risk_events
        WHERE run_id=$1
        ORDER BY
          CASE severity
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
            ELSE 5
          END,
          confidence DESC,
          created_at ASC
        """,
        run_id,
    )

    packet_dict = _row_to_dict(packet)
    packet_json = _loads_json(packet_dict.get("packet_json")) or {}
    risk_events = []
    for row in risk_rows:
        event = _row_to_dict(row)
        event["confidence"] = float(event["confidence"]) if event.get("confidence") is not None else 0
        event["evidence_refs"] = _loads_json(event.get("evidence_refs")) or []
        risk_events.append(event)
    audit_trail = packet_json.get("audit_trail") if isinstance(packet_json, dict) else None
    failure_nodes = packet_json.get("failure_nodes") if isinstance(packet_json, dict) else None
    assessment = packet_json.get("assessment") if isinstance(packet_json, dict) else None
    return {
        "packet": packet_dict,
        "risk_events": risk_events,
        "failure_nodes": failure_nodes or [],
        "assessment": assessment or _assessment_metadata(risk_events),
        "audit_trail": audit_trail
        or {
            "policy_pack": POLICY_PACK,
            "classifier_version": CLASSIFIER_VERSION,
            "source_agent_steps": 0,
            "redacted": False,
            "redaction_status": "unknown",
        },
    }
