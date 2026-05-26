from packages.shared.redaction import redact_text, redact_preview


def test_redact_email():
    t = 'Contact me at alice@example.com for details.'
    red, r = redact_text(t)
    assert '[REDACTED]' in red
    assert any(x['type']=='email' for x in r)


def test_redact_phone():
    t = 'Call +1 (555) 123-4567 tomorrow.'
    red, r = redact_text(t)
    assert '[REDACTED]' in red
    assert any(x['type']=='phone' for x in r)


def test_preview_length_and_redaction():
    t = 'a'*500 + ' alice@example.com'
    prev = redact_preview(t, max_len=100)
    assert len(prev) <= 100
    assert '[REDACTED]' in prev

