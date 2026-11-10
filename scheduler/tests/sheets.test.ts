import { it, expect } from "vitest";
import { parseTables } from "../lib/sheets";
import { templateTables } from "../lib/templates";
import { fixture } from "./fixture";
import { renderShiftTabs } from "../lib/writer";
function tables() {
  return Object.fromEntries(
    Object.entries(templateTables(fixture())).map(([k, rows]) => [
      k,
      rows.map((r) => r.map((v) => String(v))),
    ]),
  );
}
it("ignores unused roster rows containing only unchecked checkboxes", () => {
  const t = tables();
  t.Roster.push(["", "", "", "", "FALSE", "", "", "", "", ""]);
  t.Roster.push(["", "", "", "", "false", "", "", "", "", ""]);
  expect(parseTables(t).roster.map((p) => p.id)).toEqual(["001", "002", "003"]);
});
it("still rejects incomplete roster rows with member data or checked Active", () => {
  const t = tables();
  t.Roster.push(["", "Incomplete", "", "", "FALSE", "", "", ""]);
  expect(() => parseTables(t)).toThrow();
  const u = tables();
  u.Roster.push(["", "", "", "", "TRUE", "", "", ""]);
  expect(() => parseTables(u)).toThrow();
});
it("ignores reference notes and targets on cleared roster rows", () => {
  const t = tables();
  t.Roster[0].push("ReferenceMinShifts", "SetupNotes");
  t.Roster.push(["", "", "", "", "FALSE", "", "", "", "15", "Reference only"]);
  t.Roster.push(["", "", "", "", "", "", "", "", "", "Test only"]);
  expect(parseTables(t).roster.map((p) => p.id)).toEqual(["001", "002", "003"]);
});
it("excludes disabled shifts, their overrides and published pins but clears their output", () => {
  const t = tables();
  const enabled = t.Cfg_Slots[0].indexOf("Enabled");
  t.Cfg_Slots[1][enabled] = "FALSE";
  t.Cfg_Slots[2][enabled] = "TRUE";
  t.Cfg_Overrides.push(["S1", "FLOWER", "0", "0", "Closed"]);
  t.Assignments.push(["old", "S1", "FLOWER", "001", "A", "PM", "1", "TRUE"]);
  const s = parseTables(t);
  expect(s.config.slots.map((slot) => slot.id)).toEqual(["S2"]);
  expect(s.disabledSlots?.map((slot) => slot.id)).toEqual(["S1"]);
  expect(s.config.overrides).toEqual([]);
  expect(s.assignments).toEqual([]);
  const output = renderShiftTabs([], s);
  expect(output.cells).toHaveLength(4);
  expect(output.cells.every((c) => c.values.every((row) => row[0] === ""))).toBe(true);
});
it("accepts older slot tables without Enabled and rejects malformed toggles", () => {
  const t = tables();
  for (const row of t.Cfg_Slots) row.pop();
  expect(parseTables(t).config.slots).toHaveLength(2);
  const u = tables();
  u.Cfg_Slots[1][8] = "yes";
  expect(() => parseTables(u)).toThrow(/Enabled/);
  u.Cfg_Slots[1][8] = "FALSE";
  u.Cfg_Slots[2][8] = "FALSE";
  expect(() => parseTables(u)).toThrow(/Enable at least one shift/);
});
it("parses template configuration, preserves text IDs and applies default caps", () => {
  const s = parseTables(tables());
  expect(s.roster[0].id).toBe("001");
  expect(s.config.slots[0].start).toBe("08:00");
  expect(s.roster[0].maxShiftsTotal).toBeUndefined();
  expect(s.config.settings.defaultMaxShiftsTotal).toBe(3);
});
it("rejects ambiguous booleans and missing columns before scheduling", () => {
  const t = tables();
  t.Roster[1][4] = "yes";
  expect(() => parseTables(t)).toThrow(/TRUE/);
  const u = tables();
  u.Cfg_Slots[0][6] = "wrong";
  expect(() => parseTables(u)).toThrow(/StartRow/);
});
it("reads the last appended member submission, preserving other members", () => {
  const t = tables();
  t.Responses.push(
    ["001", "2026-11-10T08:00:00Z", "S1", "FLOWER", "", "", "first"],
    ["002", "2026-11-10T08:00:00Z", "S2", "ROVER", "", "", ""],
    ["001", "2026-11-10T08:00:01Z", "S2", "FLOWER", "", "", "updated"],
  );
  const s = parseTables(t);
  expect(s.responses).toHaveLength(2);
  expect(s.responses.find((r) => r.id === "001")?.notes).toBe("updated");
});
