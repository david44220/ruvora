"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Compass,
  Download,
  FileText,
  LayoutDashboard,
  Link2,
  Megaphone,
  Settings,
  Smartphone,
  Wallet,
  X,
} from "lucide-react";
import { useLocale } from "@/i18n/provider";
import { useResource } from "@/lib/hooks";
import type { CustomLink } from "@/lib/types";
import { Eyebrow, Loading } from "./ui";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "ruvora_pwa_banner_dismissed_v1";

export function PwaInstallBanner() {
  const { t } = useLocale();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isStandalone) return;
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // Ignore storage access errors in private mode.
    }

    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /(iphone|ipad|ipod)/.test(ua) && /safari/.test(ua) && !/crios|fxios/.test(ua);
    if (isIos) {
      queueMicrotask(() => {
        setIosHint(true);
        setDismissed(false);
      });
    }

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setDismissed(false);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (dismissed || (!deferredPrompt && !iosHint)) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Ignore storage errors.
    }
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setDeferredPrompt(null);
      setDismissed(true);
    }
  }

  return (
    <div className="pwa-install-banner" role="region" aria-label={t("p7PwaInstallTitle")}>
      <div className="pwa-install-copy">
        <Smartphone size={18} />
        <div>
          <strong>{t("p7PwaInstallTitle")}</strong>
          <small>{iosHint ? t("p7PwaIosHint") : t("p7PwaInstallDesc")}</small>
        </div>
      </div>
      <div className="pwa-install-actions">
        {deferredPrompt && (
          <button type="button" className="button button-small" onClick={() => void install()}>
            <Download size={14} />
            {t("p7PwaInstallBtn")}
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label={t("p7PwaDismiss")}
          onClick={dismiss}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

export function MobileBottomNav() {
  const { t } = useLocale();
  const pathname = usePathname();

  const items = [
    { href: "/app", label: t("p7MobileTabHome"), icon: <LayoutDashboard size={19} /> },
    { href: "/app/promote", label: t("p7MobileTabPromote"), icon: <Megaphone size={19} /> },
    { href: "/app/opportunities", label: t("p7MobileTabOffers"), icon: <Compass size={19} /> },
    { href: "/app/wallet", label: t("p7MobileTabWallet"), icon: <Wallet size={19} /> },
    { href: "/app/settings", label: t("p7MobileTabProfile"), icon: <Settings size={19} /> },
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label={t("menu")}>
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? "mobile-tab active" : "mobile-tab"}
            aria-current={active ? "page" : undefined}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function MediaKitAndLinksPanel({
  handle,
  customLinks,
}: {
  handle: string | null;
  customLinks: CustomLink[];
}) {
  const { t } = useLocale();
  const clicks = useResource<{ totalClicks: number; byLinkId: Record<string, number> }>(
    "/profiles/link-clicks",
  );

  if (!handle) return null;

  return (
    <section className="panel admin-section">
      <div className="panel-header">
        <div>
          <Eyebrow>{t("p7MediaKitTitle")}</Eyebrow>
          <h3>{t("p7MediaKitTitle")}</h3>
        </div>
        <a className="button button-small" href={`/api/media-kit/${encodeURIComponent(handle)}`}>
          <FileText size={15} />
          {t("p7MediaKitBtn")}
        </a>
      </div>
      <p className="panel-description">{t("p7MediaKitDesc")}</p>

      <div className="p7-link-telemetry-block">
        <div className="panel-header" style={{ marginBottom: 10 }}>
          <div>
            <strong>{t("p7LinkAnalyticsTitle")}</strong>
            <p className="field-hint" style={{ margin: "4px 0 0" }}>
              {t("p7LinkAnalyticsDesc")}
            </p>
          </div>
          <span className="tag">
            <Link2 size={13} />
            {clicks.data?.totalClicks ?? 0} {t("p7LinkClicksLabel")}
          </span>
        </div>
        {clicks.loading ? (
          <Loading />
        ) : customLinks.length > 0 ? (
          <div className="allocation-list">
            {customLinks.map((link, idx) => {
              const linkId = link.id || `legacy_${idx}`;
              const count = clicks.data?.byLinkId[linkId] ?? 0;
              return (
                <div key={linkId} className="team-member-row">
                  <span>
                    <strong>
                      {link.title}{" "}
                      {link.pinned && <span className="tag">{t("p7LinkPinnedBadge")}</span>}
                    </strong>
                    <small>{link.url}</small>
                  </span>
                  <span className="tag number">
                    {count} {t("p7LinkClicksLabel")}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="field-hint">{t("noLinks")}</p>
        )}
      </div>
    </section>
  );
}
