# JobTrackr local-first roadmap

This branch is the working integration branch for the personal job application system.

## Target architecture

```text
Safari / LinkedIn
      |
      v
Safari Web Extension ----+
                         |
Chrome extension --------+--> Next.js local app (:3001)
                         |       |
Mobile capture ----------+       +--> SQLite / local files
                                 |
                                 +--> Gmail API (read-only OAuth)
                                 |
                                 +--> Local AI (OpenAI-compatible endpoint)
                                        |
                                        +--> MLX / oMLX
```

## Principles

1. Local-first: application data, CVs, Gmail tokens and AI processing stay on the Mac by default.
2. No external AI by default: Anthropic remains an optional provider for compatibility, but `AI_PROVIDER=local` is the default configuration.
3. No invented experience: CV tailoring and application answers may reorder or rephrase facts, but may not invent employers, dates, metrics, skills or achievements.
4. Every application records the exact CV version used.
5. Gmail remains read-only and is used to build an application timeline and suggest status changes.
6. Browser integration is an adapter: Safari and Chrome share the same capture/autofill API.

## Delivery phases

### Phase 1 — provider abstraction
- [x] Local OpenAI-compatible AI provider.
- [x] Anthropic retained as an explicit optional provider.
- [x] Local AI configuration documented in `.env.example`.
- [x] Gmail classification uses the selected provider.
- [x] Job capture uses the selected provider.

### Phase 2 — Safari
- [x] Add WXT Safari build target.
- [ ] Audit content-script and popup APIs against Safari MV2.
- [ ] Add Safari packaging instructions using Xcode's `safari-web-extension-packager`.
- [ ] Test LinkedIn capture and autofill in Safari.

### Phase 3 — master profile and CV vault
- [ ] Convert the existing profile into a structured master profile.
- [ ] Add profile families: Product, Process, Industrialisation, R&D/Solution Architect, Automation.
- [ ] Add CV templates and immutable CV versions.
- [ ] Link each application to the exact CV version used.

### Phase 4 — fit engine
- [ ] Parse job requirements into structured requirements.
- [ ] Calculate explainable fit dimensions.
- [ ] Show strengths, gaps and recommended profile.
- [ ] Store analysis so it is reproducible for each application.

### Phase 5 — CV tailoring
- [ ] Generate a tailored CV from the master profile and selected template.
- [ ] Preserve factual source-of-truth constraints.
- [ ] Export DOCX and PDF locally.
- [ ] Store generated version against the application.

### Phase 6 — Gmail intelligence
- [ ] Add deterministic pre-classification before LLM classification.
- [ ] Use confidence thresholds and review queue.
- [ ] Improve company/role matching.
- [ ] Add interview dates and actionable follow-ups.

### Phase 7 — security and operational hardening
- [ ] Tighten extension CORS.
- [ ] Review local token storage and file permissions.
- [ ] Add migrations instead of relying on schema creation only.
- [ ] Add unit/integration tests and CI.

## Current branch

`feature/local-ai-safari-cv`

The branch is intentionally kept separate from `main` while the architecture is being changed. Merge only after local typecheck/build and Safari packaging have been tested on the Mac.
