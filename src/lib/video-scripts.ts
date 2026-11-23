export type VideoScriptFormat = "TIKTOK_15S" | "REELS_30S" | "YOUTUBE_SHORTS_30S";

export interface CreativeBriefInput {
  headline?: string;
  talkingPoints?: string[];
  dos?: string[];
  donts?: string[];
  brandTone?: string;
  suggestedHooks?: string[];
  cta?: string;
  disclosureNote?: string;
}

export interface VideoScriptBeat {
  timecode: string;
  label: string;
  spoken: string;
  onScreen: string;
  shotCue: string;
}

export interface VideoScriptResult {
  format: VideoScriptFormat;
  durationSec: number;
  title: string;
  disclosureLine: string;
  beats: VideoScriptBeat[];
  fullText: string;
}

export interface CarouselSlide {
  slideNumber: 1 | 2 | 3;
  eyebrow: string;
  headline: string;
  body: string;
  bullets: string[];
  cta: string;
  disclosure: string;
  showQr: boolean;
  showPromo: boolean;
}

export interface ScriptInput {
  locale: "en" | "fr";
  campaignName: string;
  description?: string;
  objective?: string;
  creatorHandle?: string | null;
  promoCode?: string | null;
  discountLabel?: string | null;
  shareUrl?: string | null;
  brief?: CreativeBriefInput | null;
}

