import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client.js";
import { useI18n } from "../i18n/context.js";
import type { Tag, UserResult } from "../api/types.js";
import { Avatar } from "../components/Avatar.js";

function randomColor() {
  return "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
}

interface TaggedPlayer {
  target_mc_username: string;
  discord_display_name: string | null;
  mc_verified: boolean;
  public_faction_tag: string | null;
}

export function TagsPage() {
  const { t } = useI18n();
  const [tags, setTags] = useState<Tag[]>([]);
  const [selected, setSelected] = useState<Tag | null>(null);
  const [players, setPlayers] = useState<TaggedPlayer[]>([]);

  // Create form
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(randomColor);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  // Assign form
  const [assignSearch, setAssignSearch] = useState("");
  const [assignResults, setAssignResults] = useState<UserResult[]>([]);
  const [rawAssign, setRawAssign] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadTags() {
    setTags(await api.get<Tag[]>("/api/tags"));
  }

  async function loadPlayers(tagId: number) {
    setPlayers(await api.get<TaggedPlayer[]>(`/api/players/by-tag/${tagId}`));
  }

  useEffect(() => { loadTags(); }, []);

  useEffect(() => {
    if (selected) loadPlayers(selected.id);
    else setPlayers([]);
  }, [selected]);

  async function createTag() {
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      await api.post("/api/tags", { name: newName.trim(), color: newColor });
      setNewName("");
      setNewColor(randomColor());
      await loadTags();
    } catch (err) {
      setCreateError(err instanceof ApiError ? t(err.code) : t("common.error"));
    } finally {
      setCreating(false);
    }
  }

  async function deleteTag(tag: Tag) {
    await api.delete(`/api/tags/${tag.id}`);
    if (selected?.id === tag.id) setSelected(null);
    await loadTags();
  }

  async function saveEdit(id: number) {
    await api.patch(`/api/tags/${id}`, { name: editName, color: editColor });
    setEditingId(null);
    const updated = tags.map((t) => t.id === id ? { ...t, name: editName, color: editColor } : t);
    setTags(updated);
    if (selected?.id === id) setSelected({ id, name: editName, color: editColor });
  }

  function handleAssignSearch(q: string) {
    setAssignSearch(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setAssignResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setAssignResults(await api.get<UserResult[]>(`/api/users/search?q=${encodeURIComponent(q)}`));
    }, 300);
  }

  async function assignPlayer(username: string) {
    if (!selected) return;
    await api.post(`/api/tags/${selected.id}/assign`, { username });
    setAssignSearch("");
    setAssignResults([]);
    setRawAssign("");
    await loadPlayers(selected.id);
  }

  async function detachPlayer(username: string) {
    if (!selected) return;
    await api.delete(`/api/tags/${selected.id}/assign/${encodeURIComponent(username)}`);
    await loadPlayers(selected.id);
  }

  return (
    <div className="page">
      <h2>{t("tags.title")}</h2>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        {/* Left: tag list + create */}
        <div style={{ minWidth: 240, flexShrink: 0 }}>
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("tags.namePlaceholder")}
                maxLength={40}
                onKeyDown={(e) => e.key === "Enter" && createTag()}
                style={{ flex: 1 }}
              />
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                style={{ width: 36, height: 32, padding: 2, cursor: "pointer" }}
              />
              <button onClick={createTag} disabled={creating || !newName.trim()}>
                {t("common.create")}
              </button>
            </div>
            {createError && <p className="field-error" style={{ margin: 0 }}>{createError}</p>}
          </div>

          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {tags.length === 0 && (
              <li style={{ color: "var(--text-muted)", fontSize: 13 }}>{t("tags.noTags")}</li>
            )}
            {tags.map((tag) => (
              <li
                key={tag.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  background: selected?.id === tag.id ? "var(--bg-hover, rgba(255,255,255,0.06))" : "transparent",
                  border: `1px solid ${selected?.id === tag.id ? "var(--border)" : "transparent"}`,
                }}
                onClick={() => setSelected(selected?.id === tag.id ? null : tag)}
              >
                {editingId === tag.id ? (
                  <>
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      style={{ width: 28, height: 24, padding: 1, cursor: "pointer" }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <input
                      value={editName}
                      maxLength={40}
                      onChange={(e) => setEditName(e.target.value)}
                      style={{ flex: 1, fontSize: 13 }}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); saveEdit(tag.id); } }}
                    />
                    <button
                      className="btn-small"
                      onClick={(e) => { e.stopPropagation(); saveEdit(tag.id); }}
                    >{t("common.save")}</button>
                    <button
                      className="btn-small"
                      onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                    >{t("common.cancel")}</button>
                  </>
                ) : (
                  <>
                    <span style={{
                      width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                      background: tag.color, border: "1px solid rgba(255,255,255,0.15)"
                    }} />
                    <span style={{ flex: 1, fontSize: 14 }}>{tag.name}</span>
                    <button
                      className="btn-small"
                      title={t("common.edit")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(tag.id);
                        setEditName(tag.name);
                        setEditColor(tag.color);
                      }}
                    >✎</button>
                    <button
                      className="btn-small"
                      title={t("tags.delete")}
                      onClick={(e) => { e.stopPropagation(); deleteTag(tag); }}
                    >×</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Right: selected tag players */}
        {selected && (
          <div style={{ flex: 1 }}>
            <div className="card">
              <h3 style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 0, marginBottom: 16 }}>
                <span style={{
                  width: 14, height: 14, borderRadius: 3,
                  background: selected.color, border: "1px solid rgba(255,255,255,0.15)", display: "inline-block"
                }} />
                {selected.name}
              </h3>

              {/* Assign by search */}
              <div className="search-box" style={{ marginBottom: 8, position: "relative" }}>
                <input
                  value={assignSearch}
                  onChange={(e) => handleAssignSearch(e.target.value)}
                  placeholder={t("tags.assignSearch")}
                />
                {assignResults.length > 0 && (
                  <ul className="search-results">
                    {assignResults.map((u) => (
                      <li key={u.userId} onClick={() => assignPlayer(u.mcUsername ?? u.discordUsername)}>
                        <Avatar mcUsername={u.mcUsername} size={24} />
                        {u.discordDisplayName}
                        {u.mcUsername && <span className="mc-name">({u.mcUsername})</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Assign by raw username */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input
                  value={rawAssign}
                  onChange={(e) => setRawAssign(e.target.value)}
                  placeholder={t("tags.assignByUsername")}
                  onKeyDown={(e) => e.key === "Enter" && rawAssign.trim() && assignPlayer(rawAssign.trim())}
                  style={{ flex: 1 }}
                />
                <button
                  onClick={() => rawAssign.trim() && assignPlayer(rawAssign.trim())}
                  disabled={!rawAssign.trim()}
                >
                  {t("tags.assign")}
                </button>
              </div>

              {/* Tagged players */}
              {players.length === 0 ? (
                <p style={{ color: "var(--text-muted)", margin: 0 }}>{t("tags.noPlayersTagged")}</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  {players.map((p) => (
                    <li key={p.target_mc_username} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar mcUsername={p.target_mc_username} size={28} />
                      <span style={{ flex: 1 }}>
                        {p.discord_display_name ?? p.target_mc_username}
                        {p.discord_display_name && (
                          <span className="mc-name" style={{ marginLeft: 6 }}>({p.target_mc_username})</span>
                        )}
                      </span>
                      <button
                        className="btn-small"
                        onClick={() => detachPlayer(p.target_mc_username)}
                        title={t("tags.detach")}
                      >×</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
