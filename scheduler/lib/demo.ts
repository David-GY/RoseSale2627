import type { Snapshot } from "./domain";
export function demoSnapshot(): Snapshot {
  const committees = [
    ["PM", "Project managers", "#cfdef2"],
    ["LOG", "Logistics", "#f4dfac"],
    ["SALES", "Sales & external relations", "#e6c6d6"],
    ["CREATIVES", "Creatives", "#cddfd3"],
  ].map(([code, name, colour]) => ({ code, name, colour }));
  const definitions = [
    ["SUPERVISOR", "Overall supervisor", "✧", "PM", "C", 1, 1],
    ["BLOOMBAR", "Bloom bar", "✿", "LOG,CREATIVES", "D", 1, 2],
    ["FLORIST", "Florists", "❀", "LOG,CREATIVES", "E", 1, 2],
    ["ENCODER", "Encoders", "⌨", "SALES", "F", 1, 1],
    ["SALESREP", "Sales representatives", "↗", "SALES", "G", 1, 2],
    ["SHOPKEEPER", "Pick-up desk", "♧", "LOG,SALES", "H", 1, 1],
    ["SCRIBE", "Scribes", "✎", "PM,SALES,CREATIVES", "I", 1, 1],
    ["ROVER", "Rovers", "◈", "*", "J", 1, 2],
    ["DOVE", "Doves", "♡", "*", "K", 1, 2],
  ];
  const roles = definitions.map(
    ([key, label, icon, allowed, column, min, max]) => ({
      key: String(key),
      label: String(label),
      icon: String(icon),
      allowed: String(allowed).split(","),
      column: String(column),
      min: Number(min),
      max: Number(max),
    }),
  );
  const slots = Array.from({ length: 6 }, (_, d) =>
    Array.from({ length: 6 }, (_, t) => ({
      id: "D" + (d + 1) + "S" + (t + 1),
      date: "2027-02-" + String(9 + d).padStart(2, "0"),
      start: String(8 + t).padStart(2, "0") + ":00",
      end: String(9 + t).padStart(2, "0") + ":00",
      label: [
        "Ingress · 8–9 am",
        "9–10 am",
        "10–11 am",
        "11 am–12 pm",
        "12–1 pm",
        "1–2 pm · Egress",
      ][t],
      tab: "FEB " + (9 + d) + " Shifts",
      startRow: 13 + t * 4,
      rowCount: 4,
    })),
  ).flat();
  const firsts = [
    "Ana",
    "Ben",
    "Cara",
    "Diego",
    "Ella",
    "Finn",
    "Gia",
    "Hugo",
    "Isla",
    "Jules",
    "Kai",
    "Lina",
  ];
  const lasts = ["Tan", "Lee", "Yu", "Reyes", "Cruz", "Lim"];
  const roster = Array.from({ length: 48 }, (_, i) => ({
    id: String(1001 + i),
    first: firsts[i % 12],
    last: lasts[Math.floor(i / 8) % 6],
    committee: committees[i % 4].code,
    active: true,
  }));
  const responses = roster.slice(0, 40).map((p, i) => ({
    id: p.id,
    submittedAt: "2026-11-10T08:00:00Z",
    availableSlots: slots.filter((_, j) => (i + j) % 5 < 3).map((s) => s.id),
    preferences: roles
      .filter((r) => r.allowed.includes("*") || r.allowed.includes(p.committee))
      .slice(i % 2, (i % 2) + 3)
      .map((r) => r.key),
    notes: "",
  }));
  return {
    config: {
      settings: {
        eventName: "Rose Sale 2027",
        venue: "SEC-C Foyer",
        formOpen: true,
        verifyField: "NONE",
        defaultMaxShiftsPerDay: 3,
        defaultMaxShiftsTotal: 8,
        maxConsecutiveSlots: 2,
        weights: { pref1: 30, pref2: 20, pref3: 10, eligible: 0, fairness: 5 },
      },
      committees,
      roles,
      slots,
      overrides: [
        {
          slotId: "D2S1",
          roleKey: "DOVE",
          min: 0,
          max: 0,
          note: "No doves during ingress",
        },
      ],
    },
    roster,
    responses,
    assignments: [],
  };
}
