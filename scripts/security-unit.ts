import { fetchUrlContent } from "../apps/web/src/lib/fetch-job.ts";

const blocked = [
  "file:///etc/passwd",
  "http://localhost/secret",
  "http://127.0.0.1/secret",
  "http://10.0.0.1/secret",
  "http://169.254.169.254/latest/meta-data/",
  "http://192.168.1.1/secret",
  "http://[::1]/secret",
];

for (const url of blocked) {
  try {
    await fetchUrlContent(url);
    throw new Error(`SSRF guard failed to block ${url}`);
  } catch (err) {
    if (err instanceof Error && /SSRF guard failed/.test(err.message)) throw err;
  }
}

console.log(`PASS security unit checks (${blocked.length} private/local URLs blocked)`);
