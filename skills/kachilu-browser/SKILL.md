---
name: kachilu-browser
description: Browser automation CLI for AI agents. When MCP tools are available, prefer kachilu_browser_prepare_workspace plus kachilu_browser_exec over raw shell commands so host-managed sessions, WSL2 Windows-browser targeting, and profile settings are preserved. Use when the user needs to interact with websites, including navigating pages, filling forms, clicking buttons, taking screenshots, extracting data, testing web apps, or automating any browser task.
allowed-tools: Bash(npx kachilu-browser:*), Bash(kachilu-browser:*)
---

## Interaction Priority

Human-like interaction is the default and strongly preferred approach.

- Prefer visible user actions first: `open`, `snapshot`, `click`, `fill`, `type`, `scroll`, `press`, `wait`, `tab`, `screenshot`.
- Re-snapshot after each meaningful page change and continue from what is actually visible on screen.
- For feeds and dynamic apps such as X, prefer repeated `scroll` + `wait` + `snapshot` cycles over DOM scraping.
- For social sites and logged-in web apps, prefer the visible UI flow: open the site or search page, click the search box, type the query, press Enter, switch visible tabs/filters, then inspect what appears.
- Do not construct direct search/result URLs such as `https://x.com/search?...` as the default path. Use direct URLs only when the visible UI path is unavailable, ambiguous, or explicitly requested, and state why the fallback is needed.
- Pace actions like a human operator. Wait after page loads, searches, filter changes, and scrolls before observing again; avoid rapid query fan-out, repeated navigations, or one-search-per-second loops.
- On X and similar feeds, use short focused search terms, inspect both prominent and recent results through visible controls when needed, scroll gradually, and stop once enough evidence has been collected.
- For post, comment, message, and other rich composer fields, click the visible editor first and use `keyboard type` at the current focus. Use `fill` only for ordinary form fields such as plain inputs and textareas, or after verifying the composer behaves like one.
- Before clicking a publish, send, save, or submit control from a composer, re-snapshot and confirm the intended body appears once in the focused or visibly active composer.
- Use `eval`, raw DOM extraction, or page-internal JavaScript only as a last resort when human-like interaction is clearly insufficient.

If there is any doubt, choose the more human-like path.

## MCP-First Routing

Before running any browser command, choose the control plane.

1. If MCP tools are available, use MCP instead of shell commands.
2. In Codex, the callable tools may be exposed as `mcp__kachilu_browser__kachilu_browser_prepare_workspace` and `mcp__kachilu_browser__kachilu_browser_exec`.
3. Call `kachilu_browser_prepare_workspace` once, then use `kachilu_browser_exec` for `batch`, `snapshot`, `click`, `fill`, `wait`, and other follow-up commands. Reuse the returned `session`.
4. After context compaction, resume, or a long interruption, continue through MCP. Do not switch to raw `kachilu-browser` shell commands just because prior tool calls are no longer visible.
5. This matters on WSL2: MCP may carry host-managed environment such as `KACHILU_BROWSER_AUTO_CONNECT_TARGET=windows` and `KACHILU_BROWSER_WINDOWS_LOCALAPPDATA`. A raw shell command from WSL can miss that runtime setup and launch or control a WSL2-local browser instead of the intended Windows browser.
6. Use raw shell `kachilu-browser` only when MCP tools are unavailable, when the user explicitly asks for a CLI command, or when the task intentionally targets a local WSL/Linux browser.

## Core Workflow

When using the raw CLI directly, browser automation follows this pattern. Prefer the MCP workflow above whenever MCP is available.

1. **Navigate**: `kachilu-browser open <url>`
2. **Snapshot**: `kachilu-browser snapshot -i` (get element refs like `@e1`, `@e2`)
3. **Interact**: Use refs to click, fill, select
4. **Re-snapshot**: After navigation or DOM changes, get fresh refs

