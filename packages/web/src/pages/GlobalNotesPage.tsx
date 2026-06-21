import { useEffect, useRef, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n/context.js";

const MAX = 5000;
const DEBOUNCE_MS = 2000;

export function GlobalNotesPage() {
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

  function handleBlur() {
    if (timerRef.current) clearTimeout(timerRef.current);
    save(body);
  }

  return (
    <div className="page">
      <h2>{t("globalNotes.title")}</h2>
      <textarea
        value={body}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={t("globalNotes.placeholder")}
        rows={20}
        style={{ width: "100%", resize: "vertical" }}
      />
      <div className="notes-footer">
        <span>
          {t("globalNotes.chars", { count: body.length, max: MAX })}
        </span>
        <span>
          {status === "saving" && t("common.saving")}
          {status === "saved" && t("common.saved")}
        </span>
      </div>
    </div>
  );
}
