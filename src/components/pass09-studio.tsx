"use client";

import { useMemo, useState } from "react";
import { Check, Clapperboard, Copy, Download, Film, Images } from "lucide-react";
import { useLocale } from "@/i18n/provider";
import {
  buildCarouselSlides,
  buildVideoScript,
  type CreativeBriefInput,
  type VideoScriptFormat,
} from "@/lib/video-scripts";
import { Empty, Eyebrow } from "./ui";

export function VideoScriptAndCarouselPanel({
  handle,
  campaign,
  shareUrl,
}: {
  handle: string | null;
  campaign: {
    id: string;
    name: string;
    description?: string;
    objective?: string;
    creativeBrief?: CreativeBriefInput | null;
    promoCode?: { code: string; discountLabel: string } | null;
  } | null;
  shareUrl: string | null;
}) {
  const { t, locale } = useLocale();
  const [scriptFormat, setScriptFormat] = useState<VideoScriptFormat>("TIKTOK_15S");
  const [carouselFormat, setCarouselFormat] = useState<"portrait" | "story">("portrait");
  const [copied, setCopied] = useState(false);

  const scriptInput = useMemo(() => {
    if (!campaign) return null;
    return {
      locale,
      campaignName: campaign.name,
      description: campaign.description,
      objective: campaign.objective,
      creatorHandle: handle,
      promoCode: campaign.promoCode?.code ?? null,
      discountLabel: campaign.promoCode?.discountLabel ?? null,
      shareUrl,
      brief: campaign.creativeBrief ?? null,
    };
  }, [campaign, handle, locale, shareUrl]);

  const script = useMemo(
    () => (scriptInput ? buildVideoScript(scriptFormat, scriptInput) : null),
    [scriptFormat, scriptInput],
  );
  const slides = useMemo(
    () => (scriptInput ? buildCarouselSlides(scriptInput) : null),
    [scriptInput],
  );

  async function copyFullScript() {
    if (!script) return;
    await navigator.clipboard.writeText(script.fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <Eyebrow>{t("p9StudioEyebrow")}</Eyebrow>
          <h2>{t("p9StudioTitle")}</h2>
          <p className="panel-description">{t("p9StudioSubtitle")}</p>
        </div>
        {campaign && (
          <span className="tag">
            <Clapperboard size={13} /> {campaign.name}
          </span>
        )}
      </div>

      {!campaign || !script || !slides ? (
        <Empty>{t("p9StudioSelectCampaignHint")}</Empty>
      ) : (
        <div className="p9-studio-stack">
          {/* Short-form video script storyboard */}
          <div className="p9-script-box">
            <div className="p9-script-toolbar">
              <div className="snippet-tabs" role="tablist">
                {(
                  [
                    ["TIKTOK_15S", "p9ScriptTabTikTok"],
                    ["REELS_30S", "p9ScriptTabReels"],
                    ["YOUTUBE_SHORTS_30S", "p9ScriptTabShorts"],
                  ] as const
                ).map(([fmt, key]) => (
                  <button
                    key={fmt}
                    type="button"
                    role="tab"
                    aria-selected={scriptFormat === fmt}
                    className={`tab-chip ${scriptFormat === fmt ? "active" : ""}`}
                    onClick={() => setScriptFormat(fmt)}
                  >
                    <Film size={13} />
                    {t(key)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="button button-small"
                onClick={() => void copyFullScript()}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {t(copied ? "p9ScriptCopied" : "p9ScriptCopyBtn")}
              </button>
            </div>

            <div className="p9-beats-grid">
              {script.beats.map((beat, idx) => (
                <article key={idx} className="p9-beat-card">
                  <div className="p9-beat-head">
                    <span className="tag tag-verified">{beat.timecode}</span>
                    <strong>{beat.label}</strong>
                  </div>
                  <p className="p9-beat-spoken">
                    <small>{t("p9ScriptVoiceLabel")}:</small> “{beat.spoken}”
                  </p>
                  <p className="field-hint">
                    <strong>{t("p9ScriptScreenLabel")}:</strong> {beat.onScreen}
                  </p>
                  <p className="field-hint">
                    <strong>{t("p9ScriptShotLabel")}:</strong> {beat.shotCue}
                  </p>
                </article>
              ))}
            </div>

            <p className="field-hint" style={{ marginTop: 10 }}>
              <strong>{t("p9ScriptDisclosureLabel")}:</strong> <code>{script.disclosureLine}</code>
            </p>
          </div>

          {/* 3-Slide Carousel PNG Kit */}
          {handle && (
            <div className="p9-carousel-box">
              <div className="p9-script-toolbar">
                <h3>
                  <Images size={16} style={{ marginRight: 6, verticalAlign: "text-bottom" }} />
                  {t("p9CarouselTitle")}
                </h3>
                <div className="snippet-tabs" role="group">
                  <button
                    type="button"
                    className={`tab-chip ${carouselFormat === "portrait" ? "active" : ""}`}
                    onClick={() => setCarouselFormat("portrait")}
                  >
                    {t("p9CarouselFormatPortrait")}
                  </button>
                  <button
                    type="button"
                    className={`tab-chip ${carouselFormat === "story" ? "active" : ""}`}
                    onClick={() => setCarouselFormat("story")}
                  >
                    {t("p9CarouselFormatStory")}
                  </button>
                </div>
              </div>

              <div className="p9-carousel-grid">
                {slides.map((sl) => {
                  const baseUrl = `/share-card/carousel/${encodeURIComponent(handle)}?campaign=${encodeURIComponent(campaign.id)}&slide=${sl.slideNumber}&format=${carouselFormat}&lang=${locale}`;
                  return (
                    <article key={sl.slideNumber} className="p9-carousel-card">
                      <div className="p9-carousel-preview">
                        {/* eslint-disable-next-line @next/next/no-img-element -- Dynamic server PNG slide preview */}
                        <img
                          src={baseUrl}
                          alt={`${t("p9CarouselSlideLabel")} ${sl.slideNumber} — ${campaign.name}`}
                          loading="lazy"
                        />
                      </div>
                      <div className="p9-carousel-meta">
                        <strong>
                          {t("p9CarouselSlideLabel")} {sl.slideNumber}/3
                        </strong>
                        <small>{sl.headline}</small>
                        <a
                          href={`${baseUrl}&download=1`}
                          className="button button-small button-secondary"
                          download
                        >
                          <Download size={13} />
                          {t("p9CarouselDownloadBtn")}
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
