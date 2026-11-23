#!/usr/bin/env bash
# Install the saved Cloud setup, or repeat CI from clean installs in a fresh task.
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  setup|verify) mode=$1 ;;
  *) echo "Usage: bash scripts/codex-cloud.sh setup|verify" >&2; exit 2 ;;
esac

worker=services/sermon-evaluator
export npm_config_cache=${npm_config_cache:-/workspace/.cache/npm}
export UV_CACHE_DIR=${UV_CACHE_DIR:-/workspace/.cache/uv}
export UV_PYTHON_INSTALL_DIR=${UV_PYTHON_INSTALL_DIR:-/workspace/.parrot/python}
saved_venv=/workspace/.parrot/cp_evals
python_version=$(cat "$worker/.python-version")
node -e 'if (process.versions.node.split(".")[0] !== process.argv[1]) throw Error("Expected Node " + process.argv[1])' "$(cat .nvmrc)"
git rev-parse HEAD
node --version
npm --version
uv --version

work_dir=$(mktemp -d)
db_container=""
cleanup() {
  if [[ -n "$db_container" ]]; then docker rm -f -v "$db_container" >/dev/null || true; fi
  rm -rf "$work_dir"
}
trap cleanup EXIT

if [[ "$mode" == setup ]]; then
  # The saved environment's workon cp_evals uses this location.
  venv=$saved_venv
  sync_options=(--reinstall)
else
  # A verification run should detect missing packages in the prepared caches.
  export npm_config_offline=true UV_OFFLINE=true UV_LINK_MODE=copy
  venv=$work_dir/dev
  sync_options=()
fi
if [[ ! -x "$venv/bin/python" ]]; then uv venv --python "$python_version" "$venv"; fi
python=$venv/bin/python
"$python" -c 'import sys; assert "%d.%d" % sys.version_info[:2] == sys.argv[1], sys.version' "$python_version"
"$python" --version
npm ci --prefer-offline
uv pip sync "${sync_options[@]}" --python "$python" "$worker/requirements-dev.txt"
uv pip install --python "$python" --no-deps -e "$worker"
uv pip check --python "$python"

# Exercise the Appwrite production install separately from the test extras.
uv venv --python "$python" "$work_dir/prod"
prod_python=$work_dir/prod/bin/python
uv pip sync --python "$prod_python" "$worker/requirements.txt"
uv pip install --python "$prod_python" --no-deps "$worker"
uv pip check --python "$prod_python"
(cd "$worker" && "$prod_python" -c 'from entrypoints.appwrite import main; assert callable(main)')

db_image=$(docker compose config --images postgres)
if [[ "$mode" == setup ]]; then
  docker pull "$db_image"
  exit 0
fi

# Use the same image as local development, with a new DB and OS-assigned port.
db_container=$(docker run -d --rm -p 127.0.0.1::5432 -e POSTGRES_PASSWORD=ci "$db_image")
for attempt in {1..60}; do
  if docker exec "$db_container" pg_isready -h localhost -U postgres -q; then break; fi
  sleep 1
done
docker exec "$db_container" pg_isready -h localhost -U postgres
docker exec "$db_container" psql -X -v ON_ERROR_STOP=1 -U postgres -c 'CREATE EXTENSION vector' -c 'SHOW server_version' -c "SELECT extversion FROM pg_extension WHERE extname = 'vector'"
db_address=$(docker port "$db_container" 5432/tcp)
db_url="postgresql://postgres:ci@$db_address/postgres"
export DATABASE_URL="$db_url?schema=public" CCEL_URL="$db_url?schema=public"
export SERMON_DATABASE_URL="$db_url?sslmode=disable"
export TEST_DATABASE_URL="$DATABASE_URL" SERMON_DATABASE_INTEGRATION_URL="$DATABASE_URL" SERMON_TEST_DATABASE_URL="$SERMON_DATABASE_URL"
export CI=1 RUN_SERMON_DATABASE_INTEGRATION_TESTS=1 NEXT_TELEMETRY_DISABLED=1
export ANTHROPIC_API_KEY=ci-placeholder GEMINI_API_KEY=ci-placeholder OPENAI_API_KEY=ci-placeholder
export TAVILY_API_KEY=ci-placeholder CRON_SECRET=ci-placeholder ADMIN_ID=ci-admin NEXT_PUBLIC_ADMIN_ID=ci-admin
export APPWRITE_ENDPOINT=http://localhost/v1 NEXT_PUBLIC_APPWRITE_ENDPOINT=http://localhost/v1
export APPWRITE_PROJECT_ID=ci-project NEXT_PUBLIC_APPWRITE_PROJECT_ID=ci-project APPWRITE_API_KEY=ci-placeholder
export APP_URL=http://localhost:3000 STUDY_BIBLE_MCP_URL=
export PARROT_AGENT_PROVIDER=anthropic PARROT_ANTHROPIC_MODEL=claude-haiku-5-5
export PARROT_OPENAI_MODEL=gpt-6-luna PARROT_GEMINI_MODEL=gemini-4-hydrogen
export NOMINATIM_USER_AGENT='CalvinistParrotCI/1.0 (ci@calvinistparrot.local)'

npm run db:deploy
npm run ci
(cd "$worker" && "$python" -m pytest)
