import { useI18n } from "../i18n/context.js";
import { useAuth } from "../lib/auth.js";

function LogoutButton({ label }: { label: string }) {
  return (
    <form method="post" action="/api/auth/logout">
      <button type="submit">{label}</button>
    </form>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="landing-feature-card">
      <div className="landing-feature-icon">{icon}</div>
      <h3 className="landing-feature-title">{title}</h3>
      <p className="landing-feature-body">{body}</p>
    </div>
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
    <div className="landing">
      {/* ── Invasion banner ── */}
      <section className="landing-invasion">
        <div className="landing-invasion-inner">
          <span className="landing-invasion-label">⚠ MENACE IMMINENTE</span>
          <p className="landing-invasion-text">
            L'invasion IA approche. Préparez vos défenses. Coordonnez vos alliances.
            <strong> Ceux qui sont organisés survivront.</strong>
          </p>
        </div>
      </section>

      {/* ── Hero ── */}
      <section className="landing-hero">
        <div className="landing-hero-glow" aria-hidden />
        <div className="landing-hero-content">
          <div className="landing-eyebrow">Hika CivMC · FR/EN</div>
          <h1 className="landing-title">
            Votre empire<br />
            <span className="landing-title-accent">mérite une mémoire.</span>
          </h1>
          <p className="landing-subtitle">
            Un outil pour les joueurs sérieux — notes de terrain, profils de joueurs,
            organisation de faction, événements coordonnés.
            <br />
            <span style={{ color: "var(--text-muted)" }}>
              The companion tool for Hika CivMC — built for those who play to win.
            </span>
          </p>
          <a href="/api/auth/discord" className="landing-cta">
            <svg width="20" height="20" viewBox="0 0 71 55" fill="currentColor" aria-hidden>
              <path d="M60.1 4.9A58.6 58.6 0 0 0 45.5.4a40.6 40.6 0 0 0-1.8 3.7 54.2 54.2 0 0 0-16.3 0A40.6 40.6 0 0 0 25.5.4 58.5 58.5 0 0 0 10.9 5C1.6 18.7-.9 32 .3 45.1a59 59 0 0 0 17.9 9 44 44 0 0 0 3.8-6.2 38.4 38.4 0 0 1-6-2.9l1.5-1.1a42 42 0 0 0 35.9 0l1.5 1.1a38.4 38.4 0 0 1-6 2.9 44 44 0 0 0 3.8 6.2 58.8 58.8 0 0 0 17.9-9C72 29.8 68.2 16.6 60.1 4.9ZM23.7 37c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.5 0 6.4 3.2 6.3 7.2 0 4-2.8 7.2-6.3 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.5 0 6.4 3.2 6.3 7.2 0 4-2.8 7.2-6.3 7.2Z" />
            </svg>
            Se connecter avec Discord
          </a>
          <p className="landing-cta-note">{t("auth.loginPrompt")}</p>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="landing-features">
        <FeatureCard
          icon="📋"
          title="Notes & Fiches joueurs"
          body="Gardez une trace de chaque allié, ennemi ou inconnu. Notes privées par joueur, visibles uniquement par vous — avec tags colorés pour organiser d'un coup d'œil."
        />
        <FeatureCard
          icon="🏷️"
          title="Tags & Organisation"
          body="Créez vos propres étiquettes — faction, statut diplomatique, menace, allié. Filtrez votre liste en une seconde. Partagez le contexte avec votre faction."
        />
        <FeatureCard
          icon="⚔️"
          title="Événements & Rassemblements"
          body="Planifiez des événements, des réunions de faction ou des jeux. Ne ratez plus jamais un événement critique."
        />
      </section>


      {/* ── Footer CTA ── */}
      <section className="landing-footer-cta">
        <p className="landing-footer-line">Vous jouez déjà sur Hika CivMC ?</p>
        <a href="/api/auth/discord" className="landing-cta landing-cta-sm">
          Rejoindre maintenant
        </a>
      </section>

    </div>
  );
}
