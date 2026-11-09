import { it, expect } from "vitest";
import { sameOrigin } from "../lib/auth";
it("accepts the browser host when Next normalizes the internal URL to localhost", () => {
  expect(sameOrigin("http://127.0.0.1:3010", "127.0.0.1:3010")).toBe(true);
  expect(sameOrigin("https://attacker.example", "127.0.0.1:3010")).toBe(false);
  expect(sameOrigin(null, "127.0.0.1:3010")).toBe(false);
  expect(sameOrigin("http://127.0.0.1:3010/path", "127.0.0.1:3010")).toBe(
    false,
  );
});
