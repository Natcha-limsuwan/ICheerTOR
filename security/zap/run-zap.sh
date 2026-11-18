#!/usr/bin/env bash
# Always use an owned disposable fixture. Existing/deployed targets are forbidden.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -n "${ZAP_TOKEN:-}" || -n "${FRONTEND_URL:-}" || -n "${BACKEND_URL:-}" ]]; then
  echo "Refusing external targets/tokens. Run the isolated fixture without these variables." >&2
  exit 2
fi
exec python3 "$SCRIPT_DIR/run-isolated.py"
