import re
from typing import Tuple, List

# Simple deterministic regex-based redaction for MVP
_PATTERNS = {
    'email': re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}") ,
    'phone': re.compile(r"\b(?:\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9})\b"),
    'credit_card': re.compile(r"\b(?:\d[ -]*?){13,16}\b"),
    'ssn': re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    'ipv4': re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
}

REDACT_TOKEN = '[REDACTED]'


def redact_text(text: str) -> Tuple[str, List[dict]]:
    """Redact known PII patterns from text. Returns (redacted_text, list_of_redactions).

    list_of_redactions: [{'type': 'email', 'match': 'x@y.com', 'replacement':'[REDACTED]'}]
    """
    if not text:
        return text, []
    redactions = []
    redacted = text
    for t, pat in _PATTERNS.items():
        def _repl(m):
            redactions.append({'type': t, 'match': m.group(0)})
            return REDACT_TOKEN
        redacted = pat.sub(_repl, redacted)
    return redacted, redactions


def redact_preview(text: str, max_len: int = 200) -> str:
    if not text:
        return text
    redacted, _ = redact_text(text)
    if len(redacted) > max_len:
        return redacted[:max_len]
    return redacted

