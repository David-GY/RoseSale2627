"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Flower2,
  CalendarDays,
  Heart,
  LogOut,
  Save,
  MapPin,
  LoaderCircle,
} from "lucide-react";
import type { Config, Person, MemberResponse } from "../lib/domain";
import { api, dayLabel, weekday } from "../lib/client";
import { Shell } from "../components/Shell";
import AvailabilityGrid from "../components/AvailabilityGrid";
type Member = {
  person: Person;
  roles: Config["roles"];
  response: MemberResponse | null;
};
export default function MemberPage() {
  const [config, setConfig] = useState<Config>(),
    [mode, setMode] = useState(""),
    [member, setMember] = useState<Member | null>(null);
  const [id, setId] = useState(""),
    [verification, setVerification] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [preferences, setPreferences] = useState<string[]>([]),
    [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [dirty, setDirty] = useState(false);
  function fill(m: Member, c?: Config) {
    setMember(m);
    setSelected(
      m.response?.availableSlots.filter((id) =>
        (c ?? config)?.slots.some((s) => s.id === id),
      ) ?? [],
    );
    setPreferences(
      m.response?.preferences.filter((id) =>
        m.roles.some((r) => r.key === id),
      ) ?? [],
    );
    setNotes(m.response?.notes ?? "");
    setDirty(false);
  }
  useEffect(() => {
    api<{ config: Config; mode: string }>("config")
      .then(async (data) => {
        setConfig(data.config);
        setMode(data.mode);
        try {
          const m = await api<Member>("member/session");
          fill(m, data.config);
        } catch {}
      })
      .catch((e) => setError(e.message));
  }, []);
  async function login(e?: React.FormEvent, demo = false) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      fill(
        await api<Member>("member", { id: demo ? "1001" : id, verification }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ response: MemberResponse }>("responses", {
        availableSlots: selected,
        preferences: preferences.filter(Boolean),
        notes,
      });
      setMessage(
        "Availability saved. You can come back and edit while the form is open.",
      );
      setDirty(false);
      if (member) setMember({ ...member, response: result.response });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const days = [...new Set(config?.slots.map((s) => s.date) ?? [])].sort(),
    committee = config?.committees.find(
      (c) => c.code === member?.person.committee,
    );
  return (
    <Shell mode={mode}>
      {!config ? (
        <div className="loading" role="status">
          {error || "Getting the week ready…"}
        </div>
      ) : (
        <>
          <div className="event-line">
            <span
              className={
                "status-pill " + (!config.settings.formOpen ? "closed" : "")
              }
            >
              <span className="dot" />
              {config.settings.formOpen
                ? "Availability is open"
                : "Availability is closed"}
            </span>
            <span>
              <MapPin size={14} />
              {config.settings.venue}
            </span>
            <span>
              {days.length
                ? dayLabel(days[0], true) + " – " + dayLabel(days.at(-1)!, true)
                : ""}
            </span>
          </div>
          <section className={"member-intro " + (member ? "compact" : "")}>
            <div>
              <p className="eyebrow">{config.settings.eventName}</p>
              <h1>
                Your time makes
                <br className="desktop-break" /> it bloom.
              </h1>
              <p className="intro-copy">
                {member
                  ? "Let us know when you can lend a hand. We’ll find a shift that fits."
                  : "A few hours of your week can make someone’s day. Share when you’re free, choose your favorite roles, and we’ll take it from there."}
              </p>
            </div>
            <div className="bloom-illustration" aria-hidden="true">
              <div className="flower-disc">
                <Flower2 strokeWidth={0.65} />
              </div>
              <span>
                A little time.
                <br />A lot of love.
              </span>
              <div className="stem" />
            </div>
          </section>
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="notice success" role="status">
              <Check size={18} />
              {message}
            </div>
          )}
          {!member ? (
            <div className="entry-layout">
              <section className="card identity-card">
                <div className="section-heading">
                  <span className="step">1</span>
                  <div>
                    <h2>Let’s start with you.</h2>
                    <p>Your ID connects you to the Rose Sale team.</p>
                  </div>
                </div>
                <form onSubmit={(e) => login(e)}>
                  <label htmlFor="student-id">Member ID</label>
                  <input
                    id="student-id"
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    placeholder="Enter your ID number"
                    required
                    autoComplete="username"
                    maxLength={100}
                  />
                  {config.settings.verifyField !== "NONE" && (
                    <>
                      <label htmlFor="verification">
                        {config.settings.verifyField === "PIN"
                          ? "Your PIN"
                          : "Last name"}
                      </label>
                      <input
                        id="verification"
                        type={
                          config.settings.verifyField === "PIN"
                            ? "password"
                            : "text"
                        }
                        value={verification}
                        onChange={(e) => setVerification(e.target.value)}
                        required
                        autoComplete={
                          config.settings.verifyField === "PIN"
                            ? "current-password"
                            : "family-name"
                        }
                      />
                    </>
                  )}
                  <button
                    className="button primary wide"
                    disabled={busy}
                    type="submit"
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={18} />
                    ) : (
                      "Find my availability"
                    )}
                    <ArrowRight size={17} />
                  </button>
                </form>
                {mode === "demo" && (
                  <div className="demo-tip">
                    <strong>Just exploring?</strong>
                    <p>
                      Try placeholder member 1001, Ana Tan from the project
                      managers.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => login(undefined, true)}
                      disabled={busy}
                    >
                      Try Ana’s availability <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </section>
              <section className="week-card">
                <div className="week-card-top">
                  <CalendarDays size={23} />
                  <span>The week ahead</span>
                </div>
                <h2>
                  Small moments.
                  <br />
                  Something meaningful.
                </h2>
                <div className="date-strip">
                  {days.map((day) => (
                    <div key={day}>
                      <span>{weekday(day)}</span>
                      <strong>{day.slice(-2)}</strong>
                      <small>
                        {new Intl.DateTimeFormat("en", {
                          month: "short",
                          timeZone: "UTC",
                        }).format(new Date(day + "T00:00:00Z"))}
                      </small>
                    </div>
                  ))}
                </div>
                <p>
                  <Heart size={17} /> Your preferences help us find your place.
                </p>
                <p className="muted">
                  Only organizers can see your answers. You can update them
                  until the form closes.
                </p>
              </section>
            </div>
          ) : (
            <>
              <div className="member-bar">
                <span className="avatar">
                  {member.person.first[0]}
                  {member.person.last[0]}
                </span>
                <div>
                  <strong>
                    {member.person.first} {member.person.last}
                  </strong>
                  <span>
                    {committee?.name} · {member.person.id}
                  </span>
                </div>
                <button
                  className="text-button"
                  onClick={async () => {
                    await api("member/logout", {});
                    setMember(null);
                    setMessage("");
                  }}
                >
                  <LogOut size={15} /> Change member
                </button>
              </div>
              <div className="scheduler-layout">
                <section className="card grid-card">
                  <div className="section-heading">
                    <span className="step">2</span>
                    <div>
                      <h2>When can you lend a hand?</h2>
                      <p>
                        Select every slot that works for you. These are
                        possibilities, not assigned shifts.
                      </p>
                    </div>
                  </div>
                  <AvailabilityGrid
                    config={config}
                    selected={selected}
                    disabled={!config.settings.formOpen || busy}
                    onChange={(ids) => {
                      setSelected(ids);
                      setDirty(true);
                      setMessage("");
                    }}
                  />
                </section>
                <aside className="preference-column">
                  <section className="card">
                    <div className="section-heading">
                      <span className="step">3</span>
                      <div>
                        <h2>Find your place.</h2>
                        <p>Rank up to three roles.</p>
                      </div>
                    </div>
                    {member.roles.length ? (
                      <>
                        <p className="preference-help">
                          You may be placed in any role your committee is
                          eligible for.
                        </p>
                        {[0, 1, 2].map((i) => (
                          <div className="rank-field" key={i}>
                            <label htmlFor={"pref-" + i}>
                              {
                                [
                                  "First choice",
                                  "Second choice",
                                  "Third choice",
                                ][i]
                              }
                              {i === 0 ? " *" : " · optional"}
                            </label>
                            <select
                              id={"pref-" + i}
                              disabled={!config.settings.formOpen || busy}
                              value={preferences[i] ?? ""}
                              onChange={(e) => {
                                const next = [...preferences];
                                next[i] = e.target.value;
                                setPreferences(next);
                                setDirty(true);
                                setMessage("");
                              }}
                            >
                              <option value="">Choose a role</option>
                              {member.roles.map((role) => (
                                <option
                                  key={role.key}
                                  value={role.key}
                                  disabled={preferences.some(
                                    (v, j) => j !== i && v === role.key,
                                  )}
                                >
                                  {role.icon} {role.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </>
                    ) : (
                      <p>
                        No roles are available for {member.person.committee}.
                        You can still share your availability.
                      </p>
                    )}
                    <label htmlFor="notes">
                      Anything we should know?{" "}
                      <span className="muted">Optional</span>
                    </label>
                    <textarea
                      id="notes"
                      rows={3}
                      maxLength={1000}
                      placeholder="A class, a commitment, a little context…"
                      value={notes}
                      disabled={!config.settings.formOpen || busy}
                      onChange={(e) => {
                        setNotes(e.target.value);
                        setDirty(true);
                      }}
                    />
                  </section>
                  <section className="save-card">
                    <div>
                      <CalendarDays size={19} />
                      <span>
                        <strong>{selected.length} slots</strong> selected across{" "}
                        {
                          new Set(
                            config.slots
                              .filter((s) => selected.includes(s.id))
                              .map((s) => s.date),
                          ).size
                        }{" "}
                        days
                      </span>
                    </div>
                    <button
                      className="button primary wide"
                      disabled={
                        busy ||
                        !config.settings.formOpen ||
                        (member.roles.length > 0 &&
                          !preferences.filter(Boolean).length)
                      }
                      onClick={save}
                    >
                      {busy ? (
                        <LoaderCircle size={17} className="spin" />
                      ) : (
                        <Save size={17} />
                      )}
                      Save availability
                    </button>
                    <p>
                      {!config.settings.formOpen
                        ? "The form is closed. Your answers are read-only."
                        : dirty
                          ? "You have unsaved changes."
                          : member.response
                            ? "Your last saved answers are shown."
                            : "Zero slots is okay if you’re unavailable."}
                    </p>
                  </section>
                </aside>
              </div>
            </>
          )}
        </>
      )}
    </Shell>
  );
}
