#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bridgePrefixedEnv, getBridgedEnvValue } from "./env-prefix-bridge.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const localCliWrapper = join(projectRoot, "bin", "kachilu-browser.js");
const MCP_PROTOCOL_VERSION = "2024-11-05";
const DEFAULT_MCP_WORKSPACE_SESSION = "mcp-workspace";
const SESSION_PROBE_TIMEOUT_MS = 6000;
const SESSION_RETRY_OPEN_TIMEOUT_MS = 15000;
const SERVER_INFO = {
  name: "kachilu-browser-mcp",
  version: "0.1.0",
};

function getEnvValue(name) {
  return getBridgedEnvValue(process.env, name);
}

function envFlagEnabled(name) {
  const value = getEnvValue(name).toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function withUpstreamEnvBridge(env) {
  return bridgePrefixedEnv(env);
}

function resolveCliCommand() {
  const explicit = getEnvValue("KACHILU_BROWSER_BIN");
  if (explicit) {
    return { command: explicit, prefixArgs: [] };
  }
  if (existsSync(localCliWrapper)) {
    return { command: process.execPath, prefixArgs: [localCliWrapper] };
  }
  return { command: "kachilu-browser", prefixArgs: [] };
}

function sanitizeSessionName(input) {
  const fallback = `mcp-${randomUUID().slice(0, 8)}`;
  if (!input) return fallback;
  const sanitized = String(input)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return sanitized || fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSiteHintFromInitialUrl(raw) {
  if (!raw) return null;
  try {
    const url = new URL(String(raw).trim());
    const host = url.hostname.replace(/^www\./i, "");
    const label = host.split(".")[0];
    return label || null;
  } catch {
    return null;
  }
}

function isXSearchUrl(raw) {
  if (!raw) return false;
  const text = String(raw);
  const candidates = text.match(/https?:\/\/[^\s"'<>]+/gi) ?? [text.trim()];

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      const host = url.hostname.replace(/^www\./i, "").toLowerCase();
      if ((host === "x.com" || host === "twitter.com") && url.pathname.replace(/\/+$/, "") === "/search") {
        return true;
      }
    } catch {}
  }

  return /(?:^|\s)(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/search(?:\b|[/?#])/i.test(text);
}

function getXHumanLikeGuardViolation(args, context) {
  if (!envFlagEnabled("KACHILU_BROWSER_X_HUMANLIKE_GUARD")) return null;

  const parts = Array.isArray(args) ? args.map(String) : [String(args ?? "")];
  for (const part of parts) {
    if (isXSearchUrl(part)) {
      return {
        reason: "direct-x-search-url",
        message: "X human-like guard blocked direct X search URL navigation",
        blocked: part,
        context,
      };
    }
  }

  const lowered = parts.map((part) => part.toLowerCase());
  for (const part of lowered) {
    const trimmed = part.trim();
    if (trimmed === "eval" || trimmed.startsWith("eval ")) {
      return {
        reason: "eval",
        message: "X human-like guard blocked eval during X collection",
        blocked: part,
        context,
      };
    }
  }

  const joined = lowered.join(" ");
  if (
    lowered.includes("--fn") ||
    joined.includes(" wait --fn") ||
    joined.includes("location.href") ||
    joined.includes("history.pushstate") ||
    joined.includes("document.queryselector") ||
    joined.includes("document.queryselectorall")
  ) {
    return {
      reason: "dom-or-js-navigation",
      message: "X human-like guard blocked DOM/JavaScript navigation during X collection",
      blocked: parts.join(" "),
      context,
    };
  }

  return null;
}

function getSocketDir() {
  const explicit = getEnvValue("KACHILU_BROWSER_SOCKET_DIR");
  if (explicit) return explicit;

  const runtimeDir = process.env.XDG_RUNTIME_DIR?.trim();
  if (runtimeDir) return join(runtimeDir, "kachilu-browser");

  const home = process.env.HOME?.trim();
  if (home) return join(home, ".kachilu-browser");

  return join(projectRoot, ".kachilu-browser");
}

function getSessionRuntimeFiles(session) {
  const socketDir = getSocketDir();
  return [
    join(socketDir, `${session}.pid`),
    join(socketDir, `${session}.sock`),
    join(socketDir, `${session}.port`),
    join(socketDir, `${session}.stream`),
    join(socketDir, `${session}.version`),
    join(socketDir, `${session}.engine`),
    join(socketDir, `${session}.provider`),
    join(socketDir, `${session}.extensions`),
  ];
}

function readSessionPid(session) {
  try {
    const raw = readFileSync(join(getSocketDir(), `${session}.pid`), "utf8").trim();
    const pid = Number(raw);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function cleanupStaleSession(session) {
  const pid = readSessionPid(session);
  if (pid && isProcessAlive(pid)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
    await sleep(300);

    if (isProcessAlive(pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
      await sleep(300);
    }
  }

  for (const path of getSessionRuntimeFiles(session)) {
    try {
      rmSync(path, { force: true });
    } catch {}
  }
}

async function runAgentBrowser(args, options = {}) {
  const timeoutMs =
    Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : null;
  const cli = resolveCliCommand();
  const finalArgs = [
    ...cli.prefixArgs,
    ...(args.includes("--json") ? args : ["--json", ...args]),
  ];
  return new Promise((resolve) => {
    const child = spawn(cli.command, finalArgs, {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...withUpstreamEnvBridge(process.env),
        ...(options.env ?? {}),
      },
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeoutHandle =
      timeoutMs == null
        ? null
        : setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve({
        ok: false,
        exitCode: null,
        stdout,
        stderr: `${stderr}${error.message}`,
        json: null,
        timedOut,
      });
    });

    child.on("close", (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      const trimmed = stdout.trim();
      let parsed = null;
      if (trimmed) {
        const lastLine = trimmed.split(/\r?\n/).filter(Boolean).at(-1) ?? "";
        try {
          parsed = JSON.parse(lastLine);
        } catch {
          parsed = null;
        }
      }

      resolve({
        ok: code === 0 && !timedOut,
        exitCode: code,
        stdout,
        stderr,
        json: parsed,
        timedOut,
      });
    });
  });
}

function successResult(data, extraText) {
  return {
    content: [
      {
        type: "text",
        text: extraText ?? JSON.stringify(data, null, 2),
      },
    ],
    structuredContent: data,
  };
}

function errorResult(message, details = {}) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: message, ...details }, null, 2),
      },
    ],
    structuredContent: { error: message, ...details },
    isError: true,
  };
}

function toolDefinitions() {
  return [
    {
      name: "kachilu_browser_prepare_workspace",
      description:
        "Preferred MCP entrypoint for browser automation. Use this instead of raw kachilu-browser shell commands when available so host-managed env such as WSL2 Windows browser targeting is preserved. Reuse an active session when available, otherwise use --auto-connect with the user's already running browser and create a same-profile workspace surface for follow-up commands. By default MCP asks kachilu-browser to open a dedicated new window so automation stays separate from the user's current window. If the browser is not available or the connection prompt is not approved, return an action-required error so the host can ask the user to open the browser and retry.",
      inputSchema: {
        type: "object",
        properties: {
          session: {
            type: "string",
            description:
              "Optional session name. Safe characters only. When omitted, MCP reuses a shared workspace session instead of creating site-specific session names.",
          },
          initialUrl: {
            type: "string",
            description:
              "Optional URL to open in the prepared workspace surface after connect.",
          },
          purpose: {
            type: "string",
            description: "Optional short note for tracing or logs.",
          },
          site: {
            type: "string",
            description:
              "Optional site hint such as x, linkedin, yahoo, or github. Used for routing or logs only.",
          },
          workspaceMode: {
            type: "string",
            description:
              "Workspace surface to prepare after auto-connect. Use 'new-window' to keep automation in a dedicated same-profile window, or 'fresh-tab' to stay in the current browser window. Defaults to 'new-window'.",
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: "kachilu_browser_exec",
      description:
        "Run a single kachilu-browser command inside an existing prepared MCP session. Use this for follow-up browser commands instead of raw shell execution, especially after context compaction or resume, so the prepared session and host-managed target stay intact. Use batch when multiple dependent commands should execute in order.",
      inputSchema: {
        type: "object",
        properties: {
          session: {
            type: "string",
            description: "Prepared session name returned by kachilu_browser_prepare_workspace.",
          },
          args: {
            type: "array",
            description:
              "kachilu-browser arguments without --session or --json. Example: ['batch', 'open https://x.com', 'snapshot -i'].",
            items: { type: "string" },
            minItems: 1,
          },
        },
        required: ["session", "args"],
        additionalProperties: false,
      },
    },
    {
      name: "kachilu_browser_close_workspace",
      description: "Close a prepared session and its attached browser workspace.",
      inputSchema: {
        type: "object",
        properties: {
          session: {
            type: "string",
            description: "Prepared session name to close.",
          },
        },
        required: ["session"],
        additionalProperties: false,
      },
    },
  ];
}

async function listActiveSessions() {
  const response = await runAgentBrowser(["session", "list"]);
  if (!response.ok) return [];
  return Array.isArray(response.json?.data?.sessions) ? response.json.data.sessions : [];
}

function listSessionTabsFromResponse(response) {
  return Array.isArray(response?.json?.data?.tabs) ? response.json.data.tabs : [];
}

function findActiveTabIndex(tabs) {
  return tabs.findIndex((tab) => tab?.active === true);
}

function isBlankStartupTab(tab) {
  const url = typeof tab?.url === "string" ? tab.url : "";
  const title = typeof tab?.title === "string" ? tab.title.trim() : "";
  const titleIsBlankStartup =
    title === "" ||
    title === "about:blank" ||
    title === "New Tab" ||
    title === "新しいタブ" ||
    title === "新しいタブページ";

  return (
    titleIsBlankStartup &&
    (url === "about:blank" ||
      url === "about:srcdoc" ||
      url === "chrome://newtab/" ||
      url === "edge://newtab/")
  );
}

async function getSessionSummary(session) {
  const [activeUrl, tabs] = await Promise.all([
    runAgentBrowser(["--session", session, "get", "url"], {
      timeoutMs: SESSION_PROBE_TIMEOUT_MS,
    }),
    runAgentBrowser(["--session", session, "tab", "list"], {
      timeoutMs: SESSION_PROBE_TIMEOUT_MS,
    }),
  ]);

  return {
    activeUrl: activeUrl.ok ? activeUrl.json?.data?.url ?? null : null,
    tabs: tabs.ok ? tabs.json?.data?.tabs ?? null : null,
  };
}

async function openInitialUrl(session, initialUrl) {
  if (!initialUrl) return { ok: true };
  return runAgentBrowser(["--session", session, "open", initialUrl], {
    timeoutMs: SESSION_RETRY_OPEN_TIMEOUT_MS,
  });
}

function normalizeWorkspaceMode(raw) {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!value) return "new-window";
  if (value === "new-window" || value === "fresh-tab") return value;
  return null;
}

async function prepareAutoConnectedWorkspace(session) {
  return runAgentBrowser(["--session", session, "--auto-connect", "get", "url"], {
    timeoutMs: SESSION_RETRY_OPEN_TIMEOUT_MS,
  });
}

async function createDedicatedWorkspaceWindow(session) {
  const beforeTabsResponse = await runAgentBrowser(["--session", session, "tab", "list"], {
    timeoutMs: 5000,
  });
  const beforeTabs = beforeTabsResponse.ok ? listSessionTabsFromResponse(beforeTabsResponse) : [];
  const bootstrapIndex = findActiveTabIndex(beforeTabs);
  const bootstrapTab = bootstrapIndex >= 0 ? beforeTabs[bootstrapIndex] : null;

  const createdWindow = await runAgentBrowser(["--session", session, "window", "new"], {
    timeoutMs: 15000,
  });
  if (!createdWindow.ok) {
    return {
      ok: false,
      createdWindow,
      bootstrapIndex,
      bootstrapTab,
      closedBootstrap: null,
    };
  }

  let closedBootstrap = null;
  if (bootstrapIndex >= 0 && isBlankStartupTab(bootstrapTab)) {
    closedBootstrap = await runAgentBrowser(
      ["--session", session, "tab", "close", String(bootstrapIndex)],
      { timeoutMs: 10000 }
    );
  }

  return {
    ok: true,
    createdWindow,
    bootstrapIndex,
    bootstrapTab,
    closedBootstrap,
  };
}

async function inspectSessionHealth(session) {
  const tabProbe = await runAgentBrowser(["--session", session, "tab", "list"], {
    timeoutMs: SESSION_PROBE_TIMEOUT_MS,
  });
  if (tabProbe.ok) {
    return {
      status: "healthy",
      via: "tab-list",
      tabProbe,
      urlProbe: null,
      pid: readSessionPid(session),
      pidAlive: true,
    };
  }

  const urlProbe = await runAgentBrowser(["--session", session, "get", "url"], {
    timeoutMs: SESSION_PROBE_TIMEOUT_MS,
  });
  if (urlProbe.ok) {
    return {
      status: "healthy",
      via: "get-url",
      tabProbe,
      urlProbe,
      pid: readSessionPid(session),
      pidAlive: true,
    };
  }

  const pid = readSessionPid(session);
  const pidAlive = isProcessAlive(pid);
  return {
    status: pidAlive ? "busy" : "stale",
    via: null,
    tabProbe,
    urlProbe,
    pid,
    pidAlive,
  };
}

async function handlePrepareWorkspace(args) {
  const inferredSite = getSiteHintFromInitialUrl(args?.initialUrl);
  const explicitSession =
    typeof args?.session === "string" && args.session.trim() ? sanitizeSessionName(args.session) : null;
  const session = explicitSession ?? DEFAULT_MCP_WORKSPACE_SESSION;
  const purpose = typeof args?.purpose === "string" ? args.purpose : null;
  const initialUrl =
    typeof args?.initialUrl === "string" && args.initialUrl.trim()
      ? args.initialUrl.trim()
      : null;
  const site =
    typeof args?.site === "string" && args.site.trim()
      ? args.site.trim()
      : inferredSite;
  const workspaceMode = normalizeWorkspaceMode(args?.workspaceMode);

  if (!workspaceMode) {
    return errorResult("Invalid workspaceMode", {
      workspaceMode: args?.workspaceMode,
      allowed: ["new-window", "fresh-tab"],
    });
  }

  const guardViolation = getXHumanLikeGuardViolation([initialUrl], "prepare_workspace.initialUrl");
  if (guardViolation) {
    return errorResult(guardViolation.message, {
      ...guardViolation,
      userMessage:
        "Do not navigate directly to X search URLs. Click the search field in the X UI, type the query, and switch result tabs through the visible page controls.",
    });
  }

  // Resolution order:
  // 1. Reuse the shared or explicit session when it is healthy
  // 2. Attach to the user's current browser and let kachilu-browser create the
  //    requested workspace surface in that same profile
  // 3. If auto-connect fails, ask the host to tell the user to open the browser
  //    and approve the connection prompt, then retry

  const activeSessions = await listActiveSessions();
  if (activeSessions.includes(session)) {
    const health = await inspectSessionHealth(session);
    if (health.status === "healthy") {
      const open = await openInitialUrl(session, initialUrl);
      if (!open.ok) {
        if (health.pidAlive) {
          return errorResult("Existing workspace session is busy; refusing to reconnect", {
            session,
            site,
            purpose,
            initialUrl,
            workspaceMode,
            actionRequired: "retry-existing-session",
            userMessage:
              "The existing browser connection is still alive. MCP will not reconnect because that would create another approval prompt. Wait a few seconds, then retry with the same session.",
            stdout: open.stdout.trim(),
            stderr: open.stderr.trim(),
          });
        }
        return errorResult("Existing session found, but initial navigation failed", {
          session,
          initialUrl,
          stdout: open.stdout.trim(),
          stderr: open.stderr.trim(),
        });
      }

      const summary = await getSessionSummary(session);
      return successResult(
        {
          controlPlane: "mcp",
          session,
          followUpTool: "kachilu_browser_exec",
          site,
          purpose,
          initialUrl,
          workspaceMode,
          strategy: "existing-session",
          launchedBrowser: false,
          autoConnected: false,
          activeUrl: summary.activeUrl,
          tabs: summary.tabs,
        },
        `Reused existing workspace session '${session}'. Continue follow-up browser commands with kachilu_browser_exec using this session.`
      );
    }

    if (health.status === "busy") {
      return errorResult("Existing workspace session is still alive; refusing to reconnect", {
        session,
        site,
        purpose,
        workspaceMode,
        actionRequired: "retry-existing-session",
        userMessage:
          "The existing browser connection is still alive. MCP will not reconnect because that would create another approval prompt. Wait briefly, then retry with the same session.",
        pid: health.pid,
        pidAlive: health.pidAlive,
        tabProbeStdout: health.tabProbe?.stdout?.trim() ?? "",
        tabProbeStderr: health.tabProbe?.stderr?.trim() ?? "",
        urlProbeStdout: health.urlProbe?.stdout?.trim() ?? "",
        urlProbeStderr: health.urlProbe?.stderr?.trim() ?? "",
      });
    }

    await cleanupStaleSession(session);
  }

  const prepare = await prepareAutoConnectedWorkspace(session);
  if (!prepare.ok) {
    return errorResult("Browser workspace requires user action", {
      session,
      site,
      purpose,
      workspaceMode,
      actionRequired: "open-browser-and-approve-auto-connect",
      userMessage:
        "Open Chrome normally, enable remote-connect, approve the auto-connect prompt, then retry.",
      stdout: prepare.stdout.trim(),
      stderr: prepare.stderr.trim(),
      timedOut: prepare.timedOut ?? false,
    });
  }

  let workspacePreparation = null;
  if (workspaceMode === "new-window") {
    workspacePreparation = await createDedicatedWorkspaceWindow(session);
    if (!workspacePreparation.ok) {
      return errorResult("Workspace prepared, but dedicated window creation failed", {
        session,
        site,
        purpose,
        workspaceMode,
        stdout: workspacePreparation.createdWindow.stdout.trim(),
        stderr: workspacePreparation.createdWindow.stderr.trim(),
      });
    }
  }

  const open = await openInitialUrl(session, initialUrl);
  if (!open.ok) {
    return errorResult("Workspace prepared, but initial navigation failed", {
      session,
      site,
      initialUrl,
      workspaceMode,
      stdout: open.stdout.trim(),
      stderr: open.stderr.trim(),
    });
  }

  const summary = await getSessionSummary(session);

  const result = {
    controlPlane: "mcp",
    session,
    followUpTool: "kachilu_browser_exec",
    site,
    workspaceMode,
    strategy:
      workspaceMode === "new-window"
        ? "auto-connect + dedicated same-profile workspace window"
        : "auto-connect + fresh tab in connected browser",
    purpose,
    initialUrl,
    autoConnected: true,
    dedicatedWindowCreated: workspaceMode === "new-window",
    bootstrapTabClosed:
      workspaceMode === "new-window"
        ? workspacePreparation?.closedBootstrap?.ok ?? false
        : false,
    activeUrl: summary.activeUrl,
    tabs: summary.tabs,
  };

  return successResult(
    result,
    `Prepared workspace session '${session}' using strategy '${result.strategy}'. Continue follow-up browser commands with kachilu_browser_exec using this session.`
  );
}

async function handleExec(args) {
  const session = sanitizeSessionName(args?.session);
  const rawArgs = Array.isArray(args?.args) ? args.args.map(String) : [];

  if (rawArgs.length === 0) {
    return errorResult("Missing args", {
      session,
    });
  }

  if (rawArgs.includes("--session") || rawArgs.includes("--json")) {
    return errorResult("Do not pass --session or --json in args", {
      session,
      args: rawArgs,
    });
  }

  const guardViolation = getXHumanLikeGuardViolation(rawArgs, "exec.args");
  if (guardViolation) {
    return errorResult(guardViolation.message, {
      session,
      args: rawArgs,
      ...guardViolation,
      userMessage:
        "Do not use direct X search URLs or DOM manipulation. Use the visible search field, Enter, visible result tabs, scroll, wait, and snapshot.",
    });
  }

  const execResult = await runAgentBrowser(["--session", session, ...rawArgs]);
  if (!execResult.ok) {
    return errorResult("kachilu-browser command failed", {
      session,
      args: rawArgs,
      stdout: execResult.stdout.trim(),
      stderr: execResult.stderr.trim(),
      response: execResult.json,
    });
  }

  return successResult({
    controlPlane: "mcp",
    session,
    followUpTool: "kachilu_browser_exec",
    args: rawArgs,
    response: execResult.json ?? execResult.stdout.trim(),
  });
}

async function handleCloseWorkspace(args) {
  const session = sanitizeSessionName(args?.session);
  const close = await runAgentBrowser(["--session", session, "close"]);
  if (!close.ok) {
    return errorResult("Failed to close workspace", {
      session,
      stdout: close.stdout.trim(),
      stderr: close.stderr.trim(),
    });
  }
  return successResult(
    {
      session,
      response: close.json ?? close.stdout.trim(),
    },
    `Closed workspace session '${session}'.`
  );
}

async function callTool(name, args) {
  switch (name) {
    case "kachilu_browser_prepare_workspace":
      return handlePrepareWorkspace(args);
    case "kachilu_browser_exec":
      return handleExec(args);
    case "kachilu_browser_close_workspace":
      return handleCloseWorkspace(args);
    default:
      return errorResult(`Unknown tool: ${name}`);
  }
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendResponse(id, result) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    result,
  });
}

function sendError(id, code, message, data) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data ? { data } : {}),
    },
  });
}

