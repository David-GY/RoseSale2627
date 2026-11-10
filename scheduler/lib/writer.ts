import { type Snapshot, type Assignment } from "./domain";
export function renderShiftTabs(assignments: Assignment[], s: Snapshot) {
  const cells: { range: string; values: string[][] }[] = [],
    warnings: string[] = [];
  for (const slot of [...s.config.slots, ...(s.disabledSlots ?? [])])
    for (const role of s.config.roles) {
      const names = assignments
        .filter((a) => a.slotId === slot.id && a.roleKey === role.key)
        .map((a) => s.roster.find((p) => p.id === a.id)!)
        .sort((a, b) =>
          (
            a.committee +
            " " +
            a.first +
            " " +
            a.last +
            " " +
            a.id
          ).localeCompare(
            b.committee + " " + b.first + " " + b.last + " " + b.id,
          ),
        )
        .map((p) => "[" + p.committee + "] " + p.first + " " + p.last);
      const values = Array.from({ length: slot.rowCount }, (_, i) => [
        i === slot.rowCount - 1 ? names.slice(i).join("\n") : (names[i] ?? ""),
      ]);
      if (names.length > slot.rowCount)
        warnings.push(
          "Overflow at " +
            slot.id +
            "/" +
            role.key +
            ": extra names share the last cell.",
        );
      cells.push({
        range:
          "'" +
          slot.tab.replaceAll("'", "''") +
          "'!" +
          role.column +
          slot.startRow +
          ":" +
          role.column +
          (slot.startRow + slot.rowCount - 1),
        values,
      });
    }
  return { cells, warnings };
}