```bash
kachilu-browser open https://example.com/form
kachilu-browser snapshot -i
# Output: @e1 [input type="email"], @e2 [input type="password"], @e3 [button] "Submit"

kachilu-browser fill @e1 "user@example.com"
kachilu-browser fill @e2 "password123"
kachilu-browser click @e3
kachilu-browser wait 2000
kachilu-browser snapshot -i  # Check result
```

## Essential Commands

```bash
# Batch: ALWAYS use batch for 2+ sequential commands. Commands run in order.
kachilu-browser batch "open https://example.com" "snapshot -i"
kachilu-browser batch "open https://example.com" "screenshot"
kachilu-browser batch "click @e1" "wait 1000" "screenshot"

# Navigation
kachilu-browser open <url>              # Navigate (aliases: goto, navigate)
kachilu-browser close                   # Close browser
kachilu-browser close --all             # Close all active sessions

# Snapshot
kachilu-browser snapshot -i             # Interactive elements with refs (recommended)
kachilu-browser snapshot -i --urls      # Include href URLs for links
kachilu-browser snapshot -s "#selector" # Scope to CSS selector

# Interaction (use @refs from snapshot)
kachilu-browser click @e1               # Click element
kachilu-browser click @e1 --new-tab     # Click and open in new tab
kachilu-browser mouse click 320 540     # Move to visible coordinates and click
kachilu-browser fill @e2 "text"         # Clear and type text
kachilu-browser type @e2 "text"         # Type without clearing
kachilu-browser select @e1 "option"     # Select dropdown option
kachilu-browser check @e1               # Check checkbox
kachilu-browser captcha check           # First pass when a site recognizes or shows a CAPTCHA
kachilu-browser captcha inspect-img --json  # Image fallback when checkbox click requires a challenge follow-up
kachilu-browser captcha check-img --point 320 540   # Human-like explicit-point fallback for image grids
kachilu-browser captcha check-img --points '[{"x":320,"y":540}]'  # Multi-point fallback; verify is clicked automatically
kachilu-browser press Enter             # Press key
kachilu-browser keyboard type "text"    # Type at current focus (no selector)
kachilu-browser keyboard inserttext "text"  # Insert without key events
kachilu-browser scroll down 500         # Scroll page
kachilu-browser scroll down 500 --selector "div.content"  # Scroll within a specific container

# Get information
kachilu-browser get text @e1            # Get element text
kachilu-browser get url                 # Get current URL
kachilu-browser get title               # Get page title
kachilu-browser get cdp-url             # Get CDP WebSocket URL

# Wait
kachilu-browser wait @e1                # Wait for element
kachilu-browser wait 2000               # Wait milliseconds
kachilu-browser wait --url "**/page"    # Wait for URL pattern
kachilu-browser wait --text "Welcome"   # Wait for text to appear (substring match)
kachilu-browser wait --load networkidle # Wait for network idle (caution: see Pitfalls)
kachilu-browser wait --fn "!document.body.innerText.includes('Loading...')"  # Wait for text to disappear
kachilu-browser wait "#spinner" --state hidden  # Wait for element to disappear

# Downloads
kachilu-browser download @e1 ./file.pdf          # Click element to trigger download
kachilu-browser wait --download ./output.zip     # Wait for any download to complete
kachilu-browser --download-path ./downloads open <url>  # Set default download directory

# Tab management
kachilu-browser tab list                         # List all open tabs
kachilu-browser tab new                          # Open a blank new tab
kachilu-browser tab new https://example.com      # Open URL in a new tab
kachilu-browser tab 2                            # Switch to tab by index (0-based)
kachilu-browser tab close                        # Close the current tab
kachilu-browser tab close 2                      # Close tab by index

# Capture
kachilu-browser screenshot              # Screenshot to temp dir
kachilu-browser screenshot --full       # Full page screenshot
kachilu-browser screenshot --annotate   # Annotated screenshot with numbered element labels
kachilu-browser screenshot --screenshot-dir ./shots  # Save to custom directory
kachilu-browser screenshot --screenshot-format jpeg --screenshot-quality 80
kachilu-browser pdf output.pdf          # Save as PDF

# Clipboard
kachilu-browser clipboard read                      # Read text from clipboard
kachilu-browser clipboard write "Hello, World!"     # Write text to clipboard
kachilu-browser clipboard copy                      # Copy current selection
kachilu-browser clipboard paste                     # Paste from clipboard

# Dialogs (alert, confirm, prompt, beforeunload)
# By default, alert and beforeunload dialogs are auto-accepted so they never block the agent.
# confirm and prompt dialogs still require explicit handling.
# Use --no-auto-dialog (or KACHILU_BROWSER_NO_AUTO_DIALOG=1) to disable automatic handling.
kachilu-browser dialog accept              # Accept dialog
kachilu-browser dialog accept "my input"   # Accept prompt dialog with text
kachilu-browser dialog dismiss             # Dismiss/cancel dialog
kachilu-browser dialog status              # Check if a dialog is currently open

# Diff (compare page states)
kachilu-browser diff snapshot                          # Compare current vs last snapshot
kachilu-browser diff snapshot --baseline before.txt    # Compare current vs saved file
kachilu-browser diff screenshot --baseline before.png  # Visual pixel diff
kachilu-browser diff url <url1> <url2>                 # Compare two pages
kachilu-browser diff url <url1> <url2> --wait-until networkidle  # Custom wait strategy
kachilu-browser diff url <url1> <url2> --selector "#main"  # Scope to element
```

