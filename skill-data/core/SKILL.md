---
name: core
description: Core kachilu-browser usage guide. Read this before running any kachilu-browser commands. Covers the snapshot-and-ref workflow, navigating pages, interacting with elements (click, fill, type, select), extracting text and data, taking screenshots, managing tabs, handling forms and auth, waiting for content, running multiple browser sessions in parallel, and troubleshooting common failures. Use when the user asks to interact with a website, fill a form, click something, extract data, take a screenshot, log into a site, test a web app, or automate any browser task.
allowed-tools: Bash(kachilu-browser:*), Bash(npx kachilu-browser:*)
---

# kachilu-browser core

Fast browser automation CLI for AI agents. Chrome/Chromium via CDP, no
Playwright or Puppeteer dependency. Accessibility-tree snapshots with compact
`@eN` refs let agents interact with pages in ~200-400 tokens instead of
parsing raw HTML.

Most normal web tasks (navigate, read, click, fill, extract, screenshot) are covered here.

The installed `skills/kachilu-browser/SKILL.md` is only a discovery stub. This
core guide is the runtime source of truth for Kachilu interaction defaults,
MCP-first routing, CAPTCHA workflow, troubleshooting, and command usage.

## Interaction Priority

Human-like interaction is the default and strongly preferred approach.

- Prefer visible user actions first: `open`, `snapshot`, `click`, `fill`, `type`, `scroll`, `press`, `wait`, `tab`, `screenshot`.
- Re-snapshot after each meaningful page change and continue from what is actually visible on screen.
- For feeds and dynamic apps such as X, prefer repeated `scroll` + `wait` + `snapshot` cycles over DOM scraping.
- For social sites and logged-in web apps, prefer the visible UI flow: open the site or search page, click the search box, type the query, press Enter, switch visible tabs/filters, then inspect what appears.
- Do not construct direct search/result URLs such as `https://x.com/search?...` as the default path. Use direct URLs only when the visible UI path is unavailable, ambiguous, or explicitly requested, and state why the fallback is needed.
- Pace actions like a human operator. Wait after page loads, searches, filter changes, and scrolls before observing again; avoid rapid query fan-out, repeated navigations, or one-search-per-second loops.
- For post, comment, message, and other rich composer fields, click the visible editor first and use `keyboard type` at the current focus. Use `fill` only for ordinary form fields such as plain inputs and textareas, or after verifying the composer behaves like one.
- Before clicking a publish, send, save, or submit control from a composer, re-snapshot and confirm the intended body appears once in the focused or visibly active composer.
- Use `eval`, raw DOM extraction, or page-internal JavaScript only as a last resort when human-like interaction is clearly insufficient.

If there is any doubt, choose the more human-like path.

## MCP-First Routing

Before running any browser command, choose the control plane.

1. If MCP tools are available, use MCP instead of shell commands.
2. In Codex, the callable tools may be exposed as `mcp__kachilu_browser__kachilu_browser_prepare_workspace` and `mcp__kachilu_browser__kachilu_browser_exec`, or under the `mcp__agent_browser__...` server namespace with the same `kachilu_browser_*` tool names.
3. In OpenClaw, bundle MCP may expose provider-safe names such as `kachilu_browser__kachilu_browser_prepare_workspace` and `kachilu_browser__kachilu_browser_exec`; use those when OpenClaw presents them.
4. Call `kachilu_browser_prepare_workspace` once, then use `kachilu_browser_exec` for `batch`, `snapshot`, `click`, `fill`, `wait`, and other follow-up commands. Reuse the returned `session`.
5. After context compaction, resume, or a long interruption, continue through MCP. Do not switch to raw `kachilu-browser` shell commands just because prior tool calls are no longer visible.
6. On WSL2, MCP may carry host-managed environment such as `KACHILU_BROWSER_AUTO_CONNECT_TARGET=windows`; raw shell commands can miss that setup and control the wrong browser.
7. Use raw shell `kachilu-browser` only when MCP tools are unavailable, when the user explicitly asks for a CLI command, or when the task intentionally targets a local WSL/Linux browser.
8. Keep the same prepared MCP session across related browser work in the same user request, even when moving from LinkedIn to X or between multiple logged-in sites. The `site` hint is for routing only; it must not create per-site sessions.
9. Do not call `kachilu_browser_close_workspace` between related browser subtasks. Close only when the entire workflow is finished or the user explicitly wants cleanup.

