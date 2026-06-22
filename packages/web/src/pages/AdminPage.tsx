import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useI18n } from "../i18n/context.js";

interface Stats {
  registeredUsers: number;
  currentlyActive: number;
  avgActive1h: number;
  avgActive4h: number;
  newspapers: number;
  articlesPublished: { total: number; last7d: number };
  eventsUpcoming: number;
  pending: { accounts: number; newspapers: number; events: number; usernameChanges: number; moderationReviews: number };
}

interface AdminUser {
  id: number;
  discord_username: string;
  discord_display_name: string;
  mc_username: string | null;
  mc_verified: boolean;
  status: string;
  is_admin: boolean;
  created_at: string;
}

interface Moditem {
  type: string;
  id: number;
  title: string;
  newspaper_name: string | null;
  newspaper_id: number | null;
  active: boolean;
}

interface UsernameChange {
  id: number;
  user_id: number;
  requested_mc_username: string;
  current_mc_username: string | null;
  discord_display_name: string;
  reason: string;
  created_at: string;
}

interface LogEntry {
  id: number;
  at: string;
  actor_id: number | null;
  actor_name: string | null;
  action: string;
  target_type: string | null;
  target_id: number | null;
  meta: string | null;
}

interface LogPage {
  total: number;
  page: number;
  limit: number;
  rows: LogEntry[];
}

type Tab = "stats" | "users" | "newspapers" | "events" | "moderation" | "log" | "settings";

interface SiteSettings {
  auto_approve_accounts: boolean;
  auto_approve_username_changes: boolean;
  auto_approve_newspapers: boolean;
}

