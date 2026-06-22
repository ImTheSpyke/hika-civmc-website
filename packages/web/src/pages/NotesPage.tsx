import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n/context.js";
import type { PlayerNote, Tag, UserResult } from "../api/types.js";
import { Avatar } from "../components/Avatar.js";
import { MarkdownEditor } from "../components/MarkdownEditor.js";

const NOTE_MAX = 5000;
const DEBOUNCE_MS = 1500;
const MAX_PLAYER_TAGS = 10;
const SEARCH_THRESHOLD = 0.8;
const SEARCH_MIN = 5;
const SEARCH_LIMIT = 10;

type SortKey = "updated" | "username" | "tag";

// ── fuzzy string similarity ──────────────────

function compareString(string1: string, string2: string): number {
  if (string1 === string2) return 1;
  if (string1 === "" || string2 === "") return 0;
  let total_count = 0;
  let ok_count = 0;
  for (let longueur_test = 1; longueur_test < string1.length + 1; longueur_test++) {
    for (let multiplier = 0; multiplier < (string1.length / longueur_test) + 1; multiplier++) {
      const index = longueur_test * multiplier;
      if (string1.length > index) {
        total_count++;
        const the_string = string1.substr(index, longueur_test);
        if (string2.indexOf(the_string) !== -1) {
          ok_count += 0.5;
        } else if (string2.toLowerCase().indexOf(the_string) !== -1) {
          ok_count += 0.45;
        } else if (string2.indexOf(the_string.toLowerCase()) !== -1) {
          ok_count += 0.45;
        }
      }
      if (string2.length > index) {
        const the_string = string2.substr(index, longueur_test);
        if (string1.indexOf(the_string) !== -1) {
          ok_count += 0.5;
        } else if (string1.toLowerCase().indexOf(the_string) !== -1) {
          ok_count += 0.45;
        } else if (string1.indexOf(the_string.toLowerCase()) !== -1) {
          ok_count += 0.45;
        }
      }
    }
  }
  const a = string1.length;
  const b = string2.length;
  const ponderation = b / a === 1 ? 1 : b / a > 1 ? a / b : b / a;
  return (ok_count / total_count) * ponderation;
}