async function handleMessage(message) {
  if (!message || message.jsonrpc !== "2.0") return;

  const { id, method, params } = message;

  try {
    switch (method) {
      case "initialize":
        {
          const requestedProtocolVersion =
            typeof params?.protocolVersion === "string" && params.protocolVersion.trim()
              ? params.protocolVersion.trim()
              : MCP_PROTOCOL_VERSION;
        sendResponse(id, {
          protocolVersion: requestedProtocolVersion,
          capabilities: {
            tools: {},
          },
          serverInfo: SERVER_INFO,
        });
        return;
        }
      case "notifications/initialized":
        return;
      case "ping":
        sendResponse(id, {});
        return;
      case "tools/list":
        sendResponse(id, { tools: toolDefinitions() });
        return;
      case "tools/call": {
        const toolName = params?.name;
        if (typeof toolName !== "string") {
          sendResponse(id, errorResult("Missing tool name"));
          return;
        }
        const result = await callTool(toolName, params?.arguments ?? {});
        sendResponse(id, result);
        return;
      }
      default:
        sendError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    sendError(id, -32000, error instanceof Error ? error.message : String(error));
  }
}

let buffer = Buffer.alloc(0);
let processing = false;

function tryReadJsonLineMessage() {
  while (buffer.length > 0) {
    const byte = buffer[0];
    if (byte === 0x0a || byte === 0x0d || byte === 0x20 || byte === 0x09) {
      buffer = buffer.subarray(1);
      continue;
    }
    break;
  }

  if (buffer.length === 0) return null;

  const firstByte = buffer[0];
  if (firstByte !== 0x7b && firstByte !== 0x5b) {
    return null;
  }

  const newlineIndex = buffer.indexOf(0x0a);
  if (newlineIndex === -1) return null;

  const line = buffer.subarray(0, newlineIndex);
  buffer = buffer.subarray(newlineIndex + 1);

  const text = line.toString("utf8").replace(/\r$/, "").trim();
  if (!text) return null;
  return JSON.parse(text);
}

function tryReadMessage() {
  const jsonLineMessage = tryReadJsonLineMessage();
  if (jsonLineMessage) return jsonLineMessage;

  const crlfSeparator = buffer.indexOf("\r\n\r\n");
  const lfSeparator = buffer.indexOf("\n\n");
  const hasCrlf = crlfSeparator !== -1;
  const hasLf = lfSeparator !== -1;
  if (!hasCrlf && !hasLf) return null;

  const separator =
    hasCrlf && (!hasLf || crlfSeparator < lfSeparator) ? crlfSeparator : lfSeparator;
  const separatorLength = hasCrlf && separator === crlfSeparator ? 4 : 2;

  const headerText = buffer.subarray(0, separator).toString("utf8");
  const headers = new Map();
  for (const line of headerText.split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index === -1) continue;
    const key = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();
    headers.set(key, value);
  }

  const contentLength = Number(headers.get("content-length"));
  if (!Number.isFinite(contentLength) || contentLength < 0) {
    buffer = buffer.subarray(separator + separatorLength);
    return null;
  }

  const messageStart = separator + separatorLength;
  const messageEnd = messageStart + contentLength;
  if (buffer.length < messageEnd) return null;

  const payload = buffer.subarray(messageStart, messageEnd);
  buffer = buffer.subarray(messageEnd);
  return JSON.parse(payload.toString("utf8"));
}

async function pumpMessages() {
  if (processing) return;
  processing = true;
  try {
    while (true) {
      const message = tryReadMessage();
      if (!message) break;
      await handleMessage(message);
    }
  } finally {
    processing = false;
  }
}

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  void pumpMessages();
});

async function flushAndExit() {
  await pumpMessages();
  while (processing) {
    await sleep(10);
  }
  process.exit(0);
}

process.stdin.on("end", () => {
  void flushAndExit();
});

process.stdin.resume();
