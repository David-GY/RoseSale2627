export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error ?? "Request failed");
  return data as T;
}
export function dayLabel(date: string, short = false) {
  return new Intl.DateTimeFormat("en-PH", {
    month: short ? "short" : "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T00:00:00Z"));
}
export function weekday(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(date + "T00:00:00Z"));
}
export function clock(time: string) {
  const [h, m] = time.split(":").map(Number);
  return (
    (h % 12 || 12) +
    (m ? ":" + String(m).padStart(2, "0") : "") +
    (h >= 12 ? " pm" : " am")
  );
}
