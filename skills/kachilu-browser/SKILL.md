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
2. In Codex, the callable tools may be exposed as `mcp__kachilu_browser__kachilu_browser_prepare_workspace` and `mcp__kachilu_browser__kachilu_browser_exec`, or under the `mcp__agent_browser__...` server namespace with the same `kachilu_browser_*` tool names.
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

## MCP Integration

The repository includes a minimal stdio MCP server at `scripts/mcp-server.mjs`.

Primary tools:

1. `kachilu_browser_prepare_workspace`
2. `kachilu_browser_exec`
3. `kachilu_browser_close_workspace`

Some hosts include the server name in the tool identifier, for example `mcp__kachilu_browser__kachilu_browser_prepare_workspace` or `mcp__agent_browser__kachilu_browser_prepare_workspace`. Treat both as the same MCP control plane and prefer them over raw shell commands.

Responsibility split:

1. MCP owns browser-runtime setup
2. This skill decides when to call the MCP tools

Use `kachilu_browser_prepare_workspace` first when the task clearly requires browser interaction, especially for site-specific requests such as X, LinkedIn, Yahoo, GitHub, Gmail, dashboards, admin panels, or other logged-in web workflows.

Preparation rules:

1. Prefer `kachilu_browser_prepare_workspace` over raw shell commands when the MCP tool is available
2. Pass `site` when the target site is obvious, for example `x`, `linkedin`, `yahoo`, or `github`
3. Pass `initialUrl` when you already know the landing page
4. Let MCP default to `workspaceMode: "new-window"` when you want the same profile but a separate workspace window from the user's current browser window
5. Reuse the returned session for all follow-up `kachilu_browser_exec` calls
6. Do not explain `--auto-connect`, profiles, or session plumbing to the user unless they explicitly ask

`kachilu_browser_prepare_workspace` handles the runtime strategy for you:

1. Reuse an active matching session
2. Prefer `--auto-connect` to the user's running browser
3. By default, prepare a dedicated same-profile workspace window so automation stays out of the user's current window
4. Use `workspaceMode: "fresh-tab"` only when you explicitly want to stay in the current browser window
5. If auto-connect cannot attach, tell the user to open Chrome, keep remote-connect enabled, approve the connection prompt, and then retry
6. If the connected browser only has a single blank startup tab and you are using `fresh-tab`, expect `kachilu-browser` to replace that placeholder instead of leaving two blank tabs open

When `session` is omitted, the MCP server reuses the shared workspace session instead of generating site-specific session names. This keeps repeated browser tasks from reconnecting unnecessarily and preserves the default dedicated-window behavior.
If the shared session still looks alive but a probe or navigation is temporarily blocked, MCP returns `actionRequired: "retry-existing-session"` instead of tearing the daemon down and auto-connecting again. Tell the user to retry the same task after a short wait. Do not kill the session or force a reconnect unless the session is clearly stale.

Do not switch to the user's currently focused tab for normal site tasks. Rely on the workspace prepared by `kachilu_browser_prepare_workspace`, and keep follow-up `kachilu_browser_exec` calls in that returned session.

## Common Patterns

### Form Submission

```bash
# Navigate and get the form structure
kachilu-browser batch "open https://example.com/signup" "snapshot -i"
# Read the snapshot output to identify form refs, then fill and submit
kachilu-browser batch "fill @e1 \"Jane Doe\"" "fill @e2 \"jane@example.com\"" "select @e3 \"California\"" "check @e4" "click @e5" "wait 2000"
```

### Session Persistence

```bash
# Auto-save/restore cookies and localStorage across browser restarts
kachilu-browser --session-name myapp open https://app.example.com/login
# ... login flow ...
kachilu-browser close  # State auto-saved to ~/.kachilu-browser/sessions/

# Next time, state is auto-loaded
kachilu-browser --session-name myapp open https://app.example.com/dashboard

# Encrypt state at rest
export KACHILU_BROWSER_ENCRYPTION_KEY=$(openssl rand -hex 32)
kachilu-browser --session-name secure open https://app.example.com

# Manage saved states
kachilu-browser state list
kachilu-browser state show myapp-default.json
kachilu-browser state clear myapp
kachilu-browser state clean --older-than 7
```

### Working with Iframes

Iframe content is automatically inlined in snapshots. Refs inside iframes carry frame context, so you can interact with them directly.

```bash
kachilu-browser batch "open https://example.com/checkout" "snapshot -i"
# @e1 [heading] "Checkout"
# @e2 [Iframe] "payment-frame"
#   @e3 [input] "Card number"
#   @e4 [input] "Expiry"
#   @e5 [button] "Pay"

# Interact directly — no frame switch needed
kachilu-browser batch "fill @e3 \"4111111111111111\"" "fill @e4 \"12/28\"" "click @e5"

# To scope a snapshot to one iframe:
kachilu-browser batch "frame @e2" "snapshot -i"
kachilu-browser frame main          # Return to main frame
```

