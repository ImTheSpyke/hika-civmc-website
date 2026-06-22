import { useEffect, useRef, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n/context.js";
import type { PlayerNote, Tag, UserResult } from "../api/types.js";
import { Avatar } from "../components/Avatar.js";
import { MarkdownEditor } from "../components/MarkdownEditor.js";

const MAX = 5000;
const DEBOUNCE_MS = 2000;
const MAX_PLAYER_TAGS = 10;

type ActiveTab = "global" | "players";

// ── Global notes ──────────────────────────────────────────────────────────────

function GlobalNotes() {
  const { t } = useI18n();
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef("");

  useEffect(() => {
    api.get<{ body: string }>("/api/global-notes").then((r) => {
      setBody(r.body);
      lastSaved.current = r.body;
    });
  }, []);

  async function save(text: string) {
    if (text === lastSaved.current) return;
    setStatus("saving");
    try {
      await api.put("/api/global-notes", { body: text });
      lastSaved.current = text;
      setStatus("saved");
    } catch {
      setStatus("idle");
    }
  }

  function handleChange(val: string) {
    if (val.length > MAX) return;
    setBody(val);
    setStatus("idle");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(val), DEBOUNCE_MS);
  }

  return (
    <MarkdownEditor
      value={body}
      onChange={handleChange}
      onBlur={() => { if (timerRef.current) clearTimeout(timerRef.current); save(body); }}
      placeholder={t("globalNotes.placeholder")}
      maxLength={MAX}
      minHeight={400}
      statusLeft={t("globalNotes.chars", { count: body.length, max: MAX })}
      statusRight={
        status === "saving" ? t("common.saving") :
        status === "saved"  ? t("common.saved")  : undefined
      }
    />
  );
}

// ── Player notes ──────────────────────────────────────────────────────────────

