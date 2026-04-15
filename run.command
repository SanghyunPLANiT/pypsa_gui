#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

VENV_DIR=".venv-pypsa"

if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

export MPLCONFIGDIR="$ROOT_DIR/.matplotlib"
mkdir -p "$MPLCONFIGDIR"

python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt

if [ ! -d "node_modules" ]; then
  npm install
fi

cleanup() {
  if [ -n "${BACKEND_PID:-}" ]; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

"$VENV_DIR/bin/python" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

until curl -sf http://127.0.0.1:8000/api/health >/dev/null 2>&1; do
  sleep 1
done

npm run start:frontend
