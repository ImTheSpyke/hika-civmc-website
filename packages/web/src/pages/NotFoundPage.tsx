import { Link } from "react-router-dom";
import { useI18n } from "../i18n/context.js";

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="page-center">
      <h1 style={{ fontSize: 48, margin: 0 }}>404</h1>
      <p>{t("notFound.message")}</p>
      <Link to="/">{t("notFound.backHome")}</Link>
    </div>
  );
}