Primary MCP tools are `kachilu_browser_prepare_workspace`, `kachilu_browser_exec`, and `kachilu_browser_close_workspace`. Use `prepare_workspace` first when the task clearly requires browser interaction, especially for site-specific requests such as X, LinkedIn, Yahoo, GitHub, Gmail, dashboards, admin panels, or other logged-in web workflows. Pass `site` when the target site is obvious and `initialUrl` when you already know the landing page. `site` is only a hint; it does not mean "start a separate session for this site".

Let MCP default to `workspaceMode: "new-window"` when you want the same browser profile but a separate workspace window. Use `workspaceMode: "fresh-tab"` only when you intentionally want to stay in the current browser window. Do not switch to the user's currently focused tab for normal site tasks.

If auto-connect cannot attach, tell the user to open Chrome, keep remote-connect enabled, approve the connection prompt, and then retry. If MCP returns `actionRequired: "retry-existing-session"`, tell the user to retry after a short wait. Do not kill the session or force a reconnect unless the session is clearly stale.

If a daemon is still running but its browser connection is gone, treat that session as stale rather than reusable. The next `prepare_workspace` should reconnect instead of clinging to the dead session.

## Core Loop

```bash
kachilu-browser open <url>        # 1. Open a page
kachilu-browser snapshot -i       # 2. See interactive elements with @eN refs
kachilu-browser click @e3         # 3. Act on refs from the snapshot
kachilu-browser snapshot -i       # 4. Re-snapshot after page changes
```

Refs (`@e1`, `@e2`, ...) are assigned fresh on every snapshot. They become stale the moment the page changes: after navigations, form submits, dynamic re-renders, dialogs, modals, or iframe changes.

## Reading a page

```bash
kachilu-browser snapshot                    # full tree (verbose)
kachilu-browser snapshot -i                 # interactive elements only (preferred)
kachilu-browser snapshot -i -u              # include href urls on links
kachilu-browser snapshot -i -c              # compact (no empty structural nodes)
kachilu-browser snapshot -i -d 3            # cap depth at 3 levels
kachilu-browser snapshot -s "#main"         # scope to a CSS selector
kachilu-browser snapshot -i --json          # machine-readable output
```

Snapshot output looks like:

```
Page: Example - Log in
URL: https://example.com/login

@e1 [heading] "Log in"
@e2 [form]
  @e3 [input type="email"] placeholder="Email"
  @e4 [input type="password"] placeholder="Password"
  @e5 [button type="submit"] "Continue"
  @e6 [link] "Forgot password?"
```

For unstructured reading (no refs needed):

```bash
kachilu-browser get text @e1                # visible text of an element
kachilu-browser get html @e1                # innerHTML
kachilu-browser get attr @e1 href           # any attribute
kachilu-browser get value @e1               # input value
kachilu-browser get title                   # page title
kachilu-browser get url                     # current URL
kachilu-browser get count ".item"           # count matching elements
```

## Interacting

```bash
kachilu-browser click @e1                   # click
kachilu-browser --action-mode ax-ref click @e1  # use the legacy fast ref path
kachilu-browser click @e1 --new-tab         # open link in new tab instead of navigating
kachilu-browser dblclick @e1                # double-click
kachilu-browser hover @e1                   # hover
kachilu-browser focus @e1                   # focus (useful before keyboard input)
kachilu-browser fill @e2 "hello"            # clear then type
kachilu-browser type @e2 " world"           # type without clearing
kachilu-browser press Enter                 # press a key at current focus
kachilu-browser press Control+a             # key combination
kachilu-browser check @e3                   # check checkbox
kachilu-browser uncheck @e3                 # uncheck
kachilu-browser select @e4 "option-value"   # select dropdown option
kachilu-browser select @e4 "a" "b"          # select multiple
kachilu-browser upload @e5 file1.pdf        # upload file(s)
kachilu-browser scroll down 500             # scroll page (up/down/left/right)
kachilu-browser scrollintoview @e1          # scroll element into view
kachilu-browser drag @e1 @e2                # drag and drop
```

When using MCP `kachilu_browser_exec` with `batch`, pass each browser command
as its own argument. The `args` array is already argv, so use
`["batch", "fill @e1 \"Alice\"", "fill @e2 \"alice@example.com\""]`. Do not
join multiple commands into one newline-delimited string such as
`["batch", "fill @e1 \"Alice\"\nfill @e2 \"alice@example.com\""]`; that is
parsed as one command and can put later commands into the first field.

### When refs don't work or you don't want to snapshot

Use semantic locators:

