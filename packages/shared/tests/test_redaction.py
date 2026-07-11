import unittest

from packages.shared.redaction import redact_text, redact_preview


class RedactionTests(unittest.TestCase):
    def test_redact_email(self):
        text = "Contact me at alice@example.com for details."
        redacted, findings = redact_text(text)
        self.assertIn("[REDACTED]", redacted)
        self.assertTrue(any(item["type"] == "email" for item in findings))

    def test_redact_phone(self):
        text = "Call +1 (555) 123-4567 tomorrow."
        redacted, findings = redact_text(text)
        self.assertIn("[REDACTED]", redacted)
        self.assertTrue(any(item["type"] == "phone" for item in findings))

    def test_preview_length_and_redaction(self):
        text = "alice@example.com " + "a" * 500
        preview = redact_preview(text, max_len=100)
        self.assertLessEqual(len(preview), 100)
        self.assertIn("[REDACTED]", preview)


if __name__ == "__main__":
    unittest.main()
