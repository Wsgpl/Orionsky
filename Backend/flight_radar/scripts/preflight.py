"""
Deployment preflight checks for commercial/public launch readiness.

Usage:
  python scripts/preflight.py
  python scripts/preflight.py --env-file .env --target production
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def non_empty(env: dict[str, str], key: str) -> bool:
    return bool(env.get(key, "").strip())


def check_secret_strength(secret: str) -> bool:
    return len(secret) >= 32 and secret.lower() not in {"replace-with-64-char-secret", "changeme"}


def check_api_keys_format(api_keys: str) -> bool:
    items = [item.strip() for item in api_keys.split(",") if item.strip()]
    if not items:
        return False
    for item in items:
        if ":" not in item:
            return False
        _, key = item.split(":", 1)
        if len(key.strip()) < 16:
            return False
    return True


def check_cors_format(cors: str) -> bool:
    origins = [origin.strip() for origin in cors.split(",") if origin.strip()]
    if not origins:
        return False
    pattern = re.compile(r"^https://[^/]+$")
    return all(bool(pattern.match(origin)) for origin in origins)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run launch preflight checks")
    parser.add_argument("--env-file", default=".env", help="Path to env file (default: .env)")
    parser.add_argument(
        "--target",
        default="production",
        choices=["production", "staging", "development"],
        help="Target environment policy set",
    )
    args = parser.parse_args()

    backend_root = Path(__file__).resolve().parents[1]
    repo_root = backend_root.parents[1]
    env_path = (backend_root / args.env_file).resolve() if not Path(args.env_file).is_absolute() else Path(args.env_file).resolve()
    env = parse_env_file(env_path)

    failures: list[str] = []
    warnings: list[str] = []

    if not env_path.exists():
        failures.append(f"Env file not found: {env_path}")
    else:
        print(f"[info] Loaded env file: {env_path}")

    if args.target == "production":
        if env.get("ENVIRONMENT") != "production":
            failures.append("ENVIRONMENT must be set to production")

        secret_key = env.get("SECRET_KEY", "")
        if not check_secret_strength(secret_key):
            failures.append("SECRET_KEY must be 32+ chars and not a placeholder")

        if not non_empty(env, "AUTH_USERNAME"):
            failures.append("AUTH_USERNAME is required")
        if not non_empty(env, "AUTH_PASSWORD_HASH"):
            failures.append("AUTH_PASSWORD_HASH is required")

        if env.get("REQUIRE_API_KEY", "").lower() != "true":
            failures.append("REQUIRE_API_KEY must be true")

        api_keys = env.get("API_KEYS", "")
        if not check_api_keys_format(api_keys):
            failures.append("API_KEYS must be set in name:key format with key length >= 16")

        cors = env.get("CORS_ALLOWED_ORIGINS", "")
        if not check_cors_format(cors):
            failures.append("CORS_ALLOWED_ORIGINS must contain one or more https:// origins")

        if env.get("EXPOSE_DOCS_IN_PRODUCTION", "").lower() != "false":
            failures.append("EXPOSE_DOCS_IN_PRODUCTION must be false")

        if env.get("ENABLE_LEGACY_UNPREFIXED_ROUTES", "").lower() != "false":
            failures.append("ENABLE_LEGACY_UNPREFIXED_ROUTES must be false")

    weather_source = env.get("WEATHER_SOURCE", "openmeteo")
    if weather_source != "openmeteo":
        failures.append("WEATHER_SOURCE must be set to openmeteo")

    aircraft_sources = [s.strip() for s in env.get("AIRCRAFT_SOURCES", "opensky").split(",") if s.strip()]
    if "icao" in aircraft_sources and not non_empty(env, "ICAO_AIRCRAFT_URL"):
        failures.append("ICAO_AIRCRAFT_URL is required when AIRCRAFT_SOURCES includes icao")

    for path in [
        repo_root / "TERMS_OF_SERVICE.md",
        repo_root / "PRIVACY_POLICY.md",
        repo_root / "SAFETY_DISCLAIMER.md",
    ]:
        if not path.exists():
            failures.append(f"Missing required legal document: {path.name}")

    if not non_empty(env, "REDIS_PASSWORD"):
        warnings.append("REDIS_PASSWORD is empty (acceptable only for local/dev Redis)")

    print("[info] Running checks for target:", args.target)
    if warnings:
        for warning in warnings:
            print(f"[warn] {warning}")

    if failures:
        for failure in failures:
            print(f"[fail] {failure}")
        print(f"\nPreflight failed: {len(failures)} blocking issue(s)")
        return 1

    print("Preflight passed: deployment configuration is launch-ready")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
