import { useEffect, useRef, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n/context.js";
import type { PlayerNote, Tag, UserResult } from "../api/types.js";
import { Avatar } from "../components/Avatar.js";
import { Markdown } from "../components/Markdown.js";

const MAX = 5000;
const DEBOUNCE_MS = 2000;

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

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    if (val.length > MAX) return;
    setBody(val);
    setStatus("idle");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(val), DEBOUNCE_MS);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="live-md-editor">
        <textarea
          value={body}
          onChange={handleChange}
          onBlur={() => { if (timerRef.current) clearTimeout(timerRef.current); save(body); }}
          placeholder={t("globalNotes.placeholder")}
          style={{ flex: 1, width: "100%", resize: "none", minHeight: 400 }}
        />
        <div className="live-md-preview markdown markdown-note">
          {body.trim()
            ? <Markdown>{body}</Markdown>
            : <p style={{ color: "var(--text-muted)", margin: 0 }}>{t("globalNotes.placeholder")}</p>}
        </div>
      </div>
      <div className="notes-footer">
        <span>{t("globalNotes.chars", { count: body.length, max: MAX })}</span>
        <span>
          {status === "saving" && t("common.saving")}
          {status === "saved" && t("common.saved")}
        </span>
      </div>
    </div>
  );
}

// ── Player notes ──────────────────────────────────────────────────────────────

function PlayerNotes() {
  const { t } = useI18n();
  const [notes, setNotes] = useState<PlayerNote[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [filterTag, setFilterTag] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [rawUsername, setRawUsername] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadNotes();
    api.get<Tag[]>("/api/tags").then(setTags);
  }, [filterTag]);

  async function loadNotes() {
    const qs = filterTag ? `?tag=${filterTag}` : "";
    setNotes(await api.get<PlayerNote[]>(`/api/player-notes${qs}`));
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
    if (selected === username) { setSelected(null); setNoteBody(""); }
    await loadNotes();
  }

  async function addRawUsername() {
    if (!rawUsername.trim()) return;
    await selectPlayer(rawUsername.trim());
    setRawUsername("");
  }

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

        {tags.length > 0 && (
          <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
            <option value="">{t("tags.filterByTag")}</option>
            {tags.map((tag) => (
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
            <h3 style={{ marginBottom: 10 }}>{selected}</h3>
            <div className="live-md-editor" style={{ minHeight: 300 }}>
              <textarea
                value={noteBody}
                onChange={(e) => handleNoteChange(e.target.value)}
                onBlur={() => saveNote(noteBody)}
                placeholder={t("playerNotes.notePlaceholder")}
                style={{ width: "100%", resize: "vertical", minHeight: 300 }}
              />
              <div className="live-md-preview markdown markdown-note" style={{ minHeight: 300 }}>
                {noteBody.trim()
                  ? <Markdown>{noteBody}</Markdown>
                  : <p style={{ color: "var(--text-muted)", margin: 0 }}>{t("playerNotes.notePlaceholder")}</p>}
              </div>
            </div>
          </>
        ) : (
          <p className="empty" style={{ color: "var(--text-muted)", paddingTop: 40 }}>{t("playerNotes.searchPlaceholder")}</p>
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
