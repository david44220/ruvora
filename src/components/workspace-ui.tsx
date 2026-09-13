"use client";
import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { CircleDollarSign, Layers3, Zap, Trophy, ArrowUpRight } from "lucide-react";
import { useLocale } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/messages";
import { minorMoney, ruNumber } from "@/lib/api";
import type { Dashboard, Activity, RuvoraEvent } from "@/lib/types";
import { Eyebrow, Empty, Status } from "./ui";
export function PageTitle({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  const { t } = useLocale();
  return (
    <div className="page-header">
      <div className="section-title">
        <Eyebrow>{t("dashboardEyebrow")}</Eyebrow>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: ReactNode;
}) {
  return (
    <article className="stat-card">
      {icon}
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <small className="stat-hint">{hint}</small>}
    </article>
  );
}
export function Stats({ data }: { data: Dashboard }) {
  const { t, locale } = useLocale();
  return (
    <div className="stats-grid">
      <Stat
        label={t("balance")}
        value={minorMoney(data.summary.moneyMinor, locale)}
        hint="EUR"
        icon={<CircleDollarSign />}
      />
      <Stat
        label={t("validatedRU")}
        value={ruNumber(data.summary.ruMicros, locale)}
        hint={t("noCashValue")}
        icon={<Layers3 />}
      />
      <Stat
        label={t("progression")}
        value={data.summary.xp.toLocaleString(locale)}
        hint={t("xpUnit")}
        icon={<Zap />}
      />
      <Stat
        label={t("eventPoints")}
        value={data.summary.eventPoints.toLocaleString(locale)}
        hint={t("eventPointsNote")}
        icon={<Trophy />}
      />
    </div>
  );
}
export function ActivityTable({ items }: { items: Activity[] }) {
  const { t, locale } = useLocale();
  if (!items.length) return <Empty>{t("noActivity")}</Empty>;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{t("activity")}</th>
            <th>{t("type")}</th>
            <th>{t("status")}</th>
            <th>{t("date")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.campaign.name}</strong>
                <small>{item.id.slice(0, 8)}</small>
              </td>
              <td>{t(`objective${item.type}` as MessageKey) || item.type}</td>
              <td>
                <Status value={item.state} />
              </td>
              <td>{new Date(item.createdAt).toLocaleDateString(locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function EventCard({ event }: { event: RuvoraEvent }) {
  const { t, locale } = useLocale();
  return (
    <Link className="event-list-card" href={`/events/${event.slug}`}>
      <Image
        src="/assets/events/ruvora-event.webp"
        alt=""
        fill
        sizes="(max-width: 768px) 90vw, 600px"
      />
      <div>
        <span className="pill">
          <Trophy size={12} />
          {t("eventTag")}
        </span>
        <h3>{event.title}</h3>
        <small>
          {t("ends")} {new Date(event.endAt).toLocaleDateString(locale)}
        </small>
      </div>
      <ArrowUpRight size={22} />
    </Link>
  );
}
