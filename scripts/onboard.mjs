#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getBridgedEnvValue } from "./env-prefix-bridge.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const skillSource = join(repoRoot, "skills", "kachilu-browser");
const defaultCodexHome = join(os.homedir(), ".codex");
const defaultClaudeHome = join(os.homedir(), ".claude");
const defaultClaudeConfig = join(os.homedir(), ".claude.json");
const allTargets = ["codex", "opencode", "claudecode"];
const managedStart = "# >>> kachilu-browser managed >>>";
const managedEnd = "# <<< kachilu-browser managed <<<";
const currentSection = "mcp_servers.kachilu_browser";

function getEnvValue(name) {
  return getBridgedEnvValue(process.env, name);
}

function detectDefaultOpencodeConfig() {
  const envConfig = process.env.OPENCODE_CONFIG?.trim();
  if (envConfig) return envConfig;

  const candidates = [
    join(os.homedir(), ".config", "opencode", "opencode.jsonc"),
    join(os.homedir(), ".config", "opencode", "opencode.json"),
    join(os.homedir(), ".local", "share", "opencode", "opencode.jsonc"),
    join(os.homedir(), ".local", "share", "opencode", "opencode.json"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

function isWslEnvironment() {
  if (process.env.WSL_DISTRO_NAME) {
    return true;
  }

  try {
    const osRelease = readFileSync("/proc/sys/kernel/osrelease", "utf8");
    return osRelease.toLowerCase().includes("microsoft");
  } catch {
    return false;
  }
}

function findWindowsPathLine(output) {
  for (const line of String(output).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
      return trimmed;
    }
  }
  return null;
}

function windowsPathToWslPath(pathValue) {
  const raw = String(pathValue).trim();
  const match = raw.match(/^([A-Za-z]):[\\/](.*)$/);
  if (!match) return null;

  const drive = match[1].toLowerCase();
  const rest = match[2].replaceAll("\\", "/");
  return `/mnt/${drive}/${rest}`;
}

function resolveWslWindowsLocalAppData() {
  if (!isWslEnvironment()) return "";

  const result = spawnSync("cmd.exe", ["/C", "echo %LOCALAPPDATA%"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (result.status !== 0) return "";

  const line = findWindowsPathLine(result.stdout);
  if (!line) return "";

  return windowsPathToWslPath(line) || line;
}

function resolveWslWindowsUserProfile(windowsLocalAppData) {
  if (!isWslEnvironment()) return "";

  const result = spawnSync("cmd.exe", ["/C", "echo %USERPROFILE%"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (result.status === 0) {
    const line = findWindowsPathLine(result.stdout);
    const converted = line ? windowsPathToWslPath(line) || line : "";
    if (converted) return converted;
  }

  const localAppData = windowsPathToWslPath(windowsLocalAppData) || windowsLocalAppData;
  if (localAppData && /[\\/]AppData[\\/]Local$/i.test(localAppData)) {
    return dirname(dirname(localAppData));
  }

  return "";
}

function parseIniAssignment(line) {
  if (/^\s*[#;]/.test(line)) return null;

  const match = line.match(/^(\s*)([A-Za-z0-9_.-]+)(\s*=\s*)(.*)$/);
  if (!match) return null;

  const [, indent, key, separator, rest] = match;
  const valueMatch = rest.match(/^([^#;]*?)(\s*(?:[#;].*)?)$/);
  const value = (valueMatch?.[1] ?? rest).trim();
  const comment = valueMatch?.[2] ?? "";

  return { indent, key, separator, value, comment };
}

function normalizeIniValue(value) {
  return String(value).trim().replace(/^["']|["']$/g, "").toLowerCase();
}

function ensureWsl2NetworkingMode(configText) {
  const eol = configText.includes("\r\n") ? "\r\n" : "\n";
  const lines = configText ? configText.split(/\r?\n/) : [];
  const desiredKey = "networkingMode";
  const desiredValue = "mirrored";
  const desiredKeyLower = desiredKey.toLowerCase();
  const changes = [];
  let sectionStart = -1;
  let sectionEnd = lines.length;

  for (let i = 0; i < lines.length; i += 1) {
    const sectionMatch = lines[i].match(/^\s*\[([^\]]+)\]\s*(?:[#;].*)?$/);
    if (!sectionMatch) continue;

    if (sectionStart >= 0) {
      sectionEnd = i;
      break;
    }

    if (sectionMatch[1].trim().toLowerCase() === "wsl2") {
      sectionStart = i;
    }
  }

  if (sectionStart < 0) {
    const prefix = configText.trimEnd();
    const block = ["[wsl2]", `${desiredKey}=${desiredValue}`].join(eol);
    return {
      text: `${prefix ? `${prefix}${eol}${eol}` : ""}${block}${eol}`,
      changed: true,
      changes: [{ key: desiredKey, previous: null, next: desiredValue }],
    };
  }

  let keyFound = false;
  for (let i = sectionStart + 1; i < sectionEnd; i += 1) {
    const assignment = parseIniAssignment(lines[i]);
    if (!assignment || assignment.key.toLowerCase() !== desiredKeyLower) continue;

    keyFound = true;
    if (normalizeIniValue(assignment.value) !== desiredValue) {
      lines[i] = `${assignment.indent}${desiredKey}${assignment.separator}${desiredValue}${assignment.comment}`;
      changes.push({ key: desiredKey, previous: assignment.value || null, next: desiredValue });
    }
  }

  if (!keyFound) {
    lines.splice(sectionEnd, 0, `${desiredKey}=${desiredValue}`);
    changes.push({ key: desiredKey, previous: null, next: desiredValue });
  }

  return {
    text: lines.join(eol).replace(/\s*$/, "") + eol,
    changed: changes.length > 0,
    changes,
  };
}

function ensureWslMirroredNetworking(options) {
  const autoConnectTarget = String(options.autoConnectTarget || "").trim().toLowerCase();
  if (!isWslEnvironment() || autoConnectTarget !== "windows") {
    return {
      status: "skipped",
      reason: "not-wsl-windows-auto-connect",
      restartRequired: false,
    };
  }

  const windowsUserProfile = resolveWslWindowsUserProfile(options.windowsLocalAppData);
  if (!windowsUserProfile) {
    return {
      status: "skipped",
      reason: "windows-user-profile-not-detected",
      restartRequired: false,
      userMessage:
        "Could not detect the Windows user profile path. Configure %USERPROFILE%\\.wslconfig manually with [wsl2] networkingMode=mirrored.",
    };
  }

  const configPath = join(windowsUserProfile, ".wslconfig");
  const current = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  const ensured = ensureWsl2NetworkingMode(current);
  const restartMessage =
    "Updated WSL networking for Windows browser auto-connect. Run `wsl --shutdown` from Windows PowerShell, then reopen WSL and your MCP host.";

  if (!ensured.changed) {
    return {
      status: "unchanged",
      configPath,
      restartRequired: false,
      settings: { networkingMode: "mirrored" },
    };
  }

  if (options.dryRun) {
    console.log(`[dry-run] update ${configPath}`);
    console.log("---");
    console.log(ensured.text.trimEnd());
    return {
      status: current ? "would-update" : "would-create",
      configPath,
      restartRequired: true,
      changes: ensured.changes,
      userMessage: restartMessage,
    };
  }

  mkdirSync(dirname(configPath), { recursive: true });
  if (current) {
    writeFileSync(`${configPath}.kachilu-browser.bak`, current, "utf8");
  }
  writeFileSync(configPath, ensured.text, "utf8");

  return {
    status: current ? "updated" : "created",
    configPath,
    backupPath: current ? `${configPath}.kachilu-browser.bak` : null,
    restartRequired: true,
    changes: ensured.changes,
    userMessage: restartMessage,
  };
}

function detectDefaultTargets(candidates) {
  const detected = [];

  if (existsSync(candidates.codexHome)) {
    detected.push("codex");
  }

  if (existsSync(candidates.claudeHome) || existsSync(candidates.claudeConfig)) {
    detected.push("claudecode");
  }

  const opencodeDir = dirname(candidates.opencodeConfig);
  if (existsSync(candidates.opencodeConfig) || existsSync(opencodeDir)) {
    detected.push("opencode");
  }

  return detected.length > 0 ? detected : ["codex"];
}

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function printHelp() {
  console.log(`Usage:
  kachilu-browser onboard [options]
  node scripts/onboard.mjs [options]

Targets:
  codex       Install Codex skill + ~/.codex/config.toml MCP entry
  opencode    Install ~/.config/opencode/opencode.json(c) MCP entry
  claudecode  Install Claude Code skill + ~/.claude.json MCP entry
  all         Install every target above

Options:
  --target <name>                      Target to onboard (repeatable or comma-separated)
                                        If omitted, auto-detect installed hosts and fall back to codex
  --codex-home <path>                  Codex home directory (default: ~/.codex)
  --claude-home <path>                 Claude Code home for skills (default: ~/.claude)
  --claude-config <path>               Claude Code MCP config (default: ~/.claude.json)
  --opencode-config <path>             OpenCode config (default: ~/.config/opencode/opencode.jsonc)
  --node <path|command>                Node executable/command for MCP (default: node)
  --kachilu-browser-bin <path>         Persist KACHILU_BROWSER_BIN into MCP env
  --auto-connect-target <value>        Persist KACHILU_BROWSER_AUTO_CONNECT_TARGET into MCP env
  --windows-localappdata <path>        Persist KACHILU_BROWSER_WINDOWS_LOCALAPPDATA into MCP env
  --socket-dir <path>                  Persist KACHILU_BROWSER_SOCKET_DIR into MCP env
  --approval-mode <mode>               approval_mode for Codex prepare_workspace (default: approve)
  --force                              Replace an existing non-symlink skill directory
  --dry-run                            Print what would change without writing files
  --help                               Show this help

Environment inputs:
  KACHILU_BROWSER_BIN
  KACHILU_BROWSER_AUTO_CONNECT_TARGET
  KACHILU_BROWSER_WINDOWS_LOCALAPPDATA
  KACHILU_BROWSER_SOCKET_DIR

WSL2 defaults:
  If no explicit auto-connect env is provided, onboard persists:
  KACHILU_BROWSER_AUTO_CONNECT_TARGET=windows
  KACHILU_BROWSER_WINDOWS_LOCALAPPDATA=<auto-detected via cmd.exe>
  When targeting Windows browsers, onboard also ensures %USERPROFILE%\\.wslconfig
  has [wsl2] networkingMode=mirrored and reports when WSL must be restarted.
`);
}

function parseTargets(targetArgs) {
  const expanded = [];
  for (const rawTarget of targetArgs) {
    for (const value of rawTarget.split(",")) {
      const target = value.trim().toLowerCase();
      if (!target) continue;
      if (target === "all") {
        expanded.push(...allTargets);
        continue;
      }
      if (!allTargets.includes(target)) {
        throw new Error(`Unknown target: ${target}`);
      }
      expanded.push(target);
    }
  }

  return [...new Set(expanded)];
}

function isInteractiveTty() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function promptWithDefault(rl, prompt, defaultValue) {
  const answer = (await rl.question(`${prompt} [${defaultValue}]: `)).trim();
  return answer || defaultValue;
}

function normalizeNodeCommand(value) {
  const raw = String(value).trim();
  if (!raw) {
    throw new Error("Node command cannot be empty");
  }

  if (
    raw.startsWith("/") ||
    raw.startsWith("./") ||
    raw.startsWith("../") ||
    raw.startsWith("~") ||
    /^[A-Za-z]:[\\/]/.test(raw)
  ) {
    return resolve(raw);
  }

  return raw;
}

async function parseArgs(argv) {
  const opencodeConfig = detectDefaultOpencodeConfig();
  const args = {
    targets: [],
    codexHome: defaultCodexHome,
    claudeHome: defaultClaudeHome,
    claudeConfig: defaultClaudeConfig,
    opencodeConfig,
    nodePath: "node",
    approvalMode: "approve",
    kachiluBrowserBin: getEnvValue("KACHILU_BROWSER_BIN"),
    autoConnectTarget: getEnvValue("KACHILU_BROWSER_AUTO_CONNECT_TARGET"),
    windowsLocalAppData: getEnvValue("KACHILU_BROWSER_WINDOWS_LOCALAPPDATA"),
    socketDir: getEnvValue("KACHILU_BROWSER_SOCKET_DIR"),
    autoDetectedTargets: [],
    autoDetectedEnv: {},
    force: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--target":
      case "--targets":
        args.targets.push(requireValue(argv, i, arg));
        i += 1;
        break;
      case "--codex-home":
        args.codexHome = resolve(requireValue(argv, i, arg));
        i += 1;
        break;
      case "--claude-home":
      case "--claudecode-home":
        args.claudeHome = resolve(requireValue(argv, i, arg));
        i += 1;
        break;
      case "--claude-config":
      case "--claudecode-config":
        args.claudeConfig = resolve(requireValue(argv, i, arg));
        i += 1;
        break;
      case "--opencode-config":
        args.opencodeConfig = resolve(requireValue(argv, i, arg));
        i += 1;
        break;
      case "--node":
        args.nodePath = normalizeNodeCommand(requireValue(argv, i, arg));
        i += 1;
        break;
      case "--kachilu-browser-bin":
        args.kachiluBrowserBin = resolve(requireValue(argv, i, arg));
        i += 1;
        break;
      case "--auto-connect-target":
        args.autoConnectTarget = requireValue(argv, i, arg);
        i += 1;
        break;
      case "--windows-localappdata":
        args.windowsLocalAppData = requireValue(argv, i, arg);
        i += 1;
        break;
      case "--socket-dir":
        args.socketDir = requireValue(argv, i, arg);
        i += 1;
        break;
      case "--approval-mode":
        args.approvalMode = requireValue(argv, i, arg);
        i += 1;
        break;
      case "--force":
        args.force = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const targetsProvided = args.targets.length > 0;
  const interactive = isInteractiveTty() && !args.dryRun;

  if (targetsProvided) {
    args.targets = parseTargets(args.targets);
  } else if (interactive) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const targetAnswer = (
        await promptWithDefault(
          rl,
          "Onboard target(s): auto/codex/claudecode/opencode/all/skip",
          "auto"
        )
      ).toLowerCase();

      if (targetAnswer === "skip") {
        args.targets = [];
      } else if (!targetAnswer || targetAnswer === "auto") {
        args.targets = detectDefaultTargets({
          codexHome: args.codexHome,
          claudeHome: args.claudeHome,
          claudeConfig: args.claudeConfig,
          opencodeConfig: args.opencodeConfig,
        });
        args.autoDetectedTargets = [...args.targets];
      } else {
        args.targets = parseTargets([targetAnswer]);
      }

      if (args.targets.length > 0 && isWslEnvironment() && !args.autoConnectTarget) {
        args.autoConnectTarget = await promptWithDefault(
          rl,
          "WSL2 browser target: windows/local/auto",
          "windows"
        );
      }

      if (
        args.targets.length > 0 &&
        isWslEnvironment() &&
        args.autoConnectTarget?.toLowerCase() === "windows" &&
        !args.windowsLocalAppData
      ) {
        const detectedLocalAppData = resolveWslWindowsLocalAppData();
        args.windowsLocalAppData = await promptWithDefault(
          rl,
          "Windows LocalAppData path",
          detectedLocalAppData || "/mnt/c/Users/<WindowsUser>/AppData/Local"
        );
      }
    } finally {
      rl.close();
    }
  } else {
    args.targets = detectDefaultTargets({
      codexHome: args.codexHome,
      claudeHome: args.claudeHome,
      claudeConfig: args.claudeConfig,
      opencodeConfig: args.opencodeConfig,
    });
    args.autoDetectedTargets = [...args.targets];
  }

  if (args.targets.length > 0 && isWslEnvironment() && !args.autoConnectTarget) {
    args.autoConnectTarget = "windows";
    args.autoDetectedEnv.KACHILU_BROWSER_AUTO_CONNECT_TARGET = "windows";
  }

  if (
    args.targets.length > 0 &&
    isWslEnvironment() &&
    args.autoConnectTarget.toLowerCase() === "windows" &&
    !args.windowsLocalAppData
  ) {
    const detectedLocalAppData = resolveWslWindowsLocalAppData();
    if (detectedLocalAppData) {
      args.windowsLocalAppData = detectedLocalAppData;
      args.autoDetectedEnv.KACHILU_BROWSER_WINDOWS_LOCALAPPDATA = detectedLocalAppData;
    }
  }

  return args;
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function buildPersistedEnvEntries(options) {
  return [
    ["KACHILU_BROWSER_BIN", options.kachiluBrowserBin],
    ["KACHILU_BROWSER_AUTO_CONNECT_TARGET", options.autoConnectTarget],
    ["KACHILU_BROWSER_WINDOWS_LOCALAPPDATA", options.windowsLocalAppData],
    ["KACHILU_BROWSER_SOCKET_DIR", options.socketDir],
  ].filter(([, value]) => value);
}

function buildCodexManagedBlock(options) {
  const mcpServerPath = join(repoRoot, "scripts", "mcp-server.mjs");
  const envEntries = buildPersistedEnvEntries(options);

  const lines = [
    managedStart,
    "[mcp_servers.kachilu_browser]",
    `command = ${tomlString(options.nodePath)}`,
    `args = [${tomlString(mcpServerPath)}]`,
    "startup_timeout_sec = 60.0",
    "",
  ];

  if (envEntries.length > 0) {
    lines.push("[mcp_servers.kachilu_browser.env]");
    for (const [key, value] of envEntries) {
      lines.push(`${key} = ${tomlString(value)}`);
    }
    lines.push("");
  }

  lines.push("[mcp_servers.kachilu_browser.tools.kachilu_browser_prepare_workspace]");
  lines.push(`approval_mode = ${tomlString(options.approvalMode)}`);
  lines.push(managedEnd);

  return lines.join("\n");
}

function buildClaudeCodeConfig(options) {
  const mcpServerPath = join(repoRoot, "scripts", "mcp-server.mjs");
  const envEntries = Object.fromEntries(buildPersistedEnvEntries(options));
  const config = {
    type: "stdio",
    command: options.nodePath,
    args: [mcpServerPath],
  };

  if (Object.keys(envEntries).length > 0) {
    config.env = envEntries;
  }

  return config;
}

function buildOpenCodeConfig(options) {
  const mcpServerPath = join(repoRoot, "scripts", "mcp-server.mjs");
  const environment = Object.fromEntries(buildPersistedEnvEntries(options));
  const config = {
    type: "local",
    command: [options.nodePath, mcpServerPath],
    enabled: true,
    timeout: 60000,
  };

  if (Object.keys(environment).length > 0) {
    config.environment = environment;
  }

  return config;
}

function findManagedBlockRange(configText) {
  const start = configText.indexOf(managedStart);
  const end = configText.indexOf(managedEnd);
  if (start >= 0 && end >= 0 && end > start) {
    return { start, end: end + managedEnd.length };
  }
  return null;
}

function findManagedSectionRange(configText) {
  const lines = configText.split("\n");
  let startLine = -1;
  let sectionPrefix = "";

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === `[${currentSection}]`) {
      startLine = i;
      sectionPrefix = currentSection;
      break;
    }
  }

  if (startLine < 0) return null;

  let endLine = lines.length;
  for (let i = startLine + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) continue;
    const sectionName = trimmed.slice(1, -1).trim();
    if (!sectionName.startsWith(sectionPrefix)) {
      endLine = i;
      break;
    }
  }

  const lineOffsets = [0];
  for (const line of lines) {
    lineOffsets.push(lineOffsets[lineOffsets.length - 1] + line.length + 1);
  }

  return {
    start: lineOffsets[startLine],
    end: lineOffsets[endLine],
  };
}

function replaceManagedBlock(configText, managedBlock) {
  const existingManaged = findManagedBlockRange(configText);
  if (existingManaged) {
    const before = configText.slice(0, existingManaged.start).replace(/\s*$/, "");
    const after = configText.slice(existingManaged.end).replace(/^\s*/, "");
    return `${before}\n\n${managedBlock}\n${after ? `\n\n${after}` : ""}`.trimEnd() + "\n";
  }

  const sectionRange = findManagedSectionRange(configText);
  if (sectionRange) {
    const before = configText.slice(0, sectionRange.start).replace(/\s*$/, "");
    const after = configText.slice(sectionRange.end).replace(/^\s*/, "");
    return `${before}\n\n${managedBlock}\n${after ? `\n\n${after}` : ""}`.trimEnd() + "\n";
  }

  const prefix = configText.trimEnd();
  return `${prefix ? `${prefix}\n\n` : ""}${managedBlock}\n`;
}

function ensureSkillSymlink(targetPath, options) {
  if (!existsSync(skillSource)) {
    throw new Error(`Skill source not found: ${skillSource}`);
  }

  if (options.dryRun) {
    console.log(`[dry-run] link or copy ${skillSource} -> ${targetPath}`);
    return;
  }

  mkdirSync(dirname(targetPath), { recursive: true });

  if (existsSync(targetPath)) {
    const stat = lstatSync(targetPath);
    if (stat.isSymbolicLink()) {
      const current = realpathSync(targetPath);
      if (current === realpathSync(skillSource)) return;
      rmSync(targetPath, { recursive: true, force: true });
    } else if (options.force || isManagedSkillCopy(targetPath)) {
      rmSync(targetPath, { recursive: true, force: true });
    } else {
      throw new Error(
        `Skill target already exists and is not a symlink: ${targetPath}. Re-run with --force to replace it.`
      );
    }
  }

  try {
    symlinkSync(skillSource, targetPath, "dir");
  } catch (error) {
    if (!shouldFallbackToSkillCopy(error)) {
      throw error;
    }

    cpSync(skillSource, targetPath, { recursive: true });
    console.log(`Symlink unavailable; copied skill directory to ${targetPath}`);
  }
}

function shouldFallbackToSkillCopy(error) {
  const code = error && typeof error === "object" ? error.code : "";
  return process.platform === "win32" && (code === "EPERM" || code === "EACCES");
}

function isManagedSkillCopy(targetPath) {
  try {
    const skillManifest = readFileSync(join(targetPath, "SKILL.md"), "utf8");
    return /^name:\s*kachilu-browser\s*$/m.test(skillManifest);
  } catch {
    return false;
  }
}

function sanitizeJsonc(text) {
  const source = text.replace(/^\uFEFF/, "");
  let stripped = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (inString) {
      stripped += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      stripped += char;
      continue;
    }

    if (char === "/" && next === "/") {
      i += 2;
      while (i < source.length && source[i] !== "\n") {
        i += 1;
      }
      if (i < source.length) {
        stripped += "\n";
      }
      continue;
    }

    if (char === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") stripped += "\n";
        i += 1;
      }
      i += 1;
      continue;
    }

    stripped += char;
  }

  let sanitized = "";
  inString = false;
  escaped = false;

  for (let i = 0; i < stripped.length; i += 1) {
    const char = stripped[i];

    if (inString) {
      sanitized += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      sanitized += char;
      continue;
    }

    if (char === ",") {
      let cursor = i + 1;
      while (cursor < stripped.length && /\s/.test(stripped[cursor])) {
        cursor += 1;
      }
      if (cursor < stripped.length && (stripped[cursor] === "}" || stripped[cursor] === "]")) {
        continue;
      }
    }

    sanitized += char;
  }

  return sanitized;
}

function readJsonConfig(configPath) {
  if (!existsSync(configPath)) return {};

  const raw = readFileSync(configPath, "utf8");
  if (!raw.trim()) return {};

  try {
    return JSON.parse(sanitizeJsonc(raw));
  } catch (error) {
    throw new Error(`Failed to parse ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function writeJsonConfig(configPath, next, options) {
  const currentRaw = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  const current = currentRaw ? readJsonConfig(configPath) : {};
  const currentNormalized = JSON.stringify(current, null, 2);
  const nextNormalized = JSON.stringify(next, null, 2);

  if (currentRaw && currentNormalized === nextNormalized) {
    if (options.dryRun) {
      console.log(`[dry-run] no changes for ${configPath}`);
    }
    return;
  }

  if (options.dryRun) {
    console.log(`[dry-run] update ${configPath}`);
    console.log("---");
    console.log(nextNormalized);
    return;
  }

  mkdirSync(dirname(configPath), { recursive: true });
  if (currentRaw) {
    writeFileSync(`${configPath}.kachilu-browser.bak`, currentRaw, "utf8");
  }
  writeFileSync(configPath, `${nextNormalized}\n`, "utf8");
}

function updateCodexConfig(options) {
  const configPath = join(options.codexHome, "config.toml");
  const current = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  const managedBlock = buildCodexManagedBlock(options);
  const next = replaceManagedBlock(current, managedBlock);

  if (options.dryRun) {
    console.log(`[dry-run] update ${configPath}`);
    console.log("---");
    console.log(managedBlock);
    return;
  }

  mkdirSync(options.codexHome, { recursive: true });
  if (current && current !== next) {
    writeFileSync(`${configPath}.kachilu-browser.bak`, current, "utf8");
  }
  writeFileSync(configPath, next, "utf8");
}

function updateClaudeCodeConfig(options) {
  const current = readJsonConfig(options.claudeConfig);
  const next = {
    ...current,
    mcpServers: {
      ...(current.mcpServers && typeof current.mcpServers === "object" ? current.mcpServers : {}),
      "kachilu-browser": buildClaudeCodeConfig(options),
    },
  };

  writeJsonConfig(options.claudeConfig, next, options);
}

function updateOpenCodeConfig(options) {
  const current = readJsonConfig(options.opencodeConfig);
  const next = {
    ...(current.$schema ? current : { ...current, $schema: "https://opencode.ai/config.json" }),
    mcp: {
      ...(current.mcp && typeof current.mcp === "object" ? current.mcp : {}),
      "kachilu-browser": buildOpenCodeConfig(options),
    },
  };

  if (!next.$schema) {
    next.$schema = "https://opencode.ai/config.json";
  }

  writeJsonConfig(options.opencodeConfig, next, options);
}

function onboardCodex(options) {
  const skillTarget = join(options.codexHome, "skills", "kachilu-browser");
  ensureSkillSymlink(skillTarget, options);
  updateCodexConfig(options);

  return {
    skillPath: skillTarget,
    configPath: join(options.codexHome, "config.toml"),
  };
}

function onboardClaudeCode(options) {
  const skillTarget = join(options.claudeHome, "skills", "kachilu-browser");
  ensureSkillSymlink(skillTarget, options);
  updateClaudeCodeConfig(options);

  return {
    skillPath: skillTarget,
    configPath: options.claudeConfig,
  };
}

function onboardOpenCode(options) {
  updateOpenCodeConfig(options);

  return {
    configPath: options.opencodeConfig,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = await parseArgs(argv);
  const wslNetworking = ensureWslMirroredNetworking(options);
  const summary = {
    targets: options.targets,
    autoDetectedTargets: options.autoDetectedTargets,
    mcpServer: join(repoRoot, "scripts", "mcp-server.mjs"),
    dryRun: options.dryRun,
    persistedEnv: {
      KACHILU_BROWSER_BIN: options.kachiluBrowserBin || null,
      KACHILU_BROWSER_AUTO_CONNECT_TARGET: options.autoConnectTarget || null,
      KACHILU_BROWSER_WINDOWS_LOCALAPPDATA: options.windowsLocalAppData || null,
      KACHILU_BROWSER_SOCKET_DIR: options.socketDir || null,
    },
    autoDetectedEnv: options.autoDetectedEnv,
    wslNetworking,
    results: {},
  };

  for (const target of options.targets) {
    switch (target) {
      case "codex":
        summary.results.codex = onboardCodex(options);
        break;
      case "opencode":
        summary.results.opencode = onboardOpenCode(options);
        break;
      case "claudecode":
        summary.results.claudecode = onboardClaudeCode(options);
        break;
      default:
        throw new Error(`Unsupported target: ${target}`);
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
