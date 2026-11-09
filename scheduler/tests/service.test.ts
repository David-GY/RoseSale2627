import { it, expect, describe } from "vitest";
import { SchedulerService } from "../lib/service";
import { InMemoryRepository } from "../lib/repository";
import { fixture } from "./fixture";
import { signToken, readToken } from "../lib/auth";
describe("member and administrator workflow", () => {
  it("requires identity verification and rejects writes after closure", async () => {
    const s = fixture();
    s.config.settings.verifyField = "LAST_NAME";
    const repo = new InMemoryRepository(s),
      service = new SchedulerService(repo);
    await expect(service.lookup("001", "wrong")).rejects.toThrow(
      /verification/i,
    );
    const m = await service.lookup("001", "tan");
    expect(m.person.id).toBe("001");
    await service.submit("001", {
      availableSlots: ["S1"],
      preferences: ["FLOWER"],
      notes: "edited",
    });
    expect(
      (await repo.snapshot()).responses.find((r) => r.id === "001")?.notes,
    ).toBe("edited");
    await repo.setFormOpen(false);
    await expect(
      service.submit("001", {
        availableSlots: [],
        preferences: ["FLOWER"],
        notes: "",
      }),
    ).rejects.toThrow(/closed/i);
  });
  it("previews without writing and publishes exactly the reviewed result", async () => {
    const repo = new InMemoryRepository(fixture()),
      service = new SchedulerService(repo);
    await repo.setFormOpen(false);
    const preview = await service.preview([]);
    expect((await repo.snapshot()).assignments).toHaveLength(0);
    await service.publish(preview.token);
    expect((await repo.snapshot()).assignments).toEqual(
      preview.run.assignments,
    );
  });
  it("rejects forged and stale previews including response edits", async () => {
    const repo = new InMemoryRepository(fixture()),
      service = new SchedulerService(repo);
    await repo.setFormOpen(false);
    const preview = await service.preview([]);
    await expect(service.publish(preview.token + "tamper")).rejects.toThrow();
    await repo.upsertResponse({
      ...(await repo.snapshot()).responses[0],
      notes: "new",
    });
    await expect(service.publish(preview.token)).rejects.toThrow(/changed/i);
  });
  it("does not accept a preview for a different token purpose", () => {
    expect(() =>
      readToken(signToken({ purpose: "member", id: "001" }), "admin"),
    ).toThrow();
  });
});