### Data Extraction

```bash
kachilu-browser batch "open https://example.com/products" "snapshot -i"
# Read snapshot to find element refs, then extract
kachilu-browser get text @e5           # Get specific element text

# JSON output for parsing
kachilu-browser snapshot -i --json
kachilu-browser get text @e1 --json
```

### Connect to Existing Chrome

```bash
# Auto-discover running Chrome with remote debugging enabled
kachilu-browser --auto-connect open https://example.com
kachilu-browser --auto-connect snapshot

# Or with explicit CDP port
kachilu-browser --cdp 9222 snapshot
```

Auto-connect discovers Chrome via `DevToolsActivePort`, common debugging ports (9222, 9229), and falls back to a direct WebSocket connection if HTTP-based CDP discovery fails.

### Local Files (PDFs, HTML)

```bash
# Open local files with file:// URLs
kachilu-browser --allow-file-access open file:///path/to/document.pdf
kachilu-browser --allow-file-access open file:///path/to/page.html
kachilu-browser screenshot output.png
```

## Timeouts and Slow Pages

The default timeout is 25 seconds. This can be overridden with the `KACHILU_BROWSER_DEFAULT_TIMEOUT` environment variable (value in milliseconds).

**Important:** `open` already waits for the page `load` event before returning. In most cases, no additional wait is needed before taking a snapshot or screenshot. Only add an explicit wait when content loads asynchronously after the initial page load.

```bash
# Wait for a specific element to appear (preferred for dynamic content)
kachilu-browser wait "#content"
kachilu-browser wait @e1

# Wait a fixed duration (good default for slow SPAs)
kachilu-browser wait 2000

# Wait for a specific URL pattern (useful after redirects)
kachilu-browser wait --url "**/dashboard"

# Wait for text to appear on the page
kachilu-browser wait --text "Results loaded"

# Wait for a JavaScript condition
kachilu-browser wait --fn "document.querySelectorAll('.item').length > 0"
```

**Avoid `wait --load networkidle`** unless you are certain the site has no persistent network activity. Ad-heavy sites, sites with analytics/tracking, and sites with websockets will cause `networkidle` to hang indefinitely. Prefer `wait 2000` or `wait <selector>` instead.

## JavaScript Dialogs (alert / confirm / prompt)

When a page opens a JavaScript dialog (`alert()`, `confirm()`, or `prompt()`), it blocks all other browser commands (snapshot, screenshot, click, etc.) until the dialog is dismissed. If commands start timing out unexpectedly, check for a pending dialog:

```bash
# Check if a dialog is blocking
kachilu-browser dialog status

# Accept the dialog (dismiss the alert / click OK)
kachilu-browser dialog accept

# Accept a prompt dialog with input text
kachilu-browser dialog accept "my input"

# Dismiss the dialog (click Cancel)
kachilu-browser dialog dismiss
```

When a dialog is pending, all command responses include a `warning` field indicating the dialog type and message. In `--json` mode this appears as a `"warning"` key in the response object.

## Ref Lifecycle (Important)

Refs (`@e1`, `@e2`, etc.) are invalidated when the page changes. Always re-snapshot after:

- Clicking links or buttons that navigate
- Form submissions
- Dynamic content loading (dropdowns, modals)

```bash
kachilu-browser click @e5              # Navigates to new page
kachilu-browser snapshot -i            # MUST re-snapshot
kachilu-browser click @e1              # Use new refs
```

## Annotated Screenshots (Vision Mode)

Use `--annotate` to take a screenshot with numbered labels overlaid on interactive elements. Each label `[N]` maps to ref `@eN`. This also caches refs, so you can interact with elements immediately without a separate snapshot.

```bash
kachilu-browser screenshot --annotate
# Output includes the image path and a legend:
#   [1] @e1 button "Submit"
#   [2] @e2 link "Home"
#   [3] @e3 textbox "Email"
kachilu-browser click @e2              # Click using ref from annotated screenshot
```

Use annotated screenshots when:

- The page has unlabeled icon buttons or visual-only elements
- You need to verify visual layout or styling
- Canvas or chart elements are present (invisible to text snapshots)
- You need spatial reasoning about element positions

## Semantic Locators (Alternative to Refs)

When refs are unavailable or unreliable, use semantic locators:

```bash
kachilu-browser find text "Sign In" click
kachilu-browser find label "Email" fill "user@test.com"
kachilu-browser find role button click --name "Submit"
kachilu-browser find placeholder "Search" type "query"
kachilu-browser find testid "submit-btn" click
```

