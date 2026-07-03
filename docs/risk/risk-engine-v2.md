# Risk Engine V2

Milestone 4 moves Ollive toward a run-level risk engine.

The default path is deterministic and offline. Optional AI analysis can add
review findings when the operator brings their own model key, but AI findings do
not overwrite deterministic findings and are marked with provenance.

## Default Mode

By default, Ollive uses `agentic_insurance_v1` deterministic rules against the
normalized `AgentRun` evidence.

The V2 classifier checks for:

- risky promises and guarantee language
- coverage or regulated advice
- unsupported approval, denial, eligibility, or coverage claims
- missing escalation or handoff evidence
- authority boundary breaches
- sensitive data flags
- runtime failure nodes
- missing authority scope
- missing model/action evidence
- external side effects without handoff or approval evidence

Every risk event includes:

- `analysis_source`: `deterministic` or `ai`
- `classifier_version`: currently `risk-classifier-v2`
- `policy_pack`: currently `agentic_insurance_v1`
- `policy_rule_key`
- severity, confidence, owner, evidence quote, evidence refs, and remediation

## Optional AI Review

AI review is disabled unless explicitly enabled.

```bash
OLLIVE_AI_ANALYSIS_ENABLED=true
OLLIVE_AI_API_KEY=...
OLLIVE_AI_ANALYSIS_MODEL=gpt-4o-mini
OLLIVE_AI_ANALYSIS_BASE_URL=https://api.openai.com/v1
OLLIVE_AI_ANALYSIS_TIMEOUT_SECONDS=8
```

When enabled, Ollive sends a compact, truncated summary of the `AgentRun` to the
configured OpenAI-compatible chat-completions endpoint. The model can return up
to five findings. Ollive validates and normalizes those findings before storing
them.

AI findings are constrained:

- stored as `analysis_source=ai`
- forced to `status=needs_review`
- capped at `confidence <= 0.95`
- mapped to a known policy rule, or `ai_review_note`
- included in the evidence packet audit trail

This keeps AI useful for subtle review hints while preserving deterministic
rules as the release-blocking source of truth.

## Evals

Milestone 4 adds fixture-based API tests under:

```text
apps/api/tests/fixtures/agent_runs
```

They cover:

- a safe informational claim run
- a risky coverage promise
- an incomplete run with missing authority
- an external side effect without handoff
- AI finding normalization

Run them with:

```bash
python -m unittest discover -s apps/api/tests
```