function PlayerNotes() {
  const { t } = useI18n();
  const [notes, setNotes] = useState<PlayerNote[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [filterTag, setFilterTag] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [rawUsername, setRawUsername] = useState("");
  // Tags assigned to the currently selected player
  const [playerTags, setPlayerTags] = useState<Tag[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadNotes();
    api.get<Tag[]>("/api/tags").then(setAllTags);
  }, [filterTag]);

  async function loadNotes() {
    const qs = filterTag ? `?tag=${filterTag}` : "";
    setNotes(await api.get<PlayerNote[]>(`/api/player-notes${qs}`));
  }

  async function loadPlayerTags(username: string) {
    // Fetch which of the user's tags are assigned to this player.
    // We ask each tag's player list — simpler: fetch all tag assignments
    // by querying the dedicated endpoint for each tag that has this player.
    // Better: fetch players-by-tag for all tags and cross-reference.
    // We do it client-side: ask /api/tags/:id/assign-check isn't an endpoint,
    // so we load all tags with their players via a single call to the player's
    // tag list endpoint that we add here.
    const data = await api.get<{ tagId: number }[]>(
      `/api/player-notes/${encodeURIComponent(username)}/tags`
    );
    const assignedIds = new Set(data.map((d) => d.tagId));
    setPlayerTags(allTags.filter((t) => assignedIds.has(t.id)));
  }

  function handleSearch(q: string) {
    setSearch(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearchResults(await api.get<UserResult[]>(`/api/users/search?q=${encodeURIComponent(q)}`));
    }, 300);
  }

  async function selectPlayer(mcUsername: string) {
    setSelected(mcUsername);
    setSearch("");
    setSearchResults([]);
    try {
      const note = await api.get<{ body: string }>(`/api/player-notes/${encodeURIComponent(mcUsername)}`);
      setNoteBody(note.body);
    } catch {
      setNoteBody("");
    }
    await loadPlayerTags(mcUsername);
  }

  function handleNoteChange(val: string) {
    setNoteBody(val);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNote(val), DEBOUNCE_MS);
  }

  async function saveNote(body: string) {
    if (!selected) return;
    await api.put(`/api/player-notes/${encodeURIComponent(selected)}`, { body });
    await loadNotes();
  }

  async function deleteNote(username: string) {
    await api.delete(`/api/player-notes/${encodeURIComponent(username)}`);
    if (selected === username) { setSelected(null); setNoteBody(""); setPlayerTags([]); }
    await loadNotes();
  }

  async function addRawUsername() {
    if (!rawUsername.trim()) return;
    await selectPlayer(rawUsername.trim());
    setRawUsername("");
  }

  async function assignTag(tag: Tag) {
    if (!selected) return;
    await api.post(`/api/tags/${tag.id}/assign`, { username: selected });
    setPlayerTags((prev) => [...prev, tag]);
  }

  async function detachTag(tag: Tag) {
    if (!selected) return;
    await api.delete(`/api/tags/${tag.id}/assign/${encodeURIComponent(selected)}`);
    setPlayerTags((prev) => prev.filter((t) => t.id !== tag.id));
  }

  const assignedIds = new Set(playerTags.map((t) => t.id));
  const availableToAssign = allTags.filter((t) => !assignedIds.has(t.id));

  return (
    <div className="player-notes-layout">
      <aside className="player-notes-sidebar">
        <div className="search-box">
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t("playerNotes.searchPlaceholder")}
          />
          {searchResults.length > 0 && (
            <ul className="search-results">
              {searchResults.map((u) => (
                <li key={u.userId} onClick={() => selectPlayer(u.mcUsername ?? u.discordUsername)}>
                  <Avatar mcUsername={u.mcUsername} size={24} />
                  {u.discordDisplayName}
                  {u.mcUsername && <span className="mc-name">({u.mcUsername})</span>}
                  {u.mcVerified && <span className="badge">{t("playerNotes.verified")}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="raw-username">
          <input
            value={rawUsername}
            onChange={(e) => setRawUsername(e.target.value)}
            placeholder={t("playerNotes.addByUsername")}
            onKeyDown={(e) => e.key === "Enter" && addRawUsername()}
          />
          <button onClick={addRawUsername}>{t("common.create")}</button>
        </div>

        {allTags.length > 0 && (
          <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
            <option value="">{t("tags.filterByTag")}</option>
            {allTags.map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </select>
        )}

        <ul className="noted-players">
          {notes.length === 0 && <li className="empty">{t("playerNotes.noNotes")}</li>}
          {notes.map((n) => (
            <li
              key={n.mcUsername}
              className={selected === n.mcUsername ? "active" : ""}
              onClick={() => selectPlayer(n.mcUsername)}
            >
              <Avatar mcUsername={n.mcUsername} size={28} />
              <span style={{ flex: 1 }}>{n.resolvedUser?.discordDisplayName ?? n.mcUsername}</span>
              <button
                className="btn-small"
                onClick={(e) => { e.stopPropagation(); deleteNote(n.mcUsername); }}
                title={t("playerNotes.deleteNote")}
              >×</button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="player-notes-editor">
        {selected ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <Avatar mcUsername={selected} size={32} />
              <h3 style={{ margin: 0 }}>{selected}</h3>
            </div>

            {/* Tag chips for this player */}
            {allTags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {playerTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="player-tag-chip"
                    style={{ "--chip-color": tag.color } as React.CSSProperties}
                    onClick={() => detachTag(tag)}
                    title={t("tags.detach")}
                  >
                    {tag.name} ×
                  </span>
                ))}
                {playerTags.length < MAX_PLAYER_TAGS && availableToAssign.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      const tag = allTags.find((t) => String(t.id) === e.target.value);
                      if (tag) assignTag(tag);
                    }}
                    className="tag-assign-select"
                  >
                    <option value="">{t("tags.addTag")}</option>
                    {availableToAssign.map((tag) => (
                      <option key={tag.id} value={tag.id}>{tag.name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <MarkdownEditor
              value={noteBody}
              onChange={handleNoteChange}
              onBlur={() => saveNote(noteBody)}
              placeholder={t("playerNotes.notePlaceholder")}
              minHeight={300}
            />
          </>
        ) : (
          <p className="empty" style={{ color: "var(--text-muted)", paddingTop: 40 }}>{t("playerNotes.selectPrompt")}</p>
        )}
      </main>
    </div>
  );
}

// ── Combined page ─────────────────────────────────────────────────────────────

export function NotesPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<ActiveTab>("global");

  return (
    <div className="page notes-page">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h2>{activeTab === "global" ? t("globalNotes.title") : t("playerNotes.title")}</h2>
        <div className="notes-tab-switcher">
          <button
            className={activeTab === "global" ? "active" : ""}
            onClick={() => setActiveTab("global")}
          >
            {t("nav.globalNotes")}
          </button>
          <button
            className={activeTab === "players" ? "active" : ""}
            onClick={() => setActiveTab("players")}
          >
            {t("nav.playerNotes")}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        {activeTab === "global" && <GlobalNotes />}
        {activeTab === "players" && <PlayerNotes />}
      </div>
    </div>
  );
}
