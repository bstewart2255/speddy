#!/bin/bash
# SessionStart hook: install dependencies so linters, type checks, and tests
# work in Claude Code on the web sessions (which start from a fresh clone).
set -euo pipefail

# Only run in remote (Claude Code on the web) environments. Local sessions
# manage their own node_modules.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Install Node dependencies. npm install is idempotent and lets the cached
# container state be reused on subsequent runs.
npm install
