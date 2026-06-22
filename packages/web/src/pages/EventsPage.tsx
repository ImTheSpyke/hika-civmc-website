import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client.js";
import { useI18n } from "../i18n/context.js";
import { useAuth } from "../lib/auth.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { ReportToggle } from "../components/ReportToggle.js";
import { Markdown } from "../components/Markdown.js";
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

const EMPTY_FORM = { name: "", description: "", startsAt: "", durationMinutes: "60", x: "", y: "", z: "" };

export function EventsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [confirm, setConfirm] = useState<
    | { kind: "hide" | "delete"; ev: Event }
    | null
  >(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [myPending, setMyPending] = useState<Event[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<typeof EMPTY_FORM>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function loadAll() {
    api.get<Event[]>("/api/events").then(setEvents);
    api.get<Event[]>("/api/me/events").then(setMyPending);
  }

  useEffect(() => { loadAll(); }, []);

  const systemEvents = events.filter((e) => e.isSystem);
  const regularEvents = events.filter((e) => !e.isSystem);

  function validate() {
    const e: Partial<typeof EMPTY_FORM> = {};
    if (!form.name.trim()) e.name = t("error.invalidInput");
    if (!form.startsAt) e.startsAt = t("error.invalidInput");
    if (!form.durationMinutes || Number(form.durationMinutes) < 1) e.durationMinutes = t("error.invalidInput");
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function requestEvent() {
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await api.post("/api/events", {
        ...form,
        durationMinutes: Number(form.durationMinutes),
        x: form.x ? Number(form.x) : undefined,
        y: form.y ? Number(form.y) : undefined,
        z: form.z ? Number(form.z) : undefined,
      });
      setShowForm(false);
      setForm(EMPTY_FORM);
      setErrors({});
      loadAll();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  function cancel() {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setErrors({});
    setSubmitError("");
  }

  async function runConfirm() {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      if (confirm.kind === "delete") {
        await api.delete(`/api/events/${confirm.ev.id}`);
      } else {
        await api.patch(`/api/events/${confirm.ev.id}/hide`);
      }
      setConfirm(null);
      loadAll();
    } finally {
      setConfirmBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t("events.title")}</h2>
        <button onClick={() => setShowForm(!showForm)}>{t("events.request")}</button>
      </div>

      {showForm && (
        <div className="card form-card">
          <div className="form-field">
            <label>Event title *</label>
            <input
              placeholder="e.g. Trade fair at spawn"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={errors.name ? "input-error" : ""}
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>

          <div className="form-field">
            <label>Description</label>
            <textarea
              placeholder="What's happening? Where to meet, what to bring…"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
          </div>

          <div className="form-row">
            <div className="form-field" style={{ flex: 2 }}>
              <label>Date & time *</label>
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                className={errors.startsAt ? "input-error" : ""}
              />
              {errors.startsAt && <span className="field-error">{errors.startsAt}</span>}
            </div>
            <div className="form-field" style={{ flex: 1 }}>
              <label>Duration (minutes) *</label>
              <input
                type="number"
                min={1}
                placeholder="60"
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: String(Number(e.target.value)) })}
                className={errors.durationMinutes ? "input-error" : ""}
              />
              {errors.durationMinutes && <span className="field-error">{errors.durationMinutes}</span>}
            </div>
          </div>

          <div className="form-field">
            <label>Coordinates (optional)</label>
            <div className="form-row">
              <input placeholder="X" value={form.x} onChange={(e) => setForm({ ...form, x: e.target.value })} />
              <input placeholder="Y" value={form.y} onChange={(e) => setForm({ ...form, y: e.target.value })} />
              <input placeholder="Z" value={form.z} onChange={(e) => setForm({ ...form, z: e.target.value })} />
            </div>
          </div>

          {submitError && <p className="field-error">{submitError}</p>}

          <div className="form-actions">
            <button onClick={requestEvent} disabled={submitting}>{t("common.submit")}</button>
            <button className="btn-secondary" onClick={cancel}>{t("common.cancel")}</button>
          </div>
        </div>
      )}

      {/* My pending submissions */}
      {myPending.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 8, fontSize: 14, color: "var(--text-muted)" }}>Your pending requests</h3>
          {myPending.map((e) => (
            <div key={e.id} className="card card-pending">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>{e.name}</strong>
                <span className="badge badge-pending">Awaiting approval</span>
              </div>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {new Date(e.starts_at).toLocaleString()} · {e.duration_minutes} min
              </span>
            </div>
          ))}
        </div>
      )}

      {/* System events */}
      {systemEvents.map((e) => (
        <div key={e.id} className="card card-system">
          <h3>⚔ {e.name}</h3>
          {e.description && <Markdown>{e.description}</Markdown>}
          <p>{t("events.nextIn", { time: "" })} <Countdown target={e.starts_at} /></p>
        </div>
      ))}

      {regularEvents.length === 0 && systemEvents.length === 0 && myPending.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>{t("events.noEvents")}</p>
      )}

      {regularEvents.map((e) => {
        const canManage = e.mine || user?.isAdmin;
        return (
          <div key={e.id} className="card" style={{ position: "relative" }}>
            <ReportToggle targetType="event" targetId={e.id} reported={!!e.reported} />
            <h3>{e.name}</h3>
            {e.description && <Markdown>{e.description}</Markdown>}
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {new Date(e.starts_at).toLocaleString()} · {e.duration_minutes} min
            </p>
            {e.x != null && (
              <p className="coords">{t("events.coordsLabel", { x: e.x!, y: e.y!, z: e.z! })}</p>
            )}
            <Countdown target={e.starts_at} />
            {canManage && (
              <div className="form-actions" style={{ marginTop: 10 }}>
                <button className="btn-small btn-secondary" onClick={() => setConfirm({ kind: "hide", ev: e })}>
                  {t("events.hide")}
                </button>
                <button className="btn-small btn-danger" onClick={() => setConfirm({ kind: "delete", ev: e })}>
                  {t("common.delete")}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === "delete" ? t("events.confirmDeleteTitle") : t("events.confirmHideTitle")}
          message={
            confirm.kind === "delete"
              ? t("events.confirmDeleteBody", { name: confirm.ev.name })
              : t("events.confirmHideBody", { name: confirm.ev.name })
          }
          confirmLabel={confirm.kind === "delete" ? t("common.delete") : t("events.hide")}
          danger={confirm.kind === "delete"}
          busy={confirmBusy}
          onConfirm={runConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
