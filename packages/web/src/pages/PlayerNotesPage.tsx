import { useEffect, useRef, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n/context.js";
import type { PlayerNote, Tag, UserResult } from "../api/types.js";
import { Avatar } from "../components/Avatar.js";

const SAVE_DEBOUNCE = 2000;

export function PlayerNotesPage() {
  const { t } = useI18n();
  const [notes, setNotes] = useState<PlayerNote[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [filterTag, setFilterTag] = useState<string>("");
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
    const data = await api.get<PlayerNote[]>(`/api/player-notes${qs}`);
    setNotes(data);
  }

  function handleSearch(q: string) {
    setSearch(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      const results = await api.get<UserResult[]>(`/api/users/search?q=${encodeURIComponent(q)}`);
      setSearchResults(results);
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
    saveTimer.current = setTimeout(() => saveNote(val), SAVE_DEBOUNCE);
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
    <div className="page player-notes-layout">
      <aside className="player-notes-sidebar">
        <h2>{t("playerNotes.title")}</h2>

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
              <span>{n.resolvedUser?.discordDisplayName ?? n.mcUsername}</span>
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
            <h3>{selected}</h3>
            <textarea
              value={noteBody}
              onChange={(e) => handleNoteChange(e.target.value)}
              onBlur={() => saveNote(noteBody)}
              placeholder={t("playerNotes.notePlaceholder")}
              rows={16}
              style={{ width: "100%", resize: "vertical" }}
            />
          </>
        ) : (
          <p className="empty">{t("playerNotes.searchPlaceholder")}</p>
        )}
      </main>
    </div>
  );
}
