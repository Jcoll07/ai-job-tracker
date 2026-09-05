import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function isPrivateIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0
    );
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    );
  }
  return false;
}

async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid job posting URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP(S) job posting URLs are supported");
  }
  if (url.username || url.password) throw new Error("Job posting URL must not contain credentials");
  if (url.port && !["80", "443"].includes(url.port)) {
    throw new Error("Job posting URL must use HTTP or HTTPS standard ports");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("Local/private job posting URLs are not allowed");
  }
  if (isPrivateIp(hostname)) throw new Error("Private or loopback job posting URLs are not allowed");

  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (!records.length || records.some((record) => isPrivateIp(record.address))) {
      throw new Error("Private or loopback job posting URLs are not allowed");
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("Private or loopback")) throw err;
    throw new Error("Could not resolve the job posting host");
  }
  return url;
}

async function fetchSafe(rawUrl: string): Promise<{ url: string; html: string }> {
  let current = await assertSafeUrl(rawUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const res = await fetch(current, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; JobTrackr/2.0)",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });

    if (res.status >= 300 && res.status < 400) {
      if (redirects === MAX_REDIRECTS) throw new Error("Too many redirects while fetching the job posting");
      const location = res.headers.get("location");
      if (!location) throw new Error("Job posting returned an invalid redirect");
      current = await assertSafeUrl(new URL(location, current).toString());
      continue;
    }

    if (!res.ok) throw new Error(`Fetching the URL failed (HTTP ${res.status})`);
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_RESPONSE_BYTES) throw new Error("Job posting response is too large (2 MB maximum)");
    const html = await res.text();
    if (Buffer.byteLength(html, "utf8") > MAX_RESPONSE_BYTES) throw new Error("Job posting response is too large (2 MB maximum)");
    return { url: current.toString(), html };
  }
  throw new Error("Unable to fetch job posting");
}

/** Fetch a job posting URL server-side and reduce it to parseable text. */
export async function fetchUrlContent(url: string): Promise<string> {
  const fetched = await fetchSafe(url);
  const html = fetched.html;

  // Prefer structured data when the site provides it.
  const jsonLdBlocks = [...html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )];
  for (const m of jsonLdBlocks) {
    try {
      const data = JSON.parse(m[1]);
      const items = Array.isArray(data) ? data : [data];
      const posting = items.find((i) => i?.["@type"] === "JobPosting");
      if (posting) {
        return `URL: ${fetched.url}\nJSON-LD JobPosting:\n${JSON.stringify(posting).slice(0, 20000)}`;
      }
    } catch {
      // ignore malformed blocks
    }
  }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&amp;|&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 200) {
    throw new Error(
      "The page returned too little readable content (it may require JavaScript or block bots). Paste the posting text instead.",
    );
  }
  return `URL: ${fetched.url}\nPage text:\n${text}`;
}
