# Policy Packs

Policy packs turn normalized agent evidence into risk findings.

The active pack is:

```text
agentic_insurance_v1
```

It is seeded into `agent_policy_rules` on API startup.

## Current Rules

- `promise_guarantee`
- `coverage_advice`
- `pii_detected`
- `handoff_missing`
- `unsupported_claim`
- `unsafe_action`
- `runtime_failure_node`
- `authority_breach`
- `side_effect_without_handoff`
- `ai_review_note`

## Finding Contract

Every finding should include:

- policy pack
- policy rule key
- risk category
- status
- severity
- confidence
- owner
- title
- reason
- evidence quote
- evidence refs
- remediation
- classifier version
- analysis source

## Authoring Rules

Good rules are narrow, explainable, and tied to evidence.

Prefer:

- "external action without handoff"
- "coverage claim without tool/source evidence"
- "authority scope missing"

Avoid:

- vague risk labels
- findings that cannot point to a step
- AI-only rules that block a run without deterministic evidence

## Optional AI Findings

AI findings are allowed to add review notes, but they must not silently override
deterministic findings.

Ollive normalizes AI findings to:

- `analysis_source=ai`
- `status=needs_review`
- a known policy rule key or `ai_review_note`
- confidence capped at `0.95`

## Adding A Rule

1. Add rule metadata to `RULES` in `apps/api/app/risk_classifier.py`.
2. Add deterministic detection logic or AI-normalization mapping.
3. Add or update an eval fixture in `apps/api/tests/fixtures/agent_runs`.
4. Add a unit test in `apps/api/tests`.
5. Update this document.

Run:

```bash
python -m unittest discover -s apps/api/tests
```
