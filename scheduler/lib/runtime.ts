import { InMemoryRepository, type SheetRepository } from "./repository";
import { GoogleSheetRepository } from "./sheets";
import { SchedulerService } from "./service";
const state = globalThis as typeof globalThis & {
  schedulerRepo?: SheetRepository;
};
export function service() {
  const mode = process.env.SCHEDULER_MODE ?? "demo";
  if (!["demo", "sheets"].includes(mode))
    throw Error("SCHEDULER_MODE must be demo or sheets");
  const repo = (state.schedulerRepo ??=
    mode === "sheets" ? new GoogleSheetRepository() : new InMemoryRepository());
  return new SchedulerService(repo);
}