function cleanLine(value: string | undefined | null, max = 140): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Deterministically builds a structured EN/FR short-form video script from campaign & Creative Pack data. */
export function buildVideoScript(format: VideoScriptFormat, input: ScriptInput): VideoScriptResult {
  const isFr = input.locale === "fr";
  const brief = input.brief ?? {};
  const name = cleanLine(input.campaignName, 70);
  const hook =
    cleanLine(brief.suggestedHooks?.[0], 120) ||
    cleanLine(brief.headline, 120) ||
    (isFr
      ? `3 secondes pour découvrir pourquoi je teste ${name} cette semaine`
      : `3 seconds to see why I am testing ${name} this week`);

  const points = [...(brief.talkingPoints ?? []), ...(brief.dos ?? [])]
    .map((p) => cleanLine(p, 110))
    .filter(Boolean);

  const primaryValue =
    points[0] ||
    cleanLine(input.description, 120) ||
    (isFr
      ? `Une offre transparente et vérifiée que j'ai sélectionnée pour ma communauté.`
      : `A transparent, verified offer I picked specifically for my community.`);

  const secondaryProof =
    points[1] ||
    (brief.brandTone
      ? isFr
        ? `Ton recommandé : ${cleanLine(brief.brandTone, 60)}. Montrez un usage concret à l'écran.`
        : `Recommended tone: ${cleanLine(brief.brandTone, 60)}. Show a concrete real-life walkthrough.`
      : isFr
        ? `Je vous montre l'accès direct en quelques secondes depuis mon lien Ruvora.`
        : `Watch how fast it is to access directly from my Ruvora link.`);

  const ctaBase =
    cleanLine(brief.cta, 90) ||
    (isFr
      ? `Clique le lien en bio pour découvrir ${name}`
      : `Tap the link in bio to explore ${name}`);

  const promoSuffix = input.promoCode
    ? isFr
      ? ` et utilise mon code ${input.promoCode}${input.discountLabel ? ` (${cleanLine(input.discountLabel, 24)})` : ""}.`
      : ` and use my code ${input.promoCode}${input.discountLabel ? ` (${cleanLine(input.discountLabel, 24)})` : ""}.`
    : ".";

  const disclosureLine =
    cleanLine(brief.disclosureNote, 120) ||
    (isFr
      ? "#collaboration #partenariat — Lien partenaire vérifié Ruvora."
      : "#ad #partner — Verified Ruvora partner link.");

  const handleTag = input.creatorHandle ? `@${input.creatorHandle}` : "Ruvora";
  const linkHint = input.shareUrl || (isFr ? "Lien en bio" : "Link in bio");

  let durationSec = 30;
  let beats: VideoScriptBeat[];

  if (format === "TIKTOK_15S") {
    durationSec = 15;
    beats = [
      {
        timecode: "00–03s",
        label: isFr ? "Accroche (Hook)" : "Hook",
        spoken: hook,
        onScreen: name,
        shotCue: isFr
          ? "Plan face caméra dynamique, lumière naturelle, rythme rapide."
          : "Energetic front-camera close-up, natural light, fast opener.",
      },
      {
        timecode: "03–10s",
        label: isFr ? "Démo & Valeur" : "Value & Demo",
        spoken: primaryValue,
        onScreen: points[0] || (isFr ? "Ce qui change concrètement" : "Why it stands out"),
        shotCue: isFr
          ? "Plan B-roll produit ou capture d'écran fluide en 2 coupes."
          : "Product B-roll or quick screen walkthrough in 2 tight cuts.",
      },
      {
        timecode: "10–15s",
        label: isFr ? "Appel à l'action (CTA)" : "Call to Action",
        spoken: `${ctaBase}${promoSuffix}`,
        onScreen: input.promoCode ? `${input.promoCode} · ${linkHint}` : linkHint,
        shotCue: isFr
          ? "Pointer vers le lien en bio / sticker et afficher la mention partenaire."
          : "Point toward link in bio / sticker with clear partner disclosure.",
      },
    ];
  } else if (format === "REELS_30S") {
    durationSec = 30;
    beats = [
      {
        timecode: "00–03s",
        label: isFr ? "Accroche visuelle" : "Visual Hook",
        spoken: hook,
        onScreen: `${name} · ${handleTag}`,
        shotCue: isFr
          ? "Ouverture directe sans intro longue, texte centré lisible."
          : "Jump straight in without filler intro, bold centered caption.",
      },
      {
        timecode: "03–12s",
        label: isFr ? "Problème & Découverte" : "Context & Discovery",
        spoken: primaryValue,
        onScreen: points[0] || name,
        shotCue: isFr
          ? "Enchaîner plan face caméra + plan détail sur l'offre."
          : "Cut between talking head and close-up detail shot.",
      },
      {
        timecode: "12–23s",
        label: isFr ? "Preuve concrète" : "Hands-on Proof",
        spoken: secondaryProof,
        onScreen: points[1] || (isFr ? "Lien vérifié Ruvora" : "Verified Ruvora link"),
        shotCue: isFr
          ? "Montrer l'ouverture rapide de la page partenaire sur mobile."
          : "Show the partner landing page opening smoothly on mobile.",
      },
      {
        timecode: "23–30s",
        label: isFr ? "CTA + Code Promo" : "CTA + Promo Code",
        spoken: `${ctaBase}${promoSuffix}`,
        onScreen: input.promoCode ? `${isFr ? "CODE" : "CODE"}: ${input.promoCode}` : linkHint,
        shotCue: isFr
          ? "Laisser 2 secondes le code/CTA lisible avec la mention partenaire."
          : "Hold the code/CTA overlay for 2 seconds with disclosure visible.",
      },
    ];
  } else {
    durationSec = 30;
    beats = [
      {
        timecode: "00–04s",
        label: isFr ? "Promesse claire" : "Clear Promise",
        spoken: hook,
        onScreen: name,
        shotCue: isFr
          ? "Cadrage stable vertical 9:16, micro clair, titre en haut."
          : "Steady 9:16 vertical frame, crisp audio, top headline.",
      },
      {
        timecode: "04–14s",
        label: isFr ? "Bénéfice clé" : "Core Benefit",
        spoken: primaryValue,
        onScreen: points[0] || name,
        shotCue: isFr
          ? "Démonstration étape par étape avec sous-titres synchronisés."
          : "Step-by-step walkthrough with synced captions.",
      },
      {
        timecode: "14–24s",
        label: isFr ? "Conseil créateur" : "Creator Tip",
        spoken: secondaryProof,
        onScreen: points[1] || handleTag,
        shotCue: isFr
          ? "Partager un détail utile pour votre audience."
          : "Highlight one practical takeaway for viewers.",
      },
      {
        timecode: "24–30s",
        label: isFr ? "Lien épinglé & Mention" : "Pinned Link & Disclosure",
        spoken: `${ctaBase}${promoSuffix}`,
        onScreen: input.promoCode ? `${input.promoCode} · ${linkHint}` : linkHint,
        shotCue: isFr
          ? "Renvoyer vers le lien épinglé en description/commentaire."
          : "Direct viewers to the pinned link in description/comments.",
      },
    ];
  }

  const title = isFr
    ? `Script ${format === "TIKTOK_15S" ? "TikTok 15s" : format === "REELS_30S" ? "Instagram Reels 30s" : "YouTube Shorts 30s"} — ${name}`
    : `${format === "TIKTOK_15S" ? "TikTok 15s" : format === "REELS_30S" ? "Instagram Reels 30s" : "YouTube Shorts 30s"} Script — ${name}`;

  const fullText = [
    title,
    "",
    ...beats.map(
      (b) =>
        `[${b.timecode}] ${b.label}\n${isFr ? "Voix" : "Voice"}: ${b.spoken}\n${isFr ? "Texte écran" : "On-screen"}: ${b.onScreen}\n${isFr ? "Plan" : "Shot"}: ${b.shotCue}`,
    ),
    "",
    `${isFr ? "Mention obligatoire" : "Required disclosure"}: ${disclosureLine}`,
    ...(input.shareUrl ? [`${isFr ? "Lien suivi" : "Tracked link"}: ${input.shareUrl}`] : []),
  ].join("\n");

  return { format, durationSec, title, disclosureLine, beats, fullText };
}

