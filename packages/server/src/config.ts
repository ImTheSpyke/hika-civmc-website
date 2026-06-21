function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  port: parseInt(optional("PORT", "3000"), 10),
  nodeEnv: optional("NODE_ENV", "development"),
  db: {
    host: optional("DB_HOST", "localhost"),
    port: parseInt(optional("DB_PORT", "3306"), 10),
    user: required("DB_USER"),
    password: required("DB_PASSWORD"),
    name: required("DB_NAME"),
  },
  sessionSecret: required("SESSION_SECRET"),
  discord: {
    clientId: required("DISCORD_CLIENT_ID"),
    clientSecret: required("DISCORD_CLIENT_SECRET"),
    redirectUri: required("DISCORD_REDIRECT_URI"),
  },
  superadminDiscordId: optional("SUPERADMIN_DISCORD_ID", ""),
  publicBaseUrl: optional("PUBLIC_BASE_URL", "http://localhost:3000"),
};
