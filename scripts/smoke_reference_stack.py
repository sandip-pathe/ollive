"""Start a clean Ollive reference stack and prove one AgentRun packet round-trip."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
PROJECT = os.getenv("OLLIVE_SMOKE_PROJECT", "ollive-v010-smoke")
SMOKE_ENV = os.environ.copy()
SMOKE_ENV["OLLIVE_API_PORT"] = os.getenv("OLLIVE_SMOKE_API_PORT", "18001")
SMOKE_ENV["OLLIVE_WEB_PORT"] = os.getenv("OLLIVE_SMOKE_WEB_PORT", "13000")
SMOKE_ENV["OLLIVE_POSTGRES_PORT"] = os.getenv("OLLIVE_SMOKE_POSTGRES_PORT", "15433")
SMOKE_ENV["OLLIVE_REDIS_PORT"] = os.getenv("OLLIVE_SMOKE_REDIS_PORT", "16380")
SMOKE_ENV["OLLIVE_INGEST_TOKEN"] = os.getenv("OLLIVE_SMOKE_INGEST_TOKEN", "ollive-v010-smoke-token")
SMOKE_ENV["NEXT_PUBLIC_API_BASE"] = f"http://localhost:{SMOKE_ENV['OLLIVE_API_PORT']}"
API_BASE = SMOKE_ENV["NEXT_PUBLIC_API_BASE"]
WEB_URL = f"http://localhost:{SMOKE_ENV['OLLIVE_WEB_PORT']}"


def run(command: list[str], *, check: bool = True, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=ROOT,
        check=check,
        text=True,
        env=SMOKE_ENV,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None,
    )


def compose(*args: str, check: bool = True, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return run(["docker", "compose", "-p", PROJECT, *args], check=check, capture=capture)


def wait_for_url(url: str, timeout_seconds: int = 420) -> None:
    deadline = time.monotonic() + timeout_seconds
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with urlopen(url, timeout=3) as response:
                if response.status == 200:
                    return
        except (HTTPError, URLError, TimeoutError, ConnectionError) as exc:
            last_error = exc
        time.sleep(2)
    raise RuntimeError(f"Timed out waiting for {url}: {last_error}")


def request_json(url: str, *, method: str = "GET", payload: dict | None = None) -> dict:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Content-Type": "application/json"} if body else {}
    token = SMOKE_ENV.get("OLLIVE_INGEST_TOKEN")
    if token:
        headers["X-Ollive-Token"] = token
    request = Request(url, data=body, headers=headers, method=method)
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-only", action="store_true", help="Skip the web readiness check.")
    args = parser.parse_args()

    docker_info = run(["docker", "info"], check=False, capture=True)
    if docker_info.returncode != 0:
        print("Docker is unavailable; clean-stack smoke was not run.", file=sys.stderr)
        if docker_info.stdout:
            print(docker_info.stdout.strip(), file=sys.stderr)
        return 2

    payload = {
        "run_id": "run_v010_smoke",
        "agent": {"name": "claims-support-agent", "version": "0.1.0", "environment": "smoke"},
        "task": {"type": "claim_question", "input": "Will my roof claim be approved?"},
        "authority": {
            "scope": "informational_support",
            "allowed_actions": ["explain_process"],
            "disallowed_actions": ["approve_claim", "deny_claim", "guarantee_payout"],
            "requires_handoff": ["coverage_decision"],
        },
        "steps": [
            {
                "step_id": "step_model_1",
                "type": "model_call",
                "status": "success",
                "output": {"text": "This claim is definitely approved and will be covered for sure."},
            }
        ],
        "outcome": {"status": "success", "summary": "Binding coverage claim returned.", "side_effects": []},
        "evidence": {"redaction_applied": True, "source": "v0.1-smoke"},
    }

    try:
        compose("down", "-v", "--remove-orphans", check=False)
        up_args = ["up", "-d", "--build"]
        if args.api_only:
            up_args.append("api")
        compose(*up_args)

        postgres_user = os.getenv("POSTGRES_USER", "ollive")
        postgres_db = os.getenv("POSTGRES_DB", "ollive_dev")
        compose("exec", "-T", "postgres", "pg_isready", "-U", postgres_user, "-d", postgres_db)
        redis_result = compose("exec", "-T", "redis", "redis-cli", "ping", capture=True)
        if "PONG" not in (redis_result.stdout or ""):
            raise RuntimeError("Redis did not return PONG")

        wait_for_url(f"{API_BASE}/health")
        if not args.api_only:
            wait_for_url(WEB_URL)

        created = request_json(f"{API_BASE}/v1/runs", method="POST", payload=payload)
        created_run_id = created.get("run", {}).get("run_id")
        created_packet = created.get("evidence_packet", {})
        packet_record = created_packet.get("packet", {})
        assessment = created_packet.get("assessment", {})
        if created_run_id != payload["run_id"] or packet_record.get("run_id") != payload["run_id"]:
            raise RuntimeError("Create response did not contain the expected run packet")
        if not packet_record.get("insurability_posture"):
            raise RuntimeError("Create response did not contain a packet posture")
        if assessment.get("status") != "experimental":
            raise RuntimeError("Create response did not expose experimental assessment status")

        fetched = request_json(f"{API_BASE}/v1/runs/{payload['run_id']}/evidence-packet")
        if fetched.get("packet", {}).get("run_id") != payload["run_id"]:
            raise RuntimeError("Fetched packet did not match the created run")
        if fetched.get("assessment", {}).get("status") != "experimental":
            raise RuntimeError("Fetched packet did not preserve experimental assessment status")

        repeated_step = {
            "steps": [
                {
                    "step_id": "step_retry_1",
                    "type": "tool_call",
                    "status": "success",
                    "output": {"source": "policy_lookup", "found": True},
                }
            ]
        }
        request_json(f"{API_BASE}/v1/runs/{payload['run_id']}/events", method="POST", payload=repeated_step)
        retried = request_json(
            f"{API_BASE}/v1/runs/{payload['run_id']}/events",
            method="POST",
            payload=repeated_step,
        )
        if len(retried.get("run", {}).get("steps", [])) != 2:
            raise RuntimeError("Retrying the same step_id created a duplicate step")

        recomputed_once = request_json(
            f"{API_BASE}/v1/runs/{payload['run_id']}/evidence-packet/recompute",
            method="POST",
        )
        recomputed_twice = request_json(
            f"{API_BASE}/v1/runs/{payload['run_id']}/evidence-packet/recompute",
            method="POST",
        )
        if len(recomputed_once.get("risk_events", [])) != len(recomputed_twice.get("risk_events", [])):
            raise RuntimeError("Repeated packet recompute changed the finding count")

        print(f"Smoke passed: {payload['run_id']} -> {packet_record['insurability_posture']}")
        return 0
    except Exception:
        logs = compose("logs", "--no-color", "--tail", "200", check=False, capture=True)
        if logs.stdout:
            print(logs.stdout, file=sys.stderr)
        raise
    finally:
        compose("down", "-v", "--remove-orphans", check=False)


if __name__ == "__main__":
    raise SystemExit(main())