```bash
kachilu-browser find role button click --name "Submit"
kachilu-browser find text "Sign In" click
kachilu-browser find text "Sign In" click --exact     # exact match only
kachilu-browser find label "Email" fill "user@test.com"
kachilu-browser find placeholder "Search" type "query"
kachilu-browser find testid "submit-btn" click
kachilu-browser find first ".card" click
kachilu-browser find nth 2 ".card" hover
```

Or a raw CSS selector:

```bash
kachilu-browser click "#submit"
kachilu-browser fill "input[name=email]" "user@test.com"
kachilu-browser click "button.primary"
```

Rule of thumb: snapshot + `@eN` refs are fastest and most reliable for
AI agents. `find role/text/label` is next best and doesn't require a prior
snapshot. Raw CSS is a fallback when the others fail.

Hybrid mode is the default for stale-prone ref actions. It keeps the existing
snapshot/ref workflow but fresh-resolves the target from current AX/DOM
semantics and the last observed geometry before dispatching the coordinate
click. Use `kachilu-browser --action-mode ax-ref click @eN` only when you want
the legacy fast ref path.

If `click @eN`, semantic click, or CSS click fails even though the visible
cursor appears to be on the intended button or control, verify the visual state
before changing strategy:

```bash
kachilu-browser screenshot /tmp/kachilu-click-state.png
# If the screenshot/capture shows the cursor over the intended button:
kachilu-browser mouse down left
kachilu-browser mouse up left
kachilu-browser snapshot -i
```

Use this current-cursor click fallback only after visual confirmation. It is
useful for canvas-like controls, custom pointer handlers, and UI layers where
element-targeted clicks resolve the right element but the page still ignores the
click. Do not keep repeating the same ref click if the cursor is visibly on the
target and the page does not respond.

If refs keep invalidating, elements live inside an iframe, or a rich text
editor ignores DOM-oriented input, switch to the visible GUI path instead of
repeating the same failing ref. Take an annotated screenshot, click the visible
control, use `keyboard type` at the current focus, then re-snapshot before
submitting.

## CAPTCHA Workflow

When a site visibly presents or recognizes a CAPTCHA, always start with
`kachilu-browser captcha check`. Do not begin with `eval`, raw DOM clicks, or
the image path unless `captcha check` has already been attempted.

Direct `kachilu-browser captcha ...` access is available until 2026-05-31 as a
launch promotion. After that date, CAPTCHA workflows must be run through
`kachilu-agent-cli`, which supplies a backend-signed, session-bound capability
token used by the browser CLI.

Run `captcha check` first. Continue on `checked`; for `v3_token_observed`, continue the page's normal submit/result flow and verify the outcome; for `v3_possible`, perform the visible action that should trigger reCAPTCHA and check again. If the response is `challenge_required`, `partial`, or the challenge is clearly image-based, run `captcha inspect-img --json`, analyze the screenshot/crop fields, then click only selected tile centers with `captcha check-img --point ...` or `--points ...`. Inspect again if the challenge changes or remains partial.

For checkbox CAPTCHAs, `captcha check` should be the first action every time.
For reCAPTCHA v2 image-grid CAPTCHAs, inspect the challenge crop only after
`captcha check` has escalated the flow, then select all matching tile centers.
Do not include the verify button in `--points`; `captcha check-img` clicks the
provided tiles with human-like movement and presses verify automatically when
all provided tile clicks complete and the challenge is still active.

For reCAPTCHA v3, there is usually no checkbox or image grid. The browser
daemon watches `/recaptcha/api2/reload` and `/recaptcha/enterprise/reload`
responses through CDP and reports `v3_token_observed` when the page obtains a
recent token. Do not describe this as solving a visible challenge; it is only
observing a token that the page acquired normally.

## Waiting (read this)

Agents fail more often from bad waits than from bad selectors. Pick the
right wait for the situation:

```bash
kachilu-browser wait @e1                     # until an element appears
kachilu-browser wait 2000                    # dumb wait, milliseconds (last resort)
kachilu-browser wait --text "Success"        # until the text appears on the page
kachilu-browser wait --url "**/dashboard"    # until URL matches pattern (glob)
kachilu-browser wait --load networkidle      # until network idle (post-navigation)
kachilu-browser wait --load domcontentloaded # until DOMContentLoaded
kachilu-browser wait --fn "window.myApp.ready === true"  # until JS condition
```

After any page-changing action, pick one:

- Wait for a specific element you expect to appear: `wait @ref` or `wait --text "..."`.
- Wait for URL change: `wait --url "**/new-page"`.
- Wait for network idle (catch-all for SPA navigation): `wait --load networkidle`.

