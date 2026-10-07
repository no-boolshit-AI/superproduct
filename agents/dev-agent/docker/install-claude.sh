#!/bin/sh
# Installs the Claude Code binary that matches the host's Agent SDK version (passed in as $1),
# from the SDK's own per-platform npm package. Used by every workspace image.
set -eu
VERSION="${1:?usage: install-claude <agent-sdk-version>}"
case "$(uname -m)" in
  x86_64|amd64) ARCH=x64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac
LIBC=""
if [ -f /etc/alpine-release ]; then LIBC="-musl"; fi
PKG="@anthropic-ai/claude-agent-sdk-linux-${ARCH}${LIBC}"
mkdir -p /opt/claude
cd /opt/claude
[ -f package.json ] || npm init -y >/dev/null
npm install --no-audit --no-fund --no-update-notifier --loglevel=error --cache /tmp/npm-cache "${PKG}@${VERSION}"
rm -rf /tmp/npm-cache
ln -sf "/opt/claude/node_modules/${PKG}/claude" /usr/local/bin/claude
chmod -R a+rX /opt/claude
claude --version
