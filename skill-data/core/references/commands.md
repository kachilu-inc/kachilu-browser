# Command Reference

Complete reference for all kachilu-browser commands. For quick start and common patterns, see SKILL.md.

## Navigation

```bash
kachilu-browser open <url>      # Navigate to URL (aliases: goto, navigate)
                              # Supports: https://, http://, file://, about:, data://
                              # Auto-prepends https:// if no protocol given
kachilu-browser back            # Go back
kachilu-browser forward         # Go forward
kachilu-browser reload          # Reload page
kachilu-browser close           # Close browser (aliases: quit, exit)
kachilu-browser connect 9222    # Connect to browser via CDP port
```

## Snapshot (page analysis)

```bash
kachilu-browser snapshot            # Full accessibility tree
kachilu-browser snapshot -i         # Interactive elements only (recommended)
kachilu-browser snapshot -c         # Compact output
kachilu-browser snapshot -d 3       # Limit depth to 3
kachilu-browser snapshot -s "#main" # Scope to CSS selector
```

## Interactions (use @refs from snapshot)

```bash
kachilu-browser click @e1           # Click
kachilu-browser click @e1 --new-tab # Click and open in new tab
kachilu-browser dblclick @e1        # Double-click
kachilu-browser focus @e1           # Focus element
kachilu-browser fill @e2 "text"     # Clear and type
kachilu-browser type @e2 "text"     # Type without clearing
kachilu-browser press Enter         # Press key (alias: key)
kachilu-browser press Control+a     # Key combination
kachilu-browser keydown Shift       # Hold key down
kachilu-browser keyup Shift         # Release key
kachilu-browser hover @e1           # Hover
kachilu-browser check @e1           # Check checkbox
kachilu-browser uncheck @e1         # Uncheck checkbox
kachilu-browser select @e1 "value"  # Select dropdown option
kachilu-browser select @e1 "a" "b"  # Select multiple options
kachilu-browser scroll down 500     # Scroll page (default: down 300px)
kachilu-browser scrollintoview @e1  # Scroll element into view (alias: scrollinto)
kachilu-browser drag @e1 @e2        # Drag and drop
kachilu-browser upload @e1 file.pdf # Upload files
```

## Get Information

```bash
kachilu-browser get text @e1        # Get element text
kachilu-browser get html @e1        # Get innerHTML
kachilu-browser get value @e1       # Get input value
kachilu-browser get attr @e1 href   # Get attribute
kachilu-browser get title           # Get page title
kachilu-browser get url             # Get current URL
kachilu-browser get cdp-url         # Get CDP WebSocket URL
kachilu-browser get count ".item"   # Count matching elements
kachilu-browser get box @e1         # Get bounding box
kachilu-browser get styles @e1      # Get computed styles (font, color, bg, etc.)
```

## Check State

```bash
kachilu-browser is visible @e1      # Check if visible
kachilu-browser is enabled @e1      # Check if enabled
kachilu-browser is checked @e1      # Check if checked
```

## Screenshots and PDF

```bash
kachilu-browser screenshot          # Save to temporary directory
kachilu-browser screenshot path.png # Save to specific path
kachilu-browser screenshot --full   # Full page
kachilu-browser pdf output.pdf      # Save as PDF
```

## Video Recording

```bash
kachilu-browser record start ./demo.webm    # Start recording
kachilu-browser click @e1                   # Perform actions
kachilu-browser record stop                 # Stop and save video
kachilu-browser record restart ./take2.webm # Stop current + start new
```

## Wait

```bash
kachilu-browser wait @e1                     # Wait for element
kachilu-browser wait 2000                    # Wait milliseconds
kachilu-browser wait --text "Success"        # Wait for text (or -t)
kachilu-browser wait --url "**/dashboard"    # Wait for URL pattern (or -u)
kachilu-browser wait --load networkidle      # Wait for network idle (or -l)
kachilu-browser wait --fn "window.ready"     # Wait for JS condition (or -f)
```

## Mouse Control

```bash
kachilu-browser mouse move 100 200      # Move mouse
kachilu-browser mouse down left         # Press button
kachilu-browser mouse up left           # Release button
kachilu-browser mouse wheel 100         # Scroll wheel
```

When a ref or locator click fails but a screenshot/capture confirms that the
cursor is already on the intended button, use `mouse down left` followed by
`mouse up left` to click at the current cursor position.

