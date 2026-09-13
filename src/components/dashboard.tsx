"use client";
import Link from "next/link";

import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Fingerprint,
  Aperture,
  Compass,
  Trophy,
  Wallet,
  Activity as ActivityIcon,
  Settings,
  Shield,
  LogOut,
  ArrowUpRight,
  Menu,
  X,
  FlaskConical,
  CircleDollarSign,
  Layers3,
  Zap,
  Users,
  Link2,
} from "lucide-react";
import { useLocale } from "@/i18n/provider";
import { type MessageKey } from "@/i18n/messages";
import { api, minorMoney, ruNumber } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { type User, type Dashboard, type RuvoraEvent } from "@/lib/types";
import {
  Brand,
  LanguageSwitch,
  Eyebrow,
  Orb,
  ButtonLink,
  Notice,
  Loading,
  Empty,
  Status,
} from "./ui";
import { ProfileForm } from "./auth";
import { AdvertiserScreen, OpportunitiesScreen } from "./campaigns";
import { AppContext, useDashboard } from "./app-context";
export function AppShell({
  children,
  user,
  development,
}: {
  children: ReactNode;
  user: User;
  development: boolean;
}) {
  const { t } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const resource = useResource<Dashboard>("/dashboard");
  const nav: [string, MessageKey, ReactNode, boolean][] = [
    ["/app", "overview", <LayoutDashboard key="o" />, true],
    ["/app/creator", "creatorStudio", <Fingerprint key="c" />, user.roles.includes("CREATOR")],
    ["/app/advertiser", "campaignManager", <Aperture key="a" />, user.roles.includes("ADVERTISER")],
    ["/app/opportunities", "opportunities", <Compass key="p" />, true],
    ["/app/events", "navEvents", <Trophy key="e" />, true],
    ["/app/wallet", "rewards", <Wallet key="w" />, true],
    ["/app/activity", "activity", <ActivityIcon key="r" />, true],
    ["/app/settings", "settings", <Settings key="s" />, true],
    ["/admin", "admin", <Shield key="d" />, user.roles.includes("ADMIN")],
  ];
  const current = nav.find(([url]) => pathname === url)?.[1] || "overview";
  async function logout() {
    await api("/auth/logout", {});
    router.push("/login");
    router.refresh();
  }
  return (
    <AppContext.Provider value={{ data: resource.data, reload: resource.reload }}>
      <div className="app-layout">
        <aside className={`sidebar ${menu ? "sidebar-open" : ""}`}>
          <Brand />
          <p className="sidebar-label">{t("dashboardEyebrow")}</p>
          <nav className="side-nav" aria-label={t("menu")}>
            {nav
              .filter((item) => item[3])
              .map(([href, key, icon]) => (
                <Link
                  className={pathname === href ? "active" : ""}
                  key={href}
                  href={href}
                  onClick={() => setMenu(false)}
                >
                  {icon}
                  {t(key)}
                </Link>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <button onClick={logout}>
              <LogOut size={16} />
              {t("logout")}
            </button>
            <div className="sidebar-profile">
              <span className="avatar">{user.displayName.substring(0, 2).toLowerCase()}</span>
              <div>
                <strong>{user.displayName}</strong>
                <small>@{user.handle}</small>
              </div>
            </div>
          </div>
        </aside>
        <div className="app-main">
          <header className="app-topbar">
            <button
              className="icon-button mobile-app-menu"
              aria-label={menu ? t("close") : t("menu")}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={19} /> : <Menu size={19} />}
            </button>
            <span>{t(current)}</span>
            <div className="topbar-actions">
              {user.handle && (
                <Link href={`/@${user.handle}`}>
                  {t("openProfile")}
                  <ArrowUpRight size={15} />
                </Link>
              )}
              <LanguageSwitch />
            </div>
          </header>
          <main className="app-content" id="main">
            {(development || resource.data?.isDemo) && (
              <div className="dev-banner">
                <FlaskConical size={14} />
                {t("development")}
              </div>
            )}
            {resource.loading ? (
              <Loading />
            ) : resource.error ? (
              <>
                <Notice
                  error
                  message={t(resource.error.status === 401 ? "sessionExpired" : "unavailable")}
                />
                <button className="button" onClick={resource.reload}>
                  {t("retry")}
                </button>
              </>
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </AppContext.Provider>
  );
}
import { PageTitle, Stats, Stat, ActivityTable, EventCard } from "./workspace-ui";
function OverviewScreen({ data }: { data: Dashboard }) {
  const { t } = useLocale();
  return (
    <>
      <PageTitle
        title={`${t("greeting")} ${data.user.displayName.split(" ")[0]}.`}
        description={t("dashboardIntro")}
      />
      <Stats data={data} />
      <div className="dashboard-grid">
        <div className="dashboard-feature">
          <Orb size={350} loading="eager" />
          <Eyebrow>{t("nextStep")}</Eyebrow>
          <h2>{t("nextTitle")}</h2>
          <p>{t("nextDescription")}</p>
          <ButtonLink href="/app/opportunities" small>
            {t("opportunities")}
          </ButtonLink>
        </div>
        <div className="quick-profile">
          <div className="quick-profile-top">
            <span className="avatar">{data.user.displayName.substring(0, 2).toLowerCase()}</span>
            <div>
              <h3>{data.user.displayName}</h3>
              <p className="handle">@{data.user.handle}</p>
            </div>
          </div>
          <p>{t("linkDescriptionLabel")}</p>
          <Link className="profile-link" href={`/@${data.user.handle}`}>
            <span>
              <Link2 size={16} />@{data.user.handle}
            </span>
            <ArrowUpRight size={17} />
          </Link>
          <Link className="text-link" href="/app/settings">
            {t("manageProfile")}
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>
      <section className="panel">
        <div className="panel-header">
          <h3>{t("recentActivity")}</h3>
          <Link href="/app/activity">
            {t("allActivity")}
            <ArrowUpRight size={14} />
          </Link>
        </div>
        <ActivityTable items={data.activities.slice(0, 5)} />
      </section>
      {data.events.length > 0 && (
        <section className="admin-section">
          <div className="panel-header">
            <h3>{t("activeEvents")}</h3>
            <Link href="/app/events">{t("eventLink")}</Link>
          </div>
          <div className="campaign-grid">
            {data.events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
function CreatorScreen({ data }: { data: Dashboard }) {
  const { t, locale } = useLocale();
  const creatorRU = data.rewardUnits
    .filter((r) => r.state === "VALIDATED" && r.category === "CREATOR")
    .reduce((sum, r) => sum + BigInt(r._sum.amountMicros || 0), 0n);
  return (
    <>
      <PageTitle title={t("creatorStudio")} description={t("creatorIntro")}>
        <ButtonLink href={`/@${data.user.handle}`} small secondary>
          {t("openProfile")}
        </ButtonLink>
      </PageTitle>
      <div className="stats-grid">
        <Stat
          label={t("audience")}
          value={data.user.followers.toLocaleString(locale)}
          hint={t("selfDeclared")}
          icon={<Users />}
        />
        <Stat
          label={t("creatorRU")}
          value={ruNumber(creatorRU, locale)}
          hint={t("noCashValue")}
          icon={<Layers3 />}
        />
        <Stat label={t("progression")} value={data.summary.xp} hint={t("xpUnit")} icon={<Zap />} />
        <Stat
          label={t("balance")}
          value={minorMoney(data.summary.moneyMinor, locale)}
          hint="EUR"
          icon={<CircleDollarSign />}
        />
      </div>
      <div className="profile-studio-card">
        <div>
          <Eyebrow>{t("publicLink")}</Eyebrow>
          <h2>@{data.user.handle}</h2>
          <p>{t("linkDescriptionLabel")}</p>
          <ButtonLink href="/app/settings" small>
            {t("manageProfile")}
          </ButtonLink>
        </div>
        <Orb size={250} loading="eager" sizes="(max-width: 760px) 270px, 250px" />
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <h3>{t("eligibility")}</h3>
          <p className="panel-description">
            {t(data.eligibility.creatorEligible ? "eligible" : "notEligible")}
          </p>
          <div className="progress-track">
            <span
              style={{
                width: `${Math.min(100, (data.user.followers / data.eligibility.followerThreshold) * 100)}%`,
              }}
            />
          </div>
          <p className="panel-description number">
            {data.user.followers} / {data.eligibility.followerThreshold} · {t("followers")}
          </p>
          <p className="field-hint">{t("heroDisclaimer")}</p>
        </section>
        <section className="panel">
          <h3>{t("activeEvents")}</h3>
          <p className="panel-description">{t("eventDescription")}</p>
          <ButtonLink href="/app/events" secondary small>
            {t("eventLink")}
          </ButtonLink>
        </section>
      </div>
      <section className="panel">
        <div className="panel-header">
          <h3>{t("recentActivity")}</h3>
        </div>
        <ActivityTable items={data.activities} />
      </section>
    </>
  );
}
function WalletScreen({ data }: { data: Dashboard }) {
  const { t, locale } = useLocale();
  return (
    <>
      <PageTitle title={t("rewards")} description={t("walletIntro")} />
      <Stats data={data} />
      <p className="panel-description">{t("walletNote")}</p>
      <div className="panel">
        <div className="panel-header">
          <h3>{t("ledger")}</h3>
        </div>
        {!data.transactions.length ? (
          <Empty />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("type")}</th>
                  <th>{t("date")}</th>
                  <th>{t("amount")}</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <strong>
                        {entry.transaction.description ||
                          entry.transaction.kind ||
                          entry.transaction.reference ||
                          entry.transaction.id.slice(0, 12)}
                      </strong>
                    </td>
                    <td>{new Date(entry.createdAt).toLocaleDateString(locale)}</td>
                    <td className="number">{minorMoney(entry.amountMinor, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="panel admin-section">
        <div className="panel-header">
          <h3>{t("ruEntries")}</h3>
        </div>
        {!data.rewardUnits.length ? (
          <Empty />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("type")}</th>
                  <th>{t("status")}</th>
                  <th>{t("amount")}</th>
                </tr>
              </thead>
              <tbody>
                {data.rewardUnits.map((ru, i) => (
                  <tr key={`${ru.category}-${ru.state}-${i}`}>
                    <td>{t(`role${ru.category}` as MessageKey) || ru.category}</td>
                    <td>
                      <Status value={ru.state} />
                    </td>
                    <td>
                      {ruNumber(ru._sum.amountMicros, locale)} {t("ruUnit")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="field-hint" style={{ marginTop: 24 }}>
        {t("payoutsUnavailable")}
      </p>
    </>
  );
}
function AppEvents() {
  const { t } = useLocale();
  const result = useResource<{ events: RuvoraEvent[] }>("/events");
  return (
    <>
      <PageTitle title={t("navEvents")} description={t("eventDescription")} />
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <Notice error message={t("unavailable")} />
      ) : result.data?.events.length ? (
        <div className="events-grid">
          {result.data.events.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      ) : (
        <Empty>{t("noEvents")}</Empty>
      )}
    </>
  );
}
export function DashboardScreen({ screen }: { screen: string }) {
  const { data, reload } = useDashboard();
  const { t } = useLocale();
  if (!data) return null;
  if (screen === "creator") return <CreatorScreen data={data} />;
  if (screen === "advertiser") return <AdvertiserScreen data={data} reload={reload} />;
  if (screen === "opportunities") return <OpportunitiesScreen />;
  if (screen === "wallet") return <WalletScreen data={data} />;
  if (screen === "events") return <AppEvents />;
  if (screen === "activity")
    return (
      <>
        <PageTitle title={t("activity")} description={t("activityIntro")} />
        <div className="panel">
          <ActivityTable items={data.activities} />
        </div>
      </>
    );
  if (screen === "settings")
    return (
      <>
        <PageTitle title={t("settings")} description={t("onboardingIntro")} />
        <div className="panel">
          <ProfileForm user={data.user} onSaved={() => void reload()} />
        </div>
      </>
    );
  return <OverviewScreen data={data} />;
}
