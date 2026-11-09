"use client";
import { useRef, useState } from "react";
import { Check, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import type { Config } from "../lib/domain";
import { dayLabel, weekday, clock } from "../lib/client";
export default function AvailabilityGrid({
  config,
  selected,
  onChange,
  disabled = false,
}: {
  config: Config;
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const days = [...new Set(config.slots.map((s) => s.date))].sort(),
    [active, setActive] = useState(0);
  const times = [
    ...new Map(
      [...config.slots]
        .sort(
          (a, b) =>
            a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
        )
        .map((s) => [s.start + "|" + s.end, { start: s.start, end: s.end }]),
    ).values(),
  ];
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const paint = useRef<{
    mode: boolean;
    visited: Set<string>;
    touch: boolean;
    started: boolean;
    id: string;
    timer?: ReturnType<typeof setTimeout>;
  } | null>(null);
  function toggle(id: string, mode: boolean) {
    const values = new Set(selectedRef.current);
    if (mode) values.add(id);
    else values.delete(id);
    selectedRef.current = [...values];
    onChange([...values]);
  }
  function start(e: React.PointerEvent<HTMLButtonElement>, id: string) {
    if (disabled || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const mode = !selectedRef.current.includes(id),
      touch = e.pointerType === "touch";
    paint.current = {
      mode,
      visited: new Set([id]),
      touch,
      started: !touch,
      id,
    };
    if (touch)
      paint.current.timer = setTimeout(() => {
        if (paint.current) {
          paint.current.started = true;
          toggle(id, mode);
        }
      }, 280);
    else {
      e.preventDefault();
      toggle(id, mode);
    }
  }
  function move(e: React.PointerEvent) {
    const p = paint.current;
    if (!p?.started) return;
    const target = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>("[data-slot]"),
      id = target?.dataset.slot;
    if (id && !p.visited.has(id)) {
      p.visited.add(id);
      toggle(id, p.mode);
    }
  }
  function finish() {
    const p = paint.current;
    if (!p) return;
    clearTimeout(p.timer);
    if (p.touch && !p.started) toggle(p.id, p.mode);
    paint.current = null;
  }
  function selectDay(day: string) {
    const ids = config.slots.filter((s) => s.date === day).map((s) => s.id),
      all = ids.every((id) => selected.includes(id)),
      next = new Set(selected);
    ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
    onChange([...next]);
  }
  return (
    <div className="availability">
      <div className="grid-toolbar">
        <p>
          <span className="legend-square" />
          Available <span className="muted">· Click or drag to select</span>
        </p>
        <button
          className="text-button"
          disabled={disabled || !selected.length}
          onClick={() => onChange([])}
        >
          Clear all
        </button>
      </div>
      <div className="mobile-days">
        <button
          aria-label="Previous day"
          disabled={active === 0}
          onClick={() => setActive(active - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <span>
          {weekday(days[active])}, {dayLabel(days[active])}
        </span>
        <button
          aria-label="Next day"
          disabled={active === days.length - 1}
          onClick={() => setActive(active + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div
        className="availability-grid"
        style={{
          gridTemplateColumns:
            "82px repeat(" + days.length + ", minmax(0, 1fr))",
        }}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={() => {
          if (paint.current) clearTimeout(paint.current.timer);
          paint.current = null;
        }}
      >
        <div className="time-heading">Time</div>
        {days.map((day, i) => (
          <div
            key={day}
            className={"day-heading " + (i !== active ? "not-active" : "")}
          >
            <span>{weekday(day)}</span>
            <strong>{dayLabel(day, true)}</strong>
            <button disabled={disabled} onClick={() => selectDay(day)}>
              {config.slots
                .filter((s) => s.date === day)
                .every((s) => selected.includes(s.id))
                ? "Clear day"
                : "Select day"}
            </button>
          </div>
        ))}
        {times.map((time) => (
          <div className="grid-row" key={time.start + time.end}>
            <div className="time-label">
              <strong>{clock(time.start)}</strong>
              <span>{clock(time.end)}</span>
            </div>
            {days.map((day, i) => {
              const slot = config.slots.find(
                  (s) =>
                    s.date === day &&
                    s.start === time.start &&
                    s.end === time.end,
                ),
                isSelected = slot && selected.includes(slot.id);
              return slot ? (
                <button
                  key={day}
                  data-slot={slot.id}
                  disabled={disabled}
                  className={
                    "slot " +
                    (isSelected ? "selected " : "") +
                    (i !== active ? "not-active" : "")
                  }
                  aria-pressed={!!isSelected}
                  aria-label={
                    weekday(day) +
                    " " +
                    dayLabel(day) +
                    " " +
                    clock(time.start) +
                    " to " +
                    clock(time.end)
                  }
                  title={slot.label}
                  onPointerDown={(e) => start(e, slot.id)}
                  onClick={(e) => {
                    if (e.detail === 0 && !disabled)
                      toggle(slot.id, !selected.includes(slot.id));
                  }}
                >
                  <span>
                    {isSelected ? <Check size={16} /> : <Plus size={15} />}
                  </span>
                  <small>{isSelected ? "Available" : "Add time"}</small>
                </button>
              ) : (
                <div
                  key={day}
                  className={
                    "slot empty-slot " + (i !== active ? "not-active" : "")
                  }
                  aria-label="No slot"
                />
              );
            })}
          </div>
        ))}
      </div>
      <p className="grid-help">
        Tap a slot on your phone, or hold and drag to select several. Use Tab
        and Space with a keyboard.
      </p>
    </div>
  );
}
