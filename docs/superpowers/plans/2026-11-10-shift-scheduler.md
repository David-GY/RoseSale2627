# Rose Sale Shift Scheduler Implementation Plan

> **Execution:** Follow the user-authorized execution method with available tools. Steps use checkbox syntax for tracking.

**Goal:** Build and run the member availability and admin scheduling app in the existing GitHub repository.

**Architecture:** Add an independent `scheduler/` Next.js app alongside the cashier. Repository interface separates memory demo and Google Sheets. Server-side HiGHS maximizes coverage first, then preferences and fairness. Signed previews separate solving from publishing.

**Tech Stack:** Next.js, TypeScript, React, zod, HiGHS WASM, Google Auth Library, Vitest, Playwright.

**Spec:** `docs/shift-scheduler-design.txt` (user supplied).

## Global Constraints

- All event-specific data comes from config/roster; sample data is explicitly placeholder.
- One role per person per slot; hard availability, eligibility, daily/total/consecutive caps and locks.
- Run and publish are separate; render only configured output cells and preserve formatting.
- Never upload credentials or overwrite cashier files.
- Demo data lives in memory and resets when the server restarts; sheets mode fails closed without secrets.

## Review Focus

- Overlapping slots and invalid pins must fail validation, including in fallback.
- Stale previews must be rejected after submissions/config/published locks change.
- Unknown slots in old responses must be visible as warnings and excluded from solving.
- Sheet writes must use literal strings, correct mapped ranges and clear old names.
- Duplicate concurrent responses must retain both submissions with latest appended row winning.

### Task 1: Domain, config and storage

Files: `scheduler/lib/domain.ts`, `demo.ts`, `repository.ts`, `sheets.ts`, `writer.ts`, `tests/core.test.ts`.
- [x] Write tests for invalid references, leading-zero IDs, caps, empty availability and writer overflow/clears; run red.
- [x] Implement typed schemas, config parsing, memory repository and Sheets journal adapter.
- [x] Generate CSV templates for all config/source tabs. Verify tests pass.

### Task 2: Assignment engine

Files: `scheduler/lib/optimizer.ts`, `tests/optimizer.test.ts`.
Interface: `solve(snapshot, locks)` returns assignments, shortfalls, stats, method and warnings.
- [x] Write hand-checkable tests for coverage, caps, overlap, locks, gaps, scarcity, determinism and fallback; run red.
- [x] Build filtered MILP variables and constraints; solve coverage then preference/fairness within fixed optimum coverage.
- [x] Independently validate every result. Greedy fallback uses the same hard constraints. Verify randomized cases.

### Task 3: API and member/admin UI

Files: `scheduler/app/`, `scheduler/components/`, `scheduler/lib/auth.ts`, `service.ts`, `tests/api.test.ts`.
- [x] Test verification/session checks, closed form, forged/stale publish, submission edits and full solve/publish flow.
- [x] Add signed member/admin cookies, same-origin mutations, bounded requests and IP throttling.
- [x] Build accessible member drag grid, role choices, admin responses/heatmap/preview/pins/settings and explicit publish confirmation.
- [x] Verify desktop/mobile submit/edit and administrator run/publish in a real browser.

### Task 4: Run and deliver

- [x] Build production Next.js app, run tests/typecheck, inspect desktop/mobile screenshots.
- [x] Start local server, document demo credentials and sheet setup limitations.
- [x] Upload only scheduler source, templates, lockfile and docs to a feature branch in GitHub; create reviewable PR.
