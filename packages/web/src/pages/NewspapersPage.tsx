import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useI18n } from "../i18n/context.js";
import type { Article, Newspaper } from "../api/types.js";

export function NewspapersPage() {
  const { t } = useI18n();
  const [newspapers, setNewspapers] = useState<Newspaper[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", requestReason: "" });

  useEffect(() => {
    api.get<Newspaper[]>("/api/newspapers").then(setNewspapers);
  }, []);

  async function submitRequest() {
    await api.post("/api/newspapers", form);
    setShowForm(false);
    setForm({ name: "", description: "", requestReason: "" });
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t("newspapers.title")}</h2>
        <button onClick={() => setShowForm(!showForm)}>{t("newspapers.create")}</button>
      </div>

      {showForm && (
        <div className="card">
          <input
            placeholder={t("newspapers.articleTitle")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <textarea
            placeholder={t("newspapers.requestReason")}
            value={form.requestReason}
            onChange={(e) => setForm({ ...form, requestReason: e.target.value })}
            rows={4}
          />
          <button onClick={submitRequest}>{t("common.submit")}</button>
          <button onClick={() => setShowForm(false)}>{t("common.cancel")}</button>
        </div>
      )}

      {newspapers.length === 0 && <p>{t("newspapers.noNewspapers")}</p>}
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

      <MyNewspapers t={t} />
    </div>
  );
}

function MyNewspapers({ t }: { t: (k: string) => string }) {
  const [mine, setMine] = useState<Newspaper[]>([]);

  useEffect(() => {
    api.get<Newspaper[]>("/api/me/newspapers").then(setMine);
  }, []);

  if (!mine.length) return null;

  return (
    <div>
      <h3>{t("newspapers.myNewspapers")}</h3>
      <ul className="card-list">
        {mine.map((np) => (
          <li key={np.id} className="card">
            <Link to={`/newspapers/${np.id}/manage`}>
              {np.name} — <span className="badge">{t(`newspapers.${np.status}`)}</span>
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
      <h2>{data.name}</h2>
      <p>{data.description}</p>
      <button className="btn-small btn-report" onClick={report}>{t("newspapers.report")}</button>
      <hr />
      {data.articles.map((a) => (
        <article key={a.id} className="article">
          <h3>{a.title}</h3>
          <p className="article-date">{new Date(a.published_at).toLocaleDateString()}</p>
          <div className="article-body">{a.body}</div>
          <button
            className="btn-small btn-report"
            onClick={() => api.post("/api/reports", { targetType: "article", targetId: a.id })}
          >
            {t("newspapers.report")}
          </button>
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
