import { useEffect, useState } from "react";
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
  pending: { accounts: number; newspapers: number; events: number; moderationReviews: number };
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
  active: boolean;
}

type Tab = "stats" | "users" | "newspapers" | "events" | "moderation" | "log";

export function AdminPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("stats");
  const [stats, setStats] = useState<Stats | null>(null);
  const [pendingUsers, setPendingUsers] = useState<AdminUser[]>([]);
  const [modItems, setModItems] = useState<Moditem[]>([]);
  const [log, setLog] = useState<unknown[]>([]);

  useEffect(() => {
    if (tab === "stats") api.get<Stats>("/api/admin/stats").then(setStats);
    if (tab === "users") api.get<AdminUser[]>("/api/admin/users?status=pending").then(setPendingUsers);
    if (tab === "moderation") api.get<Moditem[]>("/api/admin/moderation").then(setModItems);
    if (tab === "log") api.get<unknown[]>("/api/admin/log").then(setLog);
  }, [tab]);

  async function approveUser(id: number) {
    await api.post(`/api/admin/users/${id}/approve`);
    setPendingUsers((u) => u.filter((x) => x.id !== id));
  }

  async function rejectUser(id: number) {
    await api.post(`/api/admin/users/${id}/reject`);
    setPendingUsers((u) => u.filter((x) => x.id !== id));
  }

  async function reinstate(type: string, id: number) {
    await api.post(`/api/admin/moderation/${type}/${id}/reinstate`);
    setModItems((m) => m.filter((x) => !(x.type === type && x.id === id)));
  }

  async function remove(type: string, id: number) {
    await api.post(`/api/admin/moderation/${type}/${id}/remove`);
    setModItems((m) => m.filter((x) => !(x.type === type && x.id === id)));
  }

  const tabs: Tab[] = ["stats", "users", "newspapers", "events", "moderation", "log"];

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
        </div>
      )}

      {tab === "moderation" && (
        <div>
          <h3>{t("admin.moderation")}</h3>
          {modItems.map((item) => (
            <div key={`${item.type}-${item.id}`} className="card">
              <span className="badge">{item.type}</span> {item.title}
              <button onClick={() => reinstate(item.type, item.id)}>{t("admin.reinstate")}</button>
              <button className="btn-danger" onClick={() => remove(item.type, item.id)}>{t("admin.remove")}</button>
            </div>
          ))}
          {modItems.length === 0 && <p>No items pending moderation.</p>}
        </div>
      )}

      {tab === "log" && (
        <div>
          <h3>{t("admin.log")}</h3>
          <pre style={{ fontSize: 12, overflow: "auto" }}>{JSON.stringify(log, null, 2)}</pre>
        </div>
      )}

      {tab === "newspapers" && <AdminNewspapers t={t} />}
      {tab === "events" && <AdminEvents t={t} />}
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
