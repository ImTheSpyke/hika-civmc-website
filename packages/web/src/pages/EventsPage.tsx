import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n/context.js";
import type { Event } from "../api/types.js";

function formatCountdown(target: Date): string {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

function Countdown({ target }: { target: string }) {
  const [display, setDisplay] = useState(() => formatCountdown(new Date(target)));

  useEffect(() => {
    const id = setInterval(() => setDisplay(formatCountdown(new Date(target))), 5000);
    return () => clearInterval(id);
  }, [target]);

  return <span className="countdown">{display}</span>;
}

export function EventsPage() {
  const { t } = useI18n();
  const [events, setEvents] = useState<Event[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "", description: "", startsAt: "", durationMinutes: 60,
    x: "", y: "", z: "",
  });

  useEffect(() => {
    api.get<Event[]>("/api/events").then(setEvents);
  }, []);

  const systemEvents = events.filter((e) => e.isSystem);
  const regularEvents = events.filter((e) => !e.isSystem);

  async function requestEvent() {
    await api.post("/api/events", {
      ...form,
      durationMinutes: Number(form.durationMinutes),
      x: form.x ? Number(form.x) : undefined,
      y: form.y ? Number(form.y) : undefined,
      z: form.z ? Number(form.z) : undefined,
    });
    setShowForm(false);
    setForm({ name: "", description: "", startsAt: "", durationMinutes: 60, x: "", y: "", z: "" });
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t("events.title")}</h2>
        <button onClick={() => setShowForm(!showForm)}>{t("events.request")}</button>
      </div>

      {showForm && (
        <div className="card">
          <input placeholder={t("events.name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <textarea placeholder={t("events.description")} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
          <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          <input type="number" placeholder={t("events.duration")} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} />
          <div style={{ display: "flex", gap: 8 }}>
            <input placeholder="X" value={form.x} onChange={(e) => setForm({ ...form, x: e.target.value })} style={{ width: 80 }} />
            <input placeholder="Y" value={form.y} onChange={(e) => setForm({ ...form, y: e.target.value })} style={{ width: 80 }} />
            <input placeholder="Z" value={form.z} onChange={(e) => setForm({ ...form, z: e.target.value })} style={{ width: 80 }} />
          </div>
          <button onClick={requestEvent}>{t("common.submit")}</button>
          <button onClick={() => setShowForm(false)}>{t("common.cancel")}</button>
        </div>
      )}

      {/* Pinned system events */}
      {systemEvents.map((e) => (
        <div key={e.id} className="card card-system">
          <h3>⚔ {e.name}</h3>
          <p>{e.description}</p>
          <p>{t("events.nextIn", { time: "" })} <Countdown target={e.starts_at} /></p>
        </div>
      ))}

      {regularEvents.length === 0 && systemEvents.length === 0 && (
        <p>{t("events.noEvents")}</p>
      )}

      {regularEvents.map((e) => (
        <div key={e.id} className="card">
          <h3>{e.name}</h3>
          <p>{e.description}</p>
          <p>
            {new Date(e.starts_at).toLocaleString()} · {e.duration_minutes} min
          </p>
          {e.x != null && (
            <p className="coords">
              {t("events.coordsLabel", { x: e.x!, y: e.y!, z: e.z! })}
            </p>
          )}
          <p><Countdown target={e.starts_at} /></p>
          <button
            className="btn-small btn-report"
            onClick={() => api.post("/api/reports", { targetType: "event", targetId: e.id })}
          >
            {t("events.report")}
          </button>
        </div>
      ))}
    </div>
  );
}
