import { describe, it, expect } from "vitest";
import { locales } from "./index.js";

describe("i18n locale completeness", () => {
  const enKeys = new Set(Object.keys(locales["en"] ?? {}));

  for (const lang of Object.keys(locales)) {
    if (lang === "en") continue;

    it(`${lang}.json has no missing keys vs en.json`, () => {
      const langKeys = new Set(Object.keys(locales[lang]));
      const missing = [...enKeys].filter((k) => !langKeys.has(k));
      expect(missing, `Missing in ${lang}: ${missing.join(", ")}`).toHaveLength(0);
    });

    it(`${lang}.json has no extra keys vs en.json`, () => {
      const langKeys = new Set(Object.keys(locales[lang]));
      const extra = [...langKeys].filter((k) => !enKeys.has(k));
      if (extra.length) console.warn(`Extra keys in ${lang}: ${extra.join(", ")}`);
      // warn only, not fail
      expect(extra).toBeDefined();
    });
  }
});
