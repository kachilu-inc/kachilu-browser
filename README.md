# kachilu-browser

Public distribution repo for the Kachilu Browser CLI.

This repo is the npm distribution home for `kachilu-browser`. Native binaries built from the private source repo are bundled into the npm package when available, and `postinstall` can fall back to GitHub Releases for platforms that are not bundled yet.

Current synced version: `0.0.3`

## Install

```bash
npm install -g kachilu-browser
kachilu-browser onboard
```

## Shell installer

```bash
curl -fsSL https://github.com/kachilu-inc/kachilu-browser/releases/latest/download/install.sh | bash
```

The shell installer is the non-npm release path. It downloads the native binary
plus the local `onboard` support bundle (`scripts/` + `skills/`), then can
run `kachilu-browser onboard`. Target selection and host setup live in
`onboard`, so npm and shell installs share the same setup flow.

## Onboarding targets

- If `--target` is omitted in an interactive terminal, `kachilu-browser onboard` prompts for the host target
- In non-interactive runs, omitted `--target` auto-detects installed hosts and falls back to `codex`
- On WSL2, `onboard` persists `KACHILU_BROWSER_AUTO_CONNECT_TARGET=windows` and auto-detected `KACHILU_BROWSER_WINDOWS_LOCALAPPDATA` unless you override them
- When targeting Windows browsers from WSL2, `onboard` also ensures `%USERPROFILE%\.wslconfig` has `[wsl2] networkingMode=mirrored` and reports when `wsl --shutdown` is required
- `codex`: writes `~/.codex/config.toml` and links `~/.codex/skills/kachilu-browser`
- `opencode`: writes `~/.config/opencode/opencode.json(c)`
- `claudecode`: writes `~/.claude.json` and links `~/.claude/skills/kachilu-browser`

## MCP control plane

Agents should keep using the MCP prepare/exec workflow whenever the tools are available, including after context compaction or resume. This preserves the host-managed session, profile, and WSL2 Windows-browser target from the MCP env block.

Raw `kachilu-browser` shell commands are a fallback for environments without MCP, explicit CLI requests, or intentional local WSL/Linux browser work. On WSL2, a raw shell command can miss `KACHILU_BROWSER_AUTO_CONNECT_TARGET=windows` and launch or control a WSL2-local browser instead of the intended Windows browser.

Successful prepare and exec responses include `controlPlane: "mcp"` and `followUpTool: "kachilu_browser_exec"` so agents can preserve the MCP route across context compaction and long-running resumes.

## Release model

- Native binaries are built from the private source repo.
- The npm package bundles available native binaries so `npm install -g kachilu-browser` works without exposing the private source tree.
- The source repo must provide `KACHILU_BROWSER_RELEASE_TOKEN` so it can create this repo's GitHub Release and push synced tags.
- This public repo publishes the npm package via npm Trusted Publishing after the package already exists on npm.
- The very first npm publish for `kachilu-browser` must be done manually with `npm publish --access public`.
- If the package was unpublished, npm blocks republishing the same package name for 24 hours.
- This repo's publish workflow also refuses to publish if the package does not yet exist on npm.
- The npm package downloads matching native binaries from GitHub Releases only when the current platform binary was not bundled in the package.

## Commands

```bash
kachilu-browser --help
kachilu-browser onboard --help
node scripts/mcp-server.mjs
```