Avoid bare `wait 2000` except when debugging — it makes scripts slow and
flaky. Timeouts default to 25 seconds.

## Common workflows

### Log in

```bash
kachilu-browser open https://app.example.com/login
kachilu-browser snapshot -i

# Pick the email/password refs out of the snapshot, then:
kachilu-browser fill @e3 "user@example.com"
kachilu-browser fill @e4 "hunter2"
kachilu-browser click @e5
kachilu-browser wait --url "**/dashboard"
kachilu-browser snapshot -i
```

Credentials in shell history are a leak. For anything sensitive, use the
auth vault (see [references/authentication.md](references/authentication.md)):

```bash
kachilu-browser auth save my-app --url https://app.example.com/login \
  --username user@example.com --password-stdin
# (type password, Ctrl+D)

kachilu-browser auth login my-app    # fills + clicks, waits for form
```

### Persist session across runs

```bash
# Log in once, save cookies + localStorage
kachilu-browser state save ./auth.json

# Later runs start already-logged-in
kachilu-browser --state ./auth.json open https://app.example.com
```

Or use `--session-name` for auto-save/restore:

```bash
KACHILU_BROWSER_SESSION_NAME=my-app kachilu-browser open https://app.example.com
# State is auto-saved and restored on subsequent runs with the same name.
```

### Extract data

```bash
# Structured snapshot (best for AI reasoning over page content)
kachilu-browser snapshot -i --json > page.json

# Targeted extraction with refs
kachilu-browser snapshot -i
kachilu-browser get text @e5
kachilu-browser get attr @e10 href

# Arbitrary shape via JavaScript
cat <<'EOF' | kachilu-browser eval --stdin
const rows = document.querySelectorAll("table tbody tr");
Array.from(rows).map(r => ({
  name: r.cells[0].innerText,
  price: r.cells[1].innerText,
}));
EOF
```

Prefer `eval --stdin` (heredoc) or `eval -b <base64>` for any JS with
quotes or special characters. Inline `kachilu-browser eval "..."` works
only for simple expressions.

### Screenshot

```bash
kachilu-browser screenshot                        # temp path, printed on stdout
kachilu-browser screenshot page.png               # specific path
kachilu-browser screenshot --full full.png        # full scroll height
kachilu-browser screenshot --annotate map.png     # numbered labels + legend keyed to snapshot refs
```

`--annotate` is designed for multimodal models: each label `[N]` maps to ref
`@eN`. Use it when the page has unlabeled icon buttons, visual-only elements,
canvas/chart surfaces, or when spatial reasoning is more reliable than text
snapshots.

### Handle multiple pages via tabs

```bash
kachilu-browser tab                      # list open tabs (with stable tabId)
kachilu-browser tab new https://docs...  # open a new tab (and switch to it)
kachilu-browser tab t2                   # switch to tab t2
kachilu-browser tab close t2             # close tab t2
```

Stable `tabId`s mean `tab t2` points at the same tab across commands even
when other tabs open or close. After switching, refs from a prior snapshot
on a different tab no longer apply — re-snapshot.

### Run multiple browsers in parallel

Each `--session <name>` is an isolated browser with its own cookies, tabs,
and refs. Useful for testing multi-user flows or parallel scraping:

```bash
kachilu-browser --session a open https://app.example.com
kachilu-browser --session b open https://app.example.com
kachilu-browser --session a fill @e1 "alice@test.com"
kachilu-browser --session b fill @e1 "bob@test.com"
```

`KACHILU_BROWSER_SESSION=myapp` sets the default session for the current
shell.

### Mock network requests

```bash
kachilu-browser network route "**/api/users" --body '{"users":[]}'   # stub a response
kachilu-browser network route "**/analytics" --abort                 # block entirely
kachilu-browser network requests                                     # inspect what fired
kachilu-browser network har start                                    # record all traffic
# ... perform actions ...
kachilu-browser network har stop /tmp/trace.har
```

### Record a video of the workflow

```bash
kachilu-browser record start demo.webm
kachilu-browser open https://example.com
kachilu-browser snapshot -i
kachilu-browser click @e3
kachilu-browser record stop
```

See [references/video-recording.md](references/video-recording.md) for
codec options, GIF export, and more.

### Iframes

Iframes are auto-inlined in the snapshot — their refs work transparently:

