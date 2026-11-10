import { z } from "zod";
const key = z.string().trim().min(1).max(100);
const count = z.number().int().min(0).max(1000);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const assignmentSchema = z.object({
  id: key,
  slotId: key,
  roleKey: key,
  locked: z.boolean(),
});
export type Assignment = z.infer<typeof assignmentSchema>;
export const configSchema = z.object({
  settings: z.object({
    eventName: key,
    venue: z.string().max(200),
    formOpen: z.boolean(),
    verifyField: z.enum(["NONE", "LAST_NAME", "PIN"]),
    defaultMaxShiftsPerDay: count,
    defaultMaxShiftsTotal: count,
    maxConsecutiveSlots: count,
    weights: z.object({
      pref1: count,
      pref2: count,
      pref3: count,
      eligible: count,
      fairness: count,
    }),
  }),
  committees: z
    .array(
      z.object({
        code: key,
        name: key,
        colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      }),
    )
    .min(1),
  roles: z
    .array(
      z.object({
        key,
        label: key,
        icon: z.string().max(20),
        allowed: z.array(key).min(1),
        min: count,
        max: count,
        column: z.string().regex(/^[A-Z]{1,3}$/),
      }),
    )
    .min(1)
    .max(30),
  slots: z
    .array(
      z.object({
        id: key,
        date: z.iso.date(),
        start: time,
        end: time,
        label: key,
        tab: key,
        startRow: z.number().int().min(1).max(10000),
        rowCount: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(200),
  overrides: z.array(
    z.object({
      slotId: key,
      roleKey: key,
      min: count,
      max: count,
      note: z.string().optional(),
    }),
  ),
});
export type Config = z.infer<typeof configSchema>;
export const personSchema = z.object({
  id: key,
  first: key,
  last: key,
  committee: key,
  active: z.boolean(),
  pin: z.string().optional(),
  maxShiftsTotal: count.optional(),
  maxShiftsPerDay: count.optional(),
});
export type Person = z.infer<typeof personSchema>;
export const responseSchema = z.object({
  id: key,
  submittedAt: z.string(),
  availableSlots: z.array(key).max(200),
  preferences: z.array(key).max(3),
  notes: z.string().max(1000),
});
export type MemberResponse = z.infer<typeof responseSchema>;
export type Snapshot = {
  config: Config;
  disabledSlots?: Config["slots"];
  roster: Person[];
  responses: MemberResponse[];
  assignments: Assignment[];
};
export type Gap = {
  slotId: string;
  roleKey: string;
  needed: number;
  filled: number;
  short: number;
  eligibleButUnavailable: number;
};
export type Run = {
  runId: string;
  assignments: Assignment[];
  unfilled: Gap[];
  warnings: string[];
  method: "optimal" | "feasible" | "heuristic";
  elapsedMs: number;
  stats: {
    coverage: number;
    filled: number;
    needed: number;
    firstChoice: number;
    min: number;
    avg: number;
    max: number;
  };
};
export function eligible(p: Person, r: Config["roles"][number]) {
  return r.allowed.includes("*") || r.allowed.includes(p.committee);
}
export function limits(c: Config, s: string, r: string) {
  return (
    c.overrides.find((x) => x.slotId === s && x.roleKey === r) ??
    c.roles.find((x) => x.key === r)!
  );
}
export function columnIndex(c: string) {
  return [...c].reduce((n, x) => n * 26 + x.charCodeAt(0) - 64, 0) - 1;
}
function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw Error("Duplicate " + label);
}
export function validateSnapshot(input: unknown): Snapshot {
  const s = z
    .object({
      config: configSchema,
      disabledSlots: z.array(configSchema.shape.slots.element).optional(),
      roster: z.array(personSchema).max(1000),
      responses: z.array(responseSchema),
      assignments: z.array(assignmentSchema),
    })
    .parse(input);
  const c = s.config,
    allSlots = [...c.slots, ...(s.disabledSlots ?? [])];
  unique(
    c.committees.map((x) => x.code),
    "committee",
  );
  unique(
    c.roles.map((x) => x.key),
    "role",
  );
  unique(
    allSlots.map((x) => x.id),
    "slot",
  );
  unique(
    s.roster.map((x) => x.id),
    "member ID",
  );
  unique(
    c.roles.map((x) => x.column),
    "role column",
  );
  unique(
    c.overrides.map((x) => x.slotId + "|" + x.roleKey),
    "override",
  );
  const committees = new Set(c.committees.map((x) => x.code)),
    slots = new Set(c.slots.map((x) => x.id)),
    roles = new Set(c.roles.map((x) => x.key));
  for (const p of s.roster)
    if (!committees.has(p.committee))
      throw Error("Unknown committee for " + p.id);
  for (const r of c.roles) {
    if (r.min > r.max) throw Error("Role minimum exceeds maximum: " + r.key);
    if (columnIndex(r.column) < 2) throw Error("Role columns must start at C");
    for (const code of r.allowed)
      if (code !== "*" && !committees.has(code))
        throw Error("Unknown eligible committee: " + code);
  }
  for (const x of c.overrides)
    if (!slots.has(x.slotId) || !roles.has(x.roleKey) || x.min > x.max)
      throw Error("Invalid override " + x.slotId + "/" + x.roleKey);
  const reserved = [
    "Roster",
    "Cfg_Settings",
    "Cfg_Committees",
    "Cfg_Roles",
    "Cfg_Slots",
    "Cfg_Overrides",
    "Responses",
    "Assignments",
    "Unfilled",
  ];
  for (const a of allSlots) {
    if (a.start >= a.end) throw Error("Slot must end after start: " + a.id);
    if (reserved.includes(a.tab))
      throw Error("Output tab conflicts with data tab");
    for (const b of allSlots)
      if (
        a.id !== b.id &&
        a.tab === b.tab &&
        a.startRow < b.startRow + b.rowCount &&
        b.startRow < a.startRow + a.rowCount
      )
        throw Error("Overlapping sheet layout: " + a.id);
  }
  if (
    c.settings.verifyField === "PIN" &&
    s.roster.some((p) => p.active && !p.pin)
  )
    throw Error("PIN verification requires a PIN for every active member");
  return s;
}
export function validateResponse(
  s: Snapshot,
  id: string,
  input: unknown,
): MemberResponse {
  const r = responseSchema.omit({ id: true, submittedAt: true }).parse(input),
    p = s.roster.find((x) => x.id === id && x.active);
  if (!p) throw Error("Member not found");
  unique(r.availableSlots, "slot");
  unique(r.preferences, "preferences");
  if (r.availableSlots.some((x) => !s.config.slots.some((v) => v.id === x)))
    throw Error("Unknown slot");
  if (
    r.preferences.some(
      (x) =>
        !s.config.roles.some((role) => role.key === x && eligible(p, role)),
    )
  )
    throw Error("Preference is not eligible");
  if (s.config.roles.some((role) => eligible(p, role)) && !r.preferences.length)
    throw Error("Choose at least one role");
  return { ...r, id, submittedAt: new Date().toISOString() };
}
export function publicConfig(c: Config) {
  return c;
}
