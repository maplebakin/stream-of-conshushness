import { test } from 'vitest';
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".bmp",
]);

test("repository contains no merge conflict markers", () => {
  const root = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  const self = path.relative(root, fileURLToPath(import.meta.url));
  const files = execSync("git ls-files", { encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);

  const offenders = [];

  for (const file of files) {
    if (file === self) continue;
    const ext = path.extname(file).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) continue;

    const contents = readFileSync(path.join(root, file), "utf8");
    if (contents.includes("<<<<<<<") || contents.includes(">>>>>>>")) {
      offenders.push(file);
    }
  }

  assert.strictEqual(
    offenders.length,
    0,
    offenders.length
      ? `Merge conflict markers found in: ${offenders.join(", ")}`
      : "Expected no merge conflict markers"
  );
});
