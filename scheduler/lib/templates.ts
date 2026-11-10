import type { Snapshot } from "./domain";
export function templateTables(
  s: Snapshot,
): Record<string, (string | number | boolean)[][]> {
  const c = s.config,
    settings = c.settings,
    w = settings.weights;
  const tables: Record<string, (string | number | boolean)[][]> = {
    Cfg_Settings: [
      ["Key", "Value"],
      ["EventName", settings.eventName],
      ["Venue", settings.venue],
      ["FormOpen", settings.formOpen],
      ["DefaultMaxShiftsPerDay", settings.defaultMaxShiftsPerDay],
      ["DefaultMaxShiftsTotal", settings.defaultMaxShiftsTotal],
      ["MaxConsecutiveSlots", settings.maxConsecutiveSlots],
      ["VerifyField", settings.verifyField],
      ["W_Pref1", w.pref1],
      ["W_Pref2", w.pref2],
      ["W_Pref3", w.pref3],
      ["W_Eligible", w.eligible],
      ["W_Fairness", w.fairness],
    ],
    Cfg_Committees: [
      ["Code", "Name", "Colour"],
      ...c.committees.map((x) => [x.code, x.name, x.colour]),
    ],
    Cfg_Roles: [
      [
        "RoleKey",
        "Label",
        "Icon",
        "AllowedCommittees",
        "MinPerSlot",
        "MaxPerSlot",
        "SheetColumn",
      ],
      ...c.roles.map((x) => [
        x.key,
        x.label,
        x.icon,
        x.allowed.join(","),
        x.min,
        x.max,
        x.column,
      ]),
    ],
    Cfg_Slots: [
      [
        "SlotId",
        "Date",
        "Start",
        "End",
        "Label",
        "Tab",
        "StartRow",
        "RowCount",
        "Enabled",
      ],
      ...c.slots.map((x) => [
        x.id,
        x.date,
        x.start,
        x.end,
        x.label,
        x.tab,
        x.startRow,
        x.rowCount,
        true,
      ]),
    ],
    Cfg_Overrides: [
      ["SlotId", "RoleKey", "MinPerSlot", "MaxPerSlot", "Note"],
      ...c.overrides.map((x) => [
        x.slotId,
        x.roleKey,
        x.min,
        x.max,
        x.note ?? "",
      ]),
    ],
    Roster: [
      [
        "ID",
        "First",
        "Last",
        "Committee",
        "Active",
        "MaxShiftsTotal",
        "MaxShiftsPerDay",
        "PIN",
      ],
      ...s.roster.map((x) => [
        x.id,
        x.first,
        x.last,
        x.committee,
        x.active,
        x.maxShiftsTotal ?? "",
        x.maxShiftsPerDay ?? "",
        "",
      ]),
    ],
    Responses: [
      [
        "ID",
        "SubmittedAt",
        "AvailableSlots",
        "Pref1",
        "Pref2",
        "Pref3",
        "Notes",
      ],
    ],
    Assignments: [
      [
        "RunId",
        "SlotId",
        "RoleKey",
        "ID",
        "Name",
        "Committee",
        "PrefRank",
        "Locked",
      ],
    ],
    Unfilled: [
      [
        "SlotId",
        "RoleKey",
        "Needed",
        "Filled",
        "Short",
        "EligibleButUnavailable",
        "Note",
      ],
    ],
  };
  for (const tab of new Set(c.slots.map((x) => x.tab))) {
    const slots = c.slots.filter((x) => x.tab === tab),
      rows = Array.from(
        { length: Math.max(...slots.map((x) => x.startRow + x.rowCount - 1)) },
        () => Array(11).fill(""),
      );
    rows[0][1] = tab;
    for (const role of c.roles)
      rows[1][role.column.charCodeAt(0) - 65] = role.label;
    for (const slot of slots)
      rows[slot.startRow - 1][1] = slot.start + " – " + slot.end;
    tables[tab] = rows;
  }
  return tables;
}
