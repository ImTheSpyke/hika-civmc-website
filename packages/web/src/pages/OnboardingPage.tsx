import { useState } from "react";
import { api, ApiError } from "../api/client.js";
import { useI18n } from "../i18n/context.js";
import { useAuth } from "../lib/auth.js";

// Forced after account approval when the user has no Minecraft username yet.
// Blocks all other pages until completed (enforced in App routing).
export function OnboardingPage() {
  const { t } = useI18n();
  const { refresh, logout } = useAuth();
  const [mcUsername, setMcUsername] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const valid = /^[A-Za-z0-9_]{1,16}$/.test(mcUsername.trim());

  async function submit() {
    if (!valid || !confirmed) return;
    setSubmitting(true);
    setError("");
    try {
      await api.post("/api/me/onboard-username", { mcUsername: mcUsername.trim() });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.error"));
      setSubmitting(false);
    }
  }

  return (
    <div className="page-center">
      <div className="card form-card" style={{ maxWidth: 460, textAlign: "left" }}>
        <h2 style={{ marginTop: 0 }}>{t("onboarding.title")}</h2>
        <p>{t("onboarding.intro")}</p>

        <div className="form-field">
          <label>{t("onboarding.mcUsername")}</label>
          <input
            value={mcUsername}
            maxLength={16}
            autoFocus
            placeholder="Notch"
            onChange={(e) => setMcUsername(e.target.value)}
          />
        </div>

        <div className="card" style={{ borderColor: "var(--danger)", background: "transparent" }}>
          <p style={{ fontWeight: 700, color: "var(--danger)", margin: "0 0 6px" }}>
            ⚠ {t("onboarding.warnCaseSensitive")}
          </p>
          <p style={{ margin: 0, color: "var(--text-muted)" }}>
            {t("onboarding.warnSupport")}
          </p>
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>{t("onboarding.confirmCheckbox", { name: mcUsername.trim() || "…" })}</span>
        </label>

        {error && <p className="field-error">{error}</p>}

        <div className="form-actions">
          <button onClick={submit} disabled={!valid || !confirmed || submitting}>
            {t("onboarding.confirmButton")}
          </button>
          <button className="btn-secondary" onClick={() => logout()}>{t("nav.logout")}</button>
        </div>
      </div>
    </div>
  );
}
