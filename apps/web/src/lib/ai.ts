import Anthropic from "@anthropic-ai/sdk";
import {
  CLASSIFIED_EMAIL_JSON_SCHEMA,
  PARSED_JOB_JSON_SCHEMA,
  classifiedEmailSchema,
  parsedJobSchema,
  type ClassifiedEmail,
  type ParsedJob,
  type Profile,
} from "@jobtrackr/core";

type AiProvider = "local" | "anthropic";

const PROVIDER = (process.env.AI_PROVIDER || "local") as AiProvider;
const LOCAL_BASE_URL = (process.env.AI_BASE_URL || "http://127.0.0.1:8080/v1").replace(/\/$/, "");
const LOCAL_MODEL = process.env.AI_MODEL || "qwen3-8b";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

export function aiAvailable(): boolean {
  if (PROVIDER === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY);
  return Boolean(LOCAL_BASE_URL && LOCAL_MODEL);
}

function anthropicClient(): Anthropic {
  return new Anthropic();
}

function extractJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("AI returned invalid JSON");
  }
}

async function localRequest(
  system: string,
  user: string,
  options?: { schema?: object; maxTokens?: number; json?: boolean },
): Promise<string> {
  const body: Record<string, unknown> = {
    model: LOCAL_MODEL,
    temperature: 0.1,
    max_tokens: options?.maxTokens ?? 1500,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };

  if (options?.schema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: "jobtrackr_response", strict: true, schema: options.schema },
    };
  } else if (options?.json) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(`${LOCAL_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Local AI request failed (HTTP ${response.status})${detail ? `: ${detail.slice(0, 500)}` : ""}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Local AI returned no content");
  return content;
}

async function structuredRequest(
  system: string,
  user: string,
  schema: object,
  maxTokens = 1500,
): Promise<unknown> {
  if (PROVIDER === "anthropic") {
    const response = await anthropicClient().messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
      ...({ output_config: { format: { type: "json_schema", schema } } } as Record<string, unknown>),
    } as Anthropic.MessageCreateParamsNonStreaming);

    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("AI returned no text content");
    return JSON.parse(text.text);
  }

  try {
    return extractJson(await localRequest(system, user, { schema, maxTokens }));
  } catch (error) {
    // Some OpenAI-compatible local servers do not implement JSON Schema response_format.
    // Retry once using JSON mode so the provider remains portable across MLX frontends.
    if (error instanceof Error && /HTTP 400|HTTP 404|HTTP 422/.test(error.message)) {
      return extractJson(await localRequest(
        `${system}\nReturn ONLY a single valid JSON object. No markdown or commentary.`,
        user,
        { json: true, maxTokens },
      ));
    }
    throw error;
  }
}

async function textRequest(system: string, user: string, maxTokens = 700): Promise<string> {
  if (PROVIDER === "anthropic") {
    const response = await anthropicClient().messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("AI returned no text content");
    return text.text.trim();
  }
  return (await localRequest(system, user, { maxTokens })).trim();
}

export async function parseJobPosting(content: string): Promise<ParsedJob> {
  const raw = await structuredRequest(
    [
      "You extract structured data from job postings and free-form descriptions of job applications.",
      "Extract only what is stated or can be confidently inferred; use null for unknown fields.",
      "For emailDomain, infer the company's likely email domain from its website or name (e.g. 'acme.com'); null if you cannot infer it confidently.",
    ].join(" "),
    `Extract the job application details from the following content:\n\n${content.slice(0, 24000)}`,
    PARSED_JOB_JSON_SCHEMA,
  );
  return parsedJobSchema.parse(raw);
}

export async function draftAnswer(input: {
  question: string;
  profile: Profile;
  job?: {
    company: string;
    jobTitle: string;
    description: string | null;
    skills: string | null;
  } | null;
}): Promise<string> {
  const { question, profile, job } = input;
  const facts = [
    profile.currentTitle && profile.currentCompany
      ? `Current role: ${profile.currentTitle} at ${profile.currentCompany}`
      : "",
    profile.yearsOfExperience ? `Years of experience: ${profile.yearsOfExperience}` : "",
    profile.location ? `Location: ${profile.location}` : "",
    profile.background ? `Background:\n${profile.background.slice(0, 8000)}` : "",
    profile.coverLetterTemplate
      ? `Cover letter template (voice/tone reference):\n${profile.coverLetterTemplate.slice(0, 2000)}`
      : "",
    profile.customAnswers.length
      ? `Existing stock answers:\n${profile.customAnswers
          .filter((qa) => qa.question && qa.answer)
          .map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await textRequest(
    [
      "You draft job-application answers in the applicant's first-person voice.",
      "Use ONLY the facts provided — never invent numbers, employers, dates, or achievements.",
      "If a fact the answer needs is missing, write a [bracketed placeholder] the applicant fills in.",
      "Confident and specific, not sycophantic. No em-dashes. 80-160 words unless the question clearly wants a one-liner.",
      "Return only the answer text — no preamble, no quotes.",
    ].join(" "),
    [
      `Application question: ${question}`,
      job
        ? `The application is for: ${job.jobTitle} at ${job.company}.` +
          (job.description ? `\nAbout the role: ${job.description.slice(0, 2000)}` : "") +
          (job.skills ? `\nSkills they want: ${job.skills}` : "")
        : "No specific company context — write a reusable stock answer.",
      `Applicant facts:\n${facts || "(profile is empty — use placeholders)"}`,
    ].join("\n\n"),
  );

  return response.replace(/\s*—\s*/g, ", ");
}

export async function classifyEmail(input: {
  from: string;
  subject: string;
  body: string;
  trackedCompanies: string[];
}): Promise<ClassifiedEmail> {
  const raw = await structuredRequest(
    [
      "You classify emails for a job-application tracker.",
      "Decide whether the email relates to the user's job search and, if so, what kind of hiring email it is.",
      "application_confirmation = 'we received your application'. assessment_invite = coding test / take-home. interview_invite = scheduling or confirming interviews. offer = a job offer. rejection = the candidacy is over. recruiter_outreach = a recruiter contacting the user about a new role. other_job_related = job-related but none of the above (newsletters, job alerts, status unchanged). not_job_related = everything else.",
      "Marketing blasts from job boards (Indeed/LinkedIn digests) are other_job_related with low confidence, never rejections or confirmations.",
    ].join(" "),
    [
      `The user is tracking applications at these companies: ${input.trackedCompanies.slice(0, 100).join(", ") || "(none yet)"}.`,
      `From: ${input.from}`,
      `Subject: ${input.subject}`,
      `Body:\n${input.body.slice(0, 6000)}`,
    ].join("\n\n"),
    CLASSIFIED_EMAIL_JSON_SCHEMA,
    800,
  );
  return classifiedEmailSchema.parse(raw);
}
