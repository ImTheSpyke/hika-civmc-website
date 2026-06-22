import { useI18n } from "../i18n/context.js";
import { useAuth } from "../lib/auth.js";

function LogoutButton({ label }: { label: string }) {
  return (
    <form method="post" action="/api/auth/logout">
      <button type="submit">{label}</button>
    </form>
  );
}

export function LoginPage() {
  const { t } = useI18n();
  const { user } = useAuth();

  if (user?.status === "pending") {
    return (
      <div className="page-center">
        <p>{t("auth.pending")}</p>
        <LogoutButton label={t("nav.logout")} />
      </div>
    );
  }

  if (user?.status === "rejected") {
    return (
      <div className="page-center">
        <p>{t("auth.rejected")}</p>
        <LogoutButton label={t("nav.logout")} />
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
