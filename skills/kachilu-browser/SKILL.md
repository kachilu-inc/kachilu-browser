---
name: kachilu-browser
description: Browser automation CLI for AI agents. Prefer MCP tools when available. Use when the user needs to interact with websites, including navigating pages, filling forms, clicking buttons, taking screenshots, extracting data, testing web apps, or automating any browser task.
allowed-tools: Bash(npx kachilu-browser:*), Bash(kachilu-browser:*)
hidden: true
---

# Kachilu Browser Skill

This file is a thin discovery stub for `npx skills add`. Before running
browser commands, load the version-matched runtime skill from the installed
CLI:

```bash
kachilu-browser skills get core
```

The release package ships the `core` runtime skill. Use the command above for
the current workflow. Use `kachilu-browser skills get core --full` only when
the detailed references and templates are needed.

## MCP-first route

When MCP tools are available, prefer them over raw shell commands:

1. Call `kachilu_browser_prepare_workspace`.
2. Reuse the returned `session` with `kachilu_browser_exec`.
3. Keep using MCP after context compaction, resume, or long interruptions.

This preserves host-managed browser settings such as WSL2 Windows-browser
targeting and profile selection. Use raw `kachilu-browser` only when MCP tools
are unavailable, the user explicitly asks for CLI commands, or the task
intentionally targets a local browser.

## Critical defaults

Even before the full `core` skill is loaded, keep these Kachilu defaults:

- Prefer visible, human-like actions: `open`, `snapshot`, `click`, `fill`,
  `type`, `scroll`, `press`, `wait`, `tab`, and `screenshot`.
- Re-snapshot after navigation, form submits, dialogs, dynamic re-renders, and
  tab changes.
- For logged-in apps, feeds, and rich composers, use the visible UI flow before
  direct URLs, DOM scraping, or `eval`. Use `keyboard type` for rich composer
  fields after clicking the visible editor.
- Before clicking publish, send, save, or submit, re-snapshot and confirm the
  intended body appears once in the active composer.
- When a page visibly presents or recognizes a CAPTCHA, start with
  `kachilu-browser captcha check`. Use `captcha inspect-img --json` and
  `captcha check-img` only after `captcha check` reports an image challenge or
  partial result.

## Minimum CLI fallback

```bash
kachilu-browser open <url>
kachilu-browser snapshot -i
kachilu-browser click @e3
kachilu-browser snapshot -i
```

Refs are fresh on each snapshot. Re-snapshot after navigation, form submits,
dialogs, dynamic re-renders, and tab changes.
