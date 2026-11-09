# Rose Sale shift scheduler

Independent Next.js app alongside the existing Flask cashier. Cashier files and deployment are unchanged.

## Run locally

Requires Node.js 24 and pnpm 11.

```powershell
cd scheduler
pnpm install --frozen-lockfile
pnpm dev --port 3010
```

Open http://127.0.0.1:3010. Demo mode is the default; no Google account, keys or sheet are needed.

- Member: **1001** (Ana Tan), or any sample ID **1001–1048**.
- Organizer: http://127.0.0.1:3010/admin, passcode **rose-demo**.
- Names, 2027 dates, eligibility lists and headcounts are placeholders. Forty responses are preloaded.
- Responses, pins and published schedules live in this server process's memory and reset on restart. Use demo mode with one local process. It is unsuitable for a real multi-instance event deployment.

Production build and start:

```powershell
pnpm build
pnpm start --port 3010
```

## Member and organizer flow

Members identify themselves, select available slots, rank one to three eligible roles, and save. Empty availability is allowed. A committee with no eligible roles may submit without preferences. Mouse drag, touch taps/long-press drag, and keyboard Tab/Space are supported. Mobile shows one day at a time.

Organizers can inspect responses, copy missing names, view an eligible-availability heatmap and run the scheduler. Runs create previews without writes. Pin people in the preview and rerun to keep their shifts. Each run displays coverage, first-choice assignment percentage, load range and shortfalls; the previous run's summary remains for comparison.

For final publication: close the member form, run a fresh preview, review it, tick the confirmation, then publish. Changing pins, config, responses or the published schedule invalidates old previews. Direct edits in output shift tabs are overwritten on the next publish. Pins persist with published assignments, not when merely clicking a pin in an unpublished preview.

## Connect a staging Google Sheet

1. Make a **copy** of the event sheet. Enable the Google Sheets API in a Google Cloud project. Create a service account/key and share only this staging spreadsheet with its email as Editor.
2. Import each CSV under **sheet-templates/** into a tab matching its filename without .csv. Keep exact headers. Retain existing event day tabs; the provided FEB day CSVs are blank sample layouts only. Disable automatic conversion of text to numbers/dates/formulas during import. Format **ID, PIN, Date, Start and End columns as plain text**, especially leading-zero IDs.
3. Replace placeholders in Roster and Cfg_* tabs. Check actual eligibility and headcounts. Date uses YYYY-MM-DD; Start/End use 24-hour HH:mm on the same date. Split overnight shifts into separate dates. Blank member caps inherit defaults; zero means zero.
4. Every configured output tab must exist with enough rows/columns. StartRow is one-based; RowCount is cells per role in a slot block. Role columns start at C and may be multi-letter. All role-column/slot-block combinations are cleared and rewritten on publish. Other values and formatting stay. Overlapping output blocks and reserved tab names are rejected. Avoid vertically merged cells inside role output blocks.
5. Set VerifyField to **LAST_NAME** or **PIN** before using actual data. For PIN, fill the PIN column for every active member. Last-name verification is a lightweight check; use PINs if names are widely known. NONE is useful while testing placeholders.
6. Copy .env.example to .env.local and set:

```dotenv
SCHEDULER_MODE=sheets
SHEET_ID=your-spreadsheet-id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
ADMIN_PASSCODE=choose-a-unique-passcode-at-least-12-characters
SESSION_SECRET=choose-a-random-secret-at-least-32-characters
```

Never commit real keys. Generate secrets locally:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Missing credentials/admin secrets stop Sheets mode; it never silently switches to demo. Restart after changing environment variables.

7. Submit/edit three staging members on phone and desktop. Close the form, run, pin, rerun and publish. Compare Assignments/Unfilled and day tabs against the existing event format. **Real Google read/write has not been exercised without credentials and a staging sheet.**

Regenerate templates with **pnpm sheet:templates**. Real event changes belong in the sheet.

## Differences from the draft

- **Coverage is lexicographic.** First minimize shortfall, then fix that optimum and maximize preference scores minus load imbalance. Preferences cannot sacrifice proven maximum coverage. W_Pref1/2/3, W_Eligible and W_Fairness remain editable. W_Coverage is deliberately unnecessary. Each solve phase has a two-second limit. A completed coverage phase can return a feasible schedule if preference optimization times out. If coverage optimization fails or reaches its limit, an explicitly labeled scarcity-first heuristic provides a valid schedule without guaranteeing optimal coverage.
- **Response journal.** Sheets has no compare-and-set primitive. Responses append with RAW values; the latest appended row per ID is the current answer. This avoids read/find/update races without claiming transactional upserts. History stays in the sheet; no automatic compaction.
- **Atomic publish.** One spreadsheets.batchUpdate uses typed updateCells requests for Assignments, Unfilled and mapped day cells. Only userEnteredValue changes, preserving formats. Literal strings prevent names/notes becoming formulas. [Google documents batch atomicity](https://developers.google.com/workspace/sheets/api/guides/batch).
- **Signed previews.** Fifteen-minute previews include a fingerprint of source data, checked before publication. Cookies are signed, HTTP-only and SameSite Strict. Real Sheets-mode production cookies require HTTPS.
- The Google Auth Library signs Sheets REST requests instead of using the full googleapis package.
- Scoped CSS is used instead of Tailwind.
- Member lookup uses POST so IDs/verification do not appear in URLs.
- Heatmap counts are admin-only. Optional public heat, generated styled day tabs, reading hand edits back, notifications and Google sign-in remain outside v1.

Sorted model inputs, a fixed seed and single-threaded [HiGHS](https://github.com/lovasoa/highs-js) support repeatability. Identical inputs and solver versions that finish optimally are tested to match. Run IDs/timings vary. Limited-time feasible/heuristic modes do not promise optimality.

## Hosting and operational limits

Create a **separate Vercel project** from this repository, Root Directory **scheduler**, framework Next.js, build **pnpm build**. Set environment variables above. Keep the existing cashier project's settings intact. HiGHS is a server external with WASM assets included in function tracing. API maxDuration is 30 seconds; check your hosting plan against the real roster.

Use **one publishing organizer at a time**. Freeze direct spreadsheet/config edits and wait for in-flight submissions to finish after closing the form. The fingerprint check precedes the atomic write but is **not a distributed transaction**. Direct edits or another instance's late write can race that check. Use a transactional database if strict cross-request publication guarantees are required.

IP limiting is process-local. Configure platform-level rate limits for member lookup, admin login and responses before public use; serverless instances do not share local counters. Same-origin checks protect all mutations; signed admin sessions protect organizer routes. Public lookup returns only the verified member's details.

No service-account credentials/staging sheet were available during this build. No cloud project/deployment is configured automatically.

## Verify

```powershell
pnpm test
pnpm typecheck
pnpm build
# Start the local demo on port 3010, then:
python -m pip install playwright
python -m playwright install chromium
python tests/browser_smoke.py
```

Browser smoke modifies placeholder demo data. It covers member edit/reload, mouse/keyboard selection, touch/mobile submission, admin response/heatmap views, form closure, solve, pins/rerun and publish. It checks unauthorized writes, foreign-origin rejection and browser errors. Screenshots/results go to ignored test-results/. See docs/validation.md.
