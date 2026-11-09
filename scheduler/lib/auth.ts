import {
  createHmac,
  randomBytes,
  timingSafeEqual,
  createHash,
} from "node:crypto";
const state = globalThis as typeof globalThis & { schedulerSecret?: string };
function secret() {
  if (
    process.env.SCHEDULER_MODE === "sheets" &&
    (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
  )
    throw Error(
      "Sheets mode requires SESSION_SECRET of at least 32 characters",
    );
  return (
    process.env.SESSION_SECRET ??
    (state.schedulerSecret ??= randomBytes(32).toString("hex"))
  );
}
export function signToken(data: Record<string, unknown>, seconds = 3600) {
  const body = Buffer.from(
    JSON.stringify({ ...data, exp: Date.now() + seconds * 1000 }),
  ).toString("base64url");
  return (
    body + "." + createHmac("sha256", secret()).update(body).digest("base64url")
  );
}
export function readToken(
  token: string,
  purpose: string,
): Record<string, unknown> {
  const [body, signature, ...extra] = token.split(".");
  if (!body || !signature || extra.length)
    throw Error("Session or preview is invalid. Please sign in or run again.");
  const expected = createHmac("sha256", secret()).update(body).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    throw Error("Session or preview is invalid. Please sign in or run again.");
  const value = JSON.parse(Buffer.from(body, "base64url").toString()) as Record<
    string,
    unknown
  >;
  if (
    value.purpose !== purpose ||
    typeof value.exp !== "number" ||
    value.exp < Date.now()
  )
    throw Error("Session or preview expired. Please sign in or run again.");
  return value;
}
export function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function checkPasscode(passcode: string) {
  const actual =
    process.env.ADMIN_PASSCODE ??
    (process.env.SCHEDULER_MODE === "sheets" ? "" : "rose-demo");
  return (
    actual.length >= 8 &&
    timingSafeEqual(
      createHash("sha256").update(actual).digest(),
      createHash("sha256").update(passcode).digest(),
    )
  );
}
export function sameOrigin(origin: string | null, host: string | null) {
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      parsed.origin === origin &&
      parsed.host === host
    );
  } catch {
    return false;
  }
}
