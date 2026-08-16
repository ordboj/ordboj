#!/bin/bash
# SessionStart hook for Ordböj.
#
# 1. Every session (desktop + web): activates the caveman and simple-english
#    skills by injecting instructions into session context (stdout of a
#    SessionStart hook becomes context).
# 2. Web sessions only: installs rtk (token-reducing CLI proxy,
#    github.com/rtk-ai/rtk) so the PreToolUse hook in .claude/settings.json
#    can rewrite Bash commands. Desktop machines install rtk themselves.
#
# rtk install soft-fails on purpose: if the download or checksum fails, the
# session still starts and the PreToolUse hook silently no-ops because it
# guards on `command -v rtk`.
set -euo pipefail

cat <<'CONTEXT'
Token-saving defaults for this project:
- Caveman mode is ON by default (full intensity). Follow the project skill
  `caveman` for all chat output. Switch level or disable only when the user
  asks (/caveman lite|ultra|off, "normal mode").
- When writing documentation, READMEs, specs, or other prose deliverables,
  follow the project skill `simple-english` (ASD-STE100) instead.
CONTEXT

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

INSTALL_DIR="$HOME/.local/bin"

# Make rtk visible to the Bash tool for the rest of the session.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$CLAUDE_ENV_FILE"
fi

# Container state is cached between sessions — skip if already installed.
if [ -x "$INSTALL_DIR/rtk" ]; then
  echo "rtk already installed: $("$INSTALL_DIR/rtk" --version)" >&2
  exit 0
fi

REPO="rtk-ai/rtk"
case "$(uname -m)" in
  arm64 | aarch64) TARGET="aarch64-unknown-linux-gnu" ;;
  *) TARGET="x86_64-unknown-linux-musl" ;;
esac

# Resolve latest release. RTK_VERSION pins; otherwise try the releases/latest
# redirect, then fall back to the version in Cargo.toml on master — the web
# egress proxy allows raw.githubusercontent.com and release asset downloads
# but 403s the releases/latest and api.github.com lookups.
VERSION="${RTK_VERSION:-}"
if [ -z "$VERSION" ]; then
  VERSION=$(curl -fsSI "https://github.com/${REPO}/releases/latest" 2>/dev/null |
    grep -i '^location:' | sed -E 's|.*/tag/([^[:space:]]+).*|\1|' | tr -d '\r') || true
fi
if [ -z "$VERSION" ]; then
  VERSION=$(curl -fsSL "https://raw.githubusercontent.com/${REPO}/master/Cargo.toml" 2>/dev/null |
    awk -F'"' '/^version = /{print "v" $2; exit}') || true
fi
if [ -z "$VERSION" ]; then
  echo "rtk: could not resolve latest version; skipping install" >&2
  exit 0
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
ASSET="rtk-${TARGET}.tar.gz"

if ! curl -fsSL "https://github.com/${REPO}/releases/download/${VERSION}/${ASSET}" -o "$TMP/$ASSET"; then
  echo "rtk: download failed; skipping install" >&2
  exit 0
fi
if ! curl -fsSL "https://github.com/${REPO}/releases/download/${VERSION}/checksums.txt" -o "$TMP/checksums.txt"; then
  echo "rtk: checksums.txt download failed; refusing unverified install" >&2
  exit 0
fi

EXPECTED=$(awk -v a="$ASSET" '$2 == a || $2 == "*"a {print $1}' "$TMP/checksums.txt")
ACTUAL=$(sha256sum "$TMP/$ASSET" | awk '{print $1}')
if [ -z "$EXPECTED" ] || [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "rtk: checksum mismatch (expected=${EXPECTED:-none} actual=$ACTUAL); refusing install" >&2
  exit 0
fi

# Reject absolute paths / traversal inside the archive before extracting.
if tar -tzf "$TMP/$ASSET" | grep -qE '^/|(^|/)\.\.(/|$)'; then
  echo "rtk: archive contains unsafe paths; refusing install" >&2
  exit 0
fi

tar -xzf "$TMP/$ASSET" -C "$TMP"
mkdir -p "$INSTALL_DIR"
mv "$TMP/rtk" "$INSTALL_DIR/rtk"
chmod +x "$INSTALL_DIR/rtk"
echo "rtk ${VERSION} installed to ${INSTALL_DIR}/rtk" >&2
