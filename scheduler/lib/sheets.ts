import { JWT } from "google-auth-library";
import {
  type Snapshot,
  type MemberResponse,
  type Run,
  type Config,
  validateSnapshot,
  columnIndex,
} from "./domain";
import { type SheetRepository, latestResponses } from "./repository";
import { renderShiftTabs } from "./writer";
type Tables = Record<string, string[][]>;
const names = [
  "Cfg_Settings",
  "Cfg_Committees",
  "Cfg_Roles",
  "Cfg_Slots",
  "Cfg_Overrides",
  "Roster",
  "Responses",
  "Assignments",
  "Unfilled",
];
function records(
  tables: Tables,
  name: string,
  required: string[] = [],
): Record<string, string>[] {
  const rows = tables[name] ?? [],
    head = rows[0] ?? [];
  for (const col of required)
    if (!head.includes(col)) throw Error(name + " is missing column " + col);
  return rows
    .slice(1)
    .filter((r) => r.some((x) => String(x).trim() !== ""))
    .map((r) =>
      Object.fromEntries(head.map((h, j) => [h, String(r[j] ?? "").trim()])),
    );
}
function bool(value: string, label: string) {
  if (!["TRUE", "FALSE"].includes(value.toUpperCase()))
    throw Error("Expected TRUE/FALSE for " + label);
  return value.toUpperCase() === "TRUE";
}
function number(value: string, fallback?: number) {
  if (value === "") {
    if (fallback !== undefined) return fallback;
    throw Error("Missing numeric setting");
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw Error("Invalid number: " + value);
  return n;
}
function list(v: string) {
  return v
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}
export function parseTables(tables: Tables): Snapshot {
  const pairs = records(tables, "Cfg_Settings", ["Key", "Value"]),
    settings = Object.fromEntries(pairs.map((x) => [x.Key, x.Value]));
  if (new Set(pairs.map((x) => x.Key)).size !== pairs.length)
    throw Error("Duplicate setting keys");
  const config: Config = {
    settings: {
      eventName: settings.EventName,
      venue: settings.Venue ?? "",
      formOpen: bool(settings.FormOpen, "FormOpen"),
      verifyField: settings.VerifyField as Config["settings"]["verifyField"],
      defaultMaxShiftsPerDay: number(settings.DefaultMaxShiftsPerDay),
      defaultMaxShiftsTotal: number(settings.DefaultMaxShiftsTotal),
      maxConsecutiveSlots: number(settings.MaxConsecutiveSlots),
      weights: {
        pref1: number(settings.W_Pref1 ?? "", 30),
        pref2: number(settings.W_Pref2 ?? "", 20),
        pref3: number(settings.W_Pref3 ?? "", 10),
        eligible: number(settings.W_Eligible ?? "", 0),
        fairness: number(settings.W_Fairness ?? "", 5),
      },
    },
    committees: records(tables, "Cfg_Committees", [
      "Code",
      "Name",
      "Colour",
    ]).map((x) => ({ code: x.Code, name: x.Name, colour: x.Colour })),
    roles: records(tables, "Cfg_Roles", [
      "RoleKey",
      "Label",
      "Icon",
      "AllowedCommittees",
      "MinPerSlot",
      "MaxPerSlot",
      "SheetColumn",
    ]).map((x) => ({
      key: x.RoleKey,
      label: x.Label,
      icon: x.Icon,
      allowed: list(x.AllowedCommittees),
      min: number(x.MinPerSlot),
      max: number(x.MaxPerSlot),
      column: x.SheetColumn,
    })),
    slots: records(tables, "Cfg_Slots", [
      "SlotId",
      "Date",
      "Start",
      "End",
      "Label",
      "Tab",
      "StartRow",
      "RowCount",
    ]).map((x) => ({
      id: x.SlotId,
      date: x.Date,
      start: x.Start,
      end: x.End,
      label: x.Label,
      tab: x.Tab,
      startRow: number(x.StartRow),
      rowCount: number(x.RowCount),
    })),
    overrides: records(tables, "Cfg_Overrides", [
      "SlotId",
      "RoleKey",
      "MinPerSlot",
      "MaxPerSlot",
      "Note",
    ]).map((x) => ({
      slotId: x.SlotId,
      roleKey: x.RoleKey,
      min: number(x.MinPerSlot),
      max: number(x.MaxPerSlot),
      note: x.Note,
    })),
  };
  return validateSnapshot({
    config,
    roster: records(tables, "Roster", [
      "ID",
      "First",
      "Last",
      "Committee",
      "Active",
      "MaxShiftsTotal",
      "MaxShiftsPerDay",
    ])
      .filter((row) =>
        Object.entries(row).some(
          ([field, value]) =>
            value !== "" &&
            !(field === "Active" && value.toUpperCase() === "FALSE"),
        ),
      )
      .map((x) => ({
        id: x.ID,
        first: x.First,
        last: x.Last,
        committee: x.Committee,
        active: bool(x.Active, "Active"),
        ...(x.PIN ? { pin: x.PIN } : {}),
        ...(x.MaxShiftsTotal !== ""
          ? { maxShiftsTotal: number(x.MaxShiftsTotal) }
          : {}),
        ...(x.MaxShiftsPerDay !== ""
          ? { maxShiftsPerDay: number(x.MaxShiftsPerDay) }
          : {}),
      })),
    responses: latestResponses(
      records(tables, "Responses", [
        "ID",
        "SubmittedAt",
        "AvailableSlots",
        "Pref1",
        "Pref2",
        "Pref3",
        "Notes",
      ]).map((x) => ({
        id: x.ID,
        submittedAt: x.SubmittedAt,
        availableSlots: list(x.AvailableSlots),
        preferences: [x.Pref1, x.Pref2, x.Pref3].filter(Boolean),
        notes: x.Notes,
      })),
    ),
    assignments: records(tables, "Assignments", [
      "RunId",
      "SlotId",
      "RoleKey",
      "ID",
      "Name",
      "Committee",
      "PrefRank",
      "Locked",
    ]).map((x) => ({
      id: x.ID,
      slotId: x.SlotId,
      roleKey: x.RoleKey,
      locked: bool(x.Locked, "Locked"),
    })),
  });
}
export class GoogleSheetRepository implements SheetRepository {
  readonly mode = "sheets" as const;
  private auth: JWT;
  private base: string;
  constructor() {
    const id = process.env.SHEET_ID,
      email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key = process.env.GOOGLE_PRIVATE_KEY;
    if (!id || !email || !key)
      throw Error(
        "Sheets mode requires SHEET_ID and service-account environment variables.",
      );
    if (!process.env.ADMIN_PASSCODE || process.env.ADMIN_PASSCODE.length < 12)
      throw Error(
        "Sheets mode requires an ADMIN_PASSCODE of at least 12 characters.",
      );
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
      throw Error(
        "Sheets mode requires SESSION_SECRET of at least 32 characters.",
      );
    this.auth = new JWT({
      email,
      key: key.replaceAll("\\n", "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    this.base =
      "https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(id);
  }
  private async request<T>(path: string, body?: unknown): Promise<T> {
    try {
      return (
        await this.auth.request<T>({
          url: this.base + path,
          method: body === undefined ? "GET" : "POST",
          ...(body === undefined ? {} : { data: body }),
          timeout: 15000,
        })
      ).data;
    } catch (error) {
      console.error(
        "Google Sheets request failed",
        error instanceof Error ? error.name : "unknown",
      );
      throw Error(
        "Could not read or write the sheet. Check sharing, credentials, tab names and layout.",
      );
    }
  }
  async readTables(): Promise<Tables> {
    const params = new URLSearchParams({
      valueRenderOption: "FORMATTED_VALUE",
    });
    for (const name of names)
      params.append("ranges", "'" + name + "'!A1:ZZ10001");
    const result = await this.request<{
      valueRanges: { values?: string[][] }[];
    }>("/values:batchGet?" + params);
    return Object.fromEntries(
      names.map((name, i) => [name, result.valueRanges[i].values ?? []]),
    );
  }
  async snapshot() {
    return parseTables(await this.readTables());
  }
  async upsertResponse(r: MemberResponse) {
    // Server-side append avoids the read/find/update race. Snapshot projects the last appended row per ID.
    await this.request(
      "/values/Responses!A:G:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
      {
        values: [
          [
            r.id,
            r.submittedAt,
            r.availableSlots.join(","),
            r.preferences[0] ?? "",
            r.preferences[1] ?? "",
            r.preferences[2] ?? "",
            r.notes,
          ],
        ],
      },
    );
  }
  async setFormOpen(open: boolean) {
    const tables = await this.readTables(),
      index = tables.Cfg_Settings.findIndex((row) => row[0] === "FormOpen");
    if (index < 1) throw Error("Cfg_Settings is missing FormOpen");
    const headers = await this.auth.getRequestHeaders(this.base);
    try {
      await this.auth.request({
        url:
          this.base +
          "/values/" +
          encodeURIComponent("Cfg_Settings!B" + (index + 1)) +
          "?valueInputOption=RAW",
        method: "PUT",
        headers,
        data: { values: [[open ? "TRUE" : "FALSE"]] },
      });
    } catch {
      throw Error("Could not update FormOpen in the sheet.");
    }
  }
  async publish(run: Run, s: Snapshot) {
    const meta = await this.request<{
      sheets: {
        properties: {
          title: string;
          sheetId: number;
          gridProperties: { rowCount: number; columnCount: number };
        };
      }[];
    }>("?fields=sheets.properties");
    const properties = new Map(
      meta.sheets.map((x) => [x.properties.title, x.properties]),
    );
    const requests: unknown[] = [];
    const cells = (
      tab: string,
      startRow: number,
      startCol: number,
      values: (string | number | boolean)[][],
      clearTo?: number,
    ) => {
      const prop = properties.get(tab);
      if (!prop) throw Error("Missing output tab: " + tab);
      const height = Math.max(values.length, clearTo ?? 0),
        width = Math.max(...values.map((r) => r.length));
      if (
        startRow + height > prop.gridProperties.rowCount ||
        startCol + width > prop.gridProperties.columnCount
      )
        throw Error(
          "Expand sheet rows/columns for " + tab + " before publishing.",
        );
      requests.push({
        updateCells: {
          range: {
            sheetId: prop.sheetId,
            startRowIndex: startRow,
            endRowIndex: startRow + height,
            startColumnIndex: startCol,
            endColumnIndex: startCol + width,
          },
          rows: values.map((row) => ({
            values: row.map((v) => ({
              userEnteredValue:
                typeof v === "number"
                  ? { numberValue: v }
                  : typeof v === "boolean"
                    ? { boolValue: v }
                    : { stringValue: v },
            })),
          })),
          fields: "userEnteredValue",
        },
      });
    };
    const assignmentRows: (string | number | boolean)[][] = [
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
      ...run.assignments.map((a) => {
        const p = s.roster.find((p) => p.id === a.id)!,
          rank =
            s.responses
              .find((r) => r.id === a.id)!
              .preferences.indexOf(a.roleKey) + 1;
        return [
          run.runId,
          a.slotId,
          a.roleKey,
          p.id,
          p.first + " " + p.last,
          p.committee,
          rank || "",
          a.locked,
        ];
      }),
    ];
    cells(
      "Assignments",
      0,
      0,
      assignmentRows,
      properties.get("Assignments")?.gridProperties.rowCount,
    );
    const gapRows: (string | number | boolean)[][] = [
      [
        "SlotId",
        "RoleKey",
        "Needed",
        "Filled",
        "Short",
        "EligibleButUnavailable",
        "Note",
      ],
      ...run.unfilled.map((g) => [
        g.slotId,
        g.roleKey,
        g.needed,
        g.filled,
        g.short,
        g.eligibleButUnavailable,
        "",
      ]),
      ...run.warnings.map((w) => ["", "", "", "", "", "", w]),
    ];
    cells(
      "Unfilled",
      0,
      0,
      gapRows,
      properties.get("Unfilled")?.gridProperties.rowCount,
    );
    const rendered = renderShiftTabs(run.assignments, s);
    let i = 0;
    for (const slot of s.config.slots)
      for (const role of s.config.roles)
        cells(
          slot.tab,
          slot.startRow - 1,
          columnIndex(role.column),
          rendered.cells[i++].values,
        );
    // One atomic batch updates canonical assignments, shortfalls and formatted views.
    await this.request(":batchUpdate", { requests });
  }
}
