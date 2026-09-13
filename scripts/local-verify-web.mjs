import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const port = process.env.JOBTRACKR_PORT ?? "3001";
const base = process.env.JOBTRACKR_URL ?? `http://127.0.0.1:${port}`;

const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: "inherit", env: process.env });

if (process.versions.node.split(".")[0] < 22) throw new Error(`Node.js 22+ is required; found ${process.version}`);
if (!existsSync(join(root, "apps/web/.next/BUILD_ID"))) throw new Error("apps/web production build is missing.");

run("npm", ["run", "typecheck"]);
run("npm", ["run", "build"]);

const child = spawn("npm", ["run", "start", "--workspace=apps/web"], {
  cwd: root,
  stdio: "ignore",
  detached: true,
  env: process.env,
});

let ready = false;
for (let i = 0; i < 60; i++) {
  try {
    execFileSync("curl", ["-fsS", "--max-time", "2", `${base}/api/settings`], { stdio: "ignore" });
    ready = true;
    break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 500));
}

if (!ready) {
  child.kill();
  throw new Error(`JobTrackr did not start at ${base}.`);
}

console.log(`JobTrackr web build verified at ${base}.`);
child.kill();
