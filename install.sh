#!/usr/bin/env bash

set -euo pipefail

REPO="kachilu-inc/kachilu-browser"
CLI_NAME="kachilu-browser"
BUNDLE_REF="${KACHILU_BROWSER_BUNDLE_REF:-main}"

detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin) os="darwin" ;;
    Linux) os="linux" ;;
    MINGW*|MSYS*|CYGWIN*) os="win32" ;;
    *)
      echo "Unsupported OS: $os" >&2
      exit 1
      ;;
  esac

  case "$arch" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *)
      echo "Unsupported architecture: $arch" >&2
      exit 1
      ;;
  esac

  if [ "$os" = "linux" ] && ldd --version 2>&1 | grep -qi musl; then
    os="linux-musl"
  fi

  if [ "$os" = "win32" ]; then
    printf '%s-%s.exe\n' "$os" "$arch"
  else
    printf '%s-%s\n' "$os" "$arch"
  fi
}

install_dir_default() {
  if [ -w "/usr/local/bin" ]; then
    printf '/usr/local/bin\n'
  else
    printf '%s/.local/bin\n' "${HOME}"
  fi
}

bundle_dir_default() {
  local install_dir="$1"

  if [ -n "${KACHILU_BROWSER_HOME:-}" ]; then
    printf '%s\n' "${KACHILU_BROWSER_HOME}"
    return
  fi

  if [ "${install_dir}" = "/usr/local/bin" ] && [ -w "/usr/local/lib" ]; then
    printf '/usr/local/lib/kachilu-browser\n'
  else
    printf '%s/kachilu-browser\n' "${XDG_DATA_HOME:-${HOME}/.local/share}"
  fi
}

list_matching_pids() {
  local needle="$1"

  if [ -z "${needle}" ]; then
    return 0
  fi

  ps -eo pid=,args= 2>/dev/null | awk -v needle="${needle}" -v self="$$" '
    index($0, needle) > 0 {
      pid = $1 + 0
      if (pid > 0 && pid != self) {
        print pid
      }
    }
  '
}

stop_managed_processes() {
  local bundle_dir="$1"
  local binary_path="$2"
  local mcp_server_path="${bundle_dir}/scripts/mcp-server.mjs"
  local pids remaining deadline pid

  pids="$(
    {
      list_matching_pids "${binary_path}"
      list_matching_pids "${mcp_server_path}"
    } | sort -u
  )"

  if [ -z "${pids}" ]; then
    return 0
  fi

  echo "Stopping running ${CLI_NAME} processes from ${bundle_dir}"
  for pid in ${pids}; do
    kill "${pid}" 2>/dev/null || true
  done

  deadline=$((SECONDS + 5))
  while :; do
    remaining=""
    for pid in ${pids}; do
      if kill -0 "${pid}" 2>/dev/null; then
        remaining="${remaining} ${pid}"
      fi
    done

    if [ -z "${remaining}" ]; then
      return 0
    fi

    if [ "${SECONDS}" -ge "${deadline}" ]; then
      break
    fi

    sleep 1
  done

  echo "Force-stopping stuck ${CLI_NAME} processes:${remaining}"
  for pid in ${remaining}; do
    kill -9 "${pid}" 2>/dev/null || true
  done
}

shell_rc_path() {
  case "$(basename "${SHELL:-}")" in
    zsh) printf '%s/.zshrc\n' "${HOME}" ;;
    bash) printf '%s/.bashrc\n' "${HOME}" ;;
    *)
      return 1
      ;;
  esac
}

tty_device() {
  if [ -t 2 ] && [ -c /dev/tty ] && [ -r /dev/tty ] && [ -w /dev/tty ]; then
    printf '/dev/tty\n'
    return 0
  fi
  return 1
}

prompt_with_default() {
  local prompt="$1"
  local default_value="$2"
  local tty answer=""

  tty="$(tty_device || true)"
  if [ -z "${tty}" ]; then
    printf '%s\n' "${default_value}"
    return
  fi

  printf '%s [%s]: ' "${prompt}" "${default_value}" > "${tty}"
  IFS= read -r answer < "${tty}" || true
  if [ -z "${answer}" ]; then
    answer="${default_value}"
  fi
  printf '%s\n' "${answer}"
}

