"use client";
import Link from "next/link";
import Image from "next/image";
import { useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Menu,
  X,
  Globe2,
  LoaderCircle,
  AlertCircle,
  Check,
  Sparkles,
} from "lucide-react";
import { useLocale } from "@/i18n/provider";
import { type MessageKey } from "@/i18n/messages";
export function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = useLocale();
  return (
    <Link className="brand" href="/" aria-label={t("backHome")}>
      <span className="brand-symbol" aria-hidden="true">
        r
      </span>
      {!compact && <span>ruvora</span>}
    </Link>
  );
}
export function LanguageSwitch() {
  const { t, locale, setLocale } = useLocale();
  return (
    <button
      className="language-switch"
      aria-label={t("language")}
      onClick={() => setLocale(locale === "en" ? "fr" : "en")}
    >
      <Globe2 size={15} />
      {locale.toUpperCase()}
    </button>
  );
}
export function PublicNav() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <header className="public-header">
      <div className="nav-inner">
        <Brand />
        <nav className={open ? "public-nav is-open" : "public-nav"} aria-label={t("menu")}>
          <Link onClick={() => setOpen(false)} href="/#creators">
            {t("navCreators")}
          </Link>
          <Link onClick={() => setOpen(false)} href="/#experience">
            {t("navExperience")}
          </Link>
          <Link onClick={() => setOpen(false)} href="/events">
            {t("navEvents")}
          </Link>
          <Link onClick={() => setOpen(false)} href="/#economy">
            {t("navEconomy")}
          </Link>
        </nav>
        <div className="nav-actions">
          <LanguageSwitch />
          <Link className="login-link" href="/login">
            {t("login")}
          </Link>
          <Link className="button button-small" href="/register">
            {t("getLink")}
            <ArrowUpRight size={16} />
          </Link>
          <button
            className="menu-toggle icon-button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? t("close") : t("menu")}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
    </header>
  );
}
export function ButtonLink({
  children,
  href,
  secondary = false,
  small = false,
}: {
  children: ReactNode;
  href: string;
  secondary?: boolean;
  small?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`button ${secondary ? "button-secondary" : ""} ${small ? "button-small" : ""}`}
    >
      {children}
      <ArrowUpRight size={17} />
    </Link>
  );
}
export function Orb({
  className = "",
  size = 240,
  priority = false,
  loading = "lazy",
  sizes = `${size}px`,
}: {
  className?: string;
  size?: number;
  priority?: boolean;
  loading?: "eager" | "lazy";
  sizes?: string;
}) {
  return (
    <Image
      className={`canonical-orb ${className}`}
      src="/assets/orbs/ruvora-orb.webp"
      alt=""
      width={size}
      height={size}
      priority={priority}
      loading={priority ? "eager" : loading}
      sizes={sizes}
    />
  );
}
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}
export function Status({ value }: { value: string }) {
  const { t } = useLocale();
  const key = `status${value}` as MessageKey;
  return <span className={`status status-${value.toLowerCase()}`}>{t(key) || value}</span>;
}
export function Loading() {
  const { t } = useLocale();
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={24} />
      {t("loading")}
    </div>
  );
}
export function Notice({ message, error = false }: { message: string; error?: boolean }) {
  return (
    <div className={`notice ${error ? "notice-error" : ""}`} role={error ? "alert" : "status"}>
      {error ? <AlertCircle size={18} /> : <Check size={18} />}
      <span>{message}</span>
    </div>
  );
}
export function Empty({ children }: { children?: ReactNode }) {
  const { t } = useLocale();
  return (
    <div className="empty-state">
      <Sparkles size={25} />
      <p>{children || t("noRecords")}</p>
    </div>
  );
}
export function Footer() {
  const { t } = useLocale();
  return (
    <footer className="footer wrap">
      <div>
        <Brand />
        <p>{t("footerNote")}</p>
      </div>
      <div className="footer-links">
        <Link href="/privacy">{t("privacy")}</Link>
        <Link href="/terms">{t("terms")}</Link>
        <LanguageSwitch />
      </div>
      <div className="footer-bottom">
        <span>{t("copyright")}</span>
        <span>{t("noGuarantee")}</span>
        <ArrowRight size={18} />
      </div>
    </footer>
  );
}
