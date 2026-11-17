#!/usr/bin/env bash
# OWASP ZAP DAST scans (grading item 15). Requires Docker Desktop running and
# the app running locally (frontend :3000, backend :3001).
#
#   ./security/zap/run-zap.sh                 # passive baseline of the web app + unauthenticated API scan
#   ZAP_TOKEN=<token> ./security/zap/run-zap.sh   # also scans the API as a signed-in user
#
# Get a token: sign in with a TEST account that has the *user* role, then in
# DevTools → Application → Local Storage copy "icheertor_token".
# Start the backend with RATE_LIMIT_API_MAX=100000 while scanning, otherwise
# most ZAP requests are answered with 429.
#
# Only scan your own local instance: the API scan sends attack payloads.
# Reports are written to security/reports/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="ghcr.io/zaproxy/zaproxy:stable"
FRONTEND_URL="${FRONTEND_URL:-http://host.docker.internal:3000}"
mkdir -p "$ROOT/reports"

# Git Bash on Windows rewrites /zap/... paths unless this is set.
export MSYS_NO_PATHCONV=1

echo "== 1/2 Baseline (passive) scan of the web app: $FRONTEND_URL"
docker run --rm -v "$ROOT:/zap/wrk:rw" "$IMAGE" \
  zap-baseline.py -t "$FRONTEND_URL" -j \
  -r reports/zap-frontend-baseline.html -J reports/zap-frontend-baseline.json -I

echo "== 2/2 API scan (active) from security/zap/openapi.yaml"
AUTH_ARGS=()
if [[ -n "${ZAP_TOKEN:-}" ]]; then
  echo "   authenticated with ZAP_TOKEN"
  AUTH_ARGS=(-e "ZAP_AUTH_HEADER=Authorization" -e "ZAP_AUTH_HEADER_VALUE=Bearer ${ZAP_TOKEN}")
fi
docker run --rm "${AUTH_ARGS[@]}" -v "$ROOT:/zap/wrk:rw" "$IMAGE" \
  zap-api-scan.py -t zap/openapi.yaml -f openapi \
  -r reports/zap-api-scan.html -J reports/zap-api-scan.json -I

echo "Reports: $ROOT/reports/zap-*.html"