## Semantic Locators (alternative to refs)

```bash
kachilu-browser find role button click --name "Submit"
kachilu-browser find text "Sign In" click
kachilu-browser find text "Sign In" click --exact      # Exact match only
kachilu-browser find label "Email" fill "user@test.com"
kachilu-browser find placeholder "Search" type "query"
kachilu-browser find alt "Logo" click
kachilu-browser find title "Close" click
kachilu-browser find testid "submit-btn" click
kachilu-browser find first ".item" click
kachilu-browser find last ".item" click
kachilu-browser find nth 2 "a" hover
```

## Browser Settings

```bash
kachilu-browser set viewport 1920 1080          # Set viewport size
kachilu-browser set viewport 1920 1080 2        # 2x retina (same CSS size, higher res screenshots)
kachilu-browser set device "iPhone 14"          # Emulate device
kachilu-browser set geo 37.7749 -122.4194       # Set geolocation (alias: geolocation)
kachilu-browser set offline on                  # Toggle offline mode
kachilu-browser set headers '{"X-Key":"v"}'     # Extra HTTP headers
kachilu-browser set credentials user pass       # HTTP basic auth (alias: auth)
kachilu-browser set media dark                  # Emulate color scheme
kachilu-browser set media light reduced-motion  # Light mode + reduced motion
```

## Cookies and Storage

```bash
kachilu-browser cookies                     # Get all cookies
kachilu-browser cookies set name value      # Set cookie
kachilu-browser cookies clear               # Clear cookies
kachilu-browser storage local               # Get all localStorage
kachilu-browser storage local key           # Get specific key
kachilu-browser storage local set k v       # Set value
kachilu-browser storage local clear         # Clear all
```

## Network

```bash
kachilu-browser network route <url>              # Intercept requests
kachilu-browser network route <url> --abort      # Block requests
kachilu-browser network route <url> --body '{}'  # Mock response
kachilu-browser network unroute [url]            # Remove routes
kachilu-browser network requests                 # View tracked requests
kachilu-browser network requests --filter api    # Filter requests
```

## Tabs and Windows

```bash
kachilu-browser tab                              # List tabs with tabId and label
kachilu-browser tab new [url]                    # New tab
kachilu-browser tab new --label docs [url]       # New tab with a memorable label
kachilu-browser tab t2                           # Switch to tab by id
kachilu-browser tab docs                         # Switch to tab by label
kachilu-browser tab close                        # Close current tab
kachilu-browser tab close t2                     # Close tab by id
kachilu-browser tab close docs                   # Close tab by label
kachilu-browser window new                       # New window
```

Tab ids are stable strings of the form `t1`, `t2`, `t3`. They're never reused
within a session, so the same id keeps referring to the same tab across
commands. Positional integers are **not** accepted — `tab 2` errors with a
teaching message; use `t2`.

User-assigned labels (`docs`, `app`, `admin`) are interchangeable with ids
everywhere a tab ref is accepted. Labels are the agent-friendly way to write
multi-tab workflows:

```bash
kachilu-browser tab new --label docs https://docs.example.com
kachilu-browser tab new --label app  https://app.example.com
kachilu-browser tab docs                   # switch to docs
kachilu-browser snapshot                   # populate refs for docs
kachilu-browser click @e1                  # ref click on docs
kachilu-browser tab app                    # switch to app
kachilu-browser tab close docs             # close by label
```

Labels are never auto-generated, never rewritten on navigation, and must be
unique within a session. To interact with another tab, switch to it first:
the daemon maintains a single active tab, so refs (`@eN`) belong to the tab
that was active when the snapshot ran.

## Frames

```bash
kachilu-browser frame "#iframe"     # Switch to iframe by CSS selector
kachilu-browser frame @e3           # Switch to iframe by element ref
kachilu-browser frame main          # Back to main frame
```

### Iframe support

Iframes are detected automatically during snapshots. When the main-frame snapshot runs, `Iframe` nodes are resolved and their content is inlined beneath the iframe element in the output (one level of nesting; iframes within iframes are not expanded).

