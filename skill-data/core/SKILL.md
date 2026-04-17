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

Most normal web tasks (navigate, read, click, fill, extract, screenshot) are
covered here. The release package ships this core runtime skill only.

## Kachilu defaults

### MCP-first routing

If MCP tools are available, use them before raw shell commands. Call
`kachilu_browser_prepare_workspace` once, then reuse the returned `session`
with `kachilu_browser_exec` for `batch`, `snapshot`, `click`, `fill`, `wait`,
and other follow-up commands.

Keep the MCP route after context compaction, resume, or a long interruption.
This matters on WSL2 because MCP can preserve host-managed browser settings
such as `KACHILU_BROWSER_AUTO_CONNECT_TARGET=windows` and
`KACHILU_BROWSER_WINDOWS_LOCALAPPDATA`. Raw shell commands from WSL can miss
that setup and control a WSL-local browser instead of the intended Windows
browser.

Use raw `kachilu-browser` only when MCP tools are unavailable, when the user
explicitly asks for CLI commands, or when the task intentionally targets a
local browser process.

### Human-like interaction

Prefer visible user actions: `open`, `snapshot`, `click`, `fill`, `type`,
`scroll`, `press`, `wait`, `tab`, and `screenshot`. Re-snapshot after each
meaningful page change and continue from what is actually visible.

For logged-in apps, social feeds, and rich web editors, use the visible UI
flow before direct URLs, DOM scraping, or `eval`. Click the visible editor and
use `keyboard type` for rich composer fields. Use `fill` for ordinary inputs
and textareas. Before clicking publish, send, save, or submit, re-snapshot and
confirm the intended body appears once in the active composer.

Use `eval`, raw DOM extraction, or page-internal JavaScript only when the
visible workflow is clearly insufficient.

### CAPTCHA workflow

When a page visibly presents or recognizes a CAPTCHA, start with:

```bash
kachilu-browser captcha check
```

Do not begin with `eval`, raw DOM clicks, or image-grid handling unless
`captcha check` has already been attempted.

Direct `kachilu-browser captcha ...` access is available until 2026-05-31 as
a launch promotion. After that date, run CAPTCHA workflows through
`kachilu-agent-cli`, which supplies a backend-signed, session-bound capability
token used by the browser CLI.

Default order:

```bash
kachilu-browser captcha check
kachilu-browser captcha inspect-img --json
kachilu-browser captcha check-img --point 320 540
kachilu-browser captcha check-img --points '[{"x":320,"y":540}]'
```

Use the image path only for `challenge_required`, `partial`, or visibly
image-based challenges. Inspect again after each partial result because the
challenge may change.

## The core loop

```bash
kachilu-browser open <url>        # 1. Open a page
kachilu-browser snapshot -i       # 2. See what's on it (interactive elements only)
kachilu-browser click @e3         # 3. Act on refs from the snapshot
kachilu-browser snapshot -i       # 4. Re-snapshot after any page change
```

Refs (`@e1`, `@e2`, ...) are assigned fresh on every snapshot. They become
**stale the moment the page changes** — after clicks that navigate, form
submits, dynamic re-renders, dialog opens. Always re-snapshot before your
next ref interaction.

## Quickstart

```bash
# Install once
npm i -g kachilu-browser && kachilu-browser install

# Take a screenshot of a page
kachilu-browser open https://example.com
kachilu-browser screenshot home.png
kachilu-browser close

# Search, click a result, and capture it
kachilu-browser open https://duckduckgo.com
kachilu-browser snapshot -i                      # find the search box ref
kachilu-browser fill @e1 "kachilu-browser cli"
kachilu-browser press Enter
kachilu-browser wait --load networkidle
kachilu-browser snapshot -i                      # refs now reflect results
kachilu-browser click @e5                        # click a result
kachilu-browser screenshot result.png
```

The browser stays running across commands so these feel like a single
session. Use `kachilu-browser close` (or `close --all`) when you're done.

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

`--annotate` is designed for multimodal models: each label `[N]` maps to ref `@eN`.

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

**Fill / type doesn't work**
Some custom input components intercept key events. Try:

```bash
kachilu-browser focus @e1
kachilu-browser keyboard inserttext "text"    # bypasses key events
# or
kachilu-browser keyboard type "text"          # raw keystrokes, no selector
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

## Skill scope

The release package ships the `core` runtime skill only. Use the normal
snapshot-ref workflow here for browser automation, and rely on other installed
tools or project instructions for workflows outside web pages.

## Full reference

The core skill above is enough for most tasks. When you need the complete
command/flag/env listing, supporting references, or starter scripts, load the
full bundle:

```bash
kachilu-browser skills get core --full
```

That pulls in:

- `references/commands.md` — every command, flag, alias
- `references/snapshot-refs.md` — deep dive on the snapshot + ref model
- `references/authentication.md` — auth vault, credential handling
- `references/session-management.md` — persistence, multi-session workflows
- `references/profiling.md` — Chrome DevTools tracing and profiling
- `references/video-recording.md` — video capture options
- `references/proxy-support.md` — proxy configuration
- `templates/*` — starter shell scripts for form automation
