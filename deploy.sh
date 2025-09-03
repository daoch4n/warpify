#!/usr/bin/env bash
# Deploy two Cloudflare workers (test and test2), set a shared TOKEN secret,
# generate config.json with their URLs, and start the proxy client.
#
# This script is designed to be safely re-runnable:
# - It always resets worker/wrangler.toml back to name = "test" at the end.
# - It updates/overwrites the TOKEN secret for both workers on each run.
#
# Prereqs (see README for details):
# - Bun installed and available on PATH
# - Wrangler installed (bun i -g wrangler) and authenticated (wrangler login)

set -euo pipefail

WORKER_DIR="worker"
WRANGLER_TOML="$WORKER_DIR/wrangler.toml"
NAME0="test"
NAME1="test2"

# Cross-platform function to set the name in wrangler.toml without relying on sed -i
set_worker_name() {
  local new_name="$1"
  if [[ ! -f "$WRANGLER_TOML" ]]; then
    echo "[!] Missing $WRANGLER_TOML"
    exit 1
  fi
  awk -v name="$new_name" '
    BEGIN { replaced = 0 }
    /^[[:space:]]*name[[:space:]]*=/ {
      print "name = \"" name "\""; replaced = 1; next
    }
    { print }
    END {
      if (!replaced) {
        print "name = \"" name "\""
      }
    }
  ' "$WRANGLER_TOML" > "$WRANGLER_TOML.tmp" && mv "$WRANGLER_TOML.tmp" "$WRANGLER_TOML"
}

# Deploy current worker defined in wrangler.toml and extract the workers.dev URL from wrangler output
# Returns the URL on stdout (like https://test.<subdomain>.workers.dev)
wrangler_deploy_and_get_url() {
  pushd "$WORKER_DIR" >/dev/null
  # Capture output; tee to stderr for user visibility while capturing to variable
  local output
  if ! output=$(wrangler deploy 2>&1 | tee /dev/stderr); then
    echo "[!] wrangler deploy failed" >&2
    popd >/dev/null || true
    return 1
  fi
  popd >/dev/null

  # Extract the last workers.dev URL from output
  local url
  url=$(printf '%s\n' "$output" | grep -Eo 'https://[^ ]+\.workers\.dev' | tail -n 1 || true)
  if [[ -z "${url:-}" ]]; then
    echo "[!] Could not detect workers.dev URL from wrangler output." >&2
    echo "[i] You can still proceed; please edit config.json manually with your worker hostnames." >&2
  fi
  printf '%s\n' "$url"
}

# Set the TOKEN secret for a given worker name using stdin to avoid interactive prompt
set_secret_for_worker() {
  local name="$1"
  local token="$2"
  pushd "$WORKER_DIR" >/dev/null
  # Use echo -n to avoid trailing newline in the secret value
  if ! printf '%s' "$token" | wrangler secret put TOKEN --name "$name" >/dev/null 2>&1; then
    echo "[!] Failed to set TOKEN secret for worker: $name" >&2
    popd >/dev/null || true
    return 1
  fi
  popd >/dev/null
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[!] Required command not found on PATH: $1" >&2
    exit 1
  fi
}

# Always restore wrangler.toml to test on exit, regardless of success/failure
cleanup() {
  {
    set_worker_name "$NAME0"
  } || true
}
trap cleanup EXIT