/** Deterministically builds a 3-slide visual carousel deck (4:5 / 9:16) shared by UI & ImageResponse PNGs. */
export function buildCarouselSlides(
  input: ScriptInput,
): [CarouselSlide, CarouselSlide, CarouselSlide] {
  const isFr = input.locale === "fr";
  const brief = input.brief ?? {};
  const name = cleanLine(input.campaignName, 64);
  const disclosure =
    cleanLine(brief.disclosureNote, 110) ||
    (isFr
      ? "#collaboration · Partenariat transparent Ruvora"
      : "#ad · Transparent Ruvora partnership");

  const hook =
    cleanLine(brief.suggestedHooks?.[0], 100) ||
    cleanLine(brief.headline, 100) ||
    (isFr ? `Mon bon plan vérifié : ${name}` : `My verified pick: ${name}`);

  const bullets = [...(brief.talkingPoints ?? []), ...(brief.dos ?? [])]
    .map((p) => cleanLine(p, 88))
    .filter(Boolean)
    .slice(0, 3);

  const fallbackBullets = isFr
    ? [
        cleanLine(input.description, 88) || `Offre vérifiée et transparente sur Ruvora`,
        `Accès direct via lien partenaire sécurisé`,
        input.promoCode
          ? `Code personnel inclus : ${input.promoCode}`
          : `Conditions claires et sans promesse de gains`,
      ]
    : [
        cleanLine(input.description, 88) || `Verified, transparent offer on Ruvora`,
        `Direct access through a trusted partner link`,
        input.promoCode
          ? `Personal promo code included: ${input.promoCode}`
          : `Clear terms with zero income guarantees`,
      ];

  const cta =
    cleanLine(brief.cta, 84) ||
    (isFr ? "Scanne le QR ou ouvre le lien en bio" : "Scan the QR or tap the link in bio");

  return [
    {
      slideNumber: 1,
      eyebrow: isFr ? "SLIDE 1/3 · PARTENARIAT" : "SLIDE 1/3 · PARTNER PICK",
      headline: name,
      body: hook,
      bullets: [],
      cta: isFr ? "Glisse pour découvrir →" : "Swipe to explore →",
      disclosure,
      showQr: false,
      showPromo: false,
    },
    {
      slideNumber: 2,
      eyebrow: isFr ? "SLIDE 2/3 · POINTS CLÉS" : "SLIDE 2/3 · HIGHLIGHTS",
      headline: isFr ? "Pourquoi je partage cette offre" : "Why I am sharing this offer",
      body: brief.brandTone
        ? `${isFr ? "Style" : "Tone"}: ${cleanLine(brief.brandTone, 52)}`
        : name,
      bullets: bullets.length ? bullets : fallbackBullets,
      cta: isFr ? "Code & accès en slide 3 →" : "Code & access on slide 3 →",
      disclosure,
      showQr: false,
      showPromo: false,
    },
    {
      slideNumber: 3,
      eyebrow: isFr ? "SLIDE 3/3 · ACCÈS DIRECT" : "SLIDE 3/3 · DIRECT ACCESS",
      headline: cta,
      body: isFr
        ? `Offre ${name} partagée par ${input.creatorHandle ? `@${input.creatorHandle}` : "Ruvora"}`
        : `${name} shared by ${input.creatorHandle ? `@${input.creatorHandle}` : "Ruvora"}`,
      bullets: [],
      cta,
      disclosure,
      showQr: true,
      showPromo: Boolean(input.promoCode),
    },
  ];
}