```bash
kachilu-browser snapshot -i
# @e3 [Iframe] "payment-frame"
#   @e4 [input] "Card number"
#   @e5 [button] "Pay"

# Interact directly — refs inside iframes already work
kachilu-browser fill @e4 "4111111111111111"
kachilu-browser click @e5

# Or switch frame context for scoped snapshots
kachilu-browser frame @e3               # Switch using element ref
kachilu-browser snapshot -i             # Snapshot scoped to that iframe
kachilu-browser frame main              # Return to main frame
```

The `frame` command accepts:
- **Element refs** — `frame @e3` resolves the ref to an iframe element
- **CSS selectors** — `frame "#payment-iframe"` finds the iframe by selector
- **Frame name/URL** — matches against the browser's frame tree

## Dialogs

By default, `alert` and `beforeunload` dialogs are automatically accepted so they never block the agent. `confirm` and `prompt` dialogs still require explicit handling. Use `--no-auto-dialog` to disable this behavior.

```bash
kachilu-browser dialog accept [text]  # Accept dialog
kachilu-browser dialog dismiss        # Dismiss dialog
kachilu-browser dialog status         # Check if a dialog is currently open
```

## JavaScript

```bash
kachilu-browser eval "document.title"          # Simple expressions only
kachilu-browser eval -b "<base64>"             # Any JavaScript (base64 encoded)
kachilu-browser eval --stdin                   # Read script from stdin
```

Use `-b`/`--base64` or `--stdin` for reliable execution. Shell escaping with nested quotes and special characters is error-prone.

```bash
# Base64 encode your script, then:
kachilu-browser eval -b "ZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW3NyYyo9Il9uZXh0Il0nKQ=="

# Or use stdin with heredoc for multiline scripts:
cat <<'EOF' | kachilu-browser eval --stdin
const links = document.querySelectorAll('a');
Array.from(links).map(a => a.href);
EOF
```

## State Management

```bash
kachilu-browser state save auth.json    # Save cookies, storage, auth state
kachilu-browser state load auth.json    # Restore saved state
```

## Global Options

```bash
kachilu-browser --session <name> ...    # Isolated browser session
kachilu-browser --json ...              # JSON output for parsing
kachilu-browser --headed ...            # Show browser window (not headless)
kachilu-browser --full ...              # Full page screenshot (-f)
kachilu-browser --cdp <port> ...        # Connect via Chrome DevTools Protocol
kachilu-browser -p <provider> ...       # Cloud browser provider (--provider)
kachilu-browser --proxy <url> ...       # Use proxy server
kachilu-browser --proxy-bypass <hosts>  # Hosts to bypass proxy
kachilu-browser --headers <json> ...    # HTTP headers scoped to URL's origin
kachilu-browser --executable-path <p>   # Custom browser executable
kachilu-browser --extension <path> ...  # Load browser extension (repeatable)
kachilu-browser --ignore-https-errors   # Ignore SSL certificate errors
kachilu-browser --help                  # Show help (-h)
kachilu-browser --version               # Show version (-V)
kachilu-browser <command> --help        # Show detailed help for a command
```

## Debugging

```bash
kachilu-browser --headed open example.com   # Show browser window
kachilu-browser --cdp 9222 snapshot         # Connect via CDP port
kachilu-browser connect 9222                # Alternative: connect command
kachilu-browser console                     # View console messages
kachilu-browser console --clear             # Clear console
kachilu-browser errors                      # View page errors
kachilu-browser errors --clear              # Clear errors
kachilu-browser highlight @e1               # Highlight element
kachilu-browser inspect                     # Open Chrome DevTools for this session
kachilu-browser trace start                 # Start recording trace
kachilu-browser trace stop trace.zip        # Stop and save trace
kachilu-browser profiler start              # Start Chrome DevTools profiling
kachilu-browser profiler stop trace.json    # Stop and save profile
```

## Environment Variables

```bash
KACHILU_BROWSER_SESSION="mysession"            # Default session name
KACHILU_BROWSER_EXECUTABLE_PATH="/path/chrome" # Custom browser path
KACHILU_BROWSER_EXTENSIONS="/ext1,/ext2"       # Comma-separated extension paths
KACHILU_BROWSER_PROVIDER="browserbase"         # Cloud browser provider
KACHILU_BROWSER_STREAM_PORT="9223"             # Override WebSocket streaming port (default: OS-assigned)
KACHILU_BROWSER_HOME="/path/to/kachilu-browser"  # Custom install location
```