main() {
  echo "[+] Checking prerequisites..."
  require_cmd bun
  require_cmd wrangler

  # Generate a secure token
  if command -v openssl >/dev/null 2>&1; then
    TOKEN=$(openssl rand -hex 32)
  elif command -v uuidgen >/dev/null 2>&1; then
    # Fallback to uuidgen if openssl is not available, though less ideal for a secret
    TOKEN=$(uuidgen | tr -d '-')
  else
    echo "[!] Neither openssl nor uuidgen is available to generate a token."
    exit 1
  fi
  echo "[+] Generated authorization token for workers."

  # Optionally ask for proxy type and port with defaults; keep it simple and default to HTTP/8080
  TYPE="http"   # can be "socks" or "http"
  PORT=8080       # 1080 for SOCKS, 8080 for HTTP usually

  echo "[+] Deploying $NAME0..."
  set_worker_name "$NAME0"
  URL0=$(wrangler_deploy_and_get_url || true)

  echo "[+] Setting TOKEN secret on $NAME0..."
  set_secret_for_worker "$NAME0" "$TOKEN"

  echo "[+] Deploying $NAME1..."
  set_worker_name "$NAME1"
  URL1=$(wrangler_deploy_and_get_url || true)

  echo "[+] Setting TOKEN secret on $NAME1..."
  set_secret_for_worker "$NAME1" "$TOKEN"

  # Reset back to test for safe re-runs (also handled by trap, but we do it explicitly before starting proxy)
  echo "[+] Resetting wrangler.toml name back to $NAME0 for re-runnability..."
  set_worker_name "$NAME0"

  # Derive hosts (no scheme) from URLs, if found; otherwise fall back to worker name with .workers.dev
  host_from_url() { printf '%s' "$1" | sed -E 's#^https?://##; s#/$##' ; }
  HOST0=${URL0:+$(host_from_url "$URL0")}
  HOST1=${URL1:+$(host_from_url "$URL1")}
  if [[ -z "${HOST0:-}" ]]; then HOST0="$NAME0.workers.dev"; fi
  if [[ -z "${HOST1:-}" ]]; then HOST1="$NAME1.workers.dev"; fi

  # Function to check if a port is in use
  is_port_in_use() {
    local port=$1
    if command -v lsof >/dev/null 2>&1; then
      lsof -i :"$port" >/dev/null 2>&1
    elif command -v netstat >/dev/null 2>&1; then
      netstat -an | grep LISTEN | grep ":$port " >/dev/null 2>&1
    else
      # If neither lsof nor netstat is available, assume port is free
      # This is a fallback and might not be 100% reliable.
      return 1
    fi
  }

  # Function to find a free port
  find_free_port() {
    local start_port=${1:-1024}
    local max_port=65535
    local port
    
    # First, try the preferred port
    if ! is_port_in_use "$PORT"; then
      echo "$PORT"
      return 0
    fi
    
    # If preferred port is in use, try random ports
    echo "[!] Port $PORT is in use. Searching for a free port..." >&2
    for i in $(seq 1 100); do # Try up to 100 times
      port=$((start_port + RANDOM % (max_port - start_port + 1)))
      if ! is_port_in_use "$port"; then
        echo "$port"
        return 0
      fi
    done
    
    echo "[!] Could not find a free port after 100 attempts." >&2
    return 1
  }

  # Find a free port
  FREE_PORT=$(find_free_port)
  if [[ -z "$FREE_PORT" ]]; then
    echo "[!] Failed to find a free port. Exiting."
    exit 1
  fi
  
  if [[ "$FREE_PORT" != "$PORT" ]]; then
      echo "[+] Using free port: $FREE_PORT"
      # Update config.json with the free port
      cat > config.json <<JSON
{
  "worker": [
    "${HOST0}",
    "${HOST1}"
  ],
  "authorization": "${TOKEN}",
  "port": ${FREE_PORT},
  "type": "${TYPE}",
  "verbose": false,
 "load_balancing_strategy": "random"
}
JSON
  else
      echo "[+] Writing config.json with the new workers and token..."
      cat > config.json <<JSON
{
  "worker": [
    "${HOST0}",
    "${HOST1}"
  ],
  "authorization": "${TOKEN}",
  "port": ${PORT},
  "type": "${TYPE}",
  "verbose": false,
  "load_balancing_strategy": "random"
}
JSON
  fi

  echo "[+] Configuration written to config.json"
  echo "    Workers: ${HOST0}, ${HOST1}"
  echo "    Type: ${TYPE}, Port: ${FREE_PORT}"

  echo "[+] Starting proxy client..."
  echo "    Press Ctrl+C to stop the proxy."
  echo "[i] Running command: bun proxy.js $TYPE -a $TOKEN -p $FREE_PORT --worker $HOST0 --worker $HOST1"
  # bun run start
  bun proxy.js "$TYPE" -a "$TOKEN" -p "$FREE_PORT" --worker "$HOST0" --worker "$HOST1"
}

main "$@"