## CAPTCHA Workflow

When a site visibly presents or recognizes a CAPTCHA, always start with `kachilu-browser captcha check`. Do not begin with `eval`, raw DOM clicks, or the image path unless `captcha check` has already been attempted.

Direct `kachilu-browser captcha ...` access is available until 2026-05-31 as a launch promotion. After that date, CAPTCHA workflows must be run through `kachilu-agent-cli`, which supplies a backend-signed, session-bound capability token used by the browser CLI.

1. Run `kachilu-browser captcha check`
2. If the response is `checked`, continue the workflow
3. If the response is `v3_token_observed`, the page has already obtained a reCAPTCHA token; continue with the page's submit/result flow and verify the outcome
4. If the response is `v3_possible`, perform the visible page action that should trigger reCAPTCHA, such as submit/click, then run `captcha check` again if needed
5. If the response is `challenge_required`, `partial`, or the challenge is clearly image-based, run `kachilu-browser captcha inspect-img --json`
6. Analyze `full_screenshot_base64`, `captcha_crop_base64`, `challenge_crop_base64`, `checkbox_region`, `challenge_region`, and `current_pointer`
7. Execute `kachilu-browser captcha check-img --point ...` or `--points ...` with only the selected tile center points
8. If the response still says `challenge_required` or `partial`, inspect again because the challenge likely changed

Default order:

1. Detect or suspect CAPTCHA
2. Run `captcha check`
3. Treat `v3_token_observed` as a passive token observation, not a visual challenge
4. Only if needed, capture with `captcha inspect-img`
5. Analyze the returned image/crops
6. Click tile centers with `captcha check-img`

For checkbox CAPTCHAs, `captcha check` should be the first action every time. For reCAPTCHA v2 image-grid CAPTCHAs, inspect the challenge crop only after `captcha check` has escalated the flow, then select all matching tile centers. Do not include the verify button in `--points`; `captcha check-img` clicks the provided tiles with human-like movement and presses verify automatically when all provided tile clicks complete and the challenge is still active.

For reCAPTCHA v3, there is usually no checkbox or image grid. The browser daemon watches `/recaptcha/api2/reload` and `/recaptcha/enterprise/reload` responses through CDP and reports `v3_token_observed` when the page obtains a recent token. Do not describe this as solving a visible challenge; it is only observing a token that the page acquired normally.

## More Detail

This SKILL.md intentionally stops at the CAPTCHA workflow so the agent sees the
most important Kachilu behavior immediately when the skill is installed.

If the task needs more command coverage, workflow examples, troubleshooting,
global flags, references, or templates, load the version-matched runtime guide
from the installed CLI:

```bash
kachilu-browser skills get core
```

Use `kachilu-browser skills get core --full` only when references and templates
are specifically needed.
