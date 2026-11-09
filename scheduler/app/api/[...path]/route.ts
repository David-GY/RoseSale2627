import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { service } from "../../../lib/runtime";
import {
  readToken,
  signToken,
  checkPasscode,
  sameOrigin,
} from "../../../lib/auth";
import {
  assignmentSchema,
  eligible,
  validateSnapshot,
} from "../../../lib/domain";
import { identityStamp } from "../../../lib/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const attempts = new Map<string, { count: number; expires: number }>();
function throttle(req: NextRequest, kind: string, max: number) {
  const ip = (req.headers.get("x-forwarded-for") ?? "local")
      .split(",")[0]
      .trim(),
    key = kind + ip,
    now = Date.now();
  if (attempts.size > 5000)
    for (const [k, v] of attempts) if (v.expires < now) attempts.delete(k);
  const item = attempts.get(key);
  if (!item || item.expires < now) {
    attempts.set(key, { count: 1, expires: now + 60000 });
    return;
  }
  if (++item.count > max)
    throw Error("Too many attempts. Wait one minute before trying again.");
}
function reply(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
function session(req: NextRequest, name: string, purpose: string) {
  return readToken(req.cookies.get(name)?.value ?? "", purpose);
}
function setCookie(res: NextResponse, name: string, token: string) {
  res.cookies.set(name, token, {
    httpOnly: true,
    sameSite: "strict",
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.SCHEDULER_MODE === "sheets",
    path: "/",
    maxAge: 43200,
  });
  return res;
}
async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const path = (await params).path.join("/");
  try {
    const svc = service();
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      if (!sameOrigin(req.headers.get("origin"), req.headers.get("host")))
        return reply({ error: "This request must come from this app." }, 403);
      if (!req.headers.get("content-type")?.includes("application/json"))
        return reply({ error: "Expected JSON." }, 415);
      const text = await req.text();
      if (text.length > 500000)
        return reply({ error: "Request is too large." }, 413);
      body = JSON.parse(text);
    }
    if (req.method === "GET" && path === "config") {
      const s = validateSnapshot(await svc.repo.snapshot());
      return reply({ config: s.config, mode: svc.repo.mode });
    }
    if (req.method === "POST" && path === "member") {
      throttle(req, "member", 15);
      const input = z
        .object({
          id: z.string().trim().min(1).max(100),
          verification: z.string().max(200).default(""),
        })
        .parse(body);
      const member = await svc.lookup(input.id, input.verification);
      const token = signToken(
        { purpose: "member", id: member.person.id, stamp: member.stamp },
        43200,
      );
      return setCookie(reply(member), "rose_member", token);
    }
    if (path === "member/session" && req.method === "GET") {
      let auth;
      try {
        auth = session(req, "rose_member", "member");
      } catch {
        return reply({ error: "Sign in to continue." }, 401);
      }
      const s = validateSnapshot(await svc.repo.snapshot()),
        p = s.roster.find((x) => x.id === auth.id && x.active);
      if (!p || auth.stamp !== identityStamp(s, p))
        return reply({ error: "Verify your ID again." }, 401);
      const { pin, ...person } = p;
      void pin;
      return reply({
        person,
        response: s.responses.find((x) => x.id === p.id) ?? null,
        roles: s.config.roles.filter((r) => eligible(p, r)),
      });
    }
    if (path === "responses" && req.method === "POST") {
      throttle(req, "response", 30);
      let auth;
      try {
        auth = session(req, "rose_member", "member");
      } catch {
        return reply({ error: "Verify your ID before submitting." }, 401);
      }
      const s = validateSnapshot(await svc.repo.snapshot()),
        p = s.roster.find((x) => x.id === auth.id && x.active);
      if (!p || auth.stamp !== identityStamp(s, p))
        return reply(
          { error: "Your roster details changed. Verify your ID again." },
          401,
        );
      return reply({ response: await svc.submit(p.id, body) });
    }
    if (path === "member/logout" && req.method === "POST") {
      const res = reply({ ok: true });
      res.cookies.delete("rose_member");
      return res;
    }
    if (path === "admin/login" && req.method === "POST") {
      throttle(req, "admin-login", 8);
      const input = z.object({ passcode: z.string().max(200) }).parse(body);
      if (!checkPasscode(input.passcode))
        return reply({ error: "Passcode did not match." }, 401);
      return setCookie(
        reply({ ok: true }),
        "rose_admin",
        signToken({ purpose: "admin" }, 43200),
      );
    }
    if (path.startsWith("admin/")) {
      try {
        session(req, "rose_admin", "admin");
      } catch {
        return reply({ error: "Administrator sign-in required." }, 401);
      }
      if (path === "admin/dashboard" && req.method === "GET")
        return reply(await svc.dashboard());
      if (path === "admin/assign" && req.method === "POST") {
        throttle(req, "assign", 12);
        return reply(
          await svc.preview(
            z
              .array(assignmentSchema)
              .max(2000)
              .parse(body.locks ?? []),
          ),
        );
      }
      if (path === "admin/publish" && req.method === "POST") {
        throttle(req, "publish", 6);
        return reply(
          await svc.publish(z.string().max(400000).parse(body.token)),
        );
      }
      if (path === "admin/settings" && req.method === "POST") {
        const input = z.object({ formOpen: z.boolean() }).parse(body);
        await svc.repo.setFormOpen(input.formOpen);
        return reply({ ok: true });
      }
      if (path === "admin/logout" && req.method === "POST") {
        const res = reply({ ok: true });
        res.cookies.delete("rose_admin");
        return res;
      }
    }
    return reply({ error: "Not found." }, 404);
  } catch (error) {
    if (error instanceof z.ZodError)
      return reply(
        {
          error: error.issues
            .map((x) => x.path.join(".") + ": " + x.message)
            .join("; "),
        },
        400,
      );
    return reply(
      {
        error:
          error instanceof Error ? error.message : "Request failed. Try again.",
      },
      400,
    );
  }
}
export { handle as GET, handle as POST };
