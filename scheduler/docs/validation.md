# Validation

Date: 2026-11-10 (Asia/Manila). Placeholder data only.

- Production Next.js build and strict TypeScript checks passed.
- Vitest: 22 tests passed. Config parsing/defaults/text IDs, response edits/journal projection, invalid config, writer overflow/clears/quoted tabs, MILP coverage versus preferences, caps, overlap, locks, determinism, no supply, removed slots, random fallback cases, signed/stale previews and origin checking.
- Chromium desktop: ID lookup, submit/edit/reload, keyboard toggle and mouse drag passed.
- Chromium emulated touch phone at 390×844: day switching, taps, ranking and submission passed; no horizontal document overflow.
- Admin: response list, heatmap, closure, solve, pin, rerun and publish passed. Published assignments matched the reviewed run.
- Browser page errors: zero.
- After two sample-member edits: 314/323 minimum positions filled (97%); 35% first-choice assignments; min/average/max loads 2/7.9/8. Optimal solve response observed in about two seconds. Sample results do not predict real event capacity.
- Desktop/member/mobile/admin screenshots visually inspected.

Service-account authentication, real staging publication, actual roster/eligibility/headcounts, physical phones and cloud deployment remain unverified without external configuration. Demo resets on restart. Platform rate limiting and single-organizer publication restrictions are documented in README.
