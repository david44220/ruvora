"use client";
import { useRef, useState, type FormEvent } from "react";
import { Plus, ArrowUpRight, Layers3, Aperture, CircleDollarSign, Check } from "lucide-react";
import Link from "next/link";
import { useLocale } from "@/i18n/provider";
import { type MessageKey } from "@/i18n/messages";
import { api, minorMoney, ruNumber } from "@/lib/api";
import { useAction, useResource } from "@/lib/hooks";
import { type Campaign, type Dashboard } from "@/lib/types";
import { Notice, Status, Empty, Loading } from "./ui";
import { PageTitle, Stat } from "./workspace-ui";
import { useDashboard } from "./app-context";
export function CampaignForm({ onCreated }: { onCreated: () => void }) {
  const { t } = useLocale();
  const action = useAction();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const result = await action.run(
      () =>
        api("/campaigns", {
          name: f.get("name"),
          objective: f.get("objective"),
          destinationUrl: f.get("destinationUrl"),
          budgetMinor: f.get("budgetMinor"),
          dailyBudgetMinor: f.get("dailyBudgetMinor"),
          unitCostMinor: f.get("unitCostMinor"),
          startAt: new Date(String(f.get("startAt"))).toISOString(),
          endAt: new Date(String(f.get("endAt"))).toISOString(),
        }),
      t("campaignCreated"),
    );
    if (result) onCreated();
  }
  return (
    <section className="panel" style={{ marginBottom: 25 }}>
      <div className="panel-header">
        <h3>{t("createCampaign")}</h3>
      </div>
      <form onSubmit={submit} className="form-stack">
        <div className="form-grid">
          <label className="field">
            {t("campaignName")}
            <input name="name" minLength={3} maxLength={80} required />
          </label>
          <label className="field">
            {t("objective")}
            <select name="objective">
              {(["CLICK", "QUALIFIED_VIEW", "CONVERSION", "SPONSORED_MISSION"] as const).map(
                (type) => (
                  <option value={type} key={type}>
                    {t(`objective${type}`)}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="field full-width">
            {t("destination")}
            <input name="destinationUrl" type="url" required pattern="https://.*" />
          </label>
          <label className="field">
            {t("budget")}
            <input name="budgetMinor" type="number" min="1" step="1" required />
          </label>
          <label className="field">
            {t("dailyBudget")}
            <input name="dailyBudgetMinor" type="number" min="1" step="1" required />
          </label>
          <label className="field">
            {t("unitCost")}
            <input name="unitCostMinor" type="number" min="1" step="1" required />
          </label>
          <span />
          <label className="field">
            {t("startDate")}
            <input name="startAt" type="datetime-local" required />
          </label>
          <label className="field">
            {t("endDate")}
            <input name="endAt" type="datetime-local" required />
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
function CampaignCard({
  campaign,
  fundingEnabled,
  reload,
}: {
  campaign: Campaign;
  fundingEnabled: boolean;
  reload: () => Promise<void>;
}) {
  const { t, locale } = useLocale();
  const action = useAction();
  const key = useRef<string | null>(null);
  const funded = BigInt(campaign.remainingMinor || 0) > 0n;
  async function fund() {
    key.current ??= crypto.randomUUID();
    const result = await action.run(
      () =>
        api(`/campaigns/${campaign.id}/fund`, {
          amountMinor: campaign.budgetMinor,
          idempotencyKey: key.current,
        }),
      t("campaignFunded"),
    );
    if (result) await reload();
  }
  async function review() {
    const result = await action.run(
      () => api(`/campaigns/${campaign.id}/submit`, {}),
      t("campaignSubmitted"),
    );
    if (result) await reload();
  }
  return (
    <article className="campaign-card">
      <div className="panel-header">
        <span className="tag">
          {t(`objective${campaign.objective}` as MessageKey) || campaign.objective}
        </span>
        <Status value={campaign.state} />
      </div>
      <h3>{campaign.name}</h3>
      <a
        className="text-link"
        href={campaign.destinationUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t("visitDestination")}
        <ArrowUpRight size={15} />
      </a>
      <div className="campaign-facts">
        <div>
          <small>{t("totalBudget")}</small>
          <strong>{minorMoney(campaign.budgetMinor, locale)}</strong>
        </div>
        <div>
          <small>{t("validatedCount")}</small>
          <strong>{campaign.validatedCount || 0}</strong>
        </div>
      </div>
      {campaign.isDemo && (
        <p className="field-hint" style={{ marginTop: 17 }}>
          {t("demoFundsNote")}
        </p>
      )}
      {["DRAFT", "REJECTED"].includes(campaign.state) && (
        <div className="form-actions">
          {!funded && fundingEnabled && (
            <button className="button button-secondary" onClick={fund} disabled={action.busy}>
              {t(action.busy ? "working" : "fundDemo")}
            </button>
          )}
          {funded && (
            <button className="button" onClick={review} disabled={action.busy}>
              {t(action.busy ? "working" : "submitReview")}
            </button>
          )}
          {!funded && !fundingEnabled && (
            <p className="field-hint">{t("campaignFundingUnavailable")}</p>
          )}
        </div>
      )}
      {action.notice && <Notice message={action.notice} error={action.failed} />}
    </article>
  );
}
export function AdvertiserScreen({
  data,
  reload,
}: {
  data: Dashboard;
  reload: () => Promise<void>;
}) {
  const { t, locale } = useLocale();
  const [creating, setCreating] = useState(false);
  const ru = data.rewardUnits
    .filter((r) => r.category === "ADVERTISER" && r.state === "VALIDATED")
    .reduce((sum, r) => sum + BigInt(r._sum.amountMicros), 0n);
  return (
    <>
      <PageTitle title={t("campaignManager")} description={t("advertiserIntro")}>
        <button className="button button-small" onClick={() => setCreating(!creating)}>
          {t(creating ? "close" : "createCampaign")}
          <Plus size={16} />
        </button>
      </PageTitle>
      <div className="stats-grid advertiser-stats">
        <Stat label={t("campaigns")} value={data.campaigns.length} icon={<Aperture />} />
        <Stat
          label={t("advertiserRU")}
          value={ruNumber(ru, locale)}
          hint={t("noCashValue")}
          icon={<Layers3 />}
        />
        <Stat
          label={t("balance")}
          value={minorMoney(data.summary.moneyMinor, locale)}
          hint="EUR"
          icon={<CircleDollarSign />}
        />
        <Stat
          label={t("activity")}
          value={data.campaigns.reduce((sum, c) => sum + (c.validatedCount || 0), 0)}
          hint={t("statusVALIDATED")}
          icon={<Check />}
        />
      </div>
      {creating && (
        <CampaignForm
          onCreated={() => {
            setCreating(false);
            void reload();
          }}
        />
      )}
      {!data.campaigns.length ? (
        <Empty>{t("noRecords")}</Empty>
      ) : (
        <div className="campaign-grid">
          {data.campaigns.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              fundingEnabled={data.fundingEnabled}
              reload={reload}
            />
          ))}
        </div>
      )}
    </>
  );
}
function Opportunity({ campaign }: { campaign: Campaign }) {
  const { t } = useLocale();
  const { data, reload } = useDashboard();
  const action = useAction();
  const [submitted, setSubmitted] = useState(false);
  const key = useRef<string | null>(null);
  const joined = campaign.eventId && data?.events.some((e) => e.id === campaign.eventId);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    key.current ??= crypto.randomUUID();
    const f = new FormData(e.currentTarget);
    const evidence = String(f.get("evidence") || "");
    const result = await action.run(
      () =>
        api("/activities", {
          campaignId: campaign.id,
          type: campaign.objective,
          idempotencyKey: key.current,
          ...(joined ? { eventId: campaign.eventId } : {}),
          ...(evidence ? { evidence } : {}),
        }),
      t("submitted"),
    );
    if (result) {
      setSubmitted(true);
      await reload();
    }
  }
  return (
    <article className="campaign-card">
      <div className="panel-header">
        <span className="tag">
          <Check size={12} />
          {t("verified")}
        </span>
        <Status value={campaign.state} />
      </div>
      <h3>{campaign.name}</h3>
      <p className="panel-description">
        {t(`objective${campaign.objective}` as MessageKey) || campaign.objective}
      </p>
      <a
        className="text-link"
        href={campaign.destinationUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t("visitDestination")}
        <ArrowUpRight size={16} />
      </a>
      <form onSubmit={submit} className="form-stack" style={{ marginTop: 20 }}>
        <label className="field">
          {t("evidence")}
          <textarea
            name="evidence"
            minLength={10}
            maxLength={1000}
            required={campaign.objective === "CONVERSION"}
            disabled={submitted}
          />
        </label>
        <p className="field-hint">{t("activityDisclaimer")}</p>
        <button
          className="button button-small button-secondary"
          disabled={action.busy || submitted}
        >
          {t(action.busy ? "working" : submitted ? "statusPENDING_VALIDATION" : "participate")}
        </button>
      </form>
      {action.notice && <Notice message={action.notice} error={action.failed} />}
    </article>
  );
}
export function OpportunitiesScreen() {
  const { t } = useLocale();
  const result = useResource<{ campaigns: Campaign[] }>("/campaigns");
  const eligible = result.data?.campaigns.filter((c) => c.canParticipate === true) || [];
  return (
    <>
      <PageTitle title={t("opportunities")} description={t("activityDisclaimer")} />
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <Notice error message={t("unavailable")} />
      ) : !eligible.length ? (
        <Empty>{t("noOpportunities")}</Empty>
      ) : (
        <div className="campaign-grid">
          {eligible.map((c) => (
            <Opportunity key={c.id} campaign={c} />
          ))}
        </div>
      )}
      <div className="form-actions">
        <Link className="text-link" href="/app/events">
          {t("eventLink")}
          <ArrowUpRight size={16} />
        </Link>
      </div>
    </>
  );
}
