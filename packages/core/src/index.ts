import { z } from "zod";

// ---------------------------------------------------------------------------
// Job statuses
// ---------------------------------------------------------------------------

export const JOB_STATUSES = [
  "Saved",
  "Applied",
  "Assessment",
  "Interview",
  "Offer",
  "Rejected",
  "Withdrawn",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];
export const TERMINAL_STATUSES: JobStatus[] = ["Rejected", "Withdrawn"];
export const STATUS_RANK: Record<JobStatus, number> = {
  Saved: 0,
  Applied: 1,
  Assessment: 2,
  Interview: 3,
  Offer: 4,
  Rejected: 5,
  Withdrawn: 5,
};

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

export const jobSchema = z.object({
  id: z.number(), company: z.string(), jobTitle: z.string(), location: z.string().nullable(),
  sourceUrl: z.string().nullable(), salaryRange: z.string().nullable(), jobType: z.string().nullable(),
  experience: z.string().nullable(), skills: z.string().nullable(), emailDomain: z.string().nullable(),
  description: z.string().nullable(), notes: z.string().nullable(), status: z.string(), dateAdded: z.string(),
  dateApplied: z.string().nullable(), cvVersionId: z.number().nullable().optional(),
  createdAt: z.string(), updatedAt: z.string(),
});
export type Job = z.infer<typeof jobSchema>;
export const newJobSchema = jobSchema.omit({ id: true, createdAt: true, updatedAt: true }).partial().extend({
  company: z.string().min(1), jobTitle: z.string().min(1),
});
export type NewJob = z.infer<typeof newJobSchema>;

// ---------------------------------------------------------------------------
// AI job parsing
// ---------------------------------------------------------------------------

export const parsedJobSchema = z.object({
  company: z.string(), jobTitle: z.string(), location: z.string().nullable(), salaryRange: z.string().nullable(),
  jobType: z.string().nullable(), experience: z.string().nullable(), skills: z.string().nullable(),
  emailDomain: z.string().nullable(), description: z.string().nullable(),
});
export type ParsedJob = z.infer<typeof parsedJobSchema>;
export const PARSED_JOB_JSON_SCHEMA = {
  type: "object", properties: {
    company: { type: "string", description: "Company name" }, jobTitle: { type: "string", description: "Job title / position" },
    location: { type: ["string", "null"], description: "Location, including Remote/Hybrid if stated" },
    salaryRange: { type: ["string", "null"], description: "Salary or compensation range if stated" },
    jobType: { type: ["string", "null"], description: "Full-time, part-time, contract, internship, etc." },
    experience: { type: ["string", "null"], description: "Experience level or years required" },
    skills: { type: ["string", "null"], description: "Comma-separated key skills and technologies" },
    emailDomain: { type: ["string", "null"], description: "Company email domain guessed from the posting (e.g. acme.com), null if unknown" },
    description: { type: ["string", "null"], description: "2-3 sentence summary of the role" },
  }, required: ["company","jobTitle","location","salaryRange","jobType","experience","skills","emailDomain","description"], additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// Email classification
// ---------------------------------------------------------------------------

export const EMAIL_CATEGORIES = ["application_confirmation","assessment_invite","interview_invite","offer","rejection","recruiter_outreach","other_job_related","not_job_related"] as const;
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];
export const CATEGORY_TO_STATUS: Partial<Record<EmailCategory, JobStatus>> = {
  application_confirmation: "Applied", assessment_invite: "Assessment", interview_invite: "Interview", offer: "Offer", rejection: "Rejected",
};
export const classifiedEmailSchema = z.object({
  category: z.enum(EMAIL_CATEGORIES), company: z.string().nullable(), jobTitle: z.string().nullable(), confidence: z.number().min(0).max(1), summary: z.string(),
});
export type ClassifiedEmail = z.infer<typeof classifiedEmailSchema>;
export const CLASSIFIED_EMAIL_JSON_SCHEMA = {
  type: "object", properties: {
    category: { type: "string", enum: [...EMAIL_CATEGORIES], description: "The kind of hiring email this is" },
    company: { type: ["string", "null"], description: "The hiring company this email is about, null if unclear" },
    jobTitle: { type: ["string", "null"], description: "The role this email is about, null if unclear" },
    confidence: { type: "number", description: "Confidence in the category, 0 to 1" },
    summary: { type: "string", description: "One sentence summary of the email" },
  }, required: ["category","company","jobTitle","confidence","summary"], additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// Autofill / profile
// ---------------------------------------------------------------------------

export const profileSchema = z.object({
  firstName: z.string().default(""), lastName: z.string().default(""), email: z.string().default(""), phone: z.string().default(""),
  location: z.string().default(""), linkedin: z.string().default(""), github: z.string().default(""), portfolio: z.string().default(""),
  currentCompany: z.string().default(""), currentTitle: z.string().default(""), yearsOfExperience: z.string().default(""),
  workAuthorization: z.string().default(""), requiresSponsorship: z.string().default(""), desiredSalary: z.string().default(""), noticePeriod: z.string().default(""),
  coverLetterTemplate: z.string().default(""), background: z.string().default(""),
  customAnswers: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
});
export type Profile = z.infer<typeof profileSchema>;
export const EMPTY_PROFILE: Profile = profileSchema.parse({});

// ---------------------------------------------------------------------------
// CV vault + fit score
// ---------------------------------------------------------------------------

export const CV_FAMILIES = ["Product Engineer","Process Engineer","Industrialisation Engineer","R&D / Solution Architect","Automation Engineer","General Engineering"] as const;
export type CvFamily = (typeof CV_FAMILIES)[number];
export const cvVersionSchema = z.object({
  id: z.number(), name: z.string(), family: z.enum(CV_FAMILIES), summary: z.string(), content: z.string(),
  fileName: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(), active: z.number(),
});
export type CvVersion = z.infer<typeof cvVersionSchema>;
export const fitScoreSchema = z.object({
  score: z.number().min(0).max(100), family: z.enum(CV_FAMILIES),
  experience: z.number(), technical: z.number(), industry: z.number(), education: z.number(), location: z.number(), seniority: z.number(),
  strengths: z.array(z.string()), partial: z.array(z.string()), gaps: z.array(z.string()), rationale: z.array(z.string()),
});
export type FitScore = z.infer<typeof fitScoreSchema>;

// ---------------------------------------------------------------------------
// Email record
// ---------------------------------------------------------------------------

export interface EmailRecord {
  id: number; gmailId: string; threadId: string | null; jobId: number | null; fromAddress: string; subject: string; snippet: string;
  receivedAt: string; category: EmailCategory; confidence: number; summary: string; suggestedStatus: JobStatus | null; statusApplied: number; createdAt: string;
}

export interface CapturedPage { url: string; title: string; jsonLd: Record<string, unknown> | null; pageText: string; }

// ---------------------------------------------------------------------------
// Legacy import
// ---------------------------------------------------------------------------

export const legacyJobSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(), company: z.string().optional(), jobTitle: z.string().optional(), location: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(), salaryRange: z.string().nullable().optional(), jobType: z.string().nullable().optional(), experience: z.string().nullable().optional(),
  skills: z.string().nullable().optional(), emailDomain: z.string().nullable().optional(), description: z.string().nullable().optional(), dateAdded: z.string().optional(), status: z.string().optional(),
}).passthrough();
export const legacyBackupSchema = z.object({ jobs: z.array(legacyJobSchema), version: z.string().optional(), exportDate: z.string().optional() });
export type LegacyBackup = z.infer<typeof legacyBackupSchema>;
