import { describe, it, expect } from "vitest";
import { solve, validateAssignments, greedy } from "../lib/optimizer";
import { fixture } from "./fixture";
describe("scheduling hard constraints", () => {
  it("enforces consecutive caps even when another overlapping slot interrupts sorting", () => {
    const s = fixture();
    s.config.settings.maxConsecutiveSlots = 2;
    s.config.settings.defaultMaxShiftsPerDay = 3;
    s.config.slots.push(
      {
        ...s.config.slots[1],
        id: "S3",
        start: "10:00",
        end: "11:00",
        startRow: 17,
      },
      {
        ...s.config.slots[1],
        id: "ALT",
        start: "08:30",
        end: "09:30",
        startRow: 19,
      },
    );
    s.responses[0].availableSlots.push("S3");
    expect(() =>
      validateAssignments(
        s,
        ["S1", "S2", "S3"].map((slotId) => ({
          id: "001",
          slotId,
          roleKey: "FLOWER",
          locked: true,
        })),
      ),
    ).toThrow(/consecutive/i);
  });
  it("prioritizes coverage over even the largest configured preferences", async () => {
    const s = fixture();
    s.config.settings.maxConsecutiveSlots = 0;
    s.config.settings.weights.pref1 = 1000;
    s.config.settings.weights.fairness = 1000;
    s.config.slots = s.config.slots.slice(0, 1);
    s.roster = s.roster.slice(0, 2);
    s.responses = s.responses.slice(0, 2);
    s.responses.forEach((r: any) => {
      r.availableSlots = ["S1"];
      r.preferences = ["ROVER"];
    });
    const a = await solve(s, []);
    expect(a.stats.filled).toBe(2);
    expect(a.assignments).toContainEqual({
      id: "001",
      slotId: "S1",
      roleKey: "FLOWER",
      locked: false,
    });
  });
  it("finds maximum coverage under consecutive caps and is deterministic", async () => {
    const s = fixture();
    const a = await solve(s, []),
      b = await solve(s, []);
    expect(a.assignments).toEqual(b.assignments);
    expect(a.stats.filled).toBe(3);
    expect(a.stats.needed).toBe(4);
    expect(a.method).toBe("optimal");
    expect(() => validateAssignments(s, a.assignments)).not.toThrow();
  });
  it("preserves pins and rejects unavailable, duplicate, ineligible and over-cap pins", async () => {
    const s = fixture();
    const lock = { id: "001", slotId: "S1", roleKey: "FLOWER", locked: true };
    expect((await solve(s, [lock])).assignments).toContainEqual(lock);
    await expect(solve(s, [lock, lock])).rejects.toThrow();
    await expect(solve(s, [{ ...lock, id: "002" }])).rejects.toThrow(
      /eligible/i,
    );
    s.responses[0].availableSlots = [];
    await expect(solve(s, [lock])).rejects.toThrow(/available/i);
  });
  it("reports gaps for zero supply and never invents availability", async () => {
    const s = fixture();
    s.responses = [];
    const a = await solve(s, []);
    expect(a.assignments).toEqual([]);
    expect(a.stats.coverage).toBe(0);
    expect(a.unfilled.reduce((n, r) => n + r.short, 0)).toBe(4);
  });
  it("rejects overlap even for different role and slot identifiers", () => {
    const s = fixture();
    s.config.settings.maxConsecutiveSlots = 0;
    s.config.slots[1].start = "08:30";
    expect(() =>
      validateAssignments(s, [
        { id: "001", slotId: "S1", roleKey: "FLOWER", locked: true },
        { id: "001", slotId: "S2", roleKey: "FLOWER", locked: true },
      ]),
    ).toThrow(/overlap/i);
  });
  it("obeys per-person daily and total caps", async () => {
    const s = fixture();
    s.config.settings.maxConsecutiveSlots = 0;
    s.roster[0].maxShiftsTotal = 0;
    s.roster[1].maxShiftsPerDay = 1;
    const a = await solve(s, []);
    expect(a.assignments.filter((x) => x.id === "001")).toHaveLength(0);
    expect(a.assignments.filter((x) => x.id === "002")).toHaveLength(1);
  });
  it("fallback preserves all constraints across random small instances", () => {
    for (let seed = 0; seed < 30; seed++) {
      const s = fixture();
      s.config.settings.maxConsecutiveSlots = seed % 3;
      s.responses.forEach(
        (r: any, i: number) =>
          (r.availableSlots = s.config.slots
            .filter((_: any, j: number) => (seed + i + j) % 3 !== 0)
            .map((x: any) => x.id)),
      );
      expect(() => validateAssignments(s, greedy(s, []))).not.toThrow();
    }
  });
  it("ignores removed slots from old responses with a visible warning", async () => {
    const s = fixture();
    s.responses[0].availableSlots.push("REMOVED");
    const a = await solve(s, []);
    expect(a.warnings.join(" ")).toMatch(/REMOVED/);
  });
});
