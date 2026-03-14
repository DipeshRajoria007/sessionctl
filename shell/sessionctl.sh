#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SessionCtl Shell Companion v1.0.0
#
# Lightweight shell integration for zsh and bash.
# Sources in .zshrc or .bashrc to report session events to the SessionCtl app
# via a Unix domain socket.
#
# Usage:
#   eval "$(sessionctl init zsh)"   # or bash
#
# This script:
#   - Hooks into shell lifecycle events (cd, preexec, precmd)
#   - Sends structured JSON messages over a Unix domain socket
#   - Never blocks the shell prompt
#   - Silently no-ops if the app is not running
# ─────────────────────────────────────────────────────────────────────────────

# Configuration
SESSIONCTL_SOCKET="${SESSIONCTL_SOCKET:-$HOME/.sessionctl/sock}"
SESSIONCTL_ENABLED="${SESSIONCTL_ENABLED:-1}"

# ─── Internal state ─────────────────────────────────────────────────────────

# Generate a stable session ID from TTY path
__sessionctl_tty=$(tty 2>/dev/null || echo "/dev/unknown")
__sessionctl_session_id=$(echo -n "$__sessionctl_tty" | shasum -a 256 2>/dev/null | cut -c1-16 || echo "unknown")
__sessionctl_shell_type="${ZSH_VERSION:+zsh}"
__sessionctl_shell_type="${__sessionctl_shell_type:-bash}"
__sessionctl_cmd_start_time=""
__sessionctl_current_cmd=""

# ─── Utility functions ──────────────────────────────────────────────────────

# Send a JSON message to the SessionCtl socket.
# Returns immediately if socket is unavailable. Never blocks.
__sessionctl_send() {
  if [ "$SESSIONCTL_ENABLED" != "1" ]; then
    return 0
  fi

  local message="$1"

  # Check if socket exists before trying to connect
  if [ ! -S "$SESSIONCTL_SOCKET" ]; then
    return 0
  fi

  # Send via socat or nc, with a short timeout to avoid blocking
  if command -v socat >/dev/null 2>&1; then
    echo "$message" | socat -t 1 - UNIX-CONNECT:"$SESSIONCTL_SOCKET" 2>/dev/null &
    disown 2>/dev/null
  elif command -v nc >/dev/null 2>&1; then
    # macOS nc supports -U for Unix sockets
    echo "$message" | nc -U -w 1 "$SESSIONCTL_SOCKET" 2>/dev/null &
    disown 2>/dev/null
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "
import socket, sys
try:
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(1)
    s.connect('$SESSIONCTL_SOCKET')
    s.sendall(sys.stdin.read().encode() + b'\n')
    s.close()
except:
    pass
" <<< "$message" 2>/dev/null &
    disown 2>/dev/null
  fi

  return 0
}

# Get the current Unix timestamp in milliseconds
__sessionctl_timestamp() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "import time; print(int(time.time() * 1000))"
  elif command -v perl >/dev/null 2>&1; then
    perl -MTime::HiRes=time -e 'printf "%d\n", time*1000'
  else
    echo $(( $(date +%s) * 1000 ))
  fi
}

# Detect the git repo root for the current directory
__sessionctl_repo_root() {
  git rev-parse --show-toplevel 2>/dev/null || echo ""
}

# Get the current git branch
__sessionctl_branch() {
  git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null || echo ""
}

# Get repo name from the repo root path
__sessionctl_repo_name() {
  local root
  root=$(__sessionctl_repo_root)
  if [ -n "$root" ]; then
    basename "$root"
  fi
}

# Classify a command into a tool type
__sessionctl_classify_tool() {
  local cmd="$1"
  # Extract the first word (the actual command)
  local first_word
  first_word=$(echo "$cmd" | awk '{print $1}')

  case "$first_word" in
    claude|claude-code)  echo "claude" ;;
    codex)               echo "codex" ;;
    aider)               echo "aider" ;;
    git)                 echo "git" ;;
    npm|npx|yarn|pnpm)   echo "npm" ;;
    *)                   echo "other" ;;
  esac
}

# Safely escape a string for JSON
__sessionctl_json_escape() {
  local str="$1"
  # Escape backslashes, double quotes, newlines, tabs, and control chars
  str=$(printf '%s' "$str" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | tr '\n' ' ' | head -c 2048)
  echo "$str"
}

# ─── Event emitters ─────────────────────────────────────────────────────────

# Emitted once when the shell starts.
__sessionctl_emit_init() {
  local ts
  ts=$(__sessionctl_timestamp)
  local dir
  dir=$(pwd)
  local pid=$$

  local message
  message=$(cat <<EOF
{"type":"session_init","sessionId":"$__sessionctl_session_id","timestamp":$ts,"tty":"$__sessionctl_tty","pid":$pid,"shellType":"$__sessionctl_shell_type","initialDirectory":"$(__sessionctl_json_escape "$dir")"}
EOF
)
  __sessionctl_send "$message"
}

# Emitted on every cd.
__sessionctl_emit_directory_changed() {
  local ts
  ts=$(__sessionctl_timestamp)
  local dir
  dir=$(pwd)
  local repo_root
  repo_root=$(__sessionctl_repo_root)
  local repo_name
  repo_name=$(__sessionctl_repo_name)
  local branch
  branch=$(__sessionctl_branch)

  # Build JSON with null for empty values
  local repo_root_json="null"
  [ -n "$repo_root" ] && repo_root_json="\"$(__sessionctl_json_escape "$repo_root")\""
  local repo_name_json="null"
  [ -n "$repo_name" ] && repo_name_json="\"$(__sessionctl_json_escape "$repo_name")\""
  local branch_json="null"
  [ -n "$branch" ] && branch_json="\"$(__sessionctl_json_escape "$branch")\""

  local message
  message=$(cat <<EOF
{"type":"directory_changed","sessionId":"$__sessionctl_session_id","timestamp":$ts,"directory":"$(__sessionctl_json_escape "$dir")","repoRoot":$repo_root_json,"repoName":$repo_name_json,"branch":$branch_json}
EOF
)
  __sessionctl_send "$message"
}