```bash
kachilu-browser snapshot -i
# @e3 [Iframe] "payment-frame"
#   @e4 [input] "Card number"
#   @e5 [button] "Pay"

kachilu-browser fill @e4 "4111111111111111"
kachilu-browser click @e5
```

To scope a snapshot to an iframe (for focus or deep nesting):

```bash
kachilu-browser frame @e3      # switch context to the iframe
kachilu-browser snapshot -i
kachilu-browser frame main     # back to main frame
```

### Dialogs

`alert` and `beforeunload` are auto-accepted so agents never block. For
`confirm` and `prompt`:

```bash
kachilu-browser dialog status          # is there a pending dialog?
kachilu-browser dialog accept           # accept
kachilu-browser dialog accept "text"    # accept with prompt input
kachilu-browser dialog dismiss          # cancel
```

## Diagnosing install issues

If a command fails unexpectedly (`Unknown command`, `Failed to connect`,
stale daemons, version mismatches after `upgrade`, missing Chrome, etc.)
run `doctor` before anything else:

```bash
kachilu-browser doctor                     # full diagnosis (env, Chrome, daemons, config, providers, network, launch test)
kachilu-browser doctor --offline --quick   # fast, local-only
kachilu-browser doctor --fix               # also run destructive repairs (reinstall Chrome, purge old state, ...)
kachilu-browser doctor --json              # structured output for programmatic consumption
```

`doctor` auto-cleans stale socket/pid/version sidecar files on every run.
Destructive actions require `--fix`. Exit code is `0` if all checks pass
(warnings OK), `1` if any fail.

## Troubleshooting

**"Ref not found" / "Element not found: @eN"**
Page changed since the snapshot. Run `kachilu-browser snapshot -i` again,
then use the new refs.

**Element exists in the DOM but not in the snapshot**
It's probably off-screen or not yet rendered. Try:

```bash
kachilu-browser scroll down 1000
kachilu-browser snapshot -i
# or
kachilu-browser wait --text "..."
kachilu-browser snapshot -i
```

**Click does nothing / overlay swallows the click**
Some modals and cookie banners block other clicks. Snapshot, find the
dismiss/close button, click it, then re-snapshot.

If no blocker is visible and the cursor is already on the intended button, take
a screenshot/capture to confirm the cursor placement. When it is on target,
click at the current cursor position with `mouse down left` then `mouse up
left`, and re-snapshot to verify the page changed.

**Fill / type doesn't work**
Some custom input components intercept key events. Try:

```bash
kachilu-browser focus @e1
kachilu-browser keyboard type "text"          # human-like keystrokes, no selector
```

**Page needs JS you can't get right in one shot**
Use `eval --stdin` with a heredoc instead of inline:

```bash
cat <<'EOF' | kachilu-browser eval --stdin
// Complex script with quotes, backticks, whatever
document.querySelectorAll('[data-id]').length
EOF
```

**Cross-origin iframe not accessible**
Cross-origin iframes that block accessibility tree access are silently
skipped. Use `frame "#iframe"` to switch into them explicitly if the
parent opts in, otherwise the iframe's contents aren't available via
snapshot — fall back to `eval` in the iframe's origin or use the
`--headers` flag to satisfy CORS.

**Authentication expires mid-workflow**
Use `--session-name <name>` or `state save`/`state load` so your session
survives browser restarts. See [references/session-management.md](references/session-management.md)
and [references/authentication.md](references/authentication.md).

## Global flags worth knowing

```bash
--session <name>        # isolated browser session
--json                  # JSON output (for machine parsing)
--headed                # show the window (default is headless)
--auto-connect          # connect to an already-running Chrome
--cdp <port>            # connect to a specific CDP port
--profile <name|path>   # use a Chrome profile (login state survives)
--headers <json>        # HTTP headers scoped to the URL's origin
--proxy <url>           # proxy server
--state <path>          # load saved auth state from JSON
--session-name <name>   # auto-save/restore session state by name
```

Configuration can also live in `kachilu-browser.json`. Priority is:
`~/.kachilu-browser/config.json` < `./kachilu-browser.json` < environment
variables < CLI flags. Use `--config <path>` or `KACHILU_BROWSER_CONFIG` for a custom config file.

## Skill scope

The release package ships a thin discovery skill plus the `core` runtime
skill. Use the normal snapshot-ref workflow here for browser automation, and
rely on other installed tools or project instructions for workflows outside web
pages.

## Full reference

The core skill above is enough for most tasks. When you need the complete
command/flag/env listing, supporting references, or starter scripts, load the
full bundle:

```bash
kachilu-browser skills get core --full
```