export function AdminPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("stats");
  const [stats, setStats] = useState<Stats | null>(null);
  const [pendingUsers, setPendingUsers] = useState<AdminUser[]>([]);
  const [usernameChanges, setUsernameChanges] = useState<UsernameChange[]>([]);
  const [modItems, setModItems] = useState<Moditem[]>([]);
  const [logData, setLogData] = useState<LogPage | null>(null);
  const [logPage, setLogPage] = useState(1);
  const [badges, setBadges] = useState({ users: 0, newspapers: 0, events: 0, moderation: 0 });

  // Load pending counts once on mount for tab badges
  useEffect(() => {
    api.get<Stats>("/api/admin/stats").then((s) => {
      setBadges({
        users: s.pending.accounts + s.pending.usernameChanges,
        newspapers: s.pending.newspapers,
        events: s.pending.events,
        moderation: s.pending.moderationReviews,
      });
      setStats(s);
    });
  }, []);

  useEffect(() => {
    if (tab === "stats") api.get<Stats>("/api/admin/stats").then((s) => { setStats(s); setBadges({ users: s.pending.accounts + s.pending.usernameChanges, newspapers: s.pending.newspapers, events: s.pending.events, moderation: s.pending.moderationReviews }); });
    if (tab === "users") {
      api.get<AdminUser[]>("/api/admin/users?status=pending").then(setPendingUsers);
      api.get<UsernameChange[]>("/api/admin/username-changes").then(setUsernameChanges);
    }
    if (tab === "moderation") api.get<Moditem[]>("/api/admin/moderation").then(setModItems);
    if (tab === "log") api.get<LogPage>(`/api/admin/log?page=${logPage}&limit=50`).then(setLogData);
  }, [tab, logPage]);

  async function approveUser(id: number) {
    await api.post(`/api/admin/users/${id}/approve`);
    setPendingUsers((u) => u.filter((x) => x.id !== id));
    setBadges((b) => ({ ...b, users: Math.max(0, b.users - 1) }));
  }

  async function rejectUser(id: number) {
    await api.post(`/api/admin/users/${id}/reject`);
    setPendingUsers((u) => u.filter((x) => x.id !== id));
    setBadges((b) => ({ ...b, users: Math.max(0, b.users - 1) }));
  }

  async function approveUsernameChange(id: number) {
    await api.post(`/api/admin/username-changes/${id}/approve`);
    setUsernameChanges((c) => c.filter((x) => x.id !== id));
  }

  async function rejectUsernameChange(id: number) {
    await api.post(`/api/admin/username-changes/${id}/reject`);
    setUsernameChanges((c) => c.filter((x) => x.id !== id));
  }

  async function reinstate(type: string, id: number) {
    await api.post(`/api/admin/moderation/${type}/${id}/reinstate`);
    setModItems((m) => m.filter((x) => !(x.type === type && x.id === id)));
    setBadges((b) => ({ ...b, moderation: Math.max(0, b.moderation - 1) }));
  }

  async function remove(type: string, id: number) {
    await api.post(`/api/admin/moderation/${type}/${id}/remove`);
    setModItems((m) => m.filter((x) => !(x.type === type && x.id === id)));
    setBadges((b) => ({ ...b, moderation: Math.max(0, b.moderation - 1) }));
  }

  const tabs: Tab[] = ["stats", "users", "newspapers", "events", "moderation", "log", "settings"];
  const tabBadge: Partial<Record<Tab, number>> = { users: badges.users, newspapers: badges.newspapers, events: badges.events, moderation: badges.moderation };

  return (
    <div className="page">
      <h2>{t("admin.title")}</h2>
      <div className="tab-bar">
        {tabs.map((tab_) => (
          <button
            key={tab_}
            className={tab === tab_ ? "active" : ""}
            onClick={() => setTab(tab_)}
          >
            {t(`admin.${tab_}`)}
            {(tabBadge[tab_] ?? 0) > 0 && (
              <span style={{ marginLeft: 5, background: "var(--danger)", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700, verticalAlign: "middle" }}>
                {tabBadge[tab_]}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "stats" && stats && (
        <div className="stats-grid">
          <Stat label={t("admin.registeredUsers")} value={stats.registeredUsers} />
          <Stat label={t("admin.currentlyActive")} value={stats.currentlyActive} />
          <Stat label={t("admin.avgActive1h")} value={Number(stats.avgActive1h).toFixed(1)} />
          <Stat label={t("admin.avgActive4h")} value={Number(stats.avgActive4h).toFixed(1)} />
          <Stat label="Newspapers" value={stats.newspapers} />
          <Stat label="Articles (total)" value={stats.articlesPublished.total} />
          <Stat label="Articles (7d)" value={stats.articlesPublished.last7d} />
          <Stat label="Upcoming events" value={stats.eventsUpcoming} />
          <div className="stats-pending">
            <h3>Pending</h3>
            <p>Accounts: {stats.pending.accounts}</p>
            <p>Username changes: {stats.pending.usernameChanges}</p>
            <p>Newspapers: {stats.pending.newspapers}</p>
            <p>Events: {stats.pending.events}</p>
            <p>Moderation: {stats.pending.moderationReviews}</p>
          </div>
        </div>
      )}

      {tab === "users" && (
        <div>
          <h3>{t("admin.users")} ({pendingUsers.length})</h3>
          {pendingUsers.map((u) => (
            <div key={u.id} className="card">
              <span>{u.discord_display_name} ({u.discord_username})</span>
              {u.mc_username && <span> · MC: {u.mc_username}</span>}
              <button onClick={() => approveUser(u.id)}>{t("admin.approve")}</button>
              <button onClick={() => rejectUser(u.id)}>{t("admin.reject")}</button>
            </div>
          ))}
          {pendingUsers.length === 0 && <p>No pending accounts.</p>}

          <h3 style={{ marginTop: 24 }}>{t("admin.usernameChanges")} ({usernameChanges.length})</h3>
          {usernameChanges.map((c) => (
            <div key={c.id} className="card">
              <span>{c.discord_display_name}</span>
              <span style={{ color: "var(--text-muted)" }}>
                {" "}· <code>{c.current_mc_username ?? "—"}</code> → <code>{c.requested_mc_username}</code>
              </span>
              {c.reason && <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0" }}><em>{c.reason}</em></p>}
              <button onClick={() => approveUsernameChange(c.id)}>{t("admin.approve")}</button>
              <button onClick={() => rejectUsernameChange(c.id)}>{t("admin.reject")}</button>
            </div>
          ))}
          {usernameChanges.length === 0 && <p>No pending username changes.</p>}
        </div>
      )}

      {tab === "moderation" && (
        <div>
          <h3>{t("admin.moderation")}</h3>
          {modItems.map((item) => {
            // Open-page target: the newspaper itself, or the newspaper that owns
            // the reported article. Events have no detail page.
            const npId = item.type === "newspaper" ? item.id : item.newspaper_id;
            return (
              <div key={`${item.type}-${item.id}`} className="card">
                <div style={{ marginBottom: 6 }}>
                  <span className="badge">{item.type}</span>{" "}
                  <strong>{item.title}</strong>
                  {item.newspaper_name && item.type === "article" && (
                    <span style={{ color: "var(--text-muted)" }}> · {t("admin.inNewspaper", { name: item.newspaper_name })}</span>
                  )}
                </div>
                <div className="form-actions">
                  {npId != null && (
                    <Link className="btn-small btn-secondary" to={`/newspapers/${npId}`} target="_blank" rel="noreferrer">
                      {t("admin.openPage")}
                    </Link>
                  )}
                  <button className="btn-small" onClick={() => reinstate(item.type, item.id)}>{t("admin.reinstate")}</button>
                  <button className="btn-small btn-danger" onClick={() => remove(item.type, item.id)}>{t("admin.remove")}</button>
                </div>
              </div>
            );
          })}
          {modItems.length === 0 && <p>No items pending moderation.</p>}
        </div>
      )}

      {tab === "log" && (
        <AdminLog data={logData} page={logPage} onPage={setLogPage} t={t} />
      )}

      {tab === "newspapers" && <AdminNewspapers t={t} />}
      {tab === "events" && <AdminEvents t={t} />}
      {tab === "settings" && <AdminSettings t={t} />}
    </div>
  );
}

// Maps action strings to a short label and a color badge
const ACTION_META: Record<string, { label: string; color: string }> = {
  "user.create":         { label: "user+",      color: "#3a8c3a" },
  "user.connect":        { label: "login",       color: "#444" },
  "user.approve":        { label: "approved",    color: "#2a7a2a" },
  "user.reject":         { label: "rejected",    color: "#8c2a2a" },
  "user.delete":         { label: "user×",       color: "#8c2a2a" },
  "user.delete_self":    { label: "self-del",    color: "#8c2a2a" },
  "user.username_set":   { label: "mc-set",      color: "#5865f2" },
  "user.username_change_request": { label: "mc-req",  color: "#888" },
  "user.username_change_approve": { label: "mc-name+", color: "#2a7a2a" },
  "user.username_change_reject":  { label: "mc-name×", color: "#8c2a2a" },
  "user.verify":         { label: "verified",    color: "#5865f2" },
  "user.verify_request": { label: "verify-req",  color: "#888" },
  "newspaper.approve":   { label: "news+",       color: "#2a7a2a" },
  "newspaper.reject":    { label: "news×",       color: "#8c2a2a" },
  "newspaper.hide":      { label: "news-hide",   color: "#a06a2a" },
  "newspaper.unhide":    { label: "news-show",   color: "#5865f2" },
  "newspaper.archive":   { label: "news-arch",   color: "#a06a2a" },
  "newspaper.unarchive": { label: "news-unarch", color: "#5865f2" },
  "article.publish":     { label: "article+",    color: "#3a8c3a" },
  "article.hide":        { label: "art-hide",    color: "#a06a2a" },
  "article.unhide":      { label: "art-show",    color: "#5865f2" },
  "article.delete":      { label: "article×",    color: "#8c2a2a" },
  "event.approve":       { label: "event+",      color: "#2a7a2a" },
  "event.reject":        { label: "event×",      color: "#8c2a2a" },
  "event.hide":          { label: "event-hide",  color: "#a06a2a" },
  "event.delete":        { label: "event×",      color: "#8c2a2a" },
  "report.add":          { label: "report",      color: "#c0392b" },
  "report.remove":       { label: "unreport",    color: "#888" },
  "moderation.autohide": { label: "auto-hide",   color: "#a06a2a" },
  "moderation.reinstate":{ label: "reinstate",   color: "#5865f2" },
  "moderation.remove":   { label: "removed",     color: "#8c2a2a" },
};

function actionBadge(action: string) {
  const m = ACTION_META[action] ?? { label: action, color: "#555" };
  return (
    <span style={{
      background: m.color, color: "#fff", borderRadius: 3,
      padding: "1px 5px", fontSize: 10, fontWeight: 700,
      letterSpacing: "0.03em", whiteSpace: "nowrap",
    }}>{m.label}</span>
  );
}

function fmtAt(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function parseMeta(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
}

function LogDetailModal({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  const meta = parseMeta(entry.meta);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.6)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 8, padding: 20, minWidth: 340, maxWidth: 560, width: "90%",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <strong>Log #{entry.id}</strong>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text)", cursor: "pointer", fontSize: 18 }}>×</button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <tbody>
            {[
              ["Time",    fmtAt(entry.at)],
              ["Action",  entry.action],
              ["Actor",   entry.actor_name ? `${entry.actor_name} (#${entry.actor_id})` : entry.actor_id ?? "system"],
              ["Target",  entry.target_type ? `${entry.target_type} #${entry.target_id}` : "—"],
            ].map(([k, v]) => (
              <tr key={k} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "5px 8px", color: "var(--text-muted)", width: 80 }}>{k}</td>
                <td style={{ padding: "5px 8px" }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {meta && (
          <pre style={{
            marginTop: 12, background: "var(--bg)", borderRadius: 4,
            padding: "8px 10px", fontSize: 11, overflow: "auto", maxHeight: 200,
          }}>{JSON.stringify(meta, null, 2)}</pre>
        )}
        {!meta && <p style={{ marginTop: 12, color: "var(--text-muted)", fontSize: 12 }}>No additional data.</p>}
      </div>
    </div>
  );
}

function AdminLog({ data, page, onPage, t }: {
  data: LogPage | null;
  page: number;
  onPage: (p: number) => void;
  t: (k: string) => string;
}) {
  const [selected, setSelected] = useState<LogEntry | null>(null);
  if (!data) return <p>Loading…</p>;
  const totalPages = Math.ceil(data.total / data.limit);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{t("admin.log")} <span style={{ fontWeight: 400, fontSize: 13, color: "var(--text-muted)" }}>({data.total} entries)</span></h3>
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <button disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
          <span>{page} / {totalPages || 1}</span>
          <button disabled={page >= totalPages} onClick={() => onPage(page + 1)}>›</button>
        </div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ color: "var(--text-muted)", textAlign: "left", borderBottom: "1px solid var(--border)" }}>
            <th style={{ padding: "3px 6px", fontWeight: 500 }}>Time</th>
            <th style={{ padding: "3px 6px", fontWeight: 500 }}>Action</th>
            <th style={{ padding: "3px 6px", fontWeight: 500 }}>Actor</th>
            <th style={{ padding: "3px 6px", fontWeight: 500 }}>Target</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => setSelected(row)}
              style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <td style={{ padding: "3px 6px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtAt(row.at)}</td>
              <td style={{ padding: "3px 6px" }}>{actionBadge(row.action)}</td>
              <td style={{ padding: "3px 6px", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.actor_name ?? (row.actor_id ? `#${row.actor_id}` : <span style={{ color: "var(--text-muted)" }}>system</span>)}
              </td>
              <td style={{ padding: "3px 6px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                {row.target_type ? `${row.target_type} #${row.target_id}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.rows.length === 0 && <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No log entries.</p>}
      {selected && <LogDetailModal entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function AdminNewspapers({ t }: { t: (k: string) => string }) {
  const [items, setItems] = useState<unknown[]>([]);
  useEffect(() => {
    api.get<unknown[]>("/api/admin/newspapers?status=pending").then(setItems);
  }, []);

  async function approve(id: number) {
    await api.post(`/api/admin/newspapers/${id}/approve`);
    setItems((i) => i.filter((x: any) => x.id !== id));
  }

  async function reject(id: number) {
    await api.post(`/api/admin/newspapers/${id}/reject`);
    setItems((i) => i.filter((x: any) => x.id !== id));
  }

  return (
    <div>
      <h3>{t("admin.newspapers")}</h3>
      {(items as any[]).map((np) => (
        <div key={np.id} className="card">
          <h4>{np.name}</h4>
          <p>{np.description}</p>
          <p><em>Reason: {np.request_reason}</em></p>
          <p>Requested by: {np.owner_name}</p>
          <button onClick={() => approve(np.id)}>{t("admin.approve")}</button>
          <button onClick={() => reject(np.id)}>{t("admin.reject")}</button>
        </div>
      ))}
      {items.length === 0 && <p>No pending newspaper requests.</p>}
    </div>
  );
}

function AdminSettings({ t }: { t: (k: string, v?: Record<string, string | number>) => string }) {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [rebackfilling, setRebackfilling] = useState(false);
  const [rebackfillDone, setRebackfillDone] = useState(false);

  async function triggerRebackfill() {
    setRebackfilling(true);
    setRebackfillDone(false);
    try {
      await api.post("/api/admin/rebackfill");
      setRebackfillDone(true);
      setTimeout(() => setRebackfillDone(false), 3000);
    } finally {
      setRebackfilling(false);
    }
  }

  useEffect(() => {
    api.get<SiteSettings>("/api/admin/settings").then(setSettings);
  }, []);

  async function toggle(key: keyof SiteSettings) {
    if (!settings) return;
    const newValue = !settings[key];
    setSaving(key);
    try {
      const updated = await api.patch<SiteSettings>("/api/admin/settings", { [key]: newValue });
      setSettings(updated);
    } finally {
      setSaving(null);
    }
  }

  if (!settings) return <p>{t("common.loading")}</p>;

  const rows: { key: keyof SiteSettings; label: string; description: string }[] = [
    {
      key: "auto_approve_accounts",
      label: t("admin.settings.autoApproveAccounts"),
      description: t("admin.settings.autoApproveAccountsDesc"),
    },
    {
      key: "auto_approve_username_changes",
      label: t("admin.settings.autoApproveUsernameChanges"),
      description: t("admin.settings.autoApproveUsernameChangesDesc"),
    },
    {
      key: "auto_approve_newspapers",
      label: t("admin.settings.autoApproveNewspapers"),
      description: t("admin.settings.autoApproveNewspapersDesc"),
    },
  ];

  return (
    <div>
      <h3 style={{ marginBottom: 16 }}>{t("admin.settings.title")}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map(({ key, label, description }) => (
          <div key={key} className="card" style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{description}</div>
            </div>
            <button
              onClick={() => toggle(key)}
              disabled={saving === key}
              style={{
                minWidth: 56,
                padding: "5px 14px",
                background: settings[key] ? "var(--success)" : "var(--border)",
                color: settings[key] ? "#fff" : "var(--text-muted)",
                border: "none",
                borderRadius: 20,
                fontWeight: 700,
                fontSize: 13,
                transition: "background 0.2s",
                flexShrink: 0,
              }}
            >
              {settings[key] ? t("admin.settings.on") : t("admin.settings.off")}
            </button>
          </div>
        ))}

        <div className="card" style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>{t("admin.settings.rebackfill")}</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("admin.settings.rebackfillDesc")}</div>
          </div>
          <button
            className="btn-secondary"
            onClick={triggerRebackfill}
            disabled={rebackfilling}
            style={{ flexShrink: 0 }}
          >
            {rebackfilling ? t("common.loading") : rebackfillDone ? t("common.saved") : t("admin.settings.rebackfillRun")}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminEvents({ t }: { t: (k: string) => string }) {
  const [items, setItems] = useState<unknown[]>([]);
  useEffect(() => {
    api.get<unknown[]>("/api/admin/events?status=pending").then(setItems);
  }, []);

  async function approve(id: number) {
    await api.post(`/api/admin/events/${id}/approve`);
    setItems((i) => i.filter((x: any) => x.id !== id));
  }

  async function reject(id: number) {
    await api.post(`/api/admin/events/${id}/reject`);
    setItems((i) => i.filter((x: any) => x.id !== id));
  }

  return (
    <div>
      <h3>{t("admin.events")}</h3>
      {(items as any[]).map((ev) => (
        <div key={ev.id} className="card">
          <h4>{ev.name}</h4>
          <p>{ev.description}</p>
          <p>{new Date(ev.starts_at).toLocaleString()} · {ev.duration_minutes} min</p>
          <p>Requested by: {ev.requester_name}</p>
          <button onClick={() => approve(ev.id)}>{t("admin.approve")}</button>
          <button onClick={() => reject(ev.id)}>{t("admin.reject")}</button>
        </div>
      ))}
      {items.length === 0 && <p>No pending event requests.</p>}
    </div>
  );
}
