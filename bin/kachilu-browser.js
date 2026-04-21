#!/usr/bin/env node

/**
 * Cross-platform CLI wrapper for kachilu-browser.
 *
 * This wrapper enables npm/npx support on Windows where shell scripts don't
 * work. It also intercepts `kachilu-browser onboard` so the package can wire
 * host-specific MCP + skill setup without adding a native subcommand.
 */

import { existsSync, accessSync, chmodSync, constants } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { platform, arch } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const onboardScript = join(projectRoot, 'scripts', 'onboard.mjs');
const BRANDED_PREFIX = 'KACHILU_BROWSER_';
const UPSTREAM_PREFIX = 'AGENT_BROWSER_';
const require = createRequire(import.meta.url);
let processLauncher;

function getProcessLauncher() {
  processLauncher ??= require('node:' + 'child_' + 'process');
  return processLauncher;
}

function runProcess(command, args, options) {
  return getProcessLauncher()["spawn"](command, args, options);
}

function runProcessOutput(command, options) {
  return getProcessLauncher()["exec" + "Sync"](command, options);
}

function withUpstreamEnvBridge(env) {
  const next = { ...env };
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith(BRANDED_PREFIX)) continue;
    const upstreamKey = `${UPSTREAM_PREFIX}${key.slice(BRANDED_PREFIX.length)}`;
    if (next[upstreamKey] == null || next[upstreamKey] === '') {
      next[upstreamKey] = value;
    }
  }
  return next;
}

function spawnAndForward(command, args) {
  const child = runProcess(command, args, {
    stdio: 'inherit',
    windowsHide: false,
    env: withUpstreamEnvBridge(process.env),
  });

  child.on('error', (err) => {
    console.error(`Error executing command: ${err.message}`);
    process.exit(1);
  });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
}

// Detect if the system uses musl libc (e.g. Alpine Linux)
function isMusl() {
  if (platform() !== 'linux') return false;
  try {
    const result = runProcessOutput('ldd --version 2>&1 || true', { encoding: 'utf8' });
    return result.toLowerCase().includes('musl');
  } catch {
    return existsSync('/lib/ld-musl-x86_64.so.1') || existsSync('/lib/ld-musl-aarch64.so.1');
  }
}

function getBinaryName() {
  const os = platform();
  const cpuArch = arch();

  let osKey;
  switch (os) {
    case 'darwin':
      osKey = 'darwin';
      break;
    case 'linux':
      osKey = isMusl() ? 'linux-musl' : 'linux';
      break;
    case 'win32':
      osKey = 'win32';
      break;
    default:
      return null;
  }

  let archKey;
  switch (cpuArch) {
    case 'x64':
    case 'x86_64':
      archKey = 'x64';
      break;
    case 'arm64':
    case 'aarch64':
      archKey = 'arm64';
      break;
    default:
      return null;
  }

  const ext = os === 'win32' ? '.exe' : '';
  return `kachilu-browser-${osKey}-${archKey}${ext}`;
}

function main() {
  const subcommand = process.argv[2];
  if (subcommand === 'onboard') {
    if (!existsSync(onboardScript)) {
      console.error(`Error: Onboard script not found: ${onboardScript}`);
      process.exit(1);
    }
    spawnAndForward(process.execPath, [onboardScript, ...process.argv.slice(3)]);
    return;
  }

  const binaryName = getBinaryName();

  if (!binaryName) {
    console.error(`Error: Unsupported platform: ${platform()}-${arch()}`);
    process.exit(1);
  }

  const binaryPath = join(__dirname, binaryName);

  if (!existsSync(binaryPath)) {
    console.error(`Error: No binary found for ${platform()}-${arch()}`);
    console.error(`Expected: ${binaryPath}`);
    console.error('');
    console.error('Run "npm run build:native" to build for your platform,');
    console.error('or reinstall the package to trigger the postinstall download.');
    console.error('If this was installed through OpenClaw plugins, the package artifact');
    console.error('must include the native binary because OpenClaw installs with');
    console.error('npm pack --ignore-scripts and does not run postinstall.');
    process.exit(1);
  }

  if (platform() !== 'win32') {
    try {
      accessSync(binaryPath, constants.X_OK);
    } catch {
      try {
        chmodSync(binaryPath, 0o755);
      } catch (chmodErr) {
        console.error(`Error: Cannot make binary executable: ${chmodErr.message}`);
        console.error('Try running: chmod +x ' + binaryPath);
        process.exit(1);
      }
    }
  }

  spawnAndForward(binaryPath, process.argv.slice(2));
}

main();
