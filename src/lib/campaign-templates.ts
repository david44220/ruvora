export interface CampaignTemplatePreset {
  id: string;
  label: { en: string; fr: string };
  summary: { en: string; fr: string };
  name: { en: string; fr: string };
  description: { en: string; fr: string };
  objective: "CLICK" | "QUALIFIED_VIEW" | "CONVERSION" | "SPONSORED_MISSION";
  deliveryMode: "OPEN" | "UGC_BRIEF";
  destinationUrl: string;
  budgetMinor: string;
  dailyBudgetMinor: string;
  unitCostMinor: string;
  allowedCountries: string;
  allowedCities: string;
  allowedLanguages: string;
  creatorCategories: string;
  minimumCreatorFollowers: string;
  maximumCreatorFollowers: string;
  platforms: string[];
  briefHeadline: { en: string; fr: string };
  briefFormat: { en: string; fr: string };
  briefTalkingPoints: { en: string; fr: string };
  briefHashtags: string;
  briefCta: { en: string; fr: string };
  briefDisclosure: { en: string; fr: string };
  briefHooks: { en: string; fr: string };
  smartIosUrl?: string;
  smartAndroidUrl?: string;
}

export const CAMPAIGN_TEMPLATES: CampaignTemplatePreset[] = [
  {
    id: "mobile-app-launch",
    label: { en: "Mobile App Launch", fr: "Lancement App Mobile" },
    summary: {
      en: "iOS + Android Smart Routing with TikTok & Instagram Story demos.",
      fr: "Smart Routing iOS + Android avec démos TikTok et Story Instagram.",
    },
    name: { en: "Mobile App Discovery Sprint", fr: "Sprint Découverte App Mobile" },
    description: {
      en: "Drive verified mobile installs via authentic 15-second screen demos across iOS and Android.",
      fr: "Générez des installations vérifiées grâce à des démos authentiques de 15s sur iOS et Android.",
    },
    objective: "CONVERSION",
    deliveryMode: "UGC_BRIEF",
    destinationUrl: "https://example.com/app",
    budgetMinor: "50000",
    dailyBudgetMinor: "10000",
    unitCostMinor: "250",
    allowedCountries: "FR, BE, CH, CA",
    allowedCities: "",
    allowedLanguages: "fr, en",
    creatorCategories: "Tech, Lifestyle, Gaming",
    minimumCreatorFollowers: "10",
    maximumCreatorFollowers: "50000",
    platforms: ["TikTok", "Instagram", "YouTube"],
    briefHeadline: {
      en: "Show the app solving a real daily problem in 15 seconds",
      fr: "Montrez l'application résoudre un vrai besoin en 15 secondes",
    },
    briefFormat: {
      en: "Vertical 9:16 Reel / TikTok (15–30s)",
      fr: "Vidéo verticale 9:16 Reel / TikTok (15–30s)",
    },
    briefTalkingPoints: {
      en: "Open directly on the app screen\nShow 1 concrete feature live\nAdd your personal tracked link in story or bio",
      fr: "Ouvrez directement sur l'écran de l'app\nMontrez 1 fonctionnalité concrète en direct\nAjoutez votre lien tracké en story ou bio",
    },
    briefHashtags: "#app, #tech, #decouverte",
    briefCta: { en: "Try it free with my link", fr: "Testez gratuitement via mon lien" },
    briefDisclosure: {
      en: "#ad #partnerlink — Transparent Ruvora creator partnership.",
      fr: "#collaboration #lienpartenaire — Partenariat créateur transparent via Ruvora.",
    },
    briefHooks: {
      en: "The 10-second mobile shortcut I use every day\nStop doing this manually on your phone",
      fr: "L'astuce mobile en 10 secondes que j'utilise tous les jours\nArrêtez de faire ça manuellement sur votre téléphone",
    },
    smartIosUrl: "https://apps.apple.com/app/example",
    smartAndroidUrl: "https://play.google.com/store/apps/details?id=com.example.app",
  },
  {
    id: "ecommerce-promo",
    label: { en: "E-commerce + Promo Code", fr: "E-commerce + Code Promo" },
    summary: {
      en: "Trackable personal creator promo codes & verified checkout conversions.",
      fr: "Codes promo créateurs personnels et conversions e-commerce vérifiées.",
    },
    name: {
      en: "Collection Launch & Personal Promo Codes",
      fr: "Lancement Collection & Codes Promo",
    },
    description: {
      en: "Equip everyday micro-creators with personal promo codes and ready-to-share product cards.",
      fr: "Équipez les micro-créateurs de codes promo personnels et de cartes visuelles prêtes à partager.",
    },
    objective: "CONVERSION",
    deliveryMode: "OPEN",
    destinationUrl: "https://example.com/shop",
    budgetMinor: "75000",
    dailyBudgetMinor: "15000",
    unitCostMinor: "300",
    allowedCountries: "FR, BE, CH",
    allowedCities: "",
    allowedLanguages: "fr, en",
    creatorCategories: "Lifestyle, Fashion, Beauty, Design",
    minimumCreatorFollowers: "10",
    maximumCreatorFollowers: "25000",
    platforms: ["Instagram", "TikTok", "YouTube"],
    briefHeadline: {
      en: "Share your honest favorite pick + personal promo code",
      fr: "Partagez votre coup de cœur sincère + votre code promo personnel",
    },
    briefFormat: {
      en: "Story 9:16 + Bio Showcase pick",
      fr: "Story 9:16 + épingle dans votre Vitrine",
    },
    briefTalkingPoints: {
      en: "Highlight real quality and everyday use\nMention your personal Ruvora promo code clearly\nPin the offer on your Ruvora Link showcase",
      fr: "Mettez en avant la qualité et l'usage quotidien\nMentionnez clairement votre code promo Ruvora\nÉpinglez l'offre dans votre Vitrine Ruvora",
    },
    briefHashtags: "#bonplan, #codepromo, #selection",
    briefCta: { en: "Unlock the community offer", fr: "Profiter de l'offre communauté" },
    briefDisclosure: {
      en: "#ad #partnerlink — Partner offer shared transparently.",
      fr: "#collaboration #lienpartenaire — Offre partenaire partagée en transparence.",
    },
    briefHooks: {
      en: "My honest review after 2 weeks of daily use\nHere is my personal community code if you wanted to try it",
      fr: "Mon avis honnête après 2 semaines d'utilisation\nVoici mon code communauté si vous vouliez tester",
    },
  },
  {
    id: "local-business",
    label: { en: "Local Business / Venue", fr: "Commerce Local / Lieu" },
    summary: {
      en: "Hyper-local city targeting for neighborhood nano-creators (10–10k followers).",
      fr: "Ciblage ville hyper-local pour nano-créateurs de proximité (10–10k abonnés).",
    },
    name: { en: "Local Neighborhood Discovery Campaign", fr: "Campagne Découverte Commerce Local" },
    description: {
      en: "Boost foot traffic and local awareness with genuine recommendations from neighborhood creators.",
      fr: "Développez votre notoriété locale grâce aux recommandations authentiques de créateurs de votre ville.",
    },
    objective: "QUALIFIED_VIEW",
    deliveryMode: "OPEN",
    destinationUrl: "https://example.com/local-offer",
    budgetMinor: "25000",
    dailyBudgetMinor: "5000",
    unitCostMinor: "100",
    allowedCountries: "FR",
    allowedCities: "Paris, Lyon, Bordeaux",
    allowedLanguages: "fr",
    creatorCategories: "Food, Lifestyle, Culture, Sport",
    minimumCreatorFollowers: "10",
    maximumCreatorFollowers: "10000",
    platforms: ["Instagram", "TikTok"],
    briefHeadline: {
      en: "Spotlight a local favorite spot in your city",
      fr: "Faites découvrir une adresse locale dans votre ville",
    },
    briefFormat: {
      en: "Local Story / Short clip + QR card",
      fr: "Story locale / Clip court + carte QR",
    },
    briefTalkingPoints: {
      en: "Mention the city and neighborhood\nShare what stood out during your visit\nInclude the tracked local offer link",
      fr: "Mentionnez la ville et le quartier\nPartagez ce qui vous a marqué sur place\nAjoutez le lien tracké vers l'offre locale",
    },
    briefHashtags: "#local, #bonplanville, #sortir",
    briefCta: { en: "Discover the local offer", fr: "Découvrir l'offre locale" },
    briefDisclosure: {
      en: "#ad #partnerlink — Local creator partnership.",
      fr: "#collaboration #lienpartenaire — Partenariat local transparent.",
    },
    briefHooks: {
      en: "Hidden local spot you need to bookmark this weekend\nMy neighborhood go-to address right now",
      fr: "L'adresse locale à noter absolument ce week-end\nMon spot favori du quartier en ce moment",
    },
  },
  {
    id: "saas-newsletter",
    label: { en: "SaaS / Newsletter Lead", fr: "SaaS / Newsletter Lead" },
    summary: {
      en: "Qualified clicks on LinkedIn, X, YouTube & Discord communities.",
      fr: "Clics qualifiés sur LinkedIn, X, YouTube et communautés Discord.",
    },
    name: { en: "Creator Tools & Newsletter Growth", fr: "Croissance Outil SaaS & Newsletter" },
    description: {
      en: "Acquire qualified readers and trial signups through niche educators and community builders.",
      fr: "Attirez des lecteurs et utilisateurs qualifiés via des créateurs thématiques et communautés.",
    },
    objective: "CLICK",
    deliveryMode: "OPEN",
    destinationUrl: "https://example.com/newsletter",
    budgetMinor: "40000",
    dailyBudgetMinor: "8000",
    unitCostMinor: "120",
    allowedCountries: "FR, US, GB, CA, BE, CH",
    allowedCities: "",
    allowedLanguages: "fr, en",
    creatorCategories: "Tech, Business, Design, Education",
    minimumCreatorFollowers: "10",
    maximumCreatorFollowers: "100000",
    platforms: ["YouTube", "X", "Discord"],
    briefHeadline: {
      en: "Recommend a practical resource to your community",
      fr: "Recommandez une ressource utile à votre communauté",
    },
    briefFormat: {
      en: "X / LinkedIn post or Discord pinned tip",
      fr: "Post X / LinkedIn ou ressource Discord",
    },
    briefTalkingPoints: {
      en: "Summarize one takeaway in 2 lines\nExplain who benefits most from the resource\nShare your tracked Ruvora link cleanly",
      fr: "Résumez un bénéfice concret en 2 lignes\nPrécisez à qui la ressource est la plus utile\nPartagez votre lien tracké Ruvora",
    },
    briefHashtags: "#productivite, #ressource, #communaute",
    briefCta: { en: "Read the free guide", fr: "Accéder au guide gratuit" },
    briefDisclosure: {
      en: "#ad #partnerlink — Sponsored recommendation via Ruvora.",
      fr: "#collaboration #lienpartenaire — Recommandation partenaire via Ruvora.",
    },
    briefHooks: {
      en: "One resource that saved me 3 hours this week\nWorth bookmarking if you build online",
      fr: "Une ressource qui m'a fait gagner 3 heures cette semaine\nÀ garder sous la main si vous créez en ligne",
    },
  },
  {
    id: "event-ticket-drop",
    label: { en: "Event / Ticket Drop", fr: "Événement / Billetterie" },
    summary: {
      en: "Sponsored mission sprint for live drops, pop-ups & community challenges.",
      fr: "Mission sponsorisée pour drops, pop-ups et défis communautaires.",
    },
    name: { en: "Community Event & Ticket Drop Sprint", fr: "Sprint Événement & Billetterie" },
    description: {
      en: "Mobilize creators ahead of a live event with countdown stories and shareable QR invitations.",
      fr: "Mobilisez vos créateurs avant un événement grâce aux stories compte à rebours et invitations QR.",
    },
    objective: "SPONSORED_MISSION",
    deliveryMode: "UGC_BRIEF",
    destinationUrl: "https://example.com/tickets",
    budgetMinor: "60000",
    dailyBudgetMinor: "12000",
    unitCostMinor: "200",
    allowedCountries: "FR, BE, CH",
    allowedCities: "",
    allowedLanguages: "fr, en",
    creatorCategories: "Music, Culture, Gaming, Sport",
    minimumCreatorFollowers: "10",
    maximumCreatorFollowers: "",
    platforms: ["Instagram", "TikTok", "Discord", "Twitch"],
    briefHeadline: {
      en: "Invite your community to the upcoming live drop",
      fr: "Invitez votre communauté au prochain rendez-vous live",
    },
    briefFormat: {
      en: "Countdown Story 9:16 + downloadable QR card",
      fr: "Story 9:16 + carte QR téléchargeable",
    },
    briefTalkingPoints: {
      en: "Announce the date and key highlight\nUse the Ruvora 9:16 Story card for quick scanning\nRemind followers seats or drops are time-limited",
      fr: "Annoncez la date et le moment fort\nUtilisez la carte Story 9:16 Ruvora pour un scan rapide\nRappelez que l'accès est limité dans le temps",
    },
    briefHashtags: "#evenement, #live, #communaute",
    briefCta: { en: "Reserve your spot", fr: "Réserver ma place" },
    briefDisclosure: {
      en: "#ad #partnerlink — Official event partner link.",
      fr: "#collaboration #lienpartenaire — Lien partenaire officiel de l'événement.",
    },
    briefHooks: {
      en: "Mark your calendar — here is why I am joining this event\nQuick heads-up before spots close",
      fr: "Notez la date — pourquoi je participe à cet événement\nPetit rappel avant la clôture des places",
    },
  },
];
