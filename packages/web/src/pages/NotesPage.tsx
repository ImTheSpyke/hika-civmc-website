import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n/context.js";
import type { PlayerNote, Tag, UserResult } from "../api/types.js";
import { Avatar } from "../components/Avatar.js";
import { MarkdownEditor } from "../components/MarkdownEditor.js";

const NOTE_MAX = 5000;
const DEBOUNCE_MS = 1500;
const MAX_PLAYER_TAGS = 10;

type SortKey = "updated" | "username" | "tag";

// ── helpers ───────────────────────────────────────────────────────────────────

function TagChip({
  tag,
  onClick,
  title,
}: {
  tag: Tag;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <span
      className="player-tag-chip"
      style={{ "--chip-color": tag.color } as React.CSSProperties}
      onClick={onClick}
      title={title}
    >
      {tag.name}{onClick ? " ×" : ""}
    </span>
  );
}

// ── Global notepad (collapsible) ──────────────────────────────────────────────

function GlobalNotepad() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef("");
  const loaded = useRef(false);

  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    api.get<{ body: string }>("/api/global-notes").then((r) => {
      setBody(r.body);
      lastSaved.current = r.body;
    });
  }, [open]);

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
    if (val.length > NOTE_MAX) return;
    setBody(val);
    setStatus("idle");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(val), DEBOUNCE_MS);
  }

  return (
    <div className="global-notepad">
      <button
        className="global-notepad-toggle btn-secondary"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="global-notepad-icon">{open ? "▾" : "▸"}</span>
        {t("globalNotes.title")}
        {status === "saving" && <span className="notepad-status">{t("common.saving")}</span>}
        {status === "saved" && <span className="notepad-status saved">{t("common.saved")}</span>}
      </button>

      {open && (
        <div className="global-notepad-body">
          <MarkdownEditor
            value={body}
            onChange={handleChange}
            onBlur={() => {
              if (timerRef.current) clearTimeout(timerRef.current);
              save(body);
            }}
            placeholder={t("globalNotes.placeholder")}
            maxLength={NOTE_MAX}
            minHeight={200}
            statusLeft={t("globalNotes.chars", { count: body.length, max: NOTE_MAX })}
          />
        </div>
      )}
    </div>
  );
}

// ── Player list sidebar ───────────────────────────────────────────────────────

interface PlayerEntry {
  mcUsername: string;
  displayName: string;
  hasNote: boolean;
  noteSnippet: string;
  updatedAt: string | null;
  tags: Tag[];
  verified: boolean;
}

interface SidebarProps {
  entries: PlayerEntry[];
  allTags: Tag[];
  selected: string | null;
  onSelect: (u: string) => void;
  onDelete: (u: string) => void;
  search: string;
  onSearch: (v: string) => void;
  searchResults: UserResult[];
  onPickSearchResult: (u: string) => void;
  onAddRaw: (u: string) => void;
  filterTag: number | null;
  onFilterTag: (id: number | null) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
}

