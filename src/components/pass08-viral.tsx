"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Check,
  Copy,
  Download,
  ExternalLink,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useLocale } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/messages";
import { ruNumber } from "@/lib/api";
import type { MobileBridgeCardData, PublicCampaignOffer } from "@/server/offers";
import { Eyebrow, Footer, LanguageSwitch, Orb, PublicNav } from "./ui";

export function PublicOfferSheet({ offer }: { offer: PublicCampaignOffer }) {
  const { locale, t } = useLocale();
  const [copied, setCopied] = useState(false);

  const brief = offer.creativeBrief;
  const endDate = new Date(offer.endAt).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  function buildBriefMarkdown(): string {
    const lines = [
      `# ${offer.name}`,
      `${t("p8OfferByAdvertiser")}: ${offer.advertiserName}`,
      `Objective: ${offer.objective} · Mode: ${offer.deliveryMode}`,
      "",
    ];
    if (brief?.headline) lines.push(`## ${brief.headline}`, "");
    if (offer.description) lines.push(offer.description, "");
    if (brief?.brandTone) lines.push(`**${t("p8OfferBrandTone")}:** ${brief.brandTone}`);
    if (brief?.talkingPoints?.length) {
      lines.push("", "### Key Points", ...brief.talkingPoints.map((p) => `- ${p}`));
    }
    if (brief?.suggestedHooks?.length) {
      lines.push("", "### Suggested Hooks", ...brief.suggestedHooks.map((h) => `- "${h}"`));
    }
    if (brief?.dos?.length) {
      lines.push("", `### ${t("p8OfferDosTitle")}`, ...brief.dos.map((d) => `- ${d}`));
    }
    if (brief?.donts?.length) {
      lines.push("", `### ${t("p8OfferDontsTitle")}`, ...brief.donts.map((d) => `- ${d}`));
    }
    if (brief?.disclosureNote) {
      lines.push("", `**${t("p8OfferDisclosureRequired")}:** ${brief.disclosureNote}`);
    }
    if (brief?.hashtags?.length) {
      lines.push(`**Hashtags:** ${brief.hashtags.join(" ")}`);
    }
    return lines.join("\n");
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(buildBriefMarkdown());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard may be unavailable in restricted contexts.
    }
  }

  return (
    <>
      <PublicNav />
      <main className="public-page offer-sheet-page" id="main">
        <div className="wrap">
          <div style={{ marginBottom: 16 }}>
            <Link href="/explore" className="button button-secondary button-small">
              <ArrowLeft size={14} aria-hidden="true" />
              {t("p8OfferBackExplore")}
            </Link>
          </div>

          <section className="panel offer-hero-card">
            <div className="offer-hero-top">
              <div className="profile-badge-row" style={{ justifyContent: "flex-start" }}>
                <span className="tag tag-verified">{t("p8OfferEyebrow")}</span>
                <span className="tag">{t(`objective${offer.objective}` as MessageKey)}</span>
                {offer.hasSmartRouting ? (
                  <span className="tag tag-verified">{t("p7ExploreSmartRoutingBadge")}</span>
                ) : null}
                {offer.isDemo ? <span className="tag">{t("development")}</span> : null}
              </div>
              <h1>{offer.name}</h1>
              <p className="panel-description">
                {t("p8OfferByAdvertiser")}: <strong>{offer.advertiserName}</strong> ·{" "}
                {t("p8OfferEndsOn")} {endDate}
              </p>
              {offer.description ? <p className="offer-desc">{offer.description}</p> : null}

              <div className="form-actions" style={{ marginTop: 18 }}>
                <Link
                  href={`/app/promote?campaign=${encodeURIComponent(offer.id)}`}
                  className="button"
                >
                  <Megaphone size={16} aria-hidden="true" />
                  {t("p8OfferPromoteNow")}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
                <Link href="/register" className="button button-secondary">
                  {t("p8OfferJoinAndPromote")}
                </Link>
                <a
                  href={`/api/campaigns/${encodeURIComponent(offer.id)}/brief-pdf?lang=${locale}`}
                  className="button button-secondary"
                  download
                >
                  <Download size={15} aria-hidden="true" />
                  {t("p8OfferDownloadBriefPdf")}
                </a>
              </div>
            </div>

            <div className="offer-kpi-strip">
              <div className="offer-kpi-item">
                <span className="field-hint">{t("p8OfferBudgetRemaining")}</span>
                <strong className="number">{offer.budgetRemainingPct}%</strong>
              </div>
              <div className="offer-kpi-item">
                <span className="field-hint">{t("p8OfferActivePromoters")}</span>
                <strong className="number">
                  <Users size={15} aria-hidden="true" /> {offer.activePromotersCount}
                </strong>
              </div>
              <div className="offer-kpi-item">
                <span className="field-hint">{t("p8OfferRewardPolicyTitle")}</span>
                <strong className="number">
                  +{ruNumber(offer.policy.creatorRuMicros, locale)} {t("ruUnit")} · +
                  {offer.policy.xp} {t("xpUnit")}
                </strong>
              </div>
            </div>
            <p className="field-hint" style={{ marginTop: 12 }}>
              {t("p8OfferRewardPolicyNote")} ({offer.policy.ruleVersion})
            </p>
          </section>

          <div className="offer-grid">
            <section className="panel">
              <h2>{t("p8OfferEligibilityTitle")}</h2>
              <div className="profile-badge-row" style={{ justifyContent: "flex-start" }}>
                <span className="tag number">
                  {t("followers")}: &ge; {offer.minimumCreatorFollowers.toLocaleString(locale)}
                  {offer.maximumCreatorFollowers
                    ? ` – ${offer.maximumCreatorFollowers.toLocaleString(locale)}`
                    : ""}
                </span>
                {offer.requireVerifiedAudience ? (
                  <span className="tag tag-verified">
                    <ShieldCheck size={13} aria-hidden="true" /> {t("p4AudienceVerifiedBadge")}
                  </span>
                ) : null}
                {offer.allowedCountries.length > 0 ? (
                  <span className="tag">{offer.allowedCountries.join(", ")}</span>
                ) : null}
                {offer.allowedPlatforms.length > 0 ? (
                  <span className="tag">{offer.allowedPlatforms.join(" · ")}</span>
                ) : null}
                {offer.creatorCategories.length > 0 ? (
                  <span className="tag">{offer.creatorCategories.join(" · ")}</span>
                ) : null}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <Eyebrow>{t("p8OfferCreativePackTitle")}</Eyebrow>
                  <h2>
                    <Sparkles
                      size={16}
                      aria-hidden="true"
                      style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }}
                    />
                    {t("p8OfferCreativePackTitle")}
                  </h2>
                </div>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={() => void copyMarkdown()}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? t("p8OfferBriefCopied") : t("p8OfferCopyBriefMd")}
                </button>
              </div>

              {brief ? (
                <div className="creative-pack-body">
                  {brief.headline ? <p className="brief-headline">{brief.headline}</p> : null}

                  {(brief.brandTone || brief.colorPalette.length > 0) && (
                    <div className="brief-meta-row">
                      {brief.brandTone ? (
                        <div>
                          <span className="field-hint">{t("p8OfferBrandTone")}: </span>
                          <strong>{brief.brandTone}</strong>
                        </div>
                      ) : null}
                      {brief.colorPalette.length > 0 ? (
                        <div className="palette-row">
                          <span className="field-hint">{t("p8OfferColorPalette")}:</span>
                          {brief.colorPalette.map((hex) => (
                            <span key={hex} className="palette-chip">
                              <span
                                className="palette-swatch"
                                style={{ backgroundColor: hex }}
                                aria-hidden="true"
                              />
                              <code>{hex}</code>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}

                  {brief.talkingPoints.length > 0 ? (
                    <ul className="brief-list">
                      {brief.talkingPoints.map((pt, i) => (
                        <li key={i}>{pt}</li>
                      ))}
                    </ul>
                  ) : null}

                  {(brief.dos.length > 0 || brief.donts.length > 0) && (
                    <div className="dos-donts-grid">
                      {brief.dos.length > 0 ? (
                        <div className="dos-box">
                          <h3>{t("p8OfferDosTitle")}</h3>
                          <ul>
                            {brief.dos.map((d, i) => (
                              <li key={i}>{d}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {brief.donts.length > 0 ? (
                        <div className="donts-box">
                          <h3>{t("p8OfferDontsTitle")}</h3>
                          <ul>
                            {brief.donts.map((d, i) => (
                              <li key={i}>{d}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {brief.disclosureNote ? (
                    <p className="disclosure-callout">
                      <strong>{t("p8OfferDisclosureRequired")}:</strong> {brief.disclosureNote}
                    </p>
                  ) : null}

                  {brief.assetUrls.length > 0 ? (
                    <div className="asset-links-box">
                      <h3>{t("p8OfferApprovedAssets")}</h3>
                      <div className="form-actions">
                        {brief.assetUrls.map((url, idx) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="button button-secondary button-small"
                          >
                            <ExternalLink size={13} aria-hidden="true" /> Asset #{idx + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="panel-description">{offer.description || offer.name}</p>
              )}
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

export function MobileOfferBridge({ card }: { card: MobileBridgeCardData }) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    if (!card.promoCode) return;
    try {
      await navigator.clipboard.writeText(card.promoCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard fallback ignored cleanly.
    }
  }

  return (
    <div className="bridge-shell">
      <main className="bridge-card" id="main">
        <div className="bridge-top">
          <div className="bridge-brand">
            <Orb size={40} priority />
            <div>
              <Eyebrow>{t("p8BridgeEyebrow")}</Eyebrow>
              <p className="field-hint bridge-creator-line">
                {t("p8BridgeRecommendedBy")}{" "}
                <strong>
                  {card.creatorDisplayName}
                  {card.creatorHandle ? ` (@${card.creatorHandle})` : ""}
                </strong>
                {card.creatorVerified ? (
                  <>
                    {" "}
                    <BadgeCheck
                      size={14}
                      aria-hidden="true"
                      style={{ display: "inline", verticalAlign: "-2px" }}
                    />
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <LanguageSwitch />
        </div>

        <div className="profile-badge-row" style={{ justifyContent: "flex-start" }}>
          <span className="tag tag-verified">{t("p8BridgeDisclosure")}</span>
          <span className="tag">{t(`objective${card.objective}` as MessageKey)}</span>
          {card.isDemo ? <span className="tag">{t("development")}</span> : null}
        </div>

        <h1 className="bridge-title">{card.campaignName}</h1>
        <p className="bridge-headline">{card.headline}</p>
        {card.disclosureNote ? <p className="field-hint">{card.disclosureNote}</p> : null}

        {card.promoCode ? (
          <div className="bridge-promo-box">
            <div>
              <span className="field-hint">{t("p8BridgeCodeLabel")}</span>
              <strong className="bridge-code-value">{card.promoCode}</strong>
              {card.discountLabel ? <span className="field-hint">{card.discountLabel}</span> : null}
            </div>
            <button type="button" className="button button-small" onClick={() => void copyCode()}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? t("p8BridgeCodeCopied") : t("p8BridgeCopyCode")}
            </button>
          </div>
        ) : null}

        <div className="bridge-actions">
          <a
            href={card.outboundUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="button bridge-primary-cta"
          >
            <ExternalLink size={16} aria-hidden="true" />
            {t("p8BridgeOpenPartner")}
          </a>
          <Link
            href={card.ruvoraActionPath}
            className="button button-secondary bridge-secondary-cta"
          >
            {t("p8BridgeOpenRuvora")}
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>

        <p className="field-hint bridge-footer-note">{t("p8BridgeAttributionNote")}</p>
      </main>
    </div>
  );
}
