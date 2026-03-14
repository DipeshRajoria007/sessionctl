#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SessionCtl Init Script
#
# This script is invoked via: eval "$(sessionctl init zsh|bash)"
# It outputs the shell companion source command for the detected shell.
# ─────────────────────────────────────────────────────────────────────────────

SESSIONCTL_DIR="$(cd "$(dirname "$0")" && pwd)"

init_shell() {
  local shell_type="${1:-$SHELL}"

  # Resolve shell type from path if needed
  case "$shell_type" in
    */zsh|zsh) shell_type="zsh" ;;
    */bash|bash) shell_type="bash" ;;
    *)
      echo "# SessionCtl: Unsupported shell '$shell_type'. Only zsh and bash are supported." >&2
      return 1
      ;;
  esac

  echo "# SessionCtl Shell Companion v1.0.0"
  echo "# Shell: $shell_type"
  echo "export SESSIONCTL_ENABLED=1"
  echo "source \"$SESSIONCTL_DIR/sessionctl.sh\""
}

# Handle CLI commands
case "${1:-}" in
  init)
    init_shell "${2:-}"
    ;;
  status)
    if [ -S "${SESSIONCTL_SOCKET:-$HOME/.sessionctl/sock}" ]; then
      echo "SessionCtl: Socket active at ${SESSIONCTL_SOCKET:-$HOME/.sessionctl/sock}"
    else
      echo "SessionCtl: Socket not found. Is the app running?"
    fi
    ;;
  disable)
    echo "export SESSIONCTL_ENABLED=0"
    echo "# SessionCtl disabled for this session"
    ;;
  *)
    echo "Usage: sessionctl {init <shell>|status|disable}"
    echo ""
    echo "Commands:"
    echo "  init <zsh|bash>  Output shell companion source command"
    echo "  status           Check if SessionCtl app is running"
    echo "  disable          Disable the companion for this session"
    ;;
esac
