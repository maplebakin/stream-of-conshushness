import { test, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
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
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "coverage"]);

function listFiles(root, dir = ".") {
  const absDir = path.join(root, dir);
  const entries = readdirSync(absDir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env.example") {
      if (entry.name !== ".github") continue;
    }
    if (SKIP_DIRS.has(entry.name)) continue;

    const relPath = path.join(dir, entry.name);
    const absPath = path.join(root, relPath);
    if (entry.isDirectory()) {
      out.push(...listFiles(root, relPath));
      continue;
    }
    if (!entry.isFile()) continue;
    out.push({ relPath, absPath });
  }
  return out;
}

test("repository contains no merge conflict markers", () => {
  const root = process.cwd();
  const files = listFiles(root);

  const offenders = [];

  for (const { relPath, absPath } of files) {
    const ext = path.extname(relPath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) continue;

    const contents = readFileSync(absPath, "utf8");
    if (/^(<{7}(?: .*)?$|={7}$|>{7}(?: .*)?$)/m.test(contents)) {
      offenders.push(relPath);
    }
  }

  expect(
    offenders.length,
    offenders.length
      ? `Merge conflict markers found in: ${offenders.join(", ")}`
      : "Expected no merge conflict markers"
  ).toBe(0);
});
