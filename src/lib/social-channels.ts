/**
 * Pass 06 shared social promotion channels, platform labels, and client-safe
 * share intent builders (single source of truth across server & UI).
 */

export const SOCIAL_CHANNELS = [
  "DIRECT",
  "INSTAGRAM_STORY",
  "INSTAGRAM_BIO",
  "TIKTOK",
  "YOUTUBE",
  "WHATSAPP",
  "SNAPCHAT",
  "X",
  "DISCORD",
  "THREADS",
  "LINKEDIN",
  "WEB_EMBED",
] as const;

export type SocialChannel = (typeof SOCIAL_CHANNELS)[number];

export const PROMOTABLE_CHANNELS: readonly SocialChannel[] = [
  "INSTAGRAM_STORY",
  "INSTAGRAM_BIO",
  "TIKTOK",
  "YOUTUBE",
  "WHATSAPP",
  "SNAPCHAT",
  "X",
  "DISCORD",
  "THREADS",
  "LINKEDIN",
] as const;

export const SOCIAL_CHANNEL_META: Record<
  SocialChannel,
  {
    labelEn: string;
    labelFr: string;
    short: string;
    recommendedFormat: "story" | "square" | "banner";
  }
> = {
  DIRECT: {
    labelEn: "Direct link",
    labelFr: "Lien direct",
    short: "Direct",
    recommendedFormat: "banner",
  },
  INSTAGRAM_STORY: {
    labelEn: "Instagram Story / Reels",
    labelFr: "Story / Reels Instagram",
    short: "IG Story",
    recommendedFormat: "story",
  },
  INSTAGRAM_BIO: {
    labelEn: "Instagram Bio",
    labelFr: "Bio Instagram",
    short: "IG Bio",
    recommendedFormat: "square",
  },
  TIKTOK: {
    labelEn: "TikTok",
    labelFr: "TikTok",
    short: "TikTok",
    recommendedFormat: "story",
  },
  YOUTUBE: {
    labelEn: "YouTube / Shorts",
    labelFr: "YouTube / Shorts",
    short: "YouTube",
    recommendedFormat: "banner",
  },
  WHATSAPP: {
    labelEn: "WhatsApp",
    labelFr: "WhatsApp",
    short: "WhatsApp",
    recommendedFormat: "square",
  },
  SNAPCHAT: {
    labelEn: "Snapchat",
    labelFr: "Snapchat",
    short: "Snapchat",
    recommendedFormat: "story",
  },
  X: {
    labelEn: "X (Twitter)",
    labelFr: "X (Twitter)",
    short: "X",
    recommendedFormat: "banner",
  },
  DISCORD: {
    labelEn: "Discord",
    labelFr: "Discord",
    short: "Discord",
    recommendedFormat: "banner",
  },
  THREADS: {
    labelEn: "Threads",
    labelFr: "Threads",
    short: "Threads",
    recommendedFormat: "square",
  },
  LINKEDIN: {
    labelEn: "LinkedIn",
    labelFr: "LinkedIn",
    short: "LinkedIn",
    recommendedFormat: "banner",
  },
  WEB_EMBED: {
    labelEn: "Web Widget",
    labelFr: "Widget Web",
    short: "Embed",
    recommendedFormat: "banner",
  },
};

export function isSocialChannel(value: unknown): value is SocialChannel {
  return typeof value === "string" && (SOCIAL_CHANNELS as readonly string[]).includes(value);
}

/** Normalizes a URL query channel hint (e.g. ?channel=tiktok) to a canonical SocialChannel. */
export function normalizeSocialChannel(raw: string | null | undefined): SocialChannel {
  if (!raw) return "DIRECT";
  const upper = raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (isSocialChannel(upper)) return upper;
  if (upper === "IG" || upper === "INSTAGRAM" || upper === "REELS" || upper === "STORY")
    return "INSTAGRAM_STORY";
  if (upper === "TWITTER") return "X";
  if (upper === "YT" || upper === "SHORTS") return "YOUTUBE";
  if (upper === "SNAP") return "SNAPCHAT";
  return "DIRECT";
}

export function channelLabel(channel: string, locale: "en" | "fr"): string {
  if (isSocialChannel(channel)) {
    return locale === "fr"
      ? SOCIAL_CHANNEL_META[channel].labelFr
      : SOCIAL_CHANNEL_META[channel].labelEn;
  }
  return channel;
}

export interface SocialTemplateInput {
  kind: "CAMPAIGN" | "PROFILE" | "REFERRAL";
  locale: "en" | "fr";
  channel: SocialChannel;
  url: string;
  creatorHandle?: string | null;
  campaignName?: string;
  campaignDescription?: string;
  headline?: string;
  talkingPoints?: string[];
  hashtags?: string[];
  cta?: string;
  disclosureNote?: string;
  suggestedHooks?: string[];
  promoCode?: string | null;
  discountLabel?: string | null;
}

/**
 * Deterministic ready-to-post copy generator tailored per social platform.
 * Always preserves transparent partner disclosures and never promises income.
 */
