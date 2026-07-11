# Security Policy

Ollive v0.1 is an experimental, single-trust-domain reference implementation.
It is not a hardened production service and has no security SLA, response-time
commitment, or guaranteed maintenance window.

## Reporting

No private vulnerability-reporting channel is currently maintained for this
repository. Do not publish credentials, customer data, private prompts, or a
weaponized exploit in a public issue. A safely sanitized problem may be filed
through the GitHub issue tracker, but a response or fix is not guaranteed.

If a report cannot be made safe for public disclosure, disable the affected
component or maintain the fix in a private fork until a private channel exists.

## Security Boundaries

- Docker Compose is a local development/reference stack, not a production
  deployment profile.
- `OLLIVE_INGEST_TOKEN` is one optional shared collector secret. It is not
  tenant-scoped authorization.
- The API stores source evidence and can store raw model/tool payloads. Do not
  send secrets or regulated data without applying your own minimization,
  redaction, retention, and access controls.
- Optional BYOK AI review can send task and step evidence to the configured
  OpenAI-compatible endpoint.
- Packet findings are heuristic review support, not safety, compliance,
  underwriting, or insurance decisions.

Use a private network, real secrets, restricted origins, TLS, tenant-aware
authorization, retention controls, and an independent security review before
adapting this code for any shared or sensitive environment.
