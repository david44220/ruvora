export const COLLECTION_THEMES = ["obsidian", "champagne", "emerald-dusk", "amber-glow"] as const;
export type CollectionTheme = (typeof COLLECTION_THEMES)[number];

const RESERVED_COLLECTION_SLUGS = new Set([
  "new",
  "edit",
  "admin",
  "api",
  "app",
  "login",
  "register",
  "explore",
  "offers",
  "events",
  "privacy",
  "terms",
  "settings",
  "promote",
  "ruvora",
]);

const COLLECTION_SLUG_RE = /^[a-z0-9]{2,18}(?:-[a-z0-9]{1,18}){0,4}$/;

/** Validates a creator-owned collection URL slug (kebab-case, 3-40 chars, non-reserved). */
export function isCollectionSlug(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (s.length < 3 || s.length > 40) return false;
  if (RESERVED_COLLECTION_SLUGS.has(s)) return false;
  return COLLECTION_SLUG_RE.test(s);
}

/** Deterministically turns a human collection title into a valid kebab-case slug. */
export function slugifyCollectionTitle(title: string): string {
  const ascii = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 38)
    .replace(/-+$/g, "");
  if (isCollectionSlug(ascii)) return ascii;
  const fallback = `pack-${ascii.replace(/[^a-z0-9]/g, "").slice(0, 20) || "picks"}`;
  return isCollectionSlug(fallback) ? fallback : "pack-picks";
}
