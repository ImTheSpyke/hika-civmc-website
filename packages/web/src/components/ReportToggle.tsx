import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client.js";
import { useI18n } from "../i18n/context.js";

const COOLDOWN_MS = 15_000;

// Shared cooldown clock across every report button on the page. Adding a report
// (not removing) starts a 15s window during which no new report can be added.
let cooldownUntil = 0;
const listeners = new Set<() => void>();

function startCooldown(ms: number) {
  cooldownUntil = Date.now() + ms;
  listeners.forEach((fn) => fn());
}

function useCooldownRemaining(): number {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    const id = setInterval(fn, 500);
    return () => {
      listeners.delete(fn);
      clearInterval(id);
    };
  }, []);
  return Math.max(0, cooldownUntil - Date.now());
}

interface ReportToggleProps {
  targetType: "newspaper" | "article" | "event";
  targetId: number;
  reported: boolean;
  /** Called with the new reported state after a successful toggle. */
  onChange?: (reported: boolean) => void;
}

export function ReportToggle({ targetType, targetId, reported, onChange }: ReportToggleProps) {
  const { t } = useI18n();
  const [state, setState] = useState(reported);
  const [busy, setBusy] = useState(false);
  const remaining = useCooldownRemaining();

  useEffect(() => setState(reported), [reported]);

  // Cooldown only blocks *adding* a report, never removing one.
  const blocked = !state && remaining > 0;

  async function toggle() {
    if (busy || blocked) return;
    setBusy(true);
    try {
      if (state) {
        await api.delete(`/api/reports/${targetType}/${targetId}`);
        setState(false);
        onChange?.(false);
      } else {
        await api.post("/api/reports", { targetType, targetId });
        setState(true);
        onChange?.(true);
        startCooldown(COOLDOWN_MS);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        startCooldown(typeof err.retryMs === "number" ? err.retryMs : COOLDOWN_MS);
      }
    } finally {
      setBusy(false);
    }
  }

  const secs = Math.ceil(remaining / 1000);
  return (
    <button
      className={`btn-small report-corner ${state ? "btn-reported" : "btn-report"}`}
      onClick={toggle}
      disabled={busy || blocked}
      title={
        state
          ? t("report.remove")
          : blocked
          ? t("report.cooldown", { secs })
          : t("report.add")
      }
    >
      {state ? "⚑" : "⚐"}
      {blocked ? ` ${secs}s` : ""}
    </button>
  );
}
