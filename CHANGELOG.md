# Changelog

## 0.0.5

### New Features

- Added OpenClaw bundle metadata so the npm package can be installed with `openclaw plugins install kachilu-browser`.
- Added packaged OpenClaw MCP server configuration and shipped skills to the npm tarball so OpenClaw can discover the browser automation tools without running npm lifecycle scripts.

### Improvements

- Documented `openclaw plugins install kachilu-browser` as the official shortest OpenClaw setup path.
- Made default human-like keyboard typing about twice as fast while preserving the same randomized cadence and pauses.
- Added skill guidance for the current-cursor click fallback when the cursor is visibly on a target but element-targeted clicks do not trigger the UI.
- Adjusted MCP workspace reuse so OpenClaw and other hosts keep using one healthy prepared workspace across related site tasks instead of reattaching and prompting for auto-connect approval again.
- Fixed MCP health checks to treat daemon-only disconnected workspaces as stale instead of reusing them as if the browser were still attached.
- Updated public distribution sync so `.codex-plugin/plugin.json` and `.mcp.json` stay in the generated npm package.
- Updated the source release workflow so CI-built binaries are staged into the public repo before npm Trusted Publishing.
- Kept OpenClaw installs independent of `postinstall`; native binaries must be present in the package artifact because OpenClaw packs with lifecycle scripts disabled.

### Bug Fixes

- Adjusted the packaged JavaScript launch helpers so OpenClaw's install scanner can complete the normal install path without requiring `--dangerously-force-unsafe-install`.

### Contributors

- Kachilu team

## 0.0.4

### Breaking Changes

- Removed the public `keyboard inserttext` and JSON `inserttext` command surfaces. Use `keyboard type` for focused rich editors and `fill` for ordinary inputs.

### New Features

- Integrated upstream `agent-browser` v0.26.0, including the `doctor` command, stable tab ids and labels, config JSON schema generation, and the upstream `core` skill model.
- Added a manual **Build macOS Binaries** workflow that builds only `kachilu-browser-darwin-arm64` and `kachilu-browser-darwin-x64` on GitHub-hosted macOS runners.

### Improvements

- Changed the shipped skill layout so `skills/kachilu-browser/SKILL.md` stays a thin discovery stub and the versioned runtime guide lives at `skill-data/core/SKILL.md`.
- Made `kachilu-browser skills get core` return the usable runtime guide by default, while `--full` remains available for references and templates.
- Limited the public release package to the Kachilu discovery skill plus `skill-data/core`, keeping unrelated upstream skill data out of the public package.
- Added a hybrid release path for constrained Actions budgets: build macOS binaries in the manual workflow, download those artifacts locally, build Linux/Windows locally, then publish all assets to `kachilu-inc/kachilu-browser`.

### Bug Fixes

- Preserved Kachilu MCP-first, human-like interaction, and CAPTCHA guardrails in the discovery stub so agents still see critical operational defaults before loading the full core skill.
- Fixed macOS workflow artifact creation by copying release binaries with executable permissions before verification and upload.
- Updated local release helpers so non-macOS builds can skip macOS targets and consume CI-produced macOS artifacts.

### Contributors

- Kachilu team

## 0.0.3

### Documentation

- Reworked the README for the public `kachilu-browser` release with product-focused positioning around human-like browser automation, agent MCP workflows, WSL2-to-Windows browser control, and CAPTCHA automation.
- Simplified installation guidance to the npm global install and `kachilu-browser onboard` setup path.
- Added concise usage examples for the snapshot-first browser workflow, MCP prepare/exec flow, and CAPTCHA commands.

### Licensing

- Added the Kachilu Browser License.
- Clarified that the software may be used, copied, modified, published, distributed, sublicensed, and sold under the included license, while Kachilu Inc. trademarks and branding remain separately reserved.

### Distribution

- Documented that human-like browser operation remains free forever under the included license.
- Documented that direct reCAPTCHA v2 and Cloudflare Turnstile automation is available as a limited public preview until May 31, 2026.
