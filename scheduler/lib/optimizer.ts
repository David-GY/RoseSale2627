import loadHighs from "highs";
import { randomUUID } from "node:crypto";
import {
  type Snapshot,
  type Assignment,
  type Run,
  eligible,
  limits,
  validateSnapshot,
} from "./domain";
let engine: ReturnType<typeof loadHighs> | undefined;
type Variable = {
  name: string;
  id: string;
  slotId: string;
  roleKey: string;
  score: number;
};
function overlaps(s: Snapshot, a: string, b: string) {
  const x = s.config.slots.find((v) => v.id === a)!,
    y = s.config.slots.find((v) => v.id === b)!;
  return x.date === y.date && x.start < y.end && y.start < x.end;
}
function windows(s: Snapshot) {
  const k = s.config.settings.maxConsecutiveSlots;
  if (!k) return [];
  const sorted = [...s.config.slots].sort((a, b) =>
    (a.date + a.start + a.id).localeCompare(b.date + b.start + b.id),
  );
  const result: string[][] = [];
  function visit(path: typeof sorted) {
    if (path.length === k + 1) {
      result.push(path.map((s) => s.id));
      if (result.length > 10000)
        throw Error(
          "Too many alternate consecutive slots. Simplify overlapping slot configuration.",
        );
      return;
    }
    const last = path.at(-1)!;
    for (const next of sorted)
      if (next.date === last.date && next.start === last.end)
        visit([...path, next]);
  }
  for (const slot of sorted) visit([slot]);
  return result;
}
export function validateAssignments(s: Snapshot, rows: Assignment[]) {
  const seen = new Set<string>();
  for (const a of rows) {
    const p = s.roster.find((x) => x.id === a.id && x.active),
      response = s.responses.find((x) => x.id === a.id),
      role = s.config.roles.find((x) => x.key === a.roleKey),
      slot = s.config.slots.find((x) => x.id === a.slotId);
    if (!p || !response || !slot || !response.availableSlots.includes(a.slotId))
      throw Error(
        "Pinned or assigned member is not available: " + a.id + "/" + a.slotId,
      );
    if (!role || !eligible(p, role))
      throw Error("Member is not eligible for " + a.roleKey);
    const token = a.id + "|" + a.slotId;
    if (seen.has(token)) throw Error("Duplicate assignment in slot: " + token);
    seen.add(token);
  }
  for (const p of s.roster) {
    const rowsP = rows.filter((a) => a.id === p.id),
      settings = s.config.settings;
    if (rowsP.length > (p.maxShiftsTotal ?? settings.defaultMaxShiftsTotal))
      throw Error("Total shift cap exceeded for " + p.id);
    for (const day of new Set(s.config.slots.map((x) => x.date)))
      if (
        rowsP.filter(
          (a) => s.config.slots.find((x) => x.id === a.slotId)!.date === day,
        ).length > (p.maxShiftsPerDay ?? settings.defaultMaxShiftsPerDay)
      )
        throw Error("Daily shift cap exceeded for " + p.id);
    for (let i = 0; i < rowsP.length; i++)
      for (let j = i + 1; j < rowsP.length; j++)
        if (overlaps(s, rowsP[i].slotId, rowsP[j].slotId))
          throw Error("Overlapping shifts for " + p.id);
    for (const w of windows(s))
      if (
        rowsP.filter((a) => w.includes(a.slotId)).length >
        settings.maxConsecutiveSlots
      )
        throw Error("Consecutive shift cap exceeded for " + p.id);
  }
  for (const slot of s.config.slots)
    for (const role of s.config.roles)
      if (
        rows.filter((a) => a.slotId === slot.id && a.roleKey === role.key)
          .length > limits(s.config, slot.id, role.key).max
      )
        throw Error("Role capacity exceeded: " + slot.id + "/" + role.key);
}
function variables(s: Snapshot): Variable[] {
  const result: Variable[] = [],
    w = s.config.settings.weights;
  for (const p of [...s.roster].sort((a, b) => a.id.localeCompare(b.id))) {
    const response = s.responses.find((r) => r.id === p.id);
    if (!p.active || !response) continue;
    for (const slot of [...s.config.slots].sort((a, b) =>
      a.id.localeCompare(b.id),
    )) {
      if (!response.availableSlots.includes(slot.id)) continue;
      for (const role of [...s.config.roles].sort((a, b) =>
        a.key.localeCompare(b.key),
      ))
        if (eligible(p, role) && limits(s.config, slot.id, role.key).max > 0) {
          const rank = response.preferences.indexOf(role.key);
          result.push({
            name: "x" + result.length,
            id: p.id,
            slotId: slot.id,
            roleKey: role.key,
            score: rank < 0 ? w.eligible : [w.pref1, w.pref2, w.pref3][rank],
          });
        }
    }
  }
  return result;
}
function model(
  s: Snapshot,
  vs: Variable[],
  locks: Assignment[],
  coverage?: number,
) {
  const rows: string[] = [],
    shortages: string[] = [],
    bounds: string[] = [],
    k = s.config.settings.maxConsecutiveSlots;
  const expr = (v: Variable[]) =>
    v.length ? v.map((x) => x.name).join(" + ") : "0 dummy";
  const add = (text: string) => rows.push("c" + rows.length + ": " + text);
  for (const slot of s.config.slots)
    for (const role of s.config.roles) {
      const list = vs.filter(
          (x) => x.slotId === slot.id && x.roleKey === role.key,
        ),
        cap = limits(s.config, slot.id, role.key),
        u = "u" + shortages.length;
      shortages.push(u);
      bounds.push("0 <= " + u + " <= " + cap.min);
      add(expr(list) + " <= " + cap.max);
      add(expr(list) + " + " + u + " >= " + cap.min);
    }
  for (const p of s.roster.filter((p) => p.active)) {
    const list = vs.filter((x) => x.id === p.id),
      settings = s.config.settings;
    add(
      expr(list) +
        " <= " +
        (p.maxShiftsTotal ?? settings.defaultMaxShiftsTotal),
    );
    for (const day of new Set(s.config.slots.map((x) => x.date)))
      add(
        expr(
          list.filter(
            (x) => s.config.slots.find((v) => v.id === x.slotId)!.date === day,
          ),
        ) +
          " <= " +
          (p.maxShiftsPerDay ?? settings.defaultMaxShiftsPerDay),
      );
    for (const slot of s.config.slots)
      add(expr(list.filter((x) => x.slotId === slot.id)) + " <= 1");
    for (let i = 0; i < s.config.slots.length; i++)
      for (let j = i + 1; j < s.config.slots.length; j++) {
        const a = s.config.slots[i],
          b = s.config.slots[j];
        if (overlaps(s, a.id, b.id))
          add(
            expr(list.filter((x) => x.slotId === a.id || x.slotId === b.id)) +
              " <= 1",
          );
      }
    for (const window of windows(s))
      add(expr(list.filter((x) => window.includes(x.slotId))) + " <= " + k);
    if (
      s.responses
        .find((r) => r.id === p.id)
        ?.availableSlots.some((id) => s.config.slots.some((x) => x.id === id))
    ) {
      add(expr(list) + " - Lmax <= 0");
      add(expr(list) + " - Lmin >= 0");
    }
  }
  for (const pin of locks) {
    const v = vs.find(
      (x) =>
        x.id === pin.id && x.slotId === pin.slotId && x.roleKey === pin.roleKey,
    );
    if (!v) throw Error("Invalid pin");
    add(v.name + " = 1");
  }
  if (coverage !== undefined) add(shortages.join(" + ") + " = " + coverage);
  bounds.push(
    "dummy = 0",
    "0 <= Lmin <= " + s.config.slots.length,
    "0 <= Lmax <= " + s.config.slots.length,
  );
  const objective =
    coverage === undefined
      ? shortages.join(" + ")
      : vs
          .filter((x) => x.score)
          .map((x) => "- " + x.score + " " + x.name)
          .join(" ") +
        " + " +
        s.config.settings.weights.fairness +
        " Lmax - " +
        s.config.settings.weights.fairness +
        " Lmin";
  return (
    "Minimize\nobj: " +
    objective +
    "\nSubject To\n" +
    rows.join("\n") +
    "\nBounds\n" +
    bounds.join("\n") +
    "\nBinaries\n" +
    vs.map((x) => x.name).join(" ") +
    "\nEnd"
  );
}
export function greedy(s: Snapshot, locks: Assignment[]): Assignment[] {
  validateAssignments(s, locks);
  const rows = structuredClone(locks),
    vs = variables(s);
  const demands = s.config.slots
    .flatMap((slot) =>
      s.config.roles.map((role) => ({
        slotId: slot.id,
        roleKey: role.key,
        min: limits(s.config, slot.id, role.key).min,
        candidates: vs.filter(
          (x) => x.slotId === slot.id && x.roleKey === role.key,
        ),
      })),
    )
    .sort(
      (a, b) =>
        a.candidates.length - b.candidates.length ||
        (a.slotId + a.roleKey).localeCompare(b.slotId + b.roleKey),
    );
  for (const demand of demands) {
    const count = () =>
      rows.filter(
        (a) => a.slotId === demand.slotId && a.roleKey === demand.roleKey,
      ).length;
    while (count() < demand.min) {
      const candidates = [...demand.candidates].sort(
        (a, b) =>
          rows.filter((x) => x.id === a.id).length -
            rows.filter((x) => x.id === b.id).length ||
          b.score - a.score ||
          a.id.localeCompare(b.id),
      );
      let placed = false;
      for (const v of candidates) {
        const a = {
          id: v.id,
          slotId: v.slotId,
          roleKey: v.roleKey,
          locked: false,
        };
        try {
          validateAssignments(s, [...rows, a]);
          rows.push(a);
          placed = true;
          break;
        } catch {}
      }
      if (!placed) break;
    }
  }
  return rows.sort(compare);
}
function compare(a: Assignment, b: Assignment) {
  return (a.slotId + "|" + a.roleKey + "|" + a.id).localeCompare(
    b.slotId + "|" + b.roleKey + "|" + b.id,
  );
}
function summarize(
  s: Snapshot,
  assignments: Assignment[],
  method: Run["method"],
  start: number,
  warnings: string[],
): Run {
  const unfilled = s.config.slots.flatMap((slot) =>
    s.config.roles.map((role) => {
      const needed = limits(s.config, slot.id, role.key).min,
        filled = assignments.filter(
          (x) => x.slotId === slot.id && x.roleKey === role.key,
        ).length;
      return {
        slotId: slot.id,
        roleKey: role.key,
        needed,
        filled,
        short: Math.max(0, needed - filled),
        eligibleButUnavailable: s.roster.filter(
          (p) =>
            p.active &&
            eligible(p, role) &&
            !s.responses
              .find((r) => r.id === p.id)
              ?.availableSlots.includes(slot.id),
        ).length,
      };
    }),
  );
  const needed = unfilled.reduce((n, x) => n + x.needed, 0),
    filled = unfilled.reduce((n, x) => n + Math.min(x.needed, x.filled), 0);
  const loads = s.roster
    .filter(
      (p) =>
        p.active &&
        s.responses
          .find((r) => r.id === p.id)
          ?.availableSlots.some((id) =>
            s.config.slots.some((x) => x.id === id),
          ),
    )
    .map((p) => assignments.filter((a) => a.id === p.id).length);
  const first = assignments.filter(
    (a) => s.responses.find((r) => r.id === a.id)?.preferences[0] === a.roleKey,
  ).length;
  return {
    runId: randomUUID(),
    assignments: assignments.sort(compare),
    unfilled,
    warnings,
    method,
    elapsedMs: Math.round(performance.now() - start),
    stats: {
      needed,
      filled,
      coverage: needed ? Math.round((100 * filled) / needed) : 100,
      firstChoice: assignments.length
        ? Math.round((100 * first) / assignments.length)
        : 0,
      min: loads.length ? Math.min(...loads) : 0,
      avg: loads.length
        ? Math.round((10 * loads.reduce((n, x) => n + x, 0)) / loads.length) /
          10
        : 0,
      max: loads.length ? Math.max(...loads) : 0,
    },
  };
}
export async function solve(
  input: Snapshot,
  locks: Assignment[],
): Promise<Run> {
  const start = performance.now(),
    s = validateSnapshot(input),
    warnings: string[] = [];
  validateAssignments(s, locks);
  for (const r of s.responses) {
    const unknown = r.availableSlots.filter(
      (id) => !s.config.slots.some((x) => x.id === id),
    );
    if (unknown.length)
      warnings.push(
        "Ignored removed slots for " + r.id + ": " + unknown.join(", "),
      );
  }
  const vs = variables(s);
  if (!vs.length) return summarize(s, [], "optimal", start, warnings);
  try {
    const highs = await (engine ??= loadHighs());
    const options = {
      output_flag: false,
      time_limit: 2,
      random_seed: 0,
      mip_rel_gap: 0,
    };
    const first = highs.solve(model(s, vs, locks), options);
    const extract = (result: typeof first) =>
      vs
        .filter(
          (x) =>
            Number((result.Columns[x.name] as { Primal?: number })?.Primal) >
            0.5,
        )
        .map((v) => ({
          id: v.id,
          slotId: v.slotId,
          roleKey: v.roleKey,
          locked: locks.some(
            (x) =>
              x.id === v.id && x.slotId === v.slotId && x.roleKey === v.roleKey,
          ),
        }));
    if (first.Status !== "Optimal")
      throw Error("Coverage optimization did not finish");
    let best = extract(first);
    validateAssignments(s, best);
    const short = s.config.slots
      .flatMap((slot) =>
        s.config.roles.map((role) =>
          Math.max(
            0,
            limits(s.config, slot.id, role.key).min -
              best.filter((x) => x.slotId === slot.id && x.roleKey === role.key)
                .length,
          ),
        ),
      )
      .reduce((a, b) => a + b, 0);
    const second = highs.solve(model(s, vs, locks, short), options);
    if (second.Status === "Optimal") {
      best = extract(second);
      validateAssignments(s, best);
    } else
      warnings.push(
        "Maximum coverage found; preference optimization reached its time limit.",
      );
    return summarize(
      s,
      best,
      second.Status === "Optimal" ? "optimal" : "feasible",
      start,
      warnings,
    );
  } catch (error) {
    console.error(
      "Optimizer fallback:",
      error instanceof Error ? error.message : error,
    );
    warnings.push(
      "Solver unavailable or time limit reached. Showing a valid heuristic schedule; optimal coverage is not guaranteed.",
    );
    return summarize(s, greedy(s, locks), "heuristic", start, warnings);
  }
}