prompt_yes_no() {
  local prompt="$1"
  local default_value="$2"
  local tty answer="" normalized=""

  tty="$(tty_device || true)"
  if [ -z "${tty}" ]; then
    [ "${default_value}" = "y" ]
    return
  fi

  if [ "${default_value}" = "y" ]; then
    printf '%s [Y/n]: ' "${prompt}" > "${tty}"
  else
    printf '%s [y/N]: ' "${prompt}" > "${tty}"
  fi

  IFS= read -r answer < "${tty}" || true
  normalized="$(printf '%s' "${answer}" | tr '[:upper:]' '[:lower:]')"

  if [ -z "${normalized}" ]; then
    normalized="${default_value}"
  fi

  case "${normalized}" in
    y|yes) return 0 ;;
    *) return 1 ;;
  esac
}

is_wsl_environment() {
  if [ -n "${WSL_DISTRO_NAME:-}" ]; then
    return 0
  fi

  if [ -r /proc/sys/kernel/osrelease ] && grep -qi microsoft /proc/sys/kernel/osrelease; then
    return 0
  fi

  return 1
}

find_windows_path_line() {
  while IFS= read -r line; do
    line="$(printf '%s' "${line}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    if printf '%s' "${line}" | grep -Eq '^[A-Za-z]:[\\/]'; then
      printf '%s\n' "${line}"
      return 0
    fi
  done
  return 1
}

windows_path_to_wsl_path() {
  local raw="$1"
  local drive rest

  if ! printf '%s' "${raw}" | grep -Eq '^[A-Za-z]:[\\/]'; then
    return 1
  fi

  drive="$(printf '%s' "${raw}" | cut -c1 | tr '[:upper:]' '[:lower:]')"
  rest="$(printf '%s' "${raw}" | cut -c4- | tr '\\' '/')"
  printf '/mnt/%s/%s\n' "${drive}" "${rest}"
}

resolve_wsl_windows_localappdata() {
  local raw

  if ! is_wsl_environment; then
    return 1
  fi

  if [ -n "${KACHILU_BROWSER_WINDOWS_LOCALAPPDATA:-}" ]; then
    printf '%s\n' "${KACHILU_BROWSER_WINDOWS_LOCALAPPDATA}"
    return 0
  fi

  if ! command -v cmd.exe >/dev/null 2>&1; then
    return 1
  fi

  raw="$(cmd.exe /C "echo %LOCALAPPDATA%" 2>/dev/null | find_windows_path_line || true)"
  if [ -z "${raw}" ]; then
    return 1
  fi

  windows_path_to_wsl_path "${raw}" || printf '%s\n' "${raw}"
}

install_bundle_files() {
  local bundle_dir="$1"
  local archive_url archive_path tmpdir source_dir

  if ! command -v tar >/dev/null 2>&1; then
    echo "tar is required" >&2
    exit 1
  fi

  archive_url="https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BUNDLE_REF}"
  tmpdir="$(mktemp -d)"
  archive_path="${tmpdir}/bundle.tar.gz"

  echo "Downloading support bundle ${archive_url}"
  curl -fsSL "${archive_url}" -o "${archive_path}"
  tar -xzf "${archive_path}" -C "${tmpdir}"
  source_dir="$(find "${tmpdir}" -mindepth 1 -maxdepth 1 -type d | head -n1)"

  if [ -z "${source_dir}" ]; then
    echo "Failed to unpack support bundle" >&2
    rm -rf "${tmpdir}"
    exit 1
  fi

  mkdir -p "${bundle_dir}/scripts" "${bundle_dir}/skills" "${bundle_dir}/bin"
  cp "${source_dir}/scripts/env-prefix-bridge.mjs" "${bundle_dir}/scripts/env-prefix-bridge.mjs"
  cp "${source_dir}/scripts/onboard.mjs" "${bundle_dir}/scripts/onboard.mjs"
  cp "${source_dir}/scripts/mcp-server.mjs" "${bundle_dir}/scripts/mcp-server.mjs"
  cp "${source_dir}/scripts/setup-codex.mjs" "${bundle_dir}/scripts/setup-codex.mjs"
  rm -rf "${bundle_dir}/skills/kachilu-browser"
  cp -R "${source_dir}/skills/kachilu-browser" "${bundle_dir}/skills/kachilu-browser"

  rm -rf "${tmpdir}"
}

