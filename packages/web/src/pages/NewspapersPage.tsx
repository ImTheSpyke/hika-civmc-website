import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client.js";
import { useI18n } from "../i18n/context.js";
import type { Article, Newspaper } from "../api/types.js";

const EMPTY_FORM = { name: "", description: "", requestReason: "" };

export function NewspapersPage() {
  const { t } = useI18n();
  const [newspapers, setNewspapers] = useState<Newspaper[]>([]);
  const [mine, setMine] = useState<Newspaper[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<typeof EMPTY_FORM>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function loadAll() {
    api.get<Newspaper[]>("/api/newspapers").then(setNewspapers);
    api.get<Newspaper[]>("/api/me/newspapers").then(setMine);
  }

  useEffect(() => { loadAll(); }, []);

  // pending = not yet approved; exclude rejected
  const myPending = mine.filter((n) => n.status === "pending");
  const myApproved = mine.filter((n) => n.status === "approved");

  function validate() {
    const e: Partial<typeof EMPTY_FORM> = {};
    if (!form.name.trim()) e.name = t("error.invalidInput");
    if (!form.requestReason.trim()) e.requestReason = t("error.invalidInput");
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submitRequest() {
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await api.post("/api/newspapers", form);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setErrors({});
      loadAll();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  function cancel() {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setErrors({});
    setSubmitError("");
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t("newspapers.title")}</h2>
        <button onClick={() => setShowForm(!showForm)}>{t("newspapers.create")}</button>
      </div>

      {showForm && (
        <div className="card form-card">
          <div className="form-field">
            <label>Newspaper title *</label>
            <input
              placeholder="e.g. The Imperial Gazette"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={errors.name ? "input-error" : ""}
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>

          <div className="form-field">
            <label>Description</label>
            <textarea
              placeholder="What will your newspaper cover?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </div>

          <div className="form-field">
            <label>Why do you want to create a newspaper? *</label>
            <textarea
              placeholder="Tell the admin your plans and intentions…"
              value={form.requestReason}
              onChange={(e) => setForm({ ...form, requestReason: e.target.value })}
              rows={3}
              className={errors.requestReason ? "input-error" : ""}
            />
            {errors.requestReason && <span className="field-error">{errors.requestReason}</span>}
          </div>

          {submitError && <p className="field-error">{submitError}</p>}

          <div className="form-actions">
            <button onClick={submitRequest} disabled={submitting}>{t("common.submit")}</button>
            <button className="btn-secondary" onClick={cancel}>{t("common.cancel")}</button>
          </div>
        </div>
      )}

      {/* My pending requests */}
      {myPending.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 8, fontSize: 14, color: "var(--text-muted)" }}>Your pending requests</h3>
          {myPending.map((np) => (
            <div key={np.id} className="card card-pending">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>{np.name}</strong>
                <span className="badge badge-pending">Awaiting approval</span>
              </div>
              {np.description && <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{np.description}</span>}
            </div>
          ))}
        </div>
      )}

      {/* My approved newspapers */}
      {myApproved.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 8 }}>{t("newspapers.myNewspapers")}</h3>
          <ul className="card-list">
            {myApproved.map((np) => (
              <li key={np.id} className="card">
                <Link to={`/newspapers/${np.id}/manage`}>
                  <strong>{np.name}</strong> <span className="badge">{t("newspapers.approved")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Public approved newspapers */}
      <h3 style={{ marginBottom: 8 }}>{t("newspapers.title")}</h3>
      {newspapers.length === 0 && <p style={{ color: "var(--text-muted)" }}>{t("newspapers.noNewspapers")}</p>}
      <ul className="card-list">
        {newspapers.map((np) => (
          <li key={np.id} className="card">
            <Link to={`/newspapers/${np.id}`}>
              <h3>{np.name}</h3>
              <p>{np.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NewspaperDetailPage() {
  const { t } = useI18n();
  const id = window.location.pathname.split("/")[2];
  const [data, setData] = useState<(Newspaper & { articles: Article[] }) | null>(null);

  useEffect(() => {
    api.get<Newspaper & { articles: Article[] }>(`/api/newspapers/${id}`).then(setData);
  }, [id]);

  if (!data) return <p>{t("common.loading")}</p>;

  async function report() {
    await api.post("/api/reports", { targetType: "newspaper", targetId: Number(id) });
  }

  return (
    <div className="page">
      <div style={{ position: "relative" }}>
        <h2>{data.name}</h2>
        <p>{data.description}</p>
        <button className="btn-small btn-report report-corner" onClick={report} title={t("newspapers.report")}>⚑</button>
      </div>
      <hr style={{ borderColor: "var(--border)", margin: "16px 0" }} />
      {data.articles.map((a) => (
        <article key={a.id} className="article" style={{ position: "relative" }}>
          <h3>{a.title}</h3>
          <p className="article-date">{new Date(a.published_at).toLocaleDateString()}</p>
          <div className="article-body">{a.body}</div>
          <button
            className="btn-small btn-report report-corner"
            onClick={() => api.post("/api/reports", { targetType: "article", targetId: a.id })}
            title={t("newspapers.report")}
          >⚑</button>
        </article>
      ))}
    </div>
  );
}

export function NewspaperManagePage() {
  const { t } = useI18n();
  const id = window.location.pathname.split("/")[2];
  const [data, setData] = useState<(Newspaper & { articles: Article[] }) | null>(null);
  const [form, setForm] = useState({ title: "", body: "" });

  async function load() {
    const res = await api.get<Newspaper & { articles: Article[] }>(`/api/newspapers/${id}`).catch(() => null);
    if (res) setData(res);
  }

  useEffect(() => { load(); }, [id]);

  async function publish() {
    await api.post(`/api/newspapers/${id}/articles`, form);
    setForm({ title: "", body: "" });
    await load();
  }

  async function deleteArticle(articleId: number) {
    await api.delete(`/api/newspapers/${id}/articles/${articleId}`);
    await load();
  }

  if (!data) return <p>{t("common.loading")}</p>;

  return (
    <div className="page">
      <h2>{data.name}</h2>
      <div className="card">
        <h3>{t("newspapers.publishArticle")}</h3>
        <input
          placeholder={t("newspapers.articleTitle")}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <textarea
          placeholder={t("newspapers.articleBody")}
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          rows={8}
        />
        <button onClick={publish}>{t("newspapers.publishArticle")}</button>
      </div>
      {data.articles.map((a) => (
        <article key={a.id} className="article">
          <h3>{a.title}</h3>
          <button onClick={() => deleteArticle(a.id)}>{t("common.delete")}</button>
        </article>
      ))}
    </div>
  );
}