If refs keep invalidating (`stale_ref`), elements live inside an iframe, or repeated re-snapshotting still does not produce stable handles, fall back to visual GUI interaction instead of forcing more DOM-based retries.

Preferred fallback order:

1. Re-snapshot once after the last DOM-changing action
2. Try a semantic locator if the target has stable text, label, role, or placeholder
3. If the target is visually obvious but refs still churn, use an annotated screenshot and click the element by its visible position with `mouse click <x> <y>`
4. After the click places the caret correctly, type normally and submit via the visible send/submit control

Use this GUI-first fallback especially for:

- Message composers and chat overlays that re-render aggressively
- Iframe-hosted inputs that appear in snapshots but are hard to reach from top-level `eval`
- Rich text editors where `fill` or `eval` fails but the caret is visibly placed in the correct box

When taking the fallback path, prefer the human sequence a person would use:

```bash
kachilu-browser screenshot --annotate
# Inspect the annotated image, then click the textbox by its visible location/ref
kachilu-browser click @eN
kachilu-browser keyboard type "your message here"
kachilu-browser mouse click 960 720   # visible send button center
```

Do not keep retrying the same stale ref more than once. If the target is visible and the ref/semantic locator is still stale, use `mouse click <x> <y>` on the visible control.

## JavaScript Evaluation (eval)

Use `eval` to run JavaScript in the browser context. **Shell quoting can corrupt complex expressions** -- use `--stdin` or `-b` to avoid issues.

```bash
# Simple expressions work with regular quoting
kachilu-browser eval 'document.title'
kachilu-browser eval 'document.querySelectorAll("img").length'

# Complex JS: use --stdin with heredoc (RECOMMENDED)
kachilu-browser eval --stdin <<'EVALEOF'
JSON.stringify(
  Array.from(document.querySelectorAll("img"))
    .filter(i => !i.alt)
    .map(i => ({ src: i.src.split("/").pop(), width: i.width }))
)
EVALEOF

# Alternative: base64 encoding (avoids all shell escaping issues)
kachilu-browser eval -b "$(echo -n 'Array.from(document.querySelectorAll("a")).map(a => a.href)' | base64)"
```

**Why this matters:** When the shell processes your command, inner double quotes, `!` characters (history expansion), backticks, and `$()` can all corrupt the JavaScript before it reaches kachilu-browser. The `--stdin` and `-b` flags bypass shell interpretation entirely.

**Rules of thumb:**

- Single-line, no nested quotes -> regular `eval 'expression'` with single quotes is fine
- Nested quotes, arrow functions, template literals, or multiline -> use `eval --stdin <<'EVALEOF'`
- Programmatic/generated scripts -> use `eval -b` with base64

## Configuration File

Create `kachilu-browser.json` in the project root for persistent settings:

```json
{
  "headed": true,
  "proxy": "http://localhost:8080",
  "profile": "./browser-data"
}
```

Priority (lowest to highest): `~/.kachilu-browser/config.json` < `./kachilu-browser.json` < env vars < CLI flags. Use `--config <path>` or `KACHILU_BROWSER_CONFIG` env var for a custom config file (exits with error if missing/invalid). All CLI options map to camelCase keys (e.g., `--executable-path` -> `"executablePath"`). Boolean flags accept `true`/`false` values (e.g., `--headed false` overrides config). Extensions from user and project configs are merged, not replaced.

## Deep-Dive Documentation

| Reference                                                            | When to Use                                               |
| -------------------------------------------------------------------- | --------------------------------------------------------- |
| [references/commands.md](references/commands.md)                     | Full command reference with all options                   |
| [references/snapshot-refs.md](references/snapshot-refs.md)           | Ref lifecycle, invalidation rules, troubleshooting        |
| [references/session-management.md](references/session-management.md) | Parallel sessions, state persistence, concurrent scraping |
| [references/authentication.md](references/authentication.md)         | Login flows, OAuth, 2FA handling, state reuse             |
| [references/video-recording.md](references/video-recording.md)       | Recording workflows for debugging and documentation       |
| [references/profiling.md](references/profiling.md)                   | Chrome DevTools profiling for performance analysis        |
| [references/proxy-support.md](references/proxy-support.md)           | Proxy configuration, geo-testing, rotating proxies        |

## Ready-to-Use Templates

| Template                                                                 | Description                         |
| ------------------------------------------------------------------------ | ----------------------------------- |
| [templates/form-automation.sh](templates/form-automation.sh)             | Form filling with validation        |

```bash
./templates/form-automation.sh https://example.com/form
```
