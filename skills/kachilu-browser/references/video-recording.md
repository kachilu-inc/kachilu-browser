# Video Recording

Capture browser automation as video for debugging, documentation, or verification.

**Related**: [commands.md](commands.md) for full command reference, [SKILL.md](../SKILL.md) for quick start.

## Contents

- [Basic Recording](#basic-recording)
- [Recording Commands](#recording-commands)
- [Use Cases](#use-cases)
- [Best Practices](#best-practices)
- [Output Format](#output-format)
- [Limitations](#limitations)

## Basic Recording

```bash
# Start recording
kachilu-browser record start ./demo.webm

# Perform actions
kachilu-browser open https://example.com
kachilu-browser snapshot -i
kachilu-browser click @e1
kachilu-browser fill @e2 "test input"

# Stop and save
kachilu-browser record stop
```

## Recording Commands

```bash
# Start recording to file
kachilu-browser record start ./output.webm

# Stop current recording
kachilu-browser record stop

# Restart with new file (stops current + starts new)
kachilu-browser record restart ./take2.webm
```

## Use Cases

### Debugging Failed Automation

```bash
#!/bin/bash
# Record automation for debugging

kachilu-browser record start ./debug-$(date +%Y%m%d-%H%M%S).webm

# Run your automation
kachilu-browser open https://app.example.com
kachilu-browser snapshot -i
kachilu-browser click @e1 || {
    echo "Click failed - check recording"
    kachilu-browser record stop
    exit 1
}

kachilu-browser record stop
```

### Documentation Generation

```bash
#!/bin/bash
# Record workflow for documentation

kachilu-browser record start ./docs/how-to-login.webm

kachilu-browser open https://app.example.com/login
kachilu-browser wait 1000  # Pause for visibility

kachilu-browser snapshot -i
kachilu-browser fill @e1 "demo@example.com"
kachilu-browser wait 500

kachilu-browser fill @e2 "password"
kachilu-browser wait 500

kachilu-browser click @e3
kachilu-browser wait --load networkidle
kachilu-browser wait 1000  # Show result

kachilu-browser record stop
```

### CI/CD Test Evidence

```bash
#!/bin/bash
# Record E2E test runs for CI artifacts

TEST_NAME="${1:-e2e-test}"
RECORDING_DIR="./test-recordings"
mkdir -p "$RECORDING_DIR"

kachilu-browser record start "$RECORDING_DIR/$TEST_NAME-$(date +%s).webm"

# Run test
if run_e2e_test; then
    echo "Test passed"
else
    echo "Test failed - recording saved"
fi

kachilu-browser record stop
```

## Best Practices

### 1. Add Pauses for Clarity

```bash
# Slow down for human viewing
kachilu-browser click @e1
kachilu-browser wait 500  # Let viewer see result
```

### 2. Use Descriptive Filenames

```bash
# Include context in filename
kachilu-browser record start ./recordings/login-flow-2024-01-15.webm
kachilu-browser record start ./recordings/checkout-test-run-42.webm
```

### 3. Handle Recording in Error Cases

```bash
#!/bin/bash
set -e

cleanup() {
    kachilu-browser record stop 2>/dev/null || true
    kachilu-browser close 2>/dev/null || true
}
trap cleanup EXIT

kachilu-browser record start ./automation.webm
# ... automation steps ...
```

### 4. Combine with Screenshots

```bash
# Record video AND capture key frames
kachilu-browser record start ./flow.webm

kachilu-browser open https://example.com
kachilu-browser screenshot ./screenshots/step1-homepage.png

kachilu-browser click @e1
kachilu-browser screenshot ./screenshots/step2-after-click.png

kachilu-browser record stop
```

## Output Format

- Default format: WebM (VP8/VP9 codec)
- Compatible with all modern browsers and video players
- Compressed but high quality

## Limitations

- Recording adds slight overhead to automation
- Large recordings can consume significant disk space
- Some headless environments may have codec limitations
