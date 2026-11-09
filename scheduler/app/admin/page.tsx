"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  RefreshCw,
  Play,
  Upload,
  LockKeyhole,
  Pin,
  PinOff,
  Users,
  CalendarDays,
  ChartNoAxesCombined,
  LogOut,
  LoaderCircle,
  AlertCircle,
} from "lucide-react";
import { Shell } from "../../components/Shell";
import { api, dayLabel, clock } from "../../lib/client";
import {
  type Snapshot,
  type Assignment,
  type Run,
  limits,
} from "../../lib/domain";
type Dashboard = Snapshot & {
  mode: string;
  heatmap: { slotId: string; roleKey: string; available: number }[];
};
type Preview = { run: Run; token: string };
function same(a: Assignment, b: Assignment) {
  return a.id === b.id && a.slotId === b.slotId && a.roleKey === b.roleKey;
}
export default function Admin() {
  const [data, setData] = useState<Dashboard>(),
    [passcode, setPasscode] = useState(""),
    [mode, setMode] = useState(""),
    [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [tab, setTab] = useState("schedule"),
    [day, setDay] = useState("");
  const [preview, setPreview] = useState<Preview>(),
    [previous, setPrevious] = useState<Run>(),
    [locks, setLocks] = useState<Assignment[]>([]),
    [confirm, setConfirm] = useState(false),
    [filter, setFilter] = useState("all");
  async function load(preserve = false) {
    const d = await api<Dashboard>("admin/dashboard");
    setData(d);
    setMode(d.mode);
    setDay((current) =>
      d.config.slots.some((s) => s.date === current)
        ? current
        : d.config.slots[0].date,
    );
    if (!preserve) {
      setLocks(d.assignments.filter((a) => a.locked));
      setPreview(undefined);
      setConfirm(false);
    }
  }
  useEffect(() => {
    api<{ mode: string }>("config")
      .then((d) => setMode(d.mode))
      .catch((e) => setError(e.message));
    load()
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);
  async function action(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    await action("login", async () => {
      await api("admin/login", { passcode });
      setPasscode("");
      await load();
    });
  }
  async function run() {
    await action("run", async () => {
      const result = await api<Preview>("admin/assign", { locks });
      setPrevious(preview?.run);
      setPreview(result);
      setLocks(result.run.assignments.filter((a) => a.locked));
      setTab("schedule");
      setConfirm(false);
      setMessage("Preview ready. Nothing has been published.");
    });
  }
  function togglePin(a: Assignment) {
    const exists = locks.some((x) => same(x, a));
    setLocks(
      exists
        ? locks.filter((x) => !same(x, a))
        : [...locks, { ...a, locked: true }],
    );
    if (preview) setPreview({ ...preview, token: "" });
    setConfirm(false);
    setMessage("Pins changed. Run again to generate a publishable preview.");
  }
  async function publish() {
    if (!preview) return;
    await action("publish", async () => {
      const result = await api<{ mode: string }>("admin/publish", {
        token: preview.token,
      });
      setPreview(undefined);
      setConfirm(false);
      await load();
      setMessage(
        result.mode === "demo"
          ? "Published to the demo. The sheet-shaped schedule is now saved in memory."
          : "Published to Assignments, Unfilled and the configured shift tabs.",
      );
    });
  }
  const active = data?.roster.filter((p) => p.active) ?? [],
    submitted = active.filter((p) =>
      data?.responses.some((r) => r.id === p.id),
    ),
    missing = active.filter((p) => !data?.responses.some((r) => r.id === p.id));
  const days = [...new Set(data?.config.slots.map((s) => s.date) ?? [])].sort(),
    assignments = preview?.run.assignments ?? data?.assignments ?? [];
  const slots =
    data?.config.slots
      .filter((s) => s.date === day)
      .sort((a, b) => a.start.localeCompare(b.start)) ?? [];
  return (
    <Shell admin mode={mode}>
      <div className="admin-intro">
        <div>
          <p className="eyebrow">Organizer’s workspace</p>
          <h1>Bring the week together.</h1>
          <p className="intro-copy">
            A little coordination. A whole team in bloom.
          </p>
        </div>
        {data && (
          <button
            className="text-button"
            onClick={() =>
              action("logout", async () => {
                await api("admin/logout", {});
                setData(undefined);
                setPreview(undefined);
              })
            }
          >
            <LogOut size={16} />
            Sign out
          </button>
        )}
      </div>
      {error && (
        <div className="notice error" role="alert">
          <AlertCircle size={18} />
          {error}
        </div>
      )}
      {message && (
        <div className="notice success" role="status">
          <Check size={18} />
          {message}
        </div>
      )}
      {checking ? (
        <div className="loading">Opening your workspace…</div>
      ) : !data ? (
        <section className="card admin-login">
          <span className="lock-disc">
            <LockKeyhole size={24} />
          </span>
          <h2>A space for organizers.</h2>
          <p>
            Sign in to see responses, arrange shifts and publish the schedule.
          </p>
          <form onSubmit={login}>
            <label htmlFor="passcode">Administrator passcode</label>
            <input
              id="passcode"
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              className="button primary wide"
              disabled={!!busy}
              type="submit"
            >
              {busy ? "Signing in…" : "Open workspace"}
              <ArrowRight size={17} />
            </button>
          </form>
          {mode === "demo" && (
            <p className="demo-tip">
              Demo passcode: <strong>rose-demo</strong>
            </p>
          )}
        </section>
      ) : (
        <>
          <div className="admin-summary">
            <div>
              <Users size={21} />
              <strong>
                {submitted.length}
                <small> / {active.length}</small>
              </strong>
              <span>Members responded</span>
            </div>
            <div>
              <CalendarDays size={21} />
              <strong>{data.config.slots.length}</strong>
              <span>Slots across {days.length} days</span>
            </div>
            <div>
              <ChartNoAxesCombined size={21} />
              <strong>
                {preview
                  ? preview.run.stats.coverage + "%"
                  : assignments.length
                    ? assignments.length
                    : "—"}
              </strong>
              <span>
                {preview
                  ? "Minimum coverage in preview"
                  : "Published assignments"}
              </span>
            </div>
            <div className="form-setting">
              <span
                className={
                  "status-pill " +
                  (!data.config.settings.formOpen ? "closed" : "")
                }
              >
                <span className="dot" />
                {data.config.settings.formOpen ? "Form open" : "Form closed"}
              </span>
              <button
                className="text-button"
                disabled={!!busy}
                onClick={() =>
                  action("settings", async () => {
                    await api("admin/settings", {
                      formOpen: !data.config.settings.formOpen,
                    });
                    await load();
                    setMessage(
                      "Form " +
                        (data.config.settings.formOpen
                          ? "closed. Run a final preview before publishing."
                          : "opened. Members can edit their answers."),
                    );
                  })
                }
              >
                {data.config.settings.formOpen
                  ? "Close member form"
                  : "Reopen member form"}
              </button>
            </div>
          </div>
          <div className="workspace-toolbar">
            <div className="tabs" role="tablist" aria-label="Dashboard panels">
              {[
                ["schedule", "Schedule"],
                ["responses", "Responses"],
                ["heatmap", "Coverage heatmap"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                >
                  {label}
                  {key === "responses" && <span>{missing.length} missing</span>}
                </button>
              ))}
            </div>
            <div className="toolbar-actions">
              <button
                className="button secondary"
                disabled={!!busy}
                onClick={() =>
                  action("refresh", async () => {
                    await load();
                    setMessage("Roster, responses and config reloaded.");
                  })
                }
              >
                <RefreshCw
                  size={15}
                  className={busy === "refresh" ? "spin" : ""}
                />
                Refresh config
              </button>
              <button
                className="button primary"
                disabled={!!busy}
                onClick={run}
              >
                {busy === "run" ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Play size={15} />
                )}{" "}
                {busy === "run" ? "Finding a fit…" : "Run auto-assign"}
              </button>
            </div>
          </div>
          {tab === "responses" && (
            <section className="card responses-card">
              <div className="panel-heading">
                <div>
                  <h2>Every helping hand.</h2>
                  <p>
                    {missing.length} members haven’t sent their availability
                    yet.
                  </p>
                </div>
                <button
                  className="button secondary"
                  onClick={() =>
                    action("copy", async () => {
                      await navigator.clipboard.writeText(
                        missing
                          .map(
                            (p) =>
                              p.first + " " + p.last + " [" + p.committee + "]",
                          )
                          .join("\n"),
                      );
                      setMessage("Missing member names copied.");
                    })
                  }
                >
                  <Copy size={15} />
                  Copy missing names
                </button>
              </div>
              <div className="filter-buttons">
                {["all", "submitted", "missing"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={filter === f ? "active" : ""}
                  >
                    {f[0].toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Committee</th>
                      <th>Status</th>
                      <th>Available slots</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active
                      .filter(
                        (p) =>
                          filter === "all" ||
                          (filter === "submitted" ? submitted : missing).some(
                            (x) => x.id === p.id,
                          ),
                      )
                      .map((p) => {
                        const r = data.responses.find((r) => r.id === p.id);
                        return (
                          <tr key={p.id}>
                            <td>
                              <strong>
                                {p.first} {p.last}
                              </strong>
                              <small className="block muted">{p.id}</small>
                            </td>
                            <td>{p.committee}</td>
                            <td>
                              <span
                                className={
                                  "response-status " + (r ? "done" : "")
                                }
                              >
                                {r ? "Submitted" : "Waiting"}
                              </span>
                            </td>
                            <td>
                              {r?.availableSlots.filter((id) =>
                                data.config.slots.some((s) => s.id === id),
                              ).length ?? "—"}
                            </td>
                            <td className="notes-cell">{r?.notes || "—"}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {tab === "heatmap" && (
            <section className="card">
              <div className="panel-heading">
                <div>
                  <h2>A view of what’s possible.</h2>
                  <p>
                    Eligible, available members / minimum needed. Red means the
                    minimum cannot be met for that cell.
                  </p>
                </div>
              </div>
              <DayTabs days={days} day={day} setDay={setDay} />
              <div className="table-scroll">
                <table className="heatmap">
                  <thead>
                    <tr>
                      <th>Time</th>
                      {data.config.roles.map((r) => (
                        <th key={r.key}>
                          {r.icon}
                          <br />
                          {r.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {slots.map((s) => (
                      <tr key={s.id}>
                        <th>
                          {clock(s.start)}
                          <small className="block muted">{clock(s.end)}</small>
                        </th>
                        {data.config.roles.map((r) => {
                          const available =
                              data.heatmap.find(
                                (h) => h.slotId === s.id && h.roleKey === r.key,
                              )?.available ?? 0,
                            cap = limits(data.config, s.id, r.key);
                          return (
                            <td key={r.key}>
                              <div
                                className={
                                  "heat-cell " +
                                  (cap.max === 0
                                    ? "off"
                                    : available < cap.min
                                      ? "short"
                                      : "enough")
                                }
                              >
                                {cap.max === 0
                                  ? "—"
                                  : available + " / " + cap.min}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="grid-help">
                People may appear in several cells. Caps and competing roles can
                cause additional shortfalls when the scheduler runs.
              </p>
            </section>
          )}
          {tab === "schedule" && (
            <section className="card schedule-card">
              <div className="panel-heading">
                <div>
                  <h2>
                    {preview
                      ? "A first look at the week."
                      : assignments.length
                        ? "The published schedule."
                        : "Your week, ready to arrange."}
                  </h2>
                  <p>
                    {preview
                      ? "Preview only · " +
                        preview.run.method +
                        " · " +
                        (preview.run.elapsedMs / 1000).toFixed(2) +
                        " seconds"
                      : assignments.length
                        ? "Published assignments are shown below. Pinned assignments will be kept on the next run."
                        : "Run auto-assign to turn the team’s availability into a schedule."}
                  </p>
                </div>
                <span className="pin-count">
                  <Pin size={14} />
                  {locks.length} pinned
                </span>
              </div>
              {preview && (
                <>
                  <div className="preview-stats">
                    <div>
                      <strong>{preview.run.stats.coverage}%</strong>
                      <span>Minimum coverage</span>
                    </div>
                    <div>
                      <strong>{preview.run.stats.firstChoice}%</strong>
                      <span>Assignments in first-choice role</span>
                    </div>
                    <div>
                      <strong>
                        {preview.run.stats.min} / {preview.run.stats.avg} /{" "}
                        {preview.run.stats.max}
                      </strong>
                      <span>Shifts per member · min / avg / max</span>
                    </div>
                    <div>
                      <strong>
                        {preview.run.stats.needed - preview.run.stats.filled}
                      </strong>
                      <span>Unfilled minimum positions</span>
                    </div>
                  </div>
                  {previous && (
                    <p className="comparison">
                      Previous run: {previous.stats.coverage}% coverage ·{" "}
                      {previous.stats.firstChoice}% first-choice assignments ·{" "}
                      {previous.assignments.length} assignments.
                    </p>
                  )}
                  {preview.run.warnings.map((w, i) => (
                    <p className="notice warning" key={i}>
                      {w}
                    </p>
                  ))}
                </>
              )}
              {assignments.length > 0 || preview ? (
                <>
                  <DayTabs days={days} day={day} setDay={setDay} />
                  <div className="table-scroll">
                    <table className="schedule-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          {data.config.roles.map((r) => (
                            <th key={r.key}>
                              <span>{r.icon}</span>
                              {r.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {slots.map((slot) => (
                          <tr key={slot.id}>
                            <th>
                              {clock(slot.start)}
                              <small className="block muted">
                                {clock(slot.end)}
                              </small>
                            </th>
                            {data.config.roles.map((role) => {
                              const rows = assignments.filter(
                                  (a) =>
                                    a.slotId === slot.id &&
                                    a.roleKey === role.key,
                                ),
                                cap = limits(data.config, slot.id, role.key),
                                gap = Math.max(0, cap.min - rows.length);
                              return (
                                <td
                                  key={role.key}
                                  className={cap.max === 0 ? "blocked" : ""}
                                >
                                  {rows.map((a) => {
                                    const p = data.roster.find(
                                        (p) => p.id === a.id,
                                      ),
                                      pinned = locks.some((x) => same(x, a)),
                                      colour = data.config.committees.find(
                                        (c) => c.code === p?.committee,
                                      )?.colour;
                                    return (
                                      <div
                                        className={
                                          "assignment " +
                                          (pinned ? "pinned" : "")
                                        }
                                        key={a.id}
                                        style={{ borderLeftColor: colour }}
                                      >
                                        <span>
                                          <small>{p?.committee}</small>
                                          <strong>
                                            {p ? p.first + " " + p.last : a.id}
                                          </strong>
                                        </span>
                                        <button
                                          disabled={!!busy}
                                          aria-label={
                                            (pinned ? "Unpin " : "Pin ") +
                                            (p?.first ?? a.id) +
                                            " in " +
                                            slot.id +
                                            " " +
                                            role.label
                                          }
                                          title={
                                            pinned
                                              ? "Unpin assignment"
                                              : "Keep this assignment on re-run"
                                          }
                                          onClick={() => togglePin(a)}
                                        >
                                          {pinned ? (
                                            <Pin size={13} />
                                          ) : (
                                            <PinOff size={13} />
                                          )}
                                        </button>
                                      </div>
                                    );
                                  })}
                                  {gap > 0 && (
                                    <span className="gap-label">
                                      {gap} needed
                                    </span>
                                  )}
                                  {cap.max === 0 && (
                                    <span className="muted">Not needed</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="schedule-footnote">
                    <p>
                      <Pin size={14} /> Pin a person to keep their shift on the
                      next run.
                    </p>
                    <span>Committee colors come from config.</span>
                  </div>
                </>
              ) : (
                <div className="empty-schedule">
                  <CalendarDays size={40} strokeWidth={1} />
                  <h3>Good things start with a plan.</h3>
                  <p>
                    {submitted.length} responses are ready. Let’s find everyone
                    a place.
                  </p>
                  <button
                    className="button primary"
                    disabled={!!busy}
                    onClick={run}
                  >
                    <Play size={15} /> Create the first preview
                  </button>
                </div>
              )}
              {preview && (
                <div className="publish-section">
                  <div>
                    <h3>Ready to make it official?</h3>
                    <p>
                      {mode === "demo"
                        ? "Publishing saves to this demo’s memory. No Google Sheet will change."
                        : "Publishing replaces Assignments, Unfilled and names in the configured shift cells. Formatting stays."}
                    </p>
                    <p className="publish-warning">
                      Hand edits in shift tabs will be overwritten. Pin changes
                      in this workspace, close the member form, then run a final
                      preview.
                    </p>
                    {!data.config.settings.formOpen && preview.token && (
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={confirm}
                          onChange={(e) => setConfirm(e.target.checked)}
                        />
                        I reviewed this preview and am ready to replace the
                        published schedule.
                      </label>
                    )}
                  </div>
                  <button
                    className="button primary"
                    disabled={
                      !!busy ||
                      !confirm ||
                      !preview.token ||
                      data.config.settings.formOpen
                    }
                    onClick={publish}
                  >
                    <Upload size={16} />
                    {busy === "publish"
                      ? "Publishing…"
                      : mode === "demo"
                        ? "Publish to demo"
                        : "Publish to sheet"}
                  </button>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </Shell>
  );
}
function DayTabs({
  days,
  day,
  setDay,
}: {
  days: string[];
  day: string;
  setDay: (day: string) => void;
}) {
  return (
    <div className="day-tabs" role="tablist" aria-label="Schedule dates">
      {days.map((d) => (
        <button
          role="tab"
          aria-selected={d === day}
          key={d}
          onClick={() => setDay(d)}
        >
          {dayLabel(d, true)}
        </button>
      ))}
    </div>
  );
}
