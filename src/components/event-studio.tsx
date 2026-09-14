"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { Plus, ArrowUpRight, Trophy, Wallet, CalendarDays } from "lucide-react";
import { useLocale } from "@/i18n/provider";
import { messages } from "@/i18n/messages";
import { api, minorMoney } from "@/lib/api";
import { useAction, useResource } from "@/lib/hooks";
import type { RuvoraEvent } from "@/lib/types";
import { useDashboard } from "./app-context";
import { PageTitle, Stat } from "./workspace-ui";
import { Notice, Empty, Loading, Status, Eyebrow } from "./ui";
export interface ManagedEvent extends RuvoraEvent {
  ownerId: string | null;
  sponsorId: string | null;
  hostId: string | null;
  prizeBudgetMinor: string;
  fundedMinor: string;
  fundingState: string;
  configVersion: string;
  reviewReason?: string;
  settlements?: { id: string; state: string }[];
}

export function DevelopmentDeposit({ onFunded }: { onFunded: () => void }) {
  const { t } = useLocale();
  const action = useAction();
  const key = useRef<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    key.current ??= crypto.randomUUID();
    const form = new FormData(e.currentTarget);
    const result = await action.run(
      () =>
        api("/payments/deposit", {
          amountMinor: String(form.get("amountMinor")),
          idempotencyKey: key.current,
        }),
      t("operationComplete"),
    );
    if (result) {
      key.current = null;
      onFunded();
    }
  }
  return (
    <section className="panel deposit-panel">
      <h3>{t("p2AvailableFunds")}</h3>
      <p className="field-hint">{t("p2DepositNote")}</p>
      <form onSubmit={submit} className="inline-form">
        <label className="field">
          {t("p2DepositAmount")}
          <input name="amountMinor" type="number" min="1" step="1" max="100000000" required />
        </label>
        <button className="button button-small button-secondary" disabled={action.busy}>
          {t(action.busy ? "working" : "p2Deposit")}
        </button>
      </form>
      {action.notice && <Notice message={action.notice} error={action.failed} />}
    </section>
  );
}
function EventCreation({ onCreated }: { onCreated: () => void }) {
  const { t } = useLocale();
  const { data } = useDashboard();
  const action = useAction();
  const key = useRef(crypto.randomUUID());
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const title = String(f.get("title"));
    const prizeBudgetMinor = String(f.get("prizeBudgetMinor") || "0");
    const parts = String(f.get("tiers") || "")
      .split(",")
      .map(Number);
    const countries = String(f.get("countries"))
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const points = String(f.get("milestones") || "")
      .split(",")
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
    const content = (locale: "en" | "fr") => ({
      title,
      description: String(f.get(`description-${locale}`)),
      rules: String(f.get(`rules-${locale}`)),
    });
    const result = await action.run(
      () =>
        api("/events", {
          slug: String(f.get("slug")),
          localizedContent: { en: content("en"), fr: content("fr") },
          startAt: new Date(String(f.get("startAt"))).toISOString(),
          endAt: new Date(String(f.get("endAt"))).toISOString(),
          prizeBudgetMinor,
          visibility: String(f.get("visibility")),
          ...(data?.user.roles.includes("ADVERTISER") ? { sponsor: data.user.displayName } : {}),
          idempotencyKey: key.current,
          configuration: {
            version: `event-${Date.now()}`,
            pointRules: {
              IMPRESSION: 0,
              QUALIFIED_VIEW: 15,
              CLICK: 10,
              CONVERSION: 50,
              CREATOR_PROMOTION: 15,
              SPONSORED_MISSION: 25,
            },
            maxPointsPerUserPerDay: Number(f.get("dailyCap")),
            participantCap: Number(f.get("participantCap")),
            allowedCountries: countries,
            milestones: points.map((n) => ({
              points: n,
              title: { en: `${n} points`, fr: `${n} points` },
            })),
            rewardTiers:
              BigInt(prizeBudgetMinor) > 0n
                ? parts.map((shareBps, i) => ({ fromRank: i + 1, toRank: i + 1, shareBps }))
                : [],
            ruBonusBudgetMicros: "0",
            unusedFunds: "RETURN_SPONSOR",
          },
        }),
      t("p2EventCreated"),
    );
    if (result) onCreated();
  }
  return (
    <section className="panel admin-section">
      <h3>{t("p2CreateEvent")}</h3>
      <form onSubmit={submit} className="form-stack">
        <div className="form-grid">
          <label className="field">
            {t("p2EventTitle")}
            <input name="title" minLength={3} maxLength={120} required />
          </label>
          <label className="field">
            {t("publicLink")}
            <input
              name="slug"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              minLength={3}
              maxLength={100}
              required
            />
          </label>
          <label className="field">
            {t("p2EnglishDescription")}
            <textarea name="description-en" minLength={10} maxLength={3000} required />
          </label>
          <label className="field">
            {t("p2FrenchDescription")}
            <textarea name="description-fr" minLength={10} maxLength={3000} required />
          </label>
          <label className="field">
            {t("p2EnglishRules")}
            <textarea
              name="rules-en"
              defaultValue={messages.en.eventRuleText}
              minLength={10}
              maxLength={5000}
              required
            />
          </label>
          <label className="field">
            {t("p2FrenchRules")}
            <textarea
              name="rules-fr"
              defaultValue={messages.fr.eventRuleText}
              minLength={10}
              maxLength={5000}
              required
            />
          </label>
          <label className="field">
            {t("startDate")}
            <input name="startAt" type="datetime-local" required />
          </label>
          <label className="field">
            {t("endDate")}
            <input name="endAt" type="datetime-local" required />
          </label>
          <label className="field">
            {t("p2PrizeBudget")}
            <input
              name="prizeBudgetMinor"
              type="number"
              min="0"
              step="1"
              defaultValue="0"
              readOnly={!data?.user.roles.includes("ADVERTISER")}
              required
            />
          </label>
          <label className="field">
            {t("p2ParticipantCap")}
            <input
              name="participantCap"
              type="number"
              min="1"
              max="10000"
              defaultValue="500"
              required
            />
          </label>
          <label className="field">
            {t("p2AllowedCountries")}
            <input name="countries" defaultValue={data?.user.country || "FR"} required />
          </label>
          <label className="field">
            {t("p2Visibility")}
            <select name="visibility">
              <option value="PUBLIC">{t("p2Public")}</option>
              <option value="UNLISTED">{t("p2Unlisted")}</option>
            </select>
          </label>
          <label className="field">
            {t("p2RewardTiers")}
            <input name="tiers" defaultValue="5000,3000,2000" required />
            <span className="field-hint">{t("p2TierNote")}</span>
          </label>
          <label className="field">
            {t("p2DailyPointCap")}
            <input
              name="dailyCap"
              type="number"
              min="1"
              max="10000000"
              defaultValue="100"
              required
            />
          </label>
          <label className="field full-width">
            {t("p2MilestonePoints")}
            <input name="milestones" defaultValue="100,500,1000" />
          </label>
        </div>
        {action.notice && <Notice message={action.notice} error={action.failed} />}
        <div>
          <button className="button" disabled={action.busy}>
            {t(action.busy ? "working" : "submitDraft")}
            <Plus size={17} />
          </button>
        </div>
      </form>
    </section>
  );
}
function ManagedEventCard({ event, reload }: { event: ManagedEvent; reload: () => Promise<void> }) {
  const { t, locale } = useLocale();
  const { data } = useDashboard();
  const action = useAction();
  const [reason, setReason] = useState("");
  const fundKey = useRef<string | null>(null);
  const remaining = BigInt(event.prizeBudgetMinor) - BigInt(event.fundedMinor);
  async function transition(kind: string) {
    await action.run(async () => {
      await api(`/events/${event.id}/transition`, {
        action: kind,
        reason,
        idempotencyKey: crypto.randomUUID(),
      });
      await reload();
    }, t("p2EventUpdated"));
  }
  async function fund() {
    fundKey.current ??= crypto.randomUUID();
    const result = await action.run(
      () =>
        api(`/events/${event.id}/fund`, {
          amountMinor: remaining.toString(),
          idempotencyKey: fundKey.current,
        }),
      t("p2FundsReserved"),
    );
    if (result) await reload();
  }
  return (
    <article className="panel managed-event-card">
      <div className="panel-header">
        <span className="tag">
          <Trophy size={14} />
          {t("navEvents")}
        </span>
        <Status value={event.state} />
      </div>
      <h3>{event.title}</h3>
      <p className="panel-description">{event.description}</p>
      <dl className="event-management-facts">
        <div>
          <dt>{t("p2PrizePool")}</dt>
          <dd>
            {minorMoney(event.fundedMinor, locale)} / {minorMoney(event.prizeBudgetMinor, locale)}
          </dd>
        </div>
        <div>
          <dt>{t("p2PrizeFunding")}</dt>
          <dd>
            <Status value={event.fundingState} />
          </dd>
        </div>
        <div>
          <dt>{t("ends")}</dt>
          <dd>{new Date(event.endAt).toLocaleString(locale)}</dd>
        </div>
      </dl>
      {event.reviewReason && <p className="field-hint">{event.reviewReason}</p>}
      <Link className="text-link" href={`/events/${event.slug}`}>
        {t("eventLink")}
        <ArrowUpRight size={15} />
      </Link>
      {!["SETTLED", "CANCELLED", "REJECTED"].includes(event.state) && (
        <>
          <label className="field">
            <span>{t("reason")}</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={10}
              maxLength={500}
            />
          </label>
          <div className="form-actions">
            {remaining > 0n &&
              event.sponsorId === data?.user.id &&
              ["DRAFT", "PENDING_REVIEW", "APPROVED"].includes(event.state) && (
                <button className="button button-small" disabled={action.busy} onClick={fund}>
                  {t("p2FundPrize")}
                </button>
              )}
            {event.state === "DRAFT" && (
              <button
                className="button button-small"
                onClick={() => transition("SUBMIT")}
                disabled={action.busy || reason.length < 10}
              >
                {t("submitReview")}
              </button>
            )}
            {["APPROVED", "PAUSED"].includes(event.state) && (
              <button
                className="button button-small"
                onClick={() => transition("ACTIVATE")}
                disabled={action.busy || reason.length < 10}
              >
                {t("p2ActivateEvent")}
              </button>
            )}
            {event.state === "ACTIVE" && (
              <button
                className="button button-small button-secondary"
                onClick={() => transition("PAUSE")}
                disabled={action.busy || reason.length < 10}
              >
                {t("p2PauseEvent")}
              </button>
            )}
            {["ACTIVE", "PAUSED", "APPROVED"].includes(event.state) && (
              <button
                className="button button-small button-secondary"
                onClick={() => transition("COMPLETE")}
                disabled={action.busy || reason.length < 10 || new Date(event.endAt) > new Date()}
              >
                {t("p2CompleteEvent")}
              </button>
            )}
            {["DRAFT", "PENDING_REVIEW", "APPROVED", "ACTIVE", "PAUSED"].includes(event.state) && (
              <button
                className="button button-small button-danger"
                onClick={() => transition("CANCEL")}
                disabled={action.busy || reason.length < 10}
              >
                {t("p2CancelEvent")}
              </button>
            )}
          </div>
        </>
      )}
      {action.notice && <Notice message={action.notice} error={action.failed} />}
    </article>
  );
}
export function EventStudio() {
  const { t, locale } = useLocale();
  const { data, reload: reloadDashboard } = useDashboard();
  const result = useResource<{ events: ManagedEvent[]; availableMinor?: string }>("/events/manage");
  const [creating, setCreating] = useState(false);
  const funds = useResource<{ availableMinor: string; development: boolean }>("/payments/account");
  async function reload() {
    await Promise.all([result.reload(), funds.reload(), reloadDashboard()]);
  }
  const events = result.data?.events ?? [];
  const total = events.reduce((sum, e) => sum + BigInt(e.fundedMinor || 0), 0n);
  return (
    <>
      <PageTitle title={t("p2EventStudio")} description={t("p2EventStudioIntro")}>
        <button className="button button-small" onClick={() => setCreating(!creating)}>
          {t(creating ? "close" : "p2CreateEvent")}
          <Plus size={16} />
        </button>
      </PageTitle>
      <div className="stats-grid">
        <Stat label={t("navEvents")} value={events.length} icon={<CalendarDays />} />
        <Stat label={t("p2PrizePool")} value={minorMoney(total, locale)} icon={<Trophy />} />
        {data?.user.roles.includes("ADVERTISER") && (
          <Stat
            label={t("p2AvailableFunds")}
            value={minorMoney(funds.data?.availableMinor || "0", locale)}
            icon={<Wallet />}
          />
        )}
      </div>
      {creating && (
        <EventCreation
          onCreated={() => {
            setCreating(false);
            void reload();
          }}
        />
      )}
      {data?.user.roles.includes("ADVERTISER") && funds.data?.development && (
        <DevelopmentDeposit onFunded={() => void reload()} />
      )}
      <div className="managed-events-grid">
        {result.loading ? (
          <Loading />
        ) : result.error ? (
          <Notice error message={t("unavailable")} />
        ) : events.length ? (
          events.map((event) => <ManagedEventCard key={event.id} event={event} reload={reload} />)
        ) : (
          <Empty>{t("noEvents")}</Empty>
        )}
      </div>
      <p className="field-hint">{t("p2SettlementNote")}</p>
      <Eyebrow>{t("independentNature")}</Eyebrow>
    </>
  );
}
