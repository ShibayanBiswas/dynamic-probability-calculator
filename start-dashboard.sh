#!/usr/bin/env bash
# Start Primary SP Dashboard — Next.js frontend + Python analytics API (Linux/macOS)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node 20+ and retry."
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Installing Node dependencies..."
  npm install
fi

if [[ ! -f "$ROOT/.env.local" ]] && [[ -f "$ROOT/.env.example" ]]; then
  cp "$ROOT/.env.example" "$ROOT/.env.local"
  echo "Created .env.local from .env.example"
fi

PYTHON_API_URL="${PYTHON_API_URL:-http://127.0.0.1:8000}"
VENV="$ROOT/backend/python/.venv"
PY_REQ="$ROOT/backend/python/requirements.txt"

pids_on_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti:"$port" 2>/dev/null || true
  elif command -v fuser >/dev/null 2>&1; then
    fuser "$port"/tcp 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$' || true
  fi
}

# Free a TCP port: SIGTERM, then wait, then SIGKILL. Reports foreign-owned processes.
free_port() {
  local port="$1"
  local pids
  pids="$(pids_on_port "$port")"
  [[ -z "$pids" ]] && return 0

  echo "Freeing port $port (pids: $(echo "$pids" | tr '\n' ' '))..."
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true

  for _ in $(seq 1 10); do
    pids="$(pids_on_port "$port")"
    [[ -z "$pids" ]] && return 0
    sleep 0.5
  done

  pids="$(pids_on_port "$port")"
  if [[ -n "$pids" ]]; then
    echo "Port $port still busy — sending SIGKILL..."
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
    sleep 1
  fi

  pids="$(pids_on_port "$port")"
  if [[ -n "$pids" ]]; then
    echo "WARNING: port $port is held by pids $(echo "$pids" | tr '\n' ' ') that this user cannot kill."
    echo "         Try: sudo kill -9 $(echo "$pids" | tr '\n' ' ')"
    return 1
  fi
  return 0
}

start_python() {
  if ! command -v python3 >/dev/null 2>&1; then
    echo "Python 3 not found — pivot tables will use Node fallback only."
    return
  fi
  if [[ ! -d "$VENV" ]]; then
    echo "Creating Python virtualenv..."
    python3 -m venv "$VENV"
    "$VENV/bin/pip" install -r "$PY_REQ"
  fi
  if [[ -n "$(pids_on_port 8000)" ]]; then
    echo "Python API already listening on :8000"
    return
  fi
  echo "Starting Python analytics API on $PYTHON_API_URL ..."
  (cd "$ROOT/backend/python" && "$VENV/bin/python" -m uvicorn main:app --host 127.0.0.1 --port 8000) &
  PY_PID=$!
  echo "$PY_PID" > "$ROOT/.python-api.pid"
}

stop_stale() {
  free_port 3000 || true
  free_port 8000 || true
}

start_mongo() {
  if [[ -z "${MONGODB_URI:-}" ]] && [[ -f "$ROOT/.env.local" ]]; then
    set -a
    # shellcheck disable=SC1091
    source <(grep -E '^MONGODB_' "$ROOT/.env.local" | sed 's/\r$//')
    set +a
  fi
  if [[ -z "${MONGODB_URI:-}" ]]; then
    return
  fi
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    if ! docker compose -f "$ROOT/docker-compose.yml" ps --status running 2>/dev/null | grep -q sp-dashboard-mongo; then
      echo "Starting MongoDB (docker compose)..."
      docker compose -f "$ROOT/docker-compose.yml" up -d
      for _ in $(seq 1 24); do
        if docker compose -f "$ROOT/docker-compose.yml" exec -T mongo mongosh --quiet --eval "db.adminCommand('ping').ok" 2>/dev/null | grep -q 1; then
          echo "MongoDB ready on :27017"
          break
        fi
        sleep 1
      done
    else
      echo "MongoDB already running (sp-dashboard-mongo)"
    fi
  elif command -v nc >/dev/null 2>&1 && nc -z 127.0.0.1 27017 2>/dev/null; then
    echo "MongoDB already listening on :27017"
  else
    echo "MongoDB configured but not reachable — run: docker compose up -d"
  fi
}

if [[ "${1:-}" == "--stop" ]]; then
  free_port 3000 || true
  [[ -f .python-api.pid ]] && kill "$(cat .python-api.pid)" 2>/dev/null || true
  free_port 8000 || true
  rm -f .python-api.pid
  echo "Stopped Primary SP Dashboard services."
  exit 0
fi

# Ensure port 3000 is free before Next binds; abort early with guidance if not.
if ! free_port 3000; then
  echo "Cannot start Next.js — port 3000 is occupied by a process owned by another user."
  exit 1
fi
free_port 8000 || true

start_mongo
start_python

export PYTHON_API_URL
echo ""
echo "Primary SP Dashboard — local only"
echo "  App:    http://localhost:3000"
echo "  API:    http://localhost:3000/api/*"
echo "  Python: $PYTHON_API_URL"
[[ -n "${MONGODB_URI:-}" ]] && echo "  Mongo:  $MONGODB_URI"
echo ""
echo "Starting Next.js on http://localhost:3000 ..."
echo "Press Ctrl+C to stop. Run: bash start-dashboard.sh --stop"
echo ""
exec npm run dev