write_command_wrapper() {
  local target_path="$1"
  local bundle_dir="$2"
  local binary_path="$3"

  cat > "${target_path}" <<EOF
#!/usr/bin/env bash
set -euo pipefail

BUNDLE_DIR=$(printf '%q' "${bundle_dir}")
BINARY_PATH=$(printf '%q' "${binary_path}")

while IFS='=' read -r key _; do
  case "\${key}" in
    KACHILU_BROWSER_*)
      suffix="\${key#KACHILU_BROWSER_}"
      upstream_key="AGENT_BROWSER_\${suffix}"
      if [ -z "\${!upstream_key:-}" ]; then
        export "\${upstream_key}=\${!key}"
      fi
      ;;
  esac
done < <(env)

if [ "\${1:-}" = "onboard" ]; then
  if ! command -v node >/dev/null 2>&1; then
    echo "node is required for 'kachilu-browser onboard'" >&2
    exit 1
  fi
  exec node "\${BUNDLE_DIR}/scripts/onboard.mjs" "\${@:2}"
fi

exec "\${BINARY_PATH}" "\$@"
EOF

  chmod +x "${target_path}"
}

install_binary() {
  local asset_url="$1"
  local bundle_dir="$2"
  local binary_path="$3"
  local tmp_path="${binary_path}.download.$$"

  # Download to a temp path first so re-installs do not fail when the current
  # binary is still running from the previous inode.
  rm -f "${tmp_path}"
  curl -fsSL "${asset_url}" -o "${tmp_path}"
  chmod +x "${tmp_path}"

  if [ -e "${binary_path}" ]; then
    # Refreshing an active install should not leave a mix of old binary and
    # old bundled MCP support files behind.
    stop_managed_processes "${bundle_dir}" "${binary_path}"
  fi

  mv -f "${tmp_path}" "${binary_path}"
}

maybe_run_onboard() {
  local bundle_dir="$1"
  local tty

  if ! command -v node >/dev/null 2>&1; then
    echo
    echo "Node.js was not found, so onboarding was skipped."
    echo "Install Node.js to run: ${CLI_NAME} onboard"
    return
  fi

  tty="$(tty_device || true)"
  if [ -z "${tty}" ]; then
    return
  fi

  if ! prompt_yes_no "Run onboarding now?" "y"; then
    return
  fi

  echo
  node "${bundle_dir}/scripts/onboard.mjs"
}

main() {
  if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required" >&2
    exit 1
  fi

  local platform_suffix asset_url install_dir bundle_dir target_path binary_path
  platform_suffix="$(detect_platform)"
  asset_url="https://github.com/${REPO}/releases/latest/download/${CLI_NAME}-${platform_suffix}"
  install_dir="${INSTALL_DIR:-$(install_dir_default)}"
  bundle_dir="${BUNDLE_DIR:-$(bundle_dir_default "${install_dir}")}"
  target_path="${install_dir}/${CLI_NAME}"
  binary_path="${bundle_dir}/bin/${CLI_NAME}-${platform_suffix}"

  mkdir -p "${install_dir}"
  mkdir -p "${bundle_dir}/bin"

  echo "Downloading ${asset_url}"
  install_binary "${asset_url}" "${bundle_dir}" "${binary_path}"
  install_bundle_files "${bundle_dir}"
  write_command_wrapper "${target_path}" "${bundle_dir}" "${binary_path}"

  echo
  echo "Installed ${CLI_NAME} to ${target_path}"
  echo "Bundle root:"
  echo "  ${bundle_dir}"
  echo "Next step:"
  echo "  ${CLI_NAME} onboard"
  echo "  or: ${target_path} onboard"

  maybe_run_onboard "${bundle_dir}"

  case ":$PATH:" in
    *":${install_dir}:"*) ;;
    *)
      echo
      echo "Run now:"
      echo "  export PATH=\"${install_dir}:\$PATH\""

      if rc_path="$(shell_rc_path)"; then
        echo
        echo "Persist for future shells:"
        echo "  echo 'export PATH=\"${install_dir}:\$PATH\"' >> ${rc_path}"
      else
        echo
        echo "Add ${install_dir} to PATH in your shell startup file."
      fi
      ;;
  esac
}

main "$@"
