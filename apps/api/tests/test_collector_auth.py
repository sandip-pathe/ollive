import asyncio
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from starlette.requests import Request

from apps.api.app.collector_auth import require_ingest_access


def request_with_headers(headers: list[tuple[bytes, bytes]]) -> Request:
    return Request({"type": "http", "method": "POST", "path": "/v1/runs", "headers": headers})


class CollectorAuthTests(unittest.TestCase):
    def test_local_collector_allows_requests_when_token_is_unset(self):
        with patch("apps.api.app.collector_auth.INGEST_TOKEN", None):
            asyncio.run(require_ingest_access(request_with_headers([])))

    def test_configured_collector_rejects_an_invalid_token(self):
        with patch("apps.api.app.collector_auth.INGEST_TOKEN", "secret"):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(require_ingest_access(request_with_headers([(b"x-ollive-token", b"wrong")])))

        self.assertEqual(raised.exception.status_code, 401)

    def test_configured_collector_accepts_header_and_bearer_tokens(self):
        requests = [
            request_with_headers([(b"x-ollive-token", b"secret")]),
            request_with_headers([(b"authorization", b"Bearer secret")]),
        ]
        with patch("apps.api.app.collector_auth.INGEST_TOKEN", "secret"):
            for request in requests:
                asyncio.run(require_ingest_access(request))


if __name__ == "__main__":
    unittest.main()
