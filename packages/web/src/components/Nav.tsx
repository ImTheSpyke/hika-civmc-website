import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth.js";
import { useI18n } from "../i18n/context.js";
import { Avatar } from "./Avatar.js";

export function Nav() {
  const { user, logout } = useAuth();
  const { t, locale, setLocale, availableLocales } = useI18n();
  const location = useLocation();

  if (!user || user.status !== "approved") return null;

  function navLink(to: string, label: string) {
    const active = location.pathname === to || location.pathname.startsWith(to + "/");
    return (
      <Link
        to={to}
        style={{ fontWeight: active ? "bold" : "normal", textDecoration: "none" }}
      >
        {label}
      </Link>
    );
  }

  return (
    <nav className="nav">
      <div className="nav-links">
        {navLink("/notes", t("nav.notes"))}
        {navLink("/tags", t("nav.tags"))}
        {navLink("/newspapers", t("nav.newspapers"))}
        {navLink("/events", t("nav.events"))}
        {user.isAdmin && navLink("/admin", t("nav.admin"))}
      </div>
      <div className="nav-right">
        {availableLocales.length > 1 && (
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            aria-label="Language"
          >
            {availableLocales.map((l) => (
              <option key={l} value={l}>{l.toUpperCase()}</option>
            ))}
          </select>
        )}
        <Link to="/profile" style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
          <Avatar mcUsername={user.mcUsername} size={24} />
          <span>{user.discordDisplayName}</span>
        </Link>
        <button onClick={() => logout()}>{t("nav.logout")}</button>
      </div>
    </nav>
  );
}
