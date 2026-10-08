/**
 * Seeds the fake stack once, if it is empty. The in-memory API keeps the seed
 * for its lifetime, so a reused local stack is seeded only on its first run.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { apiUrl, OWNER } from "./env";

export default async function globalSetup() {
  const [documents, organisation] = await Promise.all([
    fetch(`${apiUrl}/library/documents?offset=0&limit=1`, { headers: OWNER }),
    fetch(`${apiUrl}/organisation`, { headers: OWNER }),
  ]);
  if (!documents.ok || !organisation.ok) throw new Error(`The e2e API at ${apiUrl} isn't answering (${documents.status}, ${organisation.status}).`);
  // Seeded already (even in part, by an earlier run against a reused stack): seeding again would conflict.
  const seeded = ((await documents.json()) as unknown[]).length > 0 || ((await organisation.json()) as { people: unknown[] }).people.length > 0;
  if (seeded) return;
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  execFileSync("uv", ["run", "python", "scripts/seed_demo.py", "--api", apiUrl], { cwd: root, stdio: "inherit" });
}
