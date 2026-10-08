/**
 * Seeds the fake stack once, if it is empty. The in-memory API keeps the seed
 * for its lifetime, so a reused local stack is seeded only on its first run.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { apiUrl, OWNER } from "./env";

export default async function globalSetup() {
  const documents = await fetch(`${apiUrl}/library/documents?offset=0&limit=1`, { headers: OWNER });
  if (!documents.ok) throw new Error(`The e2e API at ${apiUrl} isn't answering (${documents.status}).`);
  if (((await documents.json()) as unknown[]).length > 0) return;
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  execFileSync("uv", ["run", "python", "scripts/seed_demo.py", "--api", apiUrl], { cwd: root, stdio: "inherit" });
}
