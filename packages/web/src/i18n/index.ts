const files = import.meta.glob("./locales/*.json", { eager: true });

export const locales: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(files).map(([filePath, mod]) => [
    filePath.match(/\/(\w+)\.json$/)![1],
    (mod as { default: Record<string, string> }).default,
  ])
);

export const availableLocales = Object.keys(locales);

export function translate(
  locale: string,
  key: string,
  vars?: Record<string, string | number>
): string {
  const dict = locales[locale] ?? locales["en"] ?? {};
  const fallback = locales["en"] ?? {};
  let str = dict[key] ?? fallback[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, String(v));
    }
  }
  return str;
}
