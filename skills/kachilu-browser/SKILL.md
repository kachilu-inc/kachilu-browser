---
name: kachilu-browser
description: Browser automation CLI for AI agents. Use when the user needs to interact with websites, including navigating pages, filling forms, clicking buttons, taking screenshots, extracting data, testing web apps, logging in to sites, posting to social apps, handling CAPTCHA workflows, or automating browser actions. When MCP tools are available, prefer kachilu_browser_prepare_workspace plus kachilu_browser_exec over raw shell commands so host-managed sessions, WSL2 Windows-browser targeting, and profile settings are preserved.
allowed-tools: Bash(npx kachilu-browser:*), Bash(kachilu-browser:*)
hidden: true
---

# kachilu-browser

Browser automation CLI for AI agents. Chrome/Chromium via CDP with
accessibility-tree snapshots and compact `@eN` element refs.

Install: `npm i -g kachilu-browser && kachilu-browser install`

## Start Here

This file is a discovery stub, not the usage guide. Before running any
`kachilu-browser` command, load the actual workflow content from the CLI:

```bash
kachilu-browser skills get core             # start here: workflows, MCP-first routing, CAPTCHA, troubleshooting
kachilu-browser skills get core --full      # include references and templates when needed
```

The CLI serves skill content that matches the installed version, so instructions
do not drift when the package is upgraded. The core guide contains the Kachilu
human-like interaction defaults, MCP routing rules, rich composer safeguards,
CAPTCHA workflow, and the command reference.
