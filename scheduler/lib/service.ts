import { type SheetRepository } from "./repository";
import {
  type Assignment,
  type Run,
  type Person,
  validateSnapshot,
  validateResponse,
  eligible,
} from "./domain";
import { solve, validateAssignments } from "./optimizer";
import { signToken, readToken, fingerprint } from "./auth";
import { renderShiftTabs } from "./writer";
export function identityStamp(
  s: Awaited<ReturnType<SheetRepository["snapshot"]>>,
  p: Person,
) {
  return fingerprint([
    s.config.settings.verifyField,
    p.id,
    p.last,
    p.pin,
    p.active,
  ]);
}
export class SchedulerService {
  constructor(readonly repo: SheetRepository) {}
  async lookup(id: string, verification: string) {
    const s = validateSnapshot(await this.repo.snapshot()),
      p = s.roster.find((x) => x.id === id && x.active),
      field = s.config.settings.verifyField;
    if (
      !p ||
      (field === "LAST_NAME" &&
        p.last.toLocaleLowerCase() !==
          verification.trim().toLocaleLowerCase()) ||
      (field === "PIN" && p.pin !== verification)
    )
      throw Error(
        "ID or verification did not match. Contact your PM if you need help.",
      );
    const { pin, ...person } = p;
    void pin;
    return {
      person,
      response: s.responses.find((x) => x.id === id) ?? null,
      roles: s.config.roles.filter((r) => eligible(p, r)),
      stamp: identityStamp(s, p),
    };
  }
  async submit(id: string, input: unknown) {
    const s = validateSnapshot(await this.repo.snapshot());
    if (!s.config.settings.formOpen)
      throw Error("The availability form is closed.");
    const r = validateResponse(s, id, input);
    await this.repo.upsertResponse(r);
    return r;
  }
  async preview(locks: Assignment[]) {
    const s = validateSnapshot(await this.repo.snapshot()),
      run = await solve(s, locks);
    run.warnings.push(...renderShiftTabs(run.assignments, s).warnings);
    return {
      run,
      token: signToken(
        { purpose: "preview", source: fingerprint(s), run },
        900,
      ),
    };
  }
  async publish(token: string) {
    const data = readToken(token, "preview"),
      s = validateSnapshot(await this.repo.snapshot());
    if (data.source !== fingerprint(s))
      throw Error(
        "Responses, config or published assignments changed. Run the scheduler again.",
      );
    if (s.config.settings.formOpen)
      throw Error("Close the member form before the final run and publish.");
    const run = data.run as Run;
    validateAssignments(s, run.assignments);
    await this.repo.publish(run, s);
    return { runId: run.runId, mode: this.repo.mode };
  }
  async dashboard() {
    const s = validateSnapshot(await this.repo.snapshot());
    return {
      ...s,
      roster: s.roster.map(({ pin, ...p }) => {
        void pin;
        return p;
      }),
      mode: this.repo.mode,
      heatmap: s.config.slots.flatMap((slot) =>
        s.config.roles.map((role) => ({
          slotId: slot.id,
          roleKey: role.key,
          available: s.roster.filter(
            (p) =>
              p.active &&
              eligible(p, role) &&
              s.responses
                .find((r) => r.id === p.id)
                ?.availableSlots.includes(slot.id),
          ).length,
        })),
      ),
    };
  }
}
