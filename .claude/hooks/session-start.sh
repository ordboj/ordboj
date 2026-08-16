#!/bin/bash
# SessionStart hook for Ordböj.
#
# 1. Every session (desktop + web): activates the caveman and simple-english
#    skills by injecting instructions into session context (stdout of a
#    SessionStart hook becomes context).
# 2. Web sessions only: installs rtk (token-reducing CLI proxy,
#    github.com/rtk-ai/rtk) so the PreToolUse hook in .claude/settings.json
#    can rewrite Bash commands, and the GitHub CLI (gh). Desktop machines
#    install both themselves.
#
# Both installs soft-fail on purpose: if a download or checksum fails, the
# session still starts. The PreToolUse hook silently no-ops because it
# guards on `command -v rtk`.
#
# Note on gh in web sessions: the egress proxy relays api.github.com, but
# REST calls return 403 until an org admin connects the Claude GitHub App
# for the organization, and GraphQL serves only a pinned set of PR-review
# operations. Until then, prefer the GitHub MCP tools; git push/pull work
# through the git proxy regardless.
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
mkdir -p "$INSTALL_DIR"

# Make the tools visible to the Bash tool for the rest of the session.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$CLAUDE_ENV_FILE"
fi

# Reject absolute paths / traversal inside an archive before extracting.
archive_is_unsafe() {
  tar -tzf "$1" | grep -qE '^/|(^|/)\.\.(/|$)'
}

install_rtk() {
  # Container state is cached between sessions — skip if already installed.
  if [ -x "$INSTALL_DIR/rtk" ]; then
    echo "rtk already installed: $("$INSTALL_DIR/rtk" --version)" >&2
    return 0
  fi

  local REPO="rtk-ai/rtk"
  local TARGET
  case "$(uname -m)" in
    arm64 | aarch64) TARGET="aarch64-unknown-linux-gnu" ;;
    *) TARGET="x86_64-unknown-linux-musl" ;;
  esac

  # Resolve latest release. RTK_VERSION pins; otherwise try the
  # releases/latest redirect, then fall back to the version in Cargo.toml on
  # master — the web egress proxy allows raw.githubusercontent.com and
  # release asset downloads but 403s the releases/latest and api.github.com
  # lookups.
  local VERSION="${RTK_VERSION:-}"
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
    return 0
  fi

  local TMP
  TMP=$(mktemp -d)
  # shellcheck disable=SC2064
  trap "rm -rf '$TMP'" RETURN
  local ASSET="rtk-${TARGET}.tar.gz"

  if ! curl -fsSL "https://github.com/${REPO}/releases/download/${VERSION}/${ASSET}" -o "$TMP/$ASSET"; then
    echo "rtk: download failed; skipping install" >&2
    return 0
  fi
  if ! curl -fsSL "https://github.com/${REPO}/releases/download/${VERSION}/checksums.txt" -o "$TMP/checksums.txt"; then
    echo "rtk: checksums.txt download failed; refusing unverified install" >&2
    return 0
  fi

  local EXPECTED ACTUAL
  EXPECTED=$(awk -v a="$ASSET" '$2 == a || $2 == "*"a {print $1}' "$TMP/checksums.txt")
  ACTUAL=$(sha256sum "$TMP/$ASSET" | awk '{print $1}')
  if [ -z "$EXPECTED" ] || [ "$EXPECTED" != "$ACTUAL" ]; then
    echo "rtk: checksum mismatch (expected=${EXPECTED:-none} actual=$ACTUAL); refusing install" >&2
    return 0
  fi

  if archive_is_unsafe "$TMP/$ASSET"; then
    echo "rtk: archive contains unsafe paths; refusing install" >&2
    return 0
  fi

  tar -xzf "$TMP/$ASSET" -C "$TMP"
  mv "$TMP/rtk" "$INSTALL_DIR/rtk"
  chmod +x "$INSTALL_DIR/rtk"
  echo "rtk ${VERSION} installed to ${INSTALL_DIR}/rtk" >&2
}

install_gh() {
  if [ -x "$INSTALL_DIR/gh" ] || command -v gh >/dev/null 2>&1; then
    echo "gh already installed: $(gh --version 2>/dev/null | head -1 || "$INSTALL_DIR/gh" --version | head -1)" >&2
    return 0
  fi

  local ARCH
  case "$(uname -m)" in
    arm64 | aarch64) ARCH="arm64" ;;
    *) ARCH="amd64" ;;
  esac

  # GH_CLI_VERSION pins; otherwise try the releases/latest redirect, then
  # fall back to a known-good pin (the egress proxy 403s releases/latest,
  # so the pin is the usual path). Asset names carry no leading "v".
  local VERSION="${GH_CLI_VERSION:-}"
  if [ -z "$VERSION" ]; then
    VERSION=$(curl -fsSI "https://github.com/cli/cli/releases/latest" 2>/dev/null |
      grep -i '^location:' | sed -E 's|.*/tag/v([^[:space:]]+).*|\1|' | tr -d '\r') || true
  fi
  if [ -z "$VERSION" ]; then
    VERSION="2.76.2"
  fi

  local TMP
  TMP=$(mktemp -d)
  # shellcheck disable=SC2064
  trap "rm -rf '$TMP'" RETURN
  local ASSET="gh_${VERSION}_linux_${ARCH}.tar.gz"
  local BASE="https://github.com/cli/cli/releases/download/v${VERSION}"

  if ! curl -fsSL "${BASE}/${ASSET}" -o "$TMP/$ASSET"; then
    echo "gh: download failed; skipping install" >&2
    return 0
  fi
  if ! curl -fsSL "${BASE}/gh_${VERSION}_checksums.txt" -o "$TMP/checksums.txt"; then
    echo "gh: checksums.txt download failed; refusing unverified install" >&2
    return 0
  fi

  local EXPECTED ACTUAL
  EXPECTED=$(awk -v a="$ASSET" '$2 == a || $2 == "*"a {print $1}' "$TMP/checksums.txt")
  ACTUAL=$(sha256sum "$TMP/$ASSET" | awk '{print $1}')
  if [ -z "$EXPECTED" ] || [ "$EXPECTED" != "$ACTUAL" ]; then
    echo "gh: checksum mismatch (expected=${EXPECTED:-none} actual=$ACTUAL); refusing install" >&2
    return 0
  fi

  if archive_is_unsafe "$TMP/$ASSET"; then
    echo "gh: archive contains unsafe paths; refusing install" >&2
    return 0
  fi

  tar -xzf "$TMP/$ASSET" -C "$TMP"
  mv "$TMP/gh_${VERSION}_linux_${ARCH}/bin/gh" "$INSTALL_DIR/gh"
  chmod +x "$INSTALL_DIR/gh"
  echo "gh ${VERSION} installed to ${INSTALL_DIR}/gh" >&2
}

install_rtk
install_gh