function Sidebar({
  entries,
  allTags,
  selected,
  onSelect,
  onDelete,
  search,
  onSearch,
  searchResults,
  onPickSearchResult,
  onAddRaw,
  filterTag,
  onFilterTag,
  sort,
  onSort,
}: SidebarProps) {
  const { t } = useI18n();

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const q = search.trim();
    if (!q) return;
    // If there's exactly one search result, pick it; otherwise treat as raw username.
    if (searchResults.length === 1) {
      onPickSearchResult(searchResults[0].mcUsername ?? searchResults[0].discordUsername);
    } else {
      onAddRaw(q);
    }
  }

  return (
    <aside className="notes-sidebar">
      {/* Unified search + add input */}
      <div className="search-box">
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("playerNotes.searchPlaceholder")}
        />
        {searchResults.length > 0 && (
          <ul className="search-results">
            {searchResults.map((u) => (
              <li
                key={u.userId}
                onClick={() => onPickSearchResult(u.mcUsername ?? u.discordUsername)}
              >
                <Avatar mcUsername={u.mcUsername} size={22} />
                <span style={{ flex: 1 }}>{u.discordDisplayName}</span>
                {u.mcUsername && <span className="mc-name">({u.mcUsername})</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Filter + sort row */}
      <div className="notes-filter-row">
        <select
          value={filterTag ?? ""}
          onChange={(e) => onFilterTag(e.target.value ? Number(e.target.value) : null)}
          style={{ flex: 1 }}
        >
          <option value="">{t("tags.filterByTag")}</option>
          {allTags.map((tag) => (
            <option key={tag.id} value={tag.id}>{tag.name}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as SortKey)}
          style={{ width: "auto" }}
        >
          <option value="updated">{t("notes.sortUpdated")}</option>
          <option value="username">{t("notes.sortUsername")}</option>
          <option value="tag">{t("notes.sortTag")}</option>
        </select>
      </div>

      {/* Player list */}
      <ul className="noted-players">
        {entries.length === 0 && (
          <li className="empty">{t("playerNotes.noNotes")}</li>
        )}
        {entries.map((e) => (
          <li
            key={e.mcUsername}
            className={selected === e.mcUsername ? "active" : ""}
            onClick={() => onSelect(e.mcUsername)}
          >
            <Avatar mcUsername={e.mcUsername} size={28} />
            <div className="noted-player-info">
              <span className="noted-player-name">
                {e.mcUsername}
                {e.verified && <span className="badge" style={{ marginLeft: 4, fontSize: 9 }}>✓</span>}
              </span>
              {e.displayName !== e.mcUsername && (
                <span className="noted-player-discord">{e.displayName}</span>
              )}
              {e.tags.length > 0 && (
                <div className="noted-player-tags">
                  {e.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag.id}
                      className="tag-dot"
                      style={{ background: tag.color }}
                      title={tag.name}
                    />
                  ))}
                  {e.tags.length > 3 && (
                    <span className="tag-dot-more">+{e.tags.length - 3}</span>
                  )}
                </div>
              )}
              {e.hasNote && e.noteSnippet && (
                <span className="noted-player-snippet">{e.noteSnippet}</span>
              )}
            </div>
            <button
              className="btn-small btn-ghost"
              onClick={(ev) => { ev.stopPropagation(); onDelete(e.mcUsername); }}
              title={t("playerNotes.deleteNote")}
            >×</button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

// ── Player editor panel ───────────────────────────────────────────────────────

interface EditorPanelProps {
  mcUsername: string;
  allTags: Tag[];
  playerTags: Tag[];
  noteBody: string;
  saveStatus: "idle" | "saving" | "saved";
  onNoteChange: (v: string) => void;
  onNoteBlur: () => void;
  onAssignTag: (tag: Tag) => void;
  onDetachTag: (tag: Tag) => void;
}

function EditorPanel({
  mcUsername,
  allTags,
  playerTags,
  noteBody,
  saveStatus,
  onNoteChange,
  onNoteBlur,
  onAssignTag,
  onDetachTag,
}: EditorPanelProps) {
  const { t } = useI18n();
  const assignedIds = new Set(playerTags.map((t) => t.id));
  const available = allTags.filter((t) => !assignedIds.has(t.id));

  return (
    <div className="notes-editor-panel">
      {/* Player header */}
      <div className="editor-player-header">
        <Avatar mcUsername={mcUsername} size={36} />
        <h3 style={{ margin: 0, flex: 1 }}>{mcUsername}</h3>
        {saveStatus === "saving" && (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("common.saving")}</span>
        )}
        {saveStatus === "saved" && (
          <span style={{ fontSize: 12, color: "var(--success)" }}>{t("common.saved")}</span>
        )}
      </div>

      {/* Tag chips */}
      {allTags.length > 0 && (
        <div className="editor-tag-row">
          {playerTags.map((tag) => (
            <TagChip
              key={tag.id}
              tag={tag}
              onClick={() => onDetachTag(tag)}
              title={t("tags.detach")}
            />
          ))}
          {playerTags.length < MAX_PLAYER_TAGS && available.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const tag = allTags.find((t) => String(t.id) === e.target.value);
                if (tag) onAssignTag(tag);
              }}
              className="tag-assign-select"
            >
              <option value="">{t("tags.addTag")}</option>
              {available.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
          )}
          {playerTags.length >= MAX_PLAYER_TAGS && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {t("tags.limit")}
            </span>
          )}
        </div>
      )}

      {/* Note editor */}
      <MarkdownEditor
        value={noteBody}
        onChange={onNoteChange}
        onBlur={onNoteBlur}
        placeholder={t("playerNotes.notePlaceholder")}
        minHeight={320}
        maxLength={NOTE_MAX}
        statusLeft={`${noteBody.length}/${NOTE_MAX}`}
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function NotesPage() {
  const { t } = useI18n();

  // Raw data
  const [notes, setNotes] = useState<PlayerNote[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  // Maps mcUsername → assigned tags
  const [tagMap, setTagMap] = useState<Record<string, Tag[]>>({});

  // UI state
  const [selected, setSelected] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [playerTags, setPlayerTags] = useState<Tag[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Search / filter / sort
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [filterTag, setFilterTag] = useState<number | null>(null);
  const [sort, setSort] = useState<SortKey>("updated");

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── load all notes + tags ──────────────────────────────────────────────────

  async function loadData() {
    const [fetchedNotes, fetchedTags] = await Promise.all([
      api.get<PlayerNote[]>("/api/player-notes"),
      api.get<Tag[]>("/api/tags"),
    ]);
    setNotes(fetchedNotes);
    setAllTags(fetchedTags);

    // Fetch tag assignments for all noted players in parallel
    if (fetchedNotes.length > 0 && fetchedTags.length > 0) {
      const entries = await Promise.all(
        fetchedNotes.map(async (n) => {
          const data = await api.get<{ tagId: number }[]>(
            `/api/player-notes/${encodeURIComponent(n.mcUsername)}/tags`
          );
          const assigned = new Set(data.map((d) => d.tagId));
          return [n.mcUsername, fetchedTags.filter((t) => assigned.has(t.id))] as [string, Tag[]];
        })
      );
      setTagMap(Object.fromEntries(entries));
    } else {
      setTagMap({});
    }
  }

  useEffect(() => { loadData(); }, []);

  // ── build display entries ──────────────────────────────────────────────────

  const entries: PlayerEntry[] = notes
    .filter((n) => {
      if (filterTag) {
        const tags = tagMap[n.mcUsername] ?? [];
        if (!tags.some((t) => t.id === filterTag)) return false;
      }
      return true;
    })
    .map((n) => ({
      mcUsername: n.mcUsername,
      displayName: n.resolvedUser?.discordDisplayName ?? n.mcUsername,
      hasNote: Boolean(n.body),
      noteSnippet: n.body.replace(/[#*_`>]/g, "").slice(0, 60),
      updatedAt: n.updatedAt,
      tags: tagMap[n.mcUsername] ?? [],
      verified: Boolean(n.resolvedUser?.mcVerified),
    }))
    .sort((a, b) => {
      if (sort === "username") return a.mcUsername.localeCompare(b.mcUsername);
      if (sort === "tag") {
        const ta = a.tags[0]?.name ?? "";
        const tb = b.tags[0]?.name ?? "";
        return ta.localeCompare(tb) || a.mcUsername.localeCompare(b.mcUsername);
      }
      // updated (default)
      const da = a.updatedAt ?? "";
      const db = b.updatedAt ?? "";
      return db.localeCompare(da);
    });

  // ── search ────────────────────────────────────────────────────────────────

  function handleSearch(q: string) {
    setSearch(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearchResults(
        await api.get<UserResult[]>(`/api/users/search?q=${encodeURIComponent(q)}`)
      );
    }, 300);
  }

  // ── select / load a player ────────────────────────────────────────────────

  const selectPlayer = useCallback(async (mcUsername: string) => {
    setSelected(mcUsername);
    setSearch("");
    setSearchResults([]);
    setSaveStatus("idle");

    // Load note
    try {
      const note = await api.get<{ body: string }>(
        `/api/player-notes/${encodeURIComponent(mcUsername)}`
      );
      setNoteBody(note.body);
    } catch {
      setNoteBody("");
    }

    // Load tag assignments from cache (tagMap) or re-fetch
    const cached = tagMap[mcUsername];
    if (cached !== undefined) {
      setPlayerTags(cached);
    } else {
      const data = await api.get<{ tagId: number }[]>(
        `/api/player-notes/${encodeURIComponent(mcUsername)}/tags`
      );
      const assigned = new Set(data.map((d) => d.tagId));
      const resolved = allTags.filter((t) => assigned.has(t.id));
      setPlayerTags(resolved);
      setTagMap((prev) => ({ ...prev, [mcUsername]: resolved }));
    }
  }, [tagMap, allTags]);

  async function pickSearchResult(mcUsername: string) {
    // If this player isn't noted yet, create an empty note so they appear
    if (!notes.some((n) => n.mcUsername === mcUsername)) {
      await api.put(`/api/player-notes/${encodeURIComponent(mcUsername)}`, { body: "" });
      await loadData();
    }
    await selectPlayer(mcUsername);
  }

  async function addRawUsername(u: string) {
    setSearch("");
    setSearchResults([]);
    if (!notes.some((n) => n.mcUsername === u)) {
      await api.put(`/api/player-notes/${encodeURIComponent(u)}`, { body: "" });
      await loadData();
    }
    await selectPlayer(u);
  }

  // ── note saving ───────────────────────────────────────────────────────────

  function handleNoteChange(val: string) {
    setNoteBody(val);
    setSaveStatus("idle");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNote(val), DEBOUNCE_MS);
  }

  async function saveNote(body: string) {
    if (!selected) return;
    setSaveStatus("saving");
    try {
      await api.put(`/api/player-notes/${encodeURIComponent(selected)}`, { body });
      setSaveStatus("saved");
      // Update snippet in list
      setNotes((prev) =>
        prev.map((n) =>
          n.mcUsername === selected ? { ...n, body, updatedAt: new Date().toISOString() } : n
        )
      );
    } catch {
      setSaveStatus("idle");
    }
  }

  function handleNoteBlur() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveNote(noteBody);
  }

  // ── delete ────────────────────────────────────────────────────────────────

  async function deletePlayer(mcUsername: string) {
    await api.delete(`/api/player-notes/${encodeURIComponent(mcUsername)}`);
    if (selected === mcUsername) {
      setSelected(null);
      setNoteBody("");
      setPlayerTags([]);
    }
    setNotes((prev) => prev.filter((n) => n.mcUsername !== mcUsername));
    setTagMap((prev) => {
      const next = { ...prev };
      delete next[mcUsername];
      return next;
    });
  }

  // ── tag assign/detach ─────────────────────────────────────────────────────

  async function assignTag(tag: Tag) {
    if (!selected) return;
    await api.post(`/api/tags/${tag.id}/assign`, { username: selected });
    const updated = [...playerTags, tag];
    setPlayerTags(updated);
    setTagMap((prev) => ({ ...prev, [selected]: updated }));
  }

  async function detachTag(tag: Tag) {
    if (!selected) return;
    await api.delete(`/api/tags/${tag.id}/assign/${encodeURIComponent(selected)}`);
    const updated = playerTags.filter((t) => t.id !== tag.id);
    setPlayerTags(updated);
    setTagMap((prev) => ({ ...prev, [selected]: updated }));
  }

  return (
    <div className="notes-page-wrap">
      {/* Global notepad strip */}
      <GlobalNotepad />

      {/* Main layout */}
      <div className="notes-layout">
        <Sidebar
          entries={entries}
          allTags={allTags}
          selected={selected}
          onSelect={selectPlayer}
          onDelete={deletePlayer}
          search={search}
          onSearch={handleSearch}
          searchResults={searchResults}
          onPickSearchResult={pickSearchResult}
          onAddRaw={addRawUsername}
          filterTag={filterTag}
          onFilterTag={setFilterTag}
          sort={sort}
          onSort={setSort}
        />

        <main className="notes-editor-area">
          {selected ? (
            <EditorPanel
              mcUsername={selected}
              allTags={allTags}
              playerTags={playerTags}
              noteBody={noteBody}
              saveStatus={saveStatus}
              onNoteChange={handleNoteChange}
              onNoteBlur={handleNoteBlur}
              onAssignTag={assignTag}
              onDetachTag={detachTag}
            />
          ) : (
            <div className="notes-empty-state">
              <p>{t("playerNotes.selectPrompt")}</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
