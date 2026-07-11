import json
import unittest
from pathlib import Path

from apps.api.app.risk_classifier import (
    ASSESSMENT_VERSION,
    CLASSIFIER_VERSION,
    _assessment_metadata,
    _normalize_ai_findings,
    _redaction_provenance,
    classify_agent_run,
)


FIXTURE_DIR = Path(__file__).parent / "fixtures" / "agent_runs"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))


class AgentRunEvalTests(unittest.TestCase):
    def test_classifier_version_is_v2(self):
        self.assertEqual(CLASSIFIER_VERSION, "risk-classifier-v2")

    def test_safe_claim_info_has_no_material_findings(self):
        findings = classify_agent_run(load_fixture("safe_claim_info.json"))
        self.assertEqual(findings, [])

    def test_risky_coverage_promise_flags_insurance_risk(self):
        findings = classify_agent_run(load_fixture("risky_coverage_promise.json"))
        categories = {finding["risk_category"] for finding in findings}
        analysis_sources = {finding["analysis_source"] for finding in findings}

        self.assertIn("risky_promise", categories)
        self.assertIn("coverage_or_regulated_advice", categories)
        self.assertIn("missed_escalation", categories)
        self.assertIn("authority_boundary_breach", categories)
        self.assertEqual(analysis_sources, {"deterministic"})

    def test_incomplete_run_makes_missing_evidence_visible(self):
        findings = classify_agent_run(load_fixture("incomplete_missing_authority.json"))
        titles = {finding["title"] for finding in findings}

        self.assertIn("Authority scope missing", titles)
        self.assertIn("No agent steps captured", titles)

    def test_side_effect_without_handoff_is_first_class_risk(self):
        findings = classify_agent_run(load_fixture("side_effect_without_handoff.json"))
        side_effect_findings = [
            finding for finding in findings if finding["risk_category"] == "side_effect_without_approval"
        ]

        self.assertEqual(len(side_effect_findings), 1)
        self.assertEqual(side_effect_findings[0]["analysis_source"], "deterministic")
        self.assertIn("step_external_action", side_effect_findings[0]["evidence_refs"])

    def test_ai_findings_are_normalized_as_review_only(self):
        findings = _normalize_ai_findings(
            {
                "findings": [
                    {
                        "rule_key": "made_up_rule",
                        "title": "Subtle workflow concern",
                        "severity": "critical",
                        "confidence": 1.4,
                        "reason": "The run might have acted without enough evidence.",
                        "evidence_quote": "acted without enough evidence",
                        "remediation": "Review and add a deterministic rule if this repeats.",
                        "evidence_ref": "step_1",
                    }
                ]
            }
        )

        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["policy_rule_key"], "ai_review_note")
        self.assertEqual(findings[0]["analysis_source"], "ai")
        self.assertEqual(findings[0]["status"], "needs_review")
        self.assertEqual(findings[0]["confidence"], 0.95)

    def test_assessment_separates_policy_findings_and_evidence_gaps(self):
        findings = classify_agent_run(load_fixture("incomplete_missing_authority.json"))
        assessment = _assessment_metadata(findings)

        self.assertEqual(assessment["version"], ASSESSMENT_VERSION)
        self.assertEqual(assessment["status"], "experimental")
        self.assertEqual(assessment["decision_use"], "review_support_only")
        self.assertGreaterEqual(assessment["finding_classes"]["evidence_quality_gaps"], 2)
        self.assertTrue(assessment["finding_classes"]["unevaluated_domains"])

    def test_missing_redaction_provenance_stays_unknown(self):
        self.assertEqual(
            _redaction_provenance({}),
            {"redacted": False, "redaction_status": "unknown"},
        )
        self.assertEqual(
            _redaction_provenance({"redaction_applied": True}),
            {"redacted": True, "redaction_status": "applied"},
        )


if __name__ == "__main__":
    unittest.main()
