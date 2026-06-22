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
  const { t } = useI18n();
  const { user } = useAuth();
  const [pending, setPending] = useState<ChangeRequest | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ mcUsername: "", reason: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <div className="page">
      <h2>{t("profile.title")}</h2>

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
          <a
            href={`https://discord.com/users/${user.discordId}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            {user.discordUsername}
          </a>
        </ProfileRow>

        <ProfileRow label={t("profile.mcUsername")}>
          <code>{user.mcUsername ?? "—"}</code>
        </ProfileRow>

        {user.publicFactionTag && (
          <ProfileRow label={t("profile.factionTag")}>
            <span className="badge">{user.publicFactionTag}</span>
          </ProfileRow>
        )}
      </div>

      <div className="card">
        <h3>{t("profile.changeUsername")}</h3>
        {pending ? (
          <div className="card-pending" style={{ padding: 12 }}>
            {t("profile.changePending", { name: pending.requestedMcUsername })}
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
