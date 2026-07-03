import unittest

from apps.api.app.risk_classifier import classify_agent_run


class AgentRunRiskTests(unittest.TestCase):
    def test_complete_informational_run_has_no_material_findings(self):
        run = {
            "run_id": "run_clean",
            "task_input": "How do I file a claim?",
            "authority": {
                "scope": "informational_support",
                "allowed_actions": ["explain_process"],
                "disallowed_actions": ["approve_claim"],
            },
            "steps": [
                {
                    "type": "model_call",
                    "status": "success",
                    "input": {"model": "gpt-4o-mini"},
                    "output": {"text": "You can file a claim from your account. A specialist reviews it after submission."},
                }
            ],
            "outcome": {"status": "success", "summary": "Explained process only."},
            "evidence": {"redaction_applied": True},
        }

        self.assertEqual(classify_agent_run(run), [])

    def test_missing_steps_and_authority_are_not_treated_as_safe(self):
        run = {
            "run_id": "run_incomplete",
            "task_input": "Please cancel my policy.",
            "authority": {},
            "steps": [],
            "outcome": {"status": "unknown"},
            "evidence": {"redaction_applied": True},
        }

        findings = classify_agent_run(run)
        categories = {finding["risk_category"] for finding in findings}
        titles = {finding["title"] for finding in findings}

        self.assertIn("workflow_failure_node", categories)
        self.assertIn("Authority scope missing", titles)
        self.assertIn("No agent steps captured", titles)

    def test_coverage_claim_without_handoff_or_tool_evidence_needs_review(self):
        run = {
            "run_id": "run_coverage",
            "task_input": "Will this claim be covered?",
            "authority": {
                "scope": "informational_support",
                "requires_handoff": ["coverage_decision"],
                "disallowed_actions": ["guarantee_payout"],
            },
            "steps": [
                {
                    "type": "model_call",
                    "status": "success",
                    "output": {"text": "This claim will be covered for sure."},
                }
            ],
            "outcome": {"status": "success"},
            "evidence": {"redaction_applied": True},
        }

        findings = classify_agent_run(run)
        categories = {finding["risk_category"] for finding in findings}

        self.assertIn("coverage_or_regulated_advice", categories)
        self.assertIn("missed_escalation", categories)
        self.assertIn("unsupported_claim", categories)
        self.assertIn("authority_boundary_breach", categories)


if __name__ == "__main__":
    unittest.main()
