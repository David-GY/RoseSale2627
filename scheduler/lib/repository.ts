import type { Snapshot, MemberResponse, Run } from "./domain";
import { demoSnapshot } from "./demo";
export interface SheetRepository {
  readonly mode: "demo" | "sheets";
  snapshot(): Promise<Snapshot>;
  upsertResponse(r: MemberResponse): Promise<void>;
  publish(run: Run, snapshot: Snapshot): Promise<void>;
  setFormOpen(open: boolean): Promise<void>;
}
export function latestResponses(rows: MemberResponse[]): MemberResponse[] {
  return [...new Map(rows.map((r) => [r.id, r])).values()];
}
export class InMemoryRepository implements SheetRepository {
  readonly mode = "demo" as const;
  private data: Snapshot;
  lastRun?: Run;
  constructor(data: Snapshot = demoSnapshot()) {
    this.data = structuredClone(data);
  }
  async snapshot() {
    return structuredClone(this.data);
  }
  async upsertResponse(r: MemberResponse) {
    this.data.responses = latestResponses([...this.data.responses, r]);
  }
  async publish(run: Run) {
    this.lastRun = structuredClone(run);
    this.data.assignments = structuredClone(run.assignments);
  }
  async setFormOpen(open: boolean) {
    this.data.config.settings.formOpen = open;
  }
}
