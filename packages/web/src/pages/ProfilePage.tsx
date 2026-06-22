import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client.js";
import { useI18n } from "../i18n/context.js";
import { useAuth } from "../lib/auth.js";
import { Avatar } from "../components/Avatar.js";

interface ChangeRequest {
  id: number;
  requestedMcUsername: string;
  reason: string;
  status: string;
  createdAt: string;
}

export function ProfilePage() {
  const { t, locale, setLocale, availableLocales } = useI18n();
  const { user, logout } = useAuth();
  const [pending, setPending] = useState<ChangeRequest | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ mcUsername: "", reason: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  function loadPending() {
    api.get<ChangeRequest | null>("/api/me/username-change").then(setPending);
  }

  useEffect(() => { loadPending(); }, []);

  if (!user) return null;

  async function submit() {
    if (!form.mcUsername.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await api.post("/api/me/username-change", form);
      setShowForm(false);
      setForm({ mcUsername: "", reason: "" });
      loadPending();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelRequest() {
    setCancelling(true);
    try {
      await api.delete("/api/me/username-change");
      setPending(null);
    } finally {
      setCancelling(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      await api.delete("/api/me");
      // logout() clears the session cookie server-side and redirects to "/"
      await logout();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>{t("profile.title")}</h2>
        <span style={{ fontSize: 14, color: "var(--text-muted)", fontFamily: "monospace" }}>
          @{user.discordUsername}
        </span>
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <Avatar mcUsername={user.mcUsername} size={48} />
          <div>
            <strong style={{ fontSize: 18 }}>{user.discordDisplayName}</strong>
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
              {user.mcVerified ? t("profile.verified") : t("profile.notVerified")}
            </div>
          </div>
        </div>

        <ProfileRow label={t("profile.discord")}>
          <span>@{user.discordUsername}</span>
        </ProfileRow>

        <ProfileRow label={t("profile.mcUsername")}>
          <code>{user.mcUsername ?? "—"}</code>
        </ProfileRow>

        {user.publicFactionTag && (
          <ProfileRow label={t("profile.factionTag")}>
            <span className="badge">{user.publicFactionTag}</span>
          </ProfileRow>
        )}

        {availableLocales.length > 1 && (
          <ProfileRow label={t("profile.language")}>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              style={{ padding: "2px 6px" }}
            >
              {availableLocales.map((l) => (
                <option key={l} value={l}>{l.toUpperCase()}</option>
              ))}
            </select>
          </ProfileRow>
        )}
      </div>

      {/* Danger zone */}
      <div className="card" style={{ borderColor: "color-mix(in srgb, var(--danger) 40%, var(--border))" }}>
        <h3 style={{ color: "var(--danger)", marginBottom: 4 }}>{t("profile.dangerZone")}</h3>
        {!showDeleteConfirm ? (
          <div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
              {t("profile.deleteAccountDesc")}
            </p>
            <button className="btn-danger" onClick={() => setShowDeleteConfirm(true)}>
              {t("profile.deleteAccount")}
            </button>
          </div>
        ) : (
          <div>
            <p style={{ fontWeight: 700, color: "var(--danger)", marginBottom: 6 }}>
              ⚠ {t("profile.deleteAccountWarning")}
            </p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
              {t("profile.deleteAccountConfirmDesc")}
            </p>
            <div className="form-field" style={{ marginBottom: 12 }}>
              <label>{t("profile.deleteAccountTypeConfirm", { word: "DELETE" })}</label>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
              />
            </div>
            <div className="form-actions">
              <button
                className="btn-danger"
                onClick={deleteAccount}
                disabled={deleting || deleteConfirmText !== "DELETE"}
              >
                {deleting ? t("common.loading") : t("profile.deleteAccountConfirm")}
              </button>
              <button
                className="btn-secondary"
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3>{t("profile.changeUsername")}</h3>
        {pending ? (
          <div>
            <div className="card-pending" style={{ padding: 12, marginBottom: 12 }}>
              {t("profile.changePending", { name: pending.requestedMcUsername })}
            </div>
            <button
              className="btn-secondary"
              onClick={cancelRequest}
              disabled={cancelling}
            >
              {t("profile.cancelChangeRequest")}
            </button>
          </div>
        ) : showForm ? (
          <div>
            <p style={{ color: "var(--danger)", fontWeight: 600 }}>{t("profile.changeWarningCaseSensitive")}</p>
            <p style={{ color: "var(--text-muted)" }}>{t("profile.changeWarningSupport")}</p>
            <div className="form-field">
              <label>{t("profile.newMcUsername")}</label>
              <input
                value={form.mcUsername}
                maxLength={16}
                onChange={(e) => setForm({ ...form, mcUsername: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>{t("profile.changeReason")}</label>
              <textarea
                value={form.reason}
                rows={2}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </div>
            {error && <p className="field-error">{error}</p>}
            <div className="form-actions">
              <button onClick={submit} disabled={submitting || !form.mcUsername.trim()}>
                {t("common.submit")}
              </button>
              <button className="btn-secondary" onClick={() => { setShowForm(false); setError(""); }}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowForm(true)}>{t("profile.requestChange")}</button>
        )}
      </div>
    </div>
  );
}

function ProfileRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ width: 140, color: "var(--text-muted)" }}>{label}</span>
      <span>{children}</span>
    </div>
  );
}