function scoreUser(q: string, u: UserResult): number {
  const lq = q.toLowerCase();
  const fields = [
    u.mcUsername ?? "",
    u.discordUsername,
    u.discordDisplayName,
  ];
  let best = 0;
  for (const field of fields) {
    if (!field) continue;
    const lf = field.toLowerCase();
    // Score the query against the full field AND against every contiguous
    // substring of the field that is the same length as the query.
    // This lets "aimthespyke" match "imthespyke" even though the first
    // character differs — compareString will find "imthespyke" inside
    // the query as a high-scoring substring window.
    let s = compareString(lq, lf);
    const wlen = lq.length;
    for (let i = 0; i <= lf.length - wlen; i++) {
      const window = lf.slice(i, i + wlen);
      const ws = compareString(lq, window);
      if (ws > s) s = ws;
    }
    if (s > best) best = s;
  }
  return best;
}

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
  discordUsername: string | null;
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
  filterTags: number[];
  onToggleFilterTag: (id: number) => void;
  onClearFilter: () => void;
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
  filterTags,
  onToggleFilterTag,
  onClearFilter,
  sort,
  onSort,
}: SidebarProps) {
  const { t } = useI18n();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const q = search.trim();
    if (!q) return;
    if (searchResults.length === 1) {
      onPickSearchResult(searchResults[0].mcUsername ?? searchResults[0].discordUsername);
    } else {
      onAddRaw(q);
    }
  }

  function requestDelete(mcUsername: string, ev: React.MouseEvent) {
    ev.stopPropagation();
    setConfirmDelete(mcUsername);
  }

  function confirmAndDelete() {
    if (confirmDelete) {
      onDelete(confirmDelete);
      setConfirmDelete(null);
    }
  }

  const SORT_LABELS: Record<SortKey, string> = {
    updated: t("notes.sortUpdated"),
    username: t("notes.sortUsername"),
    tag: t("notes.sortTag"),
  };

  return (
    <aside className="notes-sidebar">
      {/* Delete confirmation overlay */}
      {confirmDelete && (
        <div className="notes-delete-confirm">
          <p>{t("playerNotes.confirmDelete", { name: confirmDelete })}</p>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button className="btn-small btn-danger" onClick={confirmAndDelete}>
              {t("common.delete")}
            </button>
            <button className="btn-small btn-secondary" onClick={() => setConfirmDelete(null)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

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
                key={u.userId !== -1 ? `u-${u.userId}` : `raw-${u.mcUsername}`}
                onClick={() => onPickSearchResult(u.mcUsername ?? u.discordUsername)}
              >
                <Avatar mcUsername={u.mcUsername} size={22} />
                {u.mcUsername && <span style={{ flex: 1 }}>{u.mcUsername}</span>}
                {u.discordUsername && (
                  <span className="mc-name">@{u.discordUsername}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Filter + sort toolbar */}
      <div className="notes-toolbar">
        <button
          className={`notes-toolbar-btn${showFilters ? " active" : ""}`}
          onClick={() => setShowFilters((v) => !v)}
          title={t("tags.filterByTag")}
        >
          <span>⊞</span>
          {filterTags.length > 0 && (
            <span className="notes-toolbar-badge">{filterTags.length}</span>
          )}
        </button>

        {/* Sort pills */}
        <div className="notes-sort-pills">
          {(["updated", "username", "tag"] as SortKey[]).map((key) => (
            <button
              key={key}
              className={`notes-sort-pill${sort === key ? " active" : ""}`}
              onClick={() => onSort(key)}
            >
              {SORT_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      {/* Tag filter panel */}
      {showFilters && allTags.length > 0 && (
        <div className="notes-tag-filter">
          {filterTags.length > 0 && (
            <button className="notes-tag-filter-clear" onClick={onClearFilter}>
              {t("notes.clearFilter")}
            </button>
          )}
          <div className="notes-tag-filter-chips">
            {allTags.map((tag) => {
              const active = filterTags.includes(tag.id);
              return (
                <span
                  key={tag.id}
                  className={`player-tag-chip${active ? " chip-active" : ""}`}
                  style={{ "--chip-color": tag.color } as React.CSSProperties}
                  onClick={() => onToggleFilterTag(tag.id)}
                >
                  {tag.name}
                </span>
              );
            })}
          </div>
        </div>
      )}

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
              {e.discordUsername && (
                <span className="noted-player-discord">@{e.discordUsername}</span>
              )}
              {e.tags.length > 0 && (
                <div className="noted-player-tags">
                  {e.tags.slice(0, 4).map((tag) => (
                    <span
                      key={tag.id}
                      className="tag-dot"
                      style={{ background: tag.color }}
                      title={tag.name}
                    />
                  ))}
                  {e.tags.length > 4 && (
                    <span className="tag-dot-more">+{e.tags.length - 4}</span>
                  )}
                </div>
              )}
              {e.hasNote && e.noteSnippet && (
                <span className="noted-player-snippet">{e.noteSnippet}</span>
              )}
            </div>
            <button
              className="btn-small btn-ghost"
              onClick={(ev) => requestDelete(e.mcUsername, ev)}
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
  discordUsername: string | null;
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
  discordUsername,
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
        {discordUsername && (
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>@{discordUsername}</span>
        )}
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
  const [tagMap, setTagMap] = useState<Record<string, Tag[]>>({});
  // All approved users, loaded once for instant client-side search
  const allUsers = useRef<UserResult[]>([]);

  // UI state
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedDiscordName, setSelectedDiscordName] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [playerTags, setPlayerTags] = useState<Tag[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Search / filter / sort
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [filterTags, setFilterTags] = useState<number[]>([]);

  // Casing conflict popup: typed name differs in case from an existing note
  const [casingConflict, setCasingConflict] = useState<{
    typed: string;
    existing: string;
  } | null>(null);
  const [sort, setSort] = useState<SortKey>("updated");

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);


  // ── load all notes + tags ──────────────────────────────────────────────────

  async function loadData() {
    const [fetchedNotes, fetchedTags, fetchedUsers] = await Promise.all([
      api.get<PlayerNote[]>("/api/player-notes"),
      api.get<Tag[]>("/api/tags"),
      allUsers.current.length === 0
        ? api.get<UserResult[]>("/api/users/all")
        : Promise.resolve(allUsers.current),
    ]);
    if (fetchedUsers !== allUsers.current) allUsers.current = fetchedUsers;
    setNotes(fetchedNotes);
    setAllTags(fetchedTags);

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
      // Hide empty, untagged entries (placeholder notes created by the search flow)
      const tags = tagMap[n.mcUsername] ?? [];
      if (!n.body.trim() && tags.length === 0) return false;
      if (filterTags.length === 0) return true;
      // must have ALL selected filter tags
      return filterTags.every((id) => tags.some((t) => t.id === id));
    })
    .map((n) => ({
      mcUsername: n.mcUsername,
      displayName: n.resolvedUser?.discordDisplayName ?? n.mcUsername,
      discordUsername: n.resolvedUser
        ? (allUsers.current.find((u) => u.mcUsername === n.mcUsername)?.discordUsername ?? null)
        : null,
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
      const da = a.updatedAt ?? "";
      const db = b.updatedAt ?? "";
      return db.localeCompare(da);
    });

  // ── search (instant, client-side) ────────────────────────────────────────

  function handleSearch(q: string) {
    setSearch(q);
    const trimmed = q.trim();
    if (!trimmed) { setSearchResults([]); return; }

    // Real registered users
    const linkedUsernames = new Set(
      allUsers.current.map((u) => u.mcUsername?.toLowerCase()).filter(Boolean)
    );

    // Synthetic entries for notes that have no linked account
    const unlinkedSynthetics: UserResult[] = notes
      .filter((n) => !n.resolvedUser && !linkedUsernames.has(n.mcUsername.toLowerCase()))
      .map((n) => ({
        userId: -1,
        discordUsername: "",
        discordDisplayName: "",
        mcUsername: n.mcUsername,
        mcVerified: false,
        publicFactionTag: null,
        avatarUrl: null,
      }));

    const candidates = [...allUsers.current, ...unlinkedSynthetics];

    const all = candidates
      .map((u) => ({ u, score: scoreUser(trimmed, u) }))
      .sort((a, b) => b.score - a.score);

    const above = all.filter(({ score }) => score >= SEARCH_THRESHOLD);
    const results = above.length >= SEARCH_MIN
      ? above.slice(0, SEARCH_LIMIT)
      : all.slice(0, SEARCH_MIN);

    setSearchResults(results.map(({ u }) => u));
  }

  // ── select / load a player ────────────────────────────────────────────────

  const selectPlayer = useCallback(async (mcUsername: string) => {
    setSelected(mcUsername);
    setSearch("");
    setSearchResults([]);
    setSaveStatus("idle");
    // Resolve discord username from allUsers list
    const discordName = allUsers.current.find((u) => u.mcUsername === mcUsername)?.discordUsername
      ?? null;
    setSelectedDiscordName(discordName);

    try {
      const note = await api.get<{ body: string }>(
        `/api/player-notes/${encodeURIComponent(mcUsername)}`
      );
      setNoteBody(note.body);
    } catch {
      setNoteBody("");
    }

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
    if (!notes.some((n) => n.mcUsername === mcUsername)) {
      await api.put(`/api/player-notes/${encodeURIComponent(mcUsername)}`, { body: "" });
      await loadData();
    }
    await selectPlayer(mcUsername);
  }

  async function addRawUsername(u: string) {
    setSearch("");
    setSearchResults([]);

    // Check for an existing note with the same username (case-insensitive)
    const existing = notes.find((n) => n.mcUsername.toLowerCase() === u.toLowerCase());
    if (existing) {
      if (existing.mcUsername === u) {
        // Exact same casing — just open it silently
        await selectPlayer(existing.mcUsername);
      } else {
        // Different casing — ask the user what to do
        setCasingConflict({ typed: u, existing: existing.mcUsername });
      }
      return;
    }

    await api.put(`/api/player-notes/${encodeURIComponent(u)}`, { body: "" });
    await loadData();
    await selectPlayer(u);
  }

  async function resolveCasingConflict(choice: "existing" | "new") {
    if (!casingConflict) return;
    const { typed, existing } = casingConflict;
    setCasingConflict(null);
    if (choice === "existing") {
      await selectPlayer(existing);
    } else {
      await api.put(`/api/player-notes/${encodeURIComponent(typed)}`, { body: "" });
      await loadData();
      await selectPlayer(typed);
    }
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
      setSelectedDiscordName(null);
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

  // ── filter helpers ────────────────────────────────────────────────────────

  function toggleFilterTag(id: number) {
    setFilterTags((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <div className="notes-page-wrap">
      <GlobalNotepad />

      {/* Casing conflict modal */}
      {casingConflict && (
        <div className="modal-overlay">
          <div className="modal-box">
            <p style={{ marginTop: 0 }}>
              {t("notes.casingConflict.body", {
                typed: casingConflict.typed,
                existing: casingConflict.existing,
              })}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => resolveCasingConflict("existing")}>
                {t("notes.casingConflict.useExisting", { name: casingConflict.existing })}
              </button>
              <button className="btn-secondary" onClick={() => resolveCasingConflict("new")}>
                {t("notes.casingConflict.createNew", { name: casingConflict.typed })}
              </button>
              <button className="btn-ghost" onClick={() => setCasingConflict(null)}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

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
          filterTags={filterTags}
          onToggleFilterTag={toggleFilterTag}
          onClearFilter={() => setFilterTags([])}
          sort={sort}
          onSort={setSort}
        />

        <main className="notes-editor-area">
          {selected ? (
            <EditorPanel
              mcUsername={selected}
              discordUsername={selectedDiscordName}
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