export function buildSocialPostTemplate(input: SocialTemplateInput): {
  hook: string;
  caption: string;
  disclosure: string;
  hashtags: string;
} {
  const fr = input.locale === "fr";
  const defaultDisclosure = fr ? "#collaboration #lienpartenaire" : "#ad #partnerlink";
  const disclosure =
    input.kind === "CAMPAIGN"
      ? input.disclosureNote?.trim() || defaultDisclosure
      : fr
        ? "#ruvora #createurs"
        : "#ruvora #creators";

  const cleanTags = (input.hashtags ?? [])
    .map((h) => (h.startsWith("#") ? h : `#${h.replace(/\s+/g, "")}`))
    .slice(0, 6);
  const hashtagLine = [...new Set([...cleanTags, ...disclosure.split(/\s+/).filter(Boolean)])]
    .slice(0, 8)
    .join(" ");

  const promoSuffix = input.promoCode
    ? fr
      ? `Code perso : ${input.promoCode}${input.discountLabel ? ` (${input.discountLabel})` : ""}`
      : `Personal code: ${input.promoCode}${input.discountLabel ? ` (${input.discountLabel})` : ""}`
    : "";

  if (input.kind === "REFERRAL") {
    const hook = fr
      ? "Tu postes déjà sur tes réseaux ? Transforme ta présence en vraie économie dès 10 abonnés."
      : "Already posting on social? Turn your presence into a real creator economy from 10 followers.";
    const note = fr
      ? "Inscription gratuite, lien bio tout-en-un et campagnes vérifiées (aucun revenu garanti — uniquement sur activité réelle validée)."
      : "Free signup, all-in-one bio link, and reviewed brand campaigns (no guaranteed income — based on real validated activity only).";
    const body =
      input.channel === "WHATSAPP" || input.channel === "DISCORD"
        ? `${hook}\n${note}\n👉 ${input.url}`
        : `${hook}\n\n${note}\n\n🔗 ${input.url}\n${hashtagLine}`;
    return { hook, caption: body.trim(), disclosure, hashtags: hashtagLine };
  }

  if (input.kind === "PROFILE") {
    const handleTag = input.creatorHandle ? `@${input.creatorHandle}` : "Ruvora";
    const hook = fr
      ? `Tous mes liens, bons plans et codes promo réunis au même endroit (${handleTag}) ✨`
      : `All my links, curated picks, and personal codes in one place (${handleTag}) ✨`;
    const cta = fr ? "Découvre ma page Ruvora :" : "Explore my Ruvora Link:";
    const body =
      input.channel === "INSTAGRAM_BIO"
        ? `${hook}\n👇 ${input.url}`
        : `${hook}\n\n${cta} ${input.url}\n${hashtagLine}`;
    return { hook, caption: body.trim(), disclosure, hashtags: hashtagLine };
  }

  // CAMPAIGN template
  const name = input.campaignName || (fr ? "cette offre" : "this offer");
  const firstHook =
    input.suggestedHooks?.find((h) => h.trim().length > 0) ||
    input.headline?.trim() ||
    (fr ? `Mon bon plan du moment : ${name}` : `My current pick: ${name}`);
  const points = (input.talkingPoints ?? []).slice(0, 3);
  const ctaLine = input.cta?.trim() || (fr ? "Lien direct ici :" : "Direct link here:");

  if (
    input.channel === "TIKTOK" ||
    input.channel === "INSTAGRAM_STORY" ||
    input.channel === "SNAPCHAT"
  ) {
    const scriptLines = [
      fr ? `[HOOK 3s] ${firstHook}` : `[3s HOOK] ${firstHook}`,
      points.length
        ? fr
          ? `[POINTS CLÉS] ${points.join(" · ")}`
          : `[KEY POINTS] ${points.join(" · ")}`
        : input.campaignDescription?.slice(0, 140) || "",
      promoSuffix ? `🎁 ${promoSuffix}` : "",
      `🔗 ${ctaLine} ${input.url}`,
      hashtagLine,
    ].filter(Boolean);
    return { hook: firstHook, caption: scriptLines.join("\n"), disclosure, hashtags: hashtagLine };
  }

  if (input.channel === "WHATSAPP" || input.channel === "DISCORD") {
    const lines = [
      `${firstHook}`,
      input.campaignDescription ? input.campaignDescription.slice(0, 160) : "",
      promoSuffix,
      `👉 ${input.url}`,
      `(${disclosure})`,
    ].filter(Boolean);
    return { hook: firstHook, caption: lines.join("\n"), disclosure, hashtags: hashtagLine };
  }

  if (input.channel === "X" || input.channel === "THREADS") {
    const shortParts = [firstHook, promoSuffix, input.url, disclosure].filter(Boolean);
    return {
      hook: firstHook,
      caption: shortParts.join(" · ").slice(0, 275),
      disclosure,
      hashtags: hashtagLine,
    };
  }

  // Default (INSTAGRAM_BIO, YOUTUBE, LINKEDIN, DIRECT)
  const lines = [
    firstHook,
    points.length
      ? points.map((p) => `• ${p}`).join("\n")
      : input.campaignDescription?.slice(0, 200) || "",
    promoSuffix,
    `${ctaLine} ${input.url}`,
    hashtagLine,
  ].filter(Boolean);
  return { hook: firstHook, caption: lines.join("\n\n"), disclosure, hashtags: hashtagLine };
}

export function buildExternalShareIntents(url: string, text: string) {
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);
  const combined = encodeURIComponent(`${text}\n${url}`);
  return {
    whatsapp: `https://wa.me/?text=${combined}`,
    x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    email: `mailto:?subject=${encodeURIComponent("Ruvora")}&body=${combined}`,
  };
}
