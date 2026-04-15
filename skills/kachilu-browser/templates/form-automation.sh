#!/bin/bash
# Template: Form Automation Workflow
# Purpose: Fill and submit web forms with validation
# Usage: ./form-automation.sh <form-url>
#
# This template demonstrates the snapshot-interact-verify pattern:
# 1. Navigate to form
# 2. Snapshot to get element refs
# 3. Fill fields using refs
# 4. Submit and verify result
#
# Customize: Update the refs (@e1, @e2, etc.) based on your form's snapshot output

set -euo pipefail

FORM_URL="${1:?Usage: $0 <form-url>}"

echo "Form automation: $FORM_URL"

# Step 1: Navigate to form
kachilu-browser open "$FORM_URL"
kachilu-browser wait --load networkidle

# Step 2: Snapshot to discover form elements
echo ""
echo "Form structure:"
kachilu-browser snapshot -i

# Step 3: Fill form fields (customize these refs based on snapshot output)
#
# Common field types:
#   kachilu-browser fill @e1 "John Doe"           # Text input
#   kachilu-browser fill @e2 "user@example.com"   # Email input
#   kachilu-browser fill @e3 "SecureP@ss123"      # Password input
#   kachilu-browser select @e4 "Option Value"     # Dropdown
#   kachilu-browser check @e5                     # Checkbox
#   kachilu-browser click @e6                     # Radio button
#   kachilu-browser fill @e7 "Multi-line text"   # Textarea
#   kachilu-browser upload @e8 /path/to/file.pdf # File upload
#
# Uncomment and modify:
# kachilu-browser fill @e1 "Test User"
# kachilu-browser fill @e2 "test@example.com"
# kachilu-browser click @e3  # Submit button

# Step 4: Wait for submission
# kachilu-browser wait --load networkidle
# kachilu-browser wait --url "**/success"  # Or wait for redirect

# Step 5: Verify result
echo ""
echo "Result:"
kachilu-browser get url
kachilu-browser snapshot -i

# Optional: Capture evidence
kachilu-browser screenshot /tmp/form-result.png
echo "Screenshot saved: /tmp/form-result.png"

# Cleanup
echo "Done"
