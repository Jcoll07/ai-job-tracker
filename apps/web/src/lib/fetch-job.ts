import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 4;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;

export interface ScrapedJobPosting {
  company: string | null;
  jobTitle: string | null;
  location: string | null;
  salaryRange: string | null;
  jobType: "On site" | "Remote" | "Hybrid" | "?";
  experience: string | null;
  skills: string | null;
  description: string | null;
  sourceUrl: string;
  emailDomain: string | null;
}

function isPrivateIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0;
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
  }
  return false;
}

async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new Error("Invalid job posting URL"); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP(S) job posting URLs are supported");
  if (url.username || url.password) throw new Error("Job posting URL must not contain credentials");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Job posting URL must use HTTP or HTTPS standard ports");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || isPrivateIp(hostname)) throw new Error("Private or loopback job posting URLs are not allowed");
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (!records.length || records.some((record) => isPrivateIp(record.address))) throw new Error("Private or loopback job posting URLs are not allowed");
  } catch (error) {
    if (error instanceof Error && error.message.includes("Private or loopback")) throw error;
    throw new Error("Could not resolve the job posting host");
  }
  return url;
}

async function fetchSafe(rawUrl: string): Promise<{ url: string; html: string }> {
  let current = await assertSafeUrl(rawUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    let response: Response;
    try {
      response = await fetch(current, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; JobTrackr/2.0)", accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8" },
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new Error("The job posting site did not respond within 8s. It may require JavaScript or block automated requests; use Copy & Paste instead.");
      throw new Error(`Unable to fetch the job posting: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (response.status >= 300 && response.status < 400) {
      if (redirects === MAX_REDIRECTS) throw new Error("Too many redirects while fetching the job posting");
      const location = response.headers.get("location");
      if (!location) throw new Error("Job posting returned an invalid redirect");
      current = await assertSafeUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Fetching the URL failed (HTTP ${response.status})`);
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_RESPONSE_BYTES) throw new Error("Job posting response is too large (2 MB maximum)");
    const html = await response.text();
    if (Buffer.byteLength(html, "utf8") > MAX_RESPONSE_BYTES) throw new Error("Job posting response is too large (2 MB maximum)");
    return { url: current.toString(), html };
  }
  throw new Error("Unable to fetch job posting");
}

function htmlToText(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<\/(?:p|div|section|article|li|h[1-6]|br|tr)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&#x27;|&#\d+;/gi, (match) => ({ "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'" }[match.toLowerCase()] ?? match)).replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n\s*\n+/g, "\n\n").trim();
}
function clean(value: unknown): string | null { if (value === undefined || value === null) return null; const text = Array.isArray(value) ? value.map((item) => clean(item)).filter(Boolean).join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value); const normalized = text.replace(/\s+/g, " ").trim(); return normalized || null; }
function firstText(...values: unknown[]): string | null { for (const value of values) { const result = clean(value); if (result) return result; } return null; }
function normalizeJobType(value: unknown): "On site" | "Remote" | "Hybrid" | "?" { const normalized = String(value ?? "").toLowerCase(); if (/remote|telecommut/.test(normalized)) return "Remote"; if (/hybrid/.test(normalized)) return "Hybrid"; if (/onsite|on-site|on site|office/.test(normalized)) return "On site"; return "?"; }
function domainOf(url: string): string | null { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; } }
function extractAboutTheJob(text: string): string | null { const normalized = text.replace(/\r/g, ""); const stop = "About the company|About the Company|Company|Benefits|Qualifications|Requirements|Skills|Responsibilities|What you(?:'|’)ll do|How you(?:'|’)ll make an impact|Employment type|Job function|Seniority level|Industry|Show less|Show more|Apply|Easy Apply|Report this job"; for (const pattern of [new RegExp(`(?:^|\\n)\\s*About the Job\\s*[:\\-]?\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:${stop})\\b|$)`, "i"), new RegExp(`(?:^|\\n)\\s*About the Job\\s*[:\\-]?\\s*([\\s\\S]*?)(?=\\n\\s*(?:${stop})\\b|$)`, "i")]) { const value = normalized.match(pattern)?.[1]?.trim(); if (value) return value; } return null; }
function looksClosed(text: string): boolean { return /no longer (accepting|available)|position (has )?(been )?(filled|closed)|job (is )?closed|this job (is )?no longer available|applications? (are )?closed|role (has )?been filled|we('re| are) no longer accepting/i.test(text); }
function parseJobPostingJsonLd(data: any, sourceUrl: string, about: string | null): ScrapedJobPosting | null { const candidates = Array.isArray(data) ? data : [data]; const posting = candidates.find((item) => { const type = item?.["@type"]; return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting")); }); if (!posting) return null; const company = posting.hiringOrganization?.name ?? posting.hiringOrganization; const address = posting.jobLocation?.address ?? posting.jobLocation; const location = typeof address === "string" ? address : [address?.addressLocality, address?.addressRegion, address?.addressCountry].filter(Boolean).join(", "); const salary = posting.baseSalary?.value ?? posting.baseSalary; const job: ScrapedJobPosting = { company: firstText(company), jobTitle: firstText(posting.title, posting.name), location: firstText(location), salaryRange: firstText(typeof salary === "object" ? [salary.minValue, salary.maxValue, salary.currency].filter(Boolean).join(" ") : salary), jobType: normalizeJobType(posting.jobLocationType ?? posting.employmentType), experience: firstText(posting.experienceRequirements), skills: firstText(posting.skills ?? posting.qualifications), description: about ?? clean(posting.description), sourceUrl, emailDomain: domainOf(sourceUrl) }; return job.company && job.jobTitle ? job : null; }

export async function fetchJobPosting(url: string): Promise<{ url: string; content: string; open: boolean; aboutTheJob: string | null; structuredJob: ScrapedJobPosting | null }> {
  const fetched = await fetchSafe(url), html = fetched.html, text = htmlToText(html), about = extractAboutTheJob(text);
  const jsonLdBlocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of jsonLdBlocks) {
    try { const data = JSON.parse(match[1]); const posting = parseJobPostingJsonLd(data, fetched.url, about); if (!posting) continue; const raw = JSON.stringify(data).slice(0, 30000); return { url: fetched.url, content: `URL: ${fetched.url}\nJSON-LD JobPosting:\n${raw}${about ? `\nABOUT_THE_JOB_VERBATIM:\n${about.slice(0, 30000)}` : ""}`, aboutTheJob: about, open: !looksClosed(raw), structuredJob: posting }; } catch { /* continue */ }
  }
  if (text.length < 200) throw new Error("The page returned too little readable content (it may require JavaScript or block bots). Paste the posting text instead.");
  return { url: fetched.url, content: about ? `URL: ${fetched.url}\nABOUT_THE_JOB_VERBATIM:\n${about.slice(0, 30000)}\nPage text:\n${text.slice(0, 30000)}` : `URL: ${fetched.url}\nPage text:\n${text.slice(0, 30000)}`, aboutTheJob: about, open: !looksClosed(text), structuredJob: null };
}
export async function fetchUrlContent(url: string): Promise<string> { const result = await fetchJobPosting(url); if (!result.open) throw new Error("Job posting is no longer open"); return result.content; }
