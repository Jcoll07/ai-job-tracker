import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const root = join(dirname(new URL(import.meta.url).pathname), "../..");
process.chdir(root);
const appDir = join(homedir(), "Applications", "JobTrackr.app");
const port = "3001";

const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: "inherit", env: process.env });
const output = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: "utf8", env: process.env }).trim();

if (process.platform !== "darwin") throw new Error("JobTrackr desktop packaging requires macOS.");
if (!existsSync(join(root, "apps/web/.next/BUILD_ID"))) throw new Error("Production build is missing.");

const commit = output("git", ["rev-parse", "HEAD"]);
console.log(`Building/installing JobTrackr for commit ${commit}...`);
run("npm", ["install"]);
try { run("node", ["-e", "require('better-sqlite3')"]); } catch { run("npm", ["rebuild", "better-sqlite3", "--build-from-source"]); }
run("npm", ["run", "build"]);

mkdirSync(join(homedir(), "Applications"), { recursive: true });
rmSync(appDir, { recursive: true, force: true });
const template = readFileSync(join(root, "scripts/macos/JobTrackr.applescript.template"), "utf8");
const script = template.replaceAll("__PROJECT_DIR__", root.replaceAll("\\", "\\\\").replaceAll('"', '\\"'));
const scriptPath = join(process.env.TMPDIR ?? "/tmp", `jobtrackr-${process.pid}.applescript`);
writeFileSync(scriptPath, script, "utf8");
try { run("osacompile", ["-o", appDir, scriptPath]); } finally { rmSync(scriptPath, { force: true }); }
writeFileSync(join(root, ".jobtrackr-build-commit"), commit);
run("open", [appDir]);

let ready = false;
for (let i = 0; i < 60; i++) {
  const result = spawnSync("curl", ["-fsS", "--max-time", "2", `http://127.0.0.1:${port}`], { stdio: "ignore" });
  if (result.status === 0) { ready = true; break; }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
}
if (!ready) throw new Error(`JobTrackr.app was installed but the server did not become ready on port ${port}.`);
console.log(`JobTrackr.app opened. Active build: ${commit}`);
