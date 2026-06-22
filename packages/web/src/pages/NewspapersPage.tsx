import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client.js";
import { useI18n } from "../i18n/context.js";
import { useAuth } from "../lib/auth.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { ReportToggle } from "../components/ReportToggle.js";
import { Markdown } from "../components/Markdown.js";
import { NotFoundPage } from "./NotFoundPage.js";
import type { Article, Newspaper } from "../api/types.js";

const EMPTY_REQUEST = { name: "", description: "", requestReason: "" };

type ListTab = "newspapers" | "subscribed";

// ── Newspaper list page ───────────────────────────────────────────────────────

export function NewspapersPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [newspapers, setNewspapers] = useState<Newspaper[]>([]);
  const [mine, setMine] = useState<Newspaper[]>([]);
  const [tab, setTab] = useState<ListTab>("newspapers");
  const [showRequest, setShowRequest] = useState(false);
  const [form, setForm] = useState(EMPTY_REQUEST);
  const [errors, setErrors] = useState<Partial<typeof EMPTY_REQUEST>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function loadAll() {
    api.get<Newspaper[]>("/api/newspapers").then(setNewspapers);
    api.get<Newspaper[]>("/api/me/newspapers").then(setMine);
  }

  useEffect(() => { loadAll(); }, []);

  const myPending = mine.filter((n) => n.status === "pending");
  const subscribed = newspapers.filter((n) => n.subscribed);

  function validate() {
    const e: Partial<typeof EMPTY_REQUEST> = {};
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
      setShowRequest(false);
      setForm(EMPTY_REQUEST);
      setErrors({});
      loadAll();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  function cancelRequest() {
    setShowRequest(false);
    setForm(EMPTY_REQUEST);
    setErrors({});
    setSubmitError("");
  }

  const displayed = tab === "subscribed" ? subscribed : newspapers;

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t("newspapers.title")}</h2>
        <button onClick={() => setShowRequest(!showRequest)}>{t("newspapers.create")}</button>
      </div>

      {showRequest && (
        <div className="card form-card" style={{ marginBottom: 20 }}>
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
            <button className="btn-secondary" onClick={cancelRequest}>{t("common.cancel")}</button>
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

      <div className="notes-tab-switcher" style={{ marginBottom: 16, width: "fit-content" }}>
        <button className={tab === "newspapers" ? "active" : ""} onClick={() => setTab("newspapers")}>
          {t("newspapers.title")}
        </button>
        <button className={tab === "subscribed" ? "active" : ""} onClick={() => setTab("subscribed")}>
          {t("newspapers.subscribed")}
        </button>
      </div>

      {displayed.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>
          {tab === "subscribed" ? t("newspapers.noSubscriptions") : t("newspapers.noNewspapers")}
        </p>
      )}
      <ul className="card-list">
        {displayed.map((np) => (
          <li key={np.id} className="card" style={{ cursor: "pointer" }} onClick={() => navigate(`/newspapers/${np.id}`)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div>
                <strong>{np.name}</strong>
                {np.archived && <span className="badge badge-archived" style={{ marginLeft: 6 }}>{t("newspapers.archived")}</span>}
                {np.active === false && !np.archived && <span className="badge" style={{ marginLeft: 6 }}>{t("newspapers.hidden")}</span>}
                {np.mine && <span className="badge" style={{ marginLeft: 6, background: "var(--success)" }}>Mine</span>}
              </div>
            </div>
            {np.description && <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>{np.description}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Newspaper detail + manage (merged) ────────────────────────────────────────

type NewspaperDetail = Newspaper & { articles: Article[] };

export function NewspaperDetailPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<NewspaperDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [showArticleForm, setShowArticleForm] = useState(false);
  const [articleForm, setArticleForm] = useState({ title: "", body: "" });
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
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
    }
  }

  useEffect(() => { load(); }, [id]);

  if (notFound) return <NotFoundPage />;
  if (!data) return <p className="page">{t("common.loading")}</p>;

  const isOwner = !!data.mine;
  const isAdmin = !!user?.isAdmin;
  const canManage = isOwner || isAdmin;
  const archived = !!data.archived;
  const adminViewingHidden = (data.active === false || archived) && isAdmin;

  async function toggleSubscribe() {
    if (data!.subscribed) {
      await api.delete(`/api/newspapers/${id}/subscribe`);
    } else {
      await api.post(`/api/newspapers/${id}/subscribe`);
    }
    await load();
  }

  async function publishArticle() {
    if (!articleForm.title.trim()) return;
    await api.post(`/api/newspapers/${id}/articles`, articleForm);
    setArticleForm({ title: "", body: "" });
    setShowArticleForm(false);
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
      {/* Top bar */}
      <div className="page-header" style={{ flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn-secondary btn-small" onClick={() => navigate("/newspapers")}>
            ← {t("newspapers.backToList")}
          </button>
          <h2 style={{ margin: 0 }}>
            {data.name}
            {archived && <span className="badge badge-archived" style={{ marginLeft: 8 }}>{t("newspapers.archived")}</span>}
            {data.active === false && <span className="badge" style={{ marginLeft: 8 }}>{t("newspapers.hidden")}</span>}
          </h2>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!canManage && (
            <button
              className={data.subscribed ? "btn-secondary btn-small" : "btn-small"}
              onClick={toggleSubscribe}
            >
              {data.subscribed ? t("newspapers.unsubscribe") : t("newspapers.subscribe")}
            </button>
          )}
          {canManage && (
            <>
              <button className="btn-small btn-secondary" onClick={toggleNewspaperHidden}>
                {data.active === false ? t("newspapers.unhide") : t("newspapers.hide")}
              </button>
              {!archived && (
                <button className="btn-small btn-danger" onClick={() => setConfirm({ kind: "archive" })}>
                  {t("newspapers.archive")}
                </button>
              )}
              {archived && isAdmin && (
                <button className="btn-small" onClick={unarchive}>{t("newspapers.unarchive")}</button>
              )}
            </>
          )}
        </div>
      </div>

      {adminViewingHidden && (
        <div className="card" style={{ borderColor: "var(--danger)", marginBottom: 12 }}>
          <strong>{t("newspapers.adminHiddenNotice")}</strong>
        </div>
      )}

      {archived && canManage && (
        <div className="card card-pending" style={{ marginBottom: 12 }}>
          {isAdmin ? t("newspapers.archivedAdminNote") : t("newspapers.archivedOwnerNote")}
        </div>
      )}

      {data.description && (
        <Markdown className="newspaper-description" style={{ marginBottom: 16 }}>{data.description}</Markdown>
      )}

      {!canManage && (
        <div style={{ position: "relative", height: 28, marginBottom: 4 }}>
          <ReportToggle targetType="newspaper" targetId={data.id} reported={!!data.reported} />
        </div>
      )}

      {/* Create article button */}
      {canManage && !archived && (
        <div style={{ marginBottom: 16, textAlign: "right" }}>
          <button onClick={() => setShowArticleForm(!showArticleForm)}>
            {showArticleForm ? t("common.cancel") : t("newspapers.newArticle")}
          </button>
        </div>
      )}

      {/* Article form */}
      {showArticleForm && canManage && !archived && (
        <div className="card form-card" style={{ marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>{t("newspapers.newArticle")}</h3>
          <div className="form-field">
            <label>{t("newspapers.articleTitle")} *</label>
            <input
              placeholder={t("newspapers.articleTitle")}
              value={articleForm.title}
              onChange={(e) => setArticleForm({ ...articleForm, title: e.target.value })}
            />
          </div>
          <div className="form-field">
            <label>{t("newspapers.articleBody")}</label>
            <div className="live-md-editor">
              <textarea
                placeholder={t("newspapers.articleBody")}
                value={articleForm.body}
                onChange={(e) => setArticleForm({ ...articleForm, body: e.target.value })}
                rows={8}
              />
              {articleForm.body.trim() && (
                <div className="live-md-preview markdown">
                  <Markdown>{articleForm.body}</Markdown>
                </div>
              )}
            </div>
            <span className="markdown-hint">{t("common.markdownSupported")}</span>
          </div>
          <button onClick={publishArticle} disabled={!articleForm.title.trim()}>
            {t("newspapers.publishArticle")}
          </button>
        </div>
      )}

      <hr style={{ borderColor: "var(--border)", margin: "16px 0" }} />

      {data.articles.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>{t("newspapers.noArticles")}</p>
      )}

      {data.articles.map((a) => (
        <article
          key={a.id}
          className="article-card"
          style={{ opacity: a.active === false ? 0.6 : 1 }}
        >
          <div className="article-card-header">
            <div>
              <h3 style={{ margin: 0 }}>
                {a.title}
                {a.active === false && <span className="badge" style={{ marginLeft: 6 }}>{t("newspapers.hidden")}</span>}
              </h3>
              <p className="article-date">{new Date(a.published_at).toLocaleDateString()}</p>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {canManage && (
                <>
                  <button
                    className="btn-small btn-secondary"
                    onClick={() => toggleArticle(a.id, a.active === false)}
                  >
                    {a.active === false ? t("newspapers.unhide") : t("newspapers.hide")}
                  </button>
                  <button
                    className="btn-small btn-danger"
                    onClick={() => setConfirm({ kind: "deleteArticle", articleId: a.id, title: a.title })}
                  >
                    {t("common.delete")}
                  </button>
                </>
              )}
              {!canManage && (
                <div style={{ position: "relative", width: 32, height: 28 }}>
                  <ReportToggle targetType="article" targetId={a.id} reported={!!a.reported} />
                </div>
              )}
            </div>
          </div>
          <Markdown className="article-body">{a.body}</Markdown>
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

// Keep the manage page route as a redirect to the detail page
export function NewspaperManagePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useEffect(() => { navigate(`/newspapers/${id}`, { replace: true }); }, [id]);
  return null;
}
