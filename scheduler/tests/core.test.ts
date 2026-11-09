import { describe, it, expect } from "vitest";
import { validateSnapshot, validateResponse } from "../lib/domain";
import { renderShiftTabs } from "../lib/writer";
import { InMemoryRepository, latestResponses } from "../lib/repository";
import { fixture } from "./fixture";
describe("configuration and submissions", () => {
  it("preserves leading zero identifiers and permits empty availability", () => {
    const s = fixture();
    expect(validateSnapshot(s).roster[0].id).toBe("001");
    expect(
      validateResponse(s, "001", {
        availableSlots: [],
        preferences: ["FLOWER"],
        notes: "",
      }).availableSlots,
    ).toEqual([]);
  });
  it("rejects unknown committees, missing layout and min greater than max", () => {
    const s = fixture();
    s.roster[0].committee = "TYPO";
    expect(() => validateSnapshot(s)).toThrow(/committee/i);
    const t = fixture();
    t.config.roles[0].min = 5;
    expect(() => validateSnapshot(t)).toThrow(/minimum/i);
    const u = fixture();
    u.config.slots[0].rowCount = 0;
    expect(() => validateSnapshot(u)).toThrow();
  });
  it("rejects ineligible and repeated preferences and unknown slots", () => {
    const s = fixture();
    expect(() =>
      validateResponse(s, "002", {
        availableSlots: ["S1"],
        preferences: ["FLOWER"],
        notes: "",
      }),
    ).toThrow(/eligible/i);
    expect(() =>
      validateResponse(s, "001", {
        availableSlots: ["S1"],
        preferences: ["FLOWER", "FLOWER"],
        notes: "",
      }),
    ).toThrow(/duplicate/i);
    expect(() =>
      validateResponse(s, "001", {
        availableSlots: ["deleted"],
        preferences: ["FLOWER"],
        notes: "",
      }),
    ).toThrow(/slot/i);
  });
  it("projects the latest appended response and edits without losing identities", async () => {
    const s = fixture(),
      repo = new InMemoryRepository(s);
    await repo.upsertResponse({ ...s.responses[0], availableSlots: [] });
    expect((await repo.snapshot()).responses).toHaveLength(3);
    expect(
      (await repo.snapshot()).responses.find((r: any) => r.id === "001")
        ?.availableSlots,
    ).toEqual([]);
    expect(
      latestResponses([
        s.responses[0],
        { ...s.responses[0], notes: "latest" },
      ])[0].notes,
    ).toBe("latest");
  });
});
describe("sheet view writer", () => {
  it("clears unused mapped cells, escapes tab names and packs overflow on last row", () => {
    const s = fixture();
    s.config.slots[0].tab = "Day's Shifts";
    s.config.slots[0].rowCount = 1;
    const result = renderShiftTabs(
      [
        { id: "001", slotId: "S1", roleKey: "FLOWER", locked: false },
        { id: "003", slotId: "S1", roleKey: "FLOWER", locked: false },
      ],
      s,
    );
    expect(result.cells[0]).toEqual({
      range: "'Day''s Shifts'!C13:C13",
      values: [["[LOG] Ana Tan\n[LOG] Cara Yu"]],
    });
    expect(result.cells[1].values).toEqual([[""]]);
    expect(result.warnings).toHaveLength(1);
  });
});
