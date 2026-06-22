import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client.js";
import { useI18n } from "../i18n/context.js";
import { useAuth } from "../lib/auth.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { ReportToggle } from "../components/ReportToggle.js";
import { Markdown } from "../components/Markdown.js";
import { NotFoundPage } from "./NotFoundPage.js";
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

      {myApproved.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 8 }}>{t("newspapers.myNewspapers")}</h3>
          <ul className="card-list">
            {myApproved.map((np) => (
              <li key={np.id} className="card">
                <Link to={`/newspapers/${np.id}/manage`}>
                  <strong>{np.name}</strong>{" "}
                  {np.archived && <span className="badge badge-archived">{t("newspapers.archived")}</span>}
                  {np.active === false && <span className="badge">{t("newspapers.hidden")}</span>}
                  {np.active !== false && !np.archived && <span className="badge">{t("newspapers.approved")}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

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

type NewspaperDetail = Newspaper & { articles: Article[] };

export function NewspaperDetailPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<NewspaperDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api
      .get<NewspaperDetail>(`/api/newspapers/${id}`)
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      });
  }, [id]);

  if (notFound) return <NotFoundPage />;
  if (!data) return <p className="page">{t("common.loading")}</p>;

  const adminViewingHidden = (data.active === false || data.archived) && user?.isAdmin;

  return (
    <div className="page">
      {adminViewingHidden && (
        <div className="card" style={{ borderColor: "var(--danger)" }}>
          <strong>{t("newspapers.adminHiddenNotice")}</strong>
        </div>
      )}
      <div style={{ position: "relative" }}>
        <h2>{data.name}</h2>
        {data.description && <Markdown className="newspaper-description">{data.description}</Markdown>}
        <ReportToggle targetType="newspaper" targetId={data.id} reported={!!data.reported} />
      </div>
      <hr style={{ borderColor: "var(--border)", margin: "16px 0" }} />
      {data.articles.map((a) => (
        <article key={a.id} className="article" style={{ position: "relative", opacity: a.active === false ? 0.5 : 1 }}>
          <h3>{a.title}{a.active === false && <span className="badge"> {t("newspapers.hidden")}</span>}</h3>
          <p className="article-date">{new Date(a.published_at).toLocaleDateString()}</p>
          <Markdown className="article-body">{a.body}</Markdown>
          <ReportToggle targetType="article" targetId={a.id} reported={!!a.reported} />
        </article>
      ))}
    </div>
  );
}

export function NewspaperManagePage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<NewspaperDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState({ title: "", body: "" });
  const [confirm, setConfirm] = useState<
    | { kind: "deleteArticle"; articleId: number; title: string }
    | { kind: "archive" }
    | null
  >(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  async function load() {
    try {
      const res = await api.get<NewspaperDetail>(`/api/newspapers/${id}`);
      setData(res);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) setNotFound(true);
    }
  }

  useEffect(() => { load(); }, [id]);

  if (notFound) return <NotFoundPage />;
  if (!data) return <p className="page">{t("common.loading")}</p>;

  const archived = !!data.archived;

  async function publish() {
    if (!form.title.trim()) return;
    await api.post(`/api/newspapers/${id}/articles`, form);
    setForm({ title: "", body: "" });
    await load();
  }

  async function toggleArticle(articleId: number, active: boolean) {
    await api.patch(`/api/newspapers/${id}/articles/${articleId}/active`, { active });
    await load();
  }

  async function toggleNewspaperHidden() {
    await api.patch(`/api/newspapers/${id}/active`, { active: data!.active === false });
    await load();
  }

  async function unarchive() {
    await api.post(`/api/admin/newspapers/${id}/unarchive`);
    await load();
  }

  async function runConfirm() {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      if (confirm.kind === "deleteArticle") {
        await api.delete(`/api/newspapers/${id}/articles/${confirm.articleId}`);
      } else if (confirm.kind === "archive") {
        await api.post(`/api/newspapers/${id}/archive`);
      }
      setConfirm(null);
      await load();
    } finally {
      setConfirmBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>
          {data.name}{" "}
          {archived && <span className="badge badge-archived">{t("newspapers.archived")}</span>}
          {data.active === false && <span className="badge">{t("newspapers.hidden")}</span>}
        </h2>
        <div className="form-actions">
          <button className="btn-small btn-secondary" onClick={toggleNewspaperHidden}>
            {data.active === false ? t("newspapers.unhide") : t("newspapers.hide")}
          </button>
          {!archived && (
            <button className="btn-small btn-danger" onClick={() => setConfirm({ kind: "archive" })}>
              {t("newspapers.archive")}
            </button>
          )}
          {archived && user?.isAdmin && (
            <button className="btn-small" onClick={unarchive}>{t("newspapers.unarchive")}</button>
          )}
        </div>
      </div>

      {archived && (
        <div className="card card-pending">
          {user?.isAdmin ? t("newspapers.archivedAdminNote") : t("newspapers.archivedOwnerNote")}
        </div>
      )}

      {!archived && (
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
          <span className="markdown-hint">{t("common.markdownSupported")}</span>
          {form.body.trim() && (
            <div className="markdown-preview">
              <span className="markdown-preview-label">{t("common.preview")}</span>
              <Markdown>{form.body}</Markdown>
            </div>
          )}
          <button onClick={publish} disabled={!form.title.trim()}>{t("newspapers.publishArticle")}</button>
        </div>
      )}

      {data.articles.map((a) => (
        <article key={a.id} className="article" style={{ opacity: a.active === false ? 0.5 : 1 }}>
          <h3>{a.title}{a.active === false && <span className="badge"> {t("newspapers.hidden")}</span>}</h3>
          <Markdown className="article-body">{a.body}</Markdown>
          <div className="form-actions" style={{ marginTop: 8 }}>
            <button className="btn-small btn-secondary" onClick={() => toggleArticle(a.id, a.active === false)}>
              {a.active === false ? t("newspapers.unhide") : t("newspapers.hide")}
            </button>
            <button
              className="btn-small btn-danger"
              onClick={() => setConfirm({ kind: "deleteArticle", articleId: a.id, title: a.title })}
            >
              {t("common.delete")}
            </button>
          </div>
        </article>
      ))}

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === "archive" ? t("newspapers.confirmArchiveTitle") : t("newspapers.confirmDeleteArticleTitle")}
          message={confirm.kind === "archive" ? t("newspapers.confirmArchiveBody") : t("newspapers.confirmDeleteArticleBody", { title: confirm.title })}
          confirmLabel={confirm.kind === "archive" ? t("newspapers.archive") : t("common.delete")}
          danger
          busy={confirmBusy}
          onConfirm={runConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
