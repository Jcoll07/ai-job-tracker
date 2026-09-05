import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

let db: Database.Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company TEXT NOT NULL, jobTitle TEXT NOT NULL, location TEXT, sourceUrl TEXT,
  salaryRange TEXT, jobType TEXT, experience TEXT, skills TEXT, emailDomain TEXT, description TEXT, notes TEXT,
  status TEXT NOT NULL DEFAULT 'Applied', dateAdded TEXT NOT NULL, dateApplied TEXT, createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, jobId INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE, fromStatus TEXT, toStatus TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual', note TEXT, createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT, gmailId TEXT NOT NULL UNIQUE, threadId TEXT, jobId INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  fromAddress TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', snippet TEXT NOT NULL DEFAULT '', receivedAt TEXT NOT NULL, category TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0, summary TEXT NOT NULL DEFAULT '', suggestedStatus TEXT, statusApplied INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cv_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, family TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
  fileName TEXT, createdAt TEXT NOT NULL DEFAULT (datetime('now')), updatedAt TEXT NOT NULL DEFAULT (datetime('now')), active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_emails_job ON emails(jobId);
CREATE INDEX IF NOT EXISTS idx_history_job ON status_history(jobId);
CREATE INDEX IF NOT EXISTS idx_cv_family ON cv_versions(family);
`;

const MASTER_BACKGROUND = `MASTER CAREER PROFILE — FACTUAL SOURCE FOR CV GENERATION

Identity
Applicant identity and contact details are stored only in the local profile. This repository intentionally contains no personal contact information.

Professional positioning
Naval Engineer specialized in marine robotics with 3+ years of technical experience in hull-cleaning ROV/AUV systems, field service, commissioning, R&D, product validation and continuous improvement. Strong at connecting field support with product improvement through root-cause analysis, data quality, KPIs, technical specifications and cross-functional coordination. Comfortable working autonomously and in international remote environments.

Current role — R&D Solution Architect, Jotun — February 2026 to present
- Technical ownership and coordination across Operations, external partners and R&D in a remote environment.
- Product management and KPI definition, including design and implementation of the Product Stability KPI in the HSS portal and UX improvements to reduce subjectivity in performance evaluations.
- Strategic technical validation: specifications and validation work for cruise, bulk carrier and gas carrier segments, with engineering feasibility reports for decision-making.
- Root-cause analysis of complex operational incidents and conversion of field data into continuous-improvement recommendations for hardware, software and procedures/PNTs.
- Data quality and robotic-support activities, including remote fleet connectivity and web-portal incident resolution.
- Regular technical meetings, IP discussions, installation documentation, shipyard risk assessments, connectivity/SIM-provider coordination, satellite-internet alternatives and VPN investigations.

Previous/current role — Service Engineer / Product Engineer, Kongsberg Discovery — July 2023 to present
- Installation, commissioning, repair, maintenance and operation of HullSkater/SSR hull-cleaning systems on merchant vessels.
- Work across container ships, car carriers, bulk carriers and passenger vessels.
- Autonomous field work: approximately 80% independently and 20% with colleagues.
- International interventions across Europe, Asia and Latin America; approximately 120 travel days and more than 20 countries visited.
- Installed approximately 4–5 systems and recovered more than 10 systems; additional field deployment experience is documented in the source CV/history.
- Diagnosis of electrical, electronic, mechanical and communications faults in mechatronic/robotic systems.
- Direct technical coordination with customers, captains, pilots and port agents during operations.
- Technical reporting and full intervention-cycle management through CRM and internal systems.
- Customer technical training and knowledge transfer.

Technical skills
Root-cause analysis (RCA); technical validation; data-quality analysis; fault diagnosis; marine robotics; AUV/ROV; mechatronics; telemetry; satellite/4G connectivity; VPN; product requirements; KPI design; continuous improvement; Lean; PDCA; technical documentation; risk assessment; commissioning; field service; stakeholder management.

Software / tools
Python; C++; MATLAB; AutoCAD; Rhinoceros V5; Rhino CAD; SketchUp; Maxsurf; FluidSIM H&P; TIA Portal; CODESYS; Excel / advanced Excel; RCommander; SQLite / DB; Teamcenter; Microsoft Dynamics 365 CRM; Microsoft Teams; SharePoint; AX; Expensya; Linux-based proprietary tools; HSS Portal; Kognifai; SSP; InControl; IoT and robotic telemetry portals; ticketing and incident-tracking systems.

Education
Degree in Naval Architecture and Marine Systems Engineering — Universidad Politécnica de Cartagena (UPCT). Degree average previously stated as 6.7/10.

Languages
Spanish — native. English — C1 / advanced professional. Chinese — basic.

Courses / credentials
Six Sigma; work-at-height prevention; electrical safety/training; maritime card; internal technical courses. Driving licence B.

