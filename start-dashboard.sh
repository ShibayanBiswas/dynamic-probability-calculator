#!/usr/bin/env bash
# Dynamic Probability Calculator — Next.js on :3001 (Linux/macOS)
# Usage: bash start-dashboard.sh | bash start-dashboard.sh --stop
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

pids_on_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti:"$port" 2>/dev/null || true
  elif command -v fuser >/dev/null 2>&1; then
    fuser "$port"/tcp 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$' || true
  fi
}

free_port() {
  local port="$1"
  local pids
  pids="$(pids_on_port "$port")"
  if [[ -z "${pids}" ]]; then
    return 0
  fi
  echo "Freeing port $port ..."
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  sleep 1
  pids="$(pids_on_port "$port")"
  if [[ -n "${pids}" ]]; then
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  fi
}

if [[ "${1:-}" == "--stop" ]]; then
  free_port 3001
  echo "Stopped Dynamic Probability Calculator local services."
  exit 0
fi

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

# shellcheck disable=SC1091
set -a
[[ -f "$ROOT/.env.local" ]] && source "$ROOT/.env.local"
set +a

if [[ -n "${MONGODB_URI:-}" ]] && command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    if ! docker compose -f "$ROOT/docker-compose.yml" ps --status running 2>/dev/null | grep -q sp-dashboard-mongo; then
      echo "Starting MongoDB (docker compose)..."
      docker compose -f "$ROOT/docker-compose.yml" up -d
    else
      echo "MongoDB already running."
    fi
  fi
fi

free_port 3001

echo ""
echo "Dynamic Probability Calculator — local only"
echo "  App: http://localhost:3001"
echo "  API: http://localhost:3001/api/*"
[[ -n "${MONGODB_URI:-}" ]] && echo "  Mongo: $MONGODB_URI"
echo "  Pivot: Node engine"
echo ""

npm run dev
