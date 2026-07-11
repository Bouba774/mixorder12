/**
 * Post-build: generate a static index.html for Capacitor.
 *
 * TanStack Start's built-in SPA prerender doesn't work with the
 * Lovable Cloudflare wrapper (it looks for dist/server/server.js while
 * nitro emits dist/server/index.mjs). We work around this by booting
 * the built worker with wrangler, fetching "/", and writing the HTML
 * into dist/client/index.html so `bunx cap add/sync` finds it.
 */
import { spawn } from "node:child_process";
import { writeFile, mkdir, access, cp } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Nitro emits to different roots depending on preset (dist/ for cloudflare-module,
// .output/ for node-server, etc). Discover the actual layout at runtime so the
// script keeps working when the deploy target changes.
const CANDIDATES = [
  { server: "dist/server/wrangler.json", client: "dist/client" },
  { server: ".output/server/wrangler.json", client: ".output/public" },
];

let LAYOUT = null;
for (const c of CANDIDATES) {
  try {
    await access(resolve(ROOT, c.server));
    LAYOUT = c;
    break;
  } catch {}
}

if (!LAYOUT) {
  console.error(
    "[prerender] Could not locate wrangler.json in dist/server or .output/server. " +
      "Did the build run? Checked:\n  " +
      CANDIDATES.map((c) => resolve(ROOT, c.server)).join("\n  "),
  );
  process.exit(1);
}

const SOURCE_CLIENT_DIR = resolve(ROOT, LAYOUT.client);
const CAPACITOR_CLIENT_DIR = resolve(ROOT, "dist/client");
const WRANGLER_CONFIG = resolve(ROOT, LAYOUT.server);
const OUT_HTML = resolve(CAPACITOR_CLIENT_DIR, "index.html");
const PORT = 8799;

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Server at ${url} did not respond within ${timeoutMs}ms`);
}

async function main() {
  console.log(`[prerender] Using build layout: ${LAYOUT.server} -> ${LAYOUT.client}`);

  console.log("[prerender] Booting wrangler…");
  const wrangler = spawn(
    "bunx",
    [
      "wrangler",
      "dev",
      "--config",
      WRANGLER_CONFIG,
      "--port",
      String(PORT),
      "--ip",
      "127.0.0.1",
      "--log-level",
      "warn",
    ],
    {
      cwd: ROOT,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      stdio: ["ignore", "inherit", "inherit"],
    },
  );

  const cleanup = () => {
    try {
      wrangler.kill("SIGTERM");
    } catch {}
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });

  try {
    const base = `http://127.0.0.1:${PORT}`;
    await waitForServer(base, 45000);

    console.log("[prerender] Fetching / …");
    const res = await fetch(base + "/", {
      headers: { "user-agent": "MixOrder-Prerender/1.0" },
    });
    if (!res.ok) throw new Error(`GET / -> HTTP ${res.status}`);
    const html = await res.text();

    await mkdir(CAPACITOR_CLIENT_DIR, { recursive: true });

    if (SOURCE_CLIENT_DIR !== CAPACITOR_CLIENT_DIR) {
      await cp(SOURCE_CLIENT_DIR, CAPACITOR_CLIENT_DIR, {
        recursive: true,
        force: true,
      });
      console.log(
        `[prerender] Copied web assets from ${LAYOUT.client} to dist/client`,
      );
    }

    await writeFile(OUT_HTML, html, "utf8");
    console.log(`[prerender] Wrote ${OUT_HTML} (${html.length} bytes)`);
  } finally {
    cleanup();
    // give wrangler a moment to release the port
    await new Promise((r) => setTimeout(r, 300));
  }
}

main().catch((err) => {
  console.error("[prerender] Failed:", err);
  process.exit(1);
});
