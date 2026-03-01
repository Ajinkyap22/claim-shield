#!/usr/bin/env bash
# start-services.sh — Start all Claim Shield services in order.
# Run from the repo root: bash start-services.sh
# Stop all: bash start-services.sh stop

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGS="$ROOT/.service-logs"
mkdir -p "$LOGS"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[start]${NC} $*"; }
warn()    { echo -e "${YELLOW}[warn]${NC}  $*"; }
err()     { echo -e "${RED}[error]${NC} $*"; }

# ── PID file ──────────────────────────────────────────────────────────────────
PID_FILE="$ROOT/.service-pids"

stop_all() {
  if [[ ! -f "$PID_FILE" ]]; then
    warn "No PID file found — services may not be running."
    return
  fi
  while IFS= read -r line; do
    name="${line%%:*}"
    pid="${line##*:}"
    if kill -0 "$pid" 2>/dev/null; then
      info "Stopping $name (pid $pid)..."
      kill "$pid" 2>/dev/null || true
    else
      warn "$name (pid $pid) was not running"
    fi
  done < "$PID_FILE"
  rm -f "$PID_FILE"
  info "All services stopped."
}

if [[ "${1:-}" == "stop" ]]; then
  stop_all
  exit 0
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
wait_for_port() {
  local name="$1" port="$2" retries="${3:-30}"
  for i in $(seq 1 "$retries"); do
    if nc -z localhost "$port" 2>/dev/null; then
      info "$name is up on :$port"
      return 0
    fi
    sleep 1
  done
  err "$name did not come up on :$port after ${retries}s"
  return 1
}

append_pid() {
  echo "$1:$2" >> "$PID_FILE"
}

# Clear old PIDs
rm -f "$PID_FILE"

# ── Build shared-ts (required by all TS services) ─────────────────────────────
info "Building shared-ts..."
(cd "$ROOT/apps/shared-ts" && npm run build --silent) || { err "shared-ts build failed"; exit 1; }

# ── Service 1: extract-file (Go) — port 8080 ─────────────────────────────────
info "Starting extract-file service on :8080..."
(
  cd "$ROOT/apps/extract-file"
  set -a; [[ -f .env ]] && source .env; set +a
  go run . > "$LOGS/extract-file.log" 2>&1
) &
EXTRACT_PID=$!
append_pid "extract-file" "$EXTRACT_PID"
wait_for_port "extract-file" 8080

# ── Service 2: data-extraction-pipe (Python) — port 8002 ─────────────────────
info "Starting data-extraction-pipe on :8002..."
(
  cd "$ROOT/apps/data-extraction-pipe"
  set -a; [[ -f .env ]] && source .env; set +a
  source .venv/bin/activate
  uvicorn api:app --host 0.0.0.0 --port "${PORT:-8002}" > "$LOGS/data-extraction-pipe.log" 2>&1
) &
MAPPING_PID=$!
append_pid "data-extraction-pipe" "$MAPPING_PID"
wait_for_port "data-extraction-pipe" "${PORT:-8002}" 60

# ── Service 3: policy-service (TS) — port 8005 ───────────────────────────────
info "Starting policy-service on :8005..."
(
  cd "$ROOT/apps/policy-service"
  set -a; [[ -f .env ]] && source .env; set +a
  npm run dev > "$LOGS/policy-service.log" 2>&1
) &
POLICY_PID=$!
append_pid "policy-service" "$POLICY_PID"
wait_for_port "policy-service" 8005

# ── Service 4: validation-service (TS) — port 8003 ───────────────────────────
info "Starting validation-service on :8003..."
(
  cd "$ROOT/apps/validation-service"
  set -a; [[ -f .env ]] && source .env; set +a
  npm run dev > "$LOGS/validation-service.log" 2>&1
) &
VALIDATION_PID=$!
append_pid "validation-service" "$VALIDATION_PID"
wait_for_port "validation-service" 8003

# ── Service 5: scoring-service (TS) — port 8004 ──────────────────────────────
info "Starting scoring-service on :8004..."
(
  cd "$ROOT/apps/scoring-service"
  set -a; [[ -f .env ]] && source .env; set +a
  npm run dev > "$LOGS/scoring-service.log" 2>&1
) &
SCORING_PID=$!
append_pid "scoring-service" "$SCORING_PID"
wait_for_port "scoring-service" 8004

# ── Service 6: gateway (TS) — port 8000 ──────────────────────────────────────
info "Starting gateway on :8000..."
(
  cd "$ROOT/apps/gateway"
  set -a; [[ -f .env ]] && source .env; set +a
  npm run dev > "$LOGS/gateway.log" 2>&1
) &
GATEWAY_PID=$!
append_pid "gateway" "$GATEWAY_PID"
wait_for_port "gateway" 8000

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  All services running!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "  Gateway (API entry point)  →  http://localhost:8000"
echo "  data-extraction-pipe       →  http://localhost:8002"
echo "  validation-service         →  http://localhost:8003"
echo "  scoring-service            →  http://localhost:8004"
echo "  policy-service             →  http://localhost:8005"
echo "  extract-file               →  http://localhost:8080"
echo ""
echo "  Logs: $LOGS/"
echo "  Stop: bash start-services.sh stop"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Keep script alive so Ctrl+C stops everything
trap "stop_all" INT TERM
wait
