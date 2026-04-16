# kachilu-browser

Human-like browser automation CLI for AI agents.

`kachilu-browser` drives a real Chrome browser through visible, human-paced actions: open pages, read snapshots, click, type, scroll, wait, capture screenshots, and continue from what is actually on screen. It is designed for agent workflows that need browser control without brittle DOM scraping.

## Highlights

- **Human-like operation, free forever**: visible UI actions such as clicking, typing, scrolling, waiting, and screenshots remain free under the included license.
- **CAPTCHA automation preview**: direct automation support for checkbox-style **reCAPTCHA v2** and **Cloudflare Turnstile** is available as a limited public preview until **May 31, 2026**.
- **WSL2 to Windows browser control**: agents running inside WSL2 can control the Windows-side Chrome browser, preserving the browser profile, login state, and desktop user experience.
- **Agent-ready MCP workflow**: `onboard` can configure Codex, Claude Code, and Claude Desktop local MCP integration so agents use the prepared browser workspace instead of raw shell commands.
- **Native CLI distribution**: npm installs include the local MCP server, skill bundle, and native binaries for supported platforms.

Use CAPTCHA automation only on properties you own, operate, or are explicitly authorized to test, and only where the target site's terms and applicable law permit it.

## Install

```bash
npm install -g kachilu-browser
kachilu-browser onboard
```

`onboard` installs the local MCP entry and skill bundle for the selected agent host. If no target is provided in an interactive terminal, it prompts for the target.

Common targets:

```bash
kachilu-browser onboard --target codex
kachilu-browser onboard --target claudecode
kachilu-browser onboard --target claudedesktop
kachilu-browser onboard --target all
```

For Codex and Claude Code on WSL2, `onboard` can persist the Windows-browser bridge settings in the generated MCP config:

```bash
kachilu-browser onboard \
  --target codex \
  --auto-connect-target windows \
  --windows-localappdata /mnt/c/Users/<you>/AppData/Local
```

When targeting a Windows browser from WSL2, `onboard` also checks `%USERPROFILE%\.wslconfig` for `[wsl2] networkingMode=mirrored` and reports when `wsl --shutdown` is required.

## Usage

### Core workflow

Use snapshots first, then interact through visible refs. Re-snapshot after every meaningful page change.

```bash
kachilu-browser open https://example.com/form
kachilu-browser snapshot -i
# Example refs: @e1 [input type="email"], @e2 [button] "Submit"

kachilu-browser fill @e1 "user@example.com"
kachilu-browser click @e2
kachilu-browser wait 2000
kachilu-browser snapshot -i
```

Common commands:

```bash
kachilu-browser open <url>              # Navigate to a page
kachilu-browser snapshot -i             # List visible interactive elements with refs
kachilu-browser click @e1               # Click a snapshot ref
kachilu-browser fill @e2 "text"         # Clear and type into a field
kachilu-browser type @e2 "text"         # Type without clearing
kachilu-browser keyboard type "text"    # Type at the current focus
kachilu-browser press Enter             # Press a key
kachilu-browser scroll down 500         # Scroll like a user
kachilu-browser wait 2000               # Wait in milliseconds
kachilu-browser screenshot              # Save a screenshot
kachilu-browser get text @e1            # Read element text
kachilu-browser get url                 # Read current URL
kachilu-browser close                   # Close the active browser session
kachilu-browser close --all             # Close all sessions
```

Run sequential commands in one invocation with `batch`:

```bash
kachilu-browser batch \
  "open https://example.com" \
  "snapshot -i"
```

### CAPTCHA workflow

Start with the visible checkbox path whenever a site presents or recognizes a CAPTCHA:

```bash
kachilu-browser captcha check
```

`captcha check` supports checkbox-style reCAPTCHA v2 and Cloudflare Turnstile widgets. It clicks the checkbox with human-like movement and reports whether the widget became checked or whether an additional challenge is required.

When an image challenge is required, inspect the current CAPTCHA region and click explicit tile points:

```bash
kachilu-browser captcha inspect-img --json
kachilu-browser captcha check-img --point 320 540
kachilu-browser captcha check-img --points '[{"x":320,"y":540},{"x":420,"y":540}]'
```

Direct `kachilu-browser captcha ...` access is available until **May 31, 2026** as a launch preview. After that date, CAPTCHA workflows are expected to run through `kachilu-agent-cli`, which supplies a backend-signed, session-bound capability token.

### MCP workflow for agents

The bundled MCP server exposes three tools:

- `kachilu_browser_prepare_workspace`
- `kachilu_browser_exec`
- `kachilu_browser_close_workspace`

Agents should prepare a workspace once, then run follow-up commands in that session. This preserves profile state, workspace window selection, and WSL2 Windows-browser routing.

Example MCP flow:

```text
kachilu_browser_prepare_workspace(initialUrl: "https://example.com")
kachilu_browser_exec(args: ["snapshot", "-i"])
kachilu_browser_exec(args: ["click", "@e1"])
```

Raw shell commands remain useful for local scripts, but MCP is preferred for agent-driven site work.

## License

`kachilu-browser` is owned by Kachilu Inc. and is available under the custom permissive license in [LICENSE](LICENSE).

In short: you may use, copy, modify, publish, distribute, sublicense, and sell copies of the software, provided the copyright and license notices are included. Kachilu Inc. trademarks and branding are not licensed except for customary origin references.
