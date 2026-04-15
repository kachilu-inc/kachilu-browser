#!/usr/bin/env node

import { main } from "./onboard.mjs";

try {
  main(["--target", "codex", ...process.argv.slice(2)]);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