# Emitted before each command executes (preexec).
__sessionctl_emit_command_start() {
  local cmd="$1"
  local ts
  ts=$(__sessionctl_timestamp)
  local tool
  tool=$(__sessionctl_classify_tool "$cmd")

  __sessionctl_cmd_start_time=$ts
  __sessionctl_current_cmd="$cmd"

  local message
  message=$(cat <<EOF
{"type":"command_start","sessionId":"$__sessionctl_session_id","timestamp":$ts,"command":"$(__sessionctl_json_escape "$cmd")","tool":"$tool"}
EOF
)
  __sessionctl_send "$message"
}

# Emitted after each command completes (precmd).
__sessionctl_emit_command_end() {
  local exit_status=$1
  local ts
  ts=$(__sessionctl_timestamp)
  local duration=0

  if [ -n "$__sessionctl_cmd_start_time" ]; then
    duration=$(( ts - __sessionctl_cmd_start_time ))
  fi

  __sessionctl_cmd_start_time=""
  __sessionctl_current_cmd=""

  local message
  message=$(cat <<EOF
{"type":"command_end","sessionId":"$__sessionctl_session_id","timestamp":$ts,"exitStatus":$exit_status,"duration":$duration}
EOF
)
  __sessionctl_send "$message"
}

# Emitted when the shell exits.
__sessionctl_emit_exit() {
  local ts
  ts=$(__sessionctl_timestamp)
  local message
  message=$(cat <<EOF
{"type":"session_exit","sessionId":"$__sessionctl_session_id","timestamp":$ts}
EOF
)
  __sessionctl_send "$message"
}

# ─── Shell-specific hooks ──────────────────────────────────────────────────

if [ -n "$ZSH_VERSION" ]; then
  # ─── ZSH hooks ─────────────────────────────────────────────────────

  # Hook into directory changes
  __sessionctl_chpwd() {
    __sessionctl_emit_directory_changed
  }

  # Hook into command execution (preexec)
  __sessionctl_preexec() {
    __sessionctl_emit_command_start "$1"
  }

  # Hook into prompt rendering (precmd)
  __sessionctl_precmd() {
    local exit_status=$?
    if [ -n "$__sessionctl_current_cmd" ]; then
      __sessionctl_emit_command_end $exit_status
    fi
  }

  # Register hooks (append to avoid overwriting existing hooks)
  autoload -Uz add-zsh-hook 2>/dev/null
  if typeset -f add-zsh-hook >/dev/null 2>&1; then
    add-zsh-hook chpwd __sessionctl_chpwd
    add-zsh-hook preexec __sessionctl_preexec
    add-zsh-hook precmd __sessionctl_precmd
  else
    # Fallback: prepend to existing hook arrays
    chpwd_functions=(__sessionctl_chpwd $chpwd_functions)
    preexec_functions=(__sessionctl_preexec $preexec_functions)
    precmd_functions=(__sessionctl_precmd $precmd_functions)
  fi

elif [ -n "$BASH_VERSION" ]; then
  # ─── BASH hooks ────────────────────────────────────────────────────

  # cd override for directory change detection
  __sessionctl_original_cd=$(type -t cd)
  cd() {
    builtin cd "$@"
    local ret=$?
    if [ $ret -eq 0 ]; then
      __sessionctl_emit_directory_changed
    fi
    return $ret
  }

  # Also handle pushd and popd
  pushd() {
    builtin pushd "$@"
    local ret=$?
    if [ $ret -eq 0 ]; then
      __sessionctl_emit_directory_changed
    fi
    return $ret
  }

  popd() {
    builtin popd "$@"
    local ret=$?
    if [ $ret -eq 0 ]; then
      __sessionctl_emit_directory_changed
    fi
    return $ret
  }

  # DEBUG trap for preexec equivalent
  __sessionctl_bash_preexec() {
    # Avoid firing for PROMPT_COMMAND itself
    if [ -n "$COMP_LINE" ]; then
      return
    fi
    # Get the command from bash history
    local cmd
    cmd=$(HISTTIMEFORMAT= history 1 | sed 's/^[ ]*[0-9]*[ ]*//')
    if [ -n "$cmd" ] && [ "$cmd" != "$__sessionctl_last_cmd" ]; then
      __sessionctl_last_cmd="$cmd"
      __sessionctl_emit_command_start "$cmd"
    fi
  }

  __sessionctl_last_cmd=""
  trap '__sessionctl_bash_preexec' DEBUG

  # PROMPT_COMMAND for precmd equivalent
  __sessionctl_bash_precmd() {
    local exit_status=$?
    if [ -n "$__sessionctl_current_cmd" ]; then
      __sessionctl_emit_command_end $exit_status
    fi
  }

  # Append to PROMPT_COMMAND
  if [ -n "$PROMPT_COMMAND" ]; then
    PROMPT_COMMAND="__sessionctl_bash_precmd;$PROMPT_COMMAND"
  else
    PROMPT_COMMAND="__sessionctl_bash_precmd"
  fi
fi

# ─── Exit hook ──────────────────────────────────────────────────────────────

trap '__sessionctl_emit_exit' EXIT

# ─── Initial events ────────────────────────────────────────────────────────

# Emit session init and initial directory
__sessionctl_emit_init
__sessionctl_emit_directory_changed
