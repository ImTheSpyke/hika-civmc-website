import { useI18n } from "../i18n/context.js";
import { useAuth } from "../lib/auth.js";

export function LoginPage() {
  const { t } = useI18n();
  const { user } = useAuth();

  if (user?.status === "pending") {
    return (
      <div className="page-center">
        <p>{t("auth.pending")}</p>
        <a href="/api/auth/logout">Logout</a>
      </div>
    );
  }

  if (user?.status === "rejected") {
    return (
      <div className="page-center">
        <p>{t("auth.rejected")}</p>
        <a href="/api/auth/logout">Logout</a>
      </div>
    );
  }

  return (
    <div className="page-center">
      <h1>CivMC Companion</h1>
      <p>{t("auth.loginPrompt")}</p>
      <a href="/api/auth/discord" className="btn-discord">
        {t("nav.login")}
      </a>
    </div>
  );
}