Academic / engineering project — AUV pipeline inspection
Design of an AUV for BBL Pipeline inspection in the North Sea, maximum depth 50 m. Approximate project specifications: 320.8 kg, 3.92 m length, 0.52 m diameter, 18.2 h autonomy, L/B 7.49. Mission: inspection and detection of leaks/damage on assumed non-rocky seabed. Navigation: Exail Nucleus 1000 INS+DVL; USBL: Sonardyne AvTrak 6 Nano; GNSS: u-blox M9N or Trimble BX992; multibeam sonar: Kongsberg M3; optical-acoustic sensor: Impact Subsea ISS360HD; camera: YellowFin AR210; antenna: Taoglas MA450 Storm; battery: Kraken Robotics SeaPower, 15.6 kWh, 48 V, 6000 m depth-rated, Li-ion NMC. Hydrodynamics included modified Albacore forms, NACA 0012 rudders/sail and Hoerner resistance method. Structural design referenced ABS Underwater Vehicles requirements and Aluminium 5083-H116/H321. Single ducted thruster/monopropulsion was selected for efficiency. Tools included Rhino CAD, MATLAB and engineering calculations; no CFD was intended for the final project. Reserve buoyancy target: 3% positive.

Career target
Preferred functions: Product Engineering, Process Engineering, Industrialisation Engineering, Automation, Quality, Consultancy and R&D / Solution Architecture. Target compensation previously stated as above €35k gross/year. Remote-first preference.

CV truth rules
This source is factual material. Future CV generation may select, reorder, shorten and rewrite these facts for relevance, but must never invent employers, dates, technologies, metrics, projects, responsibilities or achievements. If a metric is approximate, preserve the approximate qualifier. Tailored CVs must remain truthful and reviewable.`;

const CV_STYLE_GUIDE = `CV GENERATION STYLE GUIDE — BASED ON THE USER-PROVIDED ONE-PAGE CV

- One page whenever reasonably possible.
- Clean, professional engineering layout with strong information hierarchy and high ATS readability.
- Header: full name, professional headline, location/work mode, email/phone and relevant profile links when available.
- Sections in this general order: PROFESSIONAL PROFILE / SUMMARY; PROFESSIONAL EXPERIENCE; KEY COMPETENCIES; EDUCATION AND TRAINING; LANGUAGES; TECHNICAL TOOLS when space permits.
- Experience uses role — company — dates followed by concise achievement-oriented bullets.
- Prioritize technical ownership, measurable outcomes, validation, RCA, product/process improvement, robotics/mechatronics and international stakeholder coordination when relevant to the target role.
- Use direct professional English for English CVs. Keep terminology technically precise.
- Avoid decorative language, generic soft-skill filler and keyword stuffing.
- Never fabricate or upgrade a responsibility into a leadership claim unless supported by the source.
- Adapt the headline, summary, competency ordering and bullets to the target job while preserving truthful chronology and facts.
- The supplied CV is the visual/content model to emulate for future generated CVs; the master profile is the factual source of truth.`;

function hasColumn(database: Database.Database, table: string, column: string): boolean {
  return (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((c) => c.name === column);
}

function seedCareerData(database: Database.Database): void {
  const profileRow = database.prepare("SELECT value FROM settings WHERE key = 'profile'").get() as { value: string } | undefined;
  if (!profileRow) {
    const profile = {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      location: "Spain — Remote / Hybrid",
      linkedin: "",
      github: "",
      portfolio: "",
      currentCompany: "Jotun",
      currentTitle: "R&D Solution Architect",
      yearsOfExperience: "3+ years",
      workAuthorization: "Spanish / EU citizen",
      requiresSponsorship: "No",
      desiredSalary: "> €35,000 gross/year",
      noticePeriod: "",
      coverLetterTemplate: "",
      background: MASTER_BACKGROUND,
      customAnswers: [],
    };
    database.prepare("INSERT INTO settings(key,value) VALUES('profile',?)").run(JSON.stringify(profile));
  }

  const guideRow = database.prepare("SELECT value FROM settings WHERE key = 'cvStyleGuide'").get() as { value: string } | undefined;
  if (!guideRow) database.prepare("INSERT INTO settings(key,value) VALUES('cvStyleGuide',?)").run(JSON.stringify(CV_STYLE_GUIDE));

  const masterRow = database.prepare("SELECT id FROM cv_versions WHERE name = 'MASTER — Career Source'").get() as { id: number } | undefined;
  if (!masterRow) {
    const now = new Date().toISOString();
    database.prepare("INSERT INTO cv_versions(name,family,summary,content,fileName,createdAt,updatedAt,active) VALUES(?,?,?,?,?,?,?,1)").run(
      "MASTER — Career Source",
      "General Engineering",
      "Factual career source and CV-generation master. Do not send as-is; use it to build targeted one-page CVs.",
      MASTER_BACKGROUND,
      null,
      now,
      now,
    );
  }
}

export function getDb(): Database.Database {
  if (db) return db;
  const file = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "jobtracker.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  if (!hasColumn(db, "jobs", "cvVersionId")) db.exec("ALTER TABLE jobs ADD COLUMN cvVersionId INTEGER");
  seedCareerData(db);
  return db;
}

export function getSetting<T>(key: string): T | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.value) as T; } catch { return null; }
}
export function setSetting(key: string, value: unknown): void {
  getDb().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));
}
export function deleteSetting(key: string): void { getDb().prepare("DELETE FROM settings WHERE key = ?").run(key); }
