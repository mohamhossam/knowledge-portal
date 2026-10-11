/** The e2e stack's ports, shared by the config, the global setup and the specs. */
export const apiPort = process.env.E2E_API_PORT ?? "8130";
export const webPort = process.env.E2E_WEB_PORT ?? "4184";
export const apiUrl = `http://127.0.0.1:${apiPort}`;

/** The seeded admin persona (scripts/seed_demo.py). */
export const OWNER = { "X-Fake-Actor-Id": "fake-owner" };
