"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import {
  ShieldCheck,
  Layers3,
  CircleDollarSign,
  Wallet,
  Activity as ActivityIcon,
} from "lucide-react";
import { useLocale } from "@/i18n/provider";
import { api, minorMoney } from "@/lib/api";
import { useResource, useAction } from "@/lib/hooks";
import { type Campaign, type Activity, type User } from "@/lib/types";
import { PageTitle, Stat } from "./workspace-ui";
import { Loading, Notice, Empty, Status } from "./ui";
import { Pass02Admin } from "./admin-pass02";
interface AdminData {
  campaigns: Campaign[];
  activities: (Activity & { evidence?: string })[];
  validatedActivities?: (Activity & { evidence?: string })[];
  users: User[];
  distributions: { id: string; state: string; startAt: string; endAt: string }[];
  auditLogs: { id: string; action: string; targetId: string; createdAt: string }[];
  rules: { id: string; version: string; config: unknown } | null;
  profitability: {
    retainedRevenueMinor: string;
    grossValidatedRevenueMinor: string;
    eventPrizeLiabilitiesMinor: string;
    advertiserAvailableMinor: string;
    distributionPoolMinor: string;
    userLiabilitiesMinor: string;
    campaignLiabilitiesMinor: string;
    targetOperatingProfitMinor: string;
    isDemo: boolean;
  };
}
interface AdminSecurityStatus {
  mfaEnabled: boolean;
  currentSessionId: string;
  sessions: { id: string; mfaVerifiedAt: string | null }[];
}
function ReviewCard({
  item,
  kind,
  reload,
}: {
  item: Campaign | Activity;
  kind: "campaigns" | "activities";
  reload: () => Promise<void>;
}) {
  const { t } = useLocale();
  const action = useAction();
  const [reason, setReason] = useState("");
  const [verified, setVerified] = useState(false);
  const activity = item as Activity & { evidence?: string };
  async function review(decision: string) {
    const result = await action.run(
      () =>
        api(`/admin/${kind}/${item.id}/review`, {
          decision,
          reason,
          ...(kind === "activities" ? { evidenceVerified: verified } : {}),
        }),
      t("reviewed"),
    );
    if (result) await reload();
  }
  return (
    <article className="review-card">
      <div className="panel-header">
        <h4>{kind === "campaigns" ? (item as Campaign).name : activity.campaign.name}</h4>
        <Status value={item.state} />
      </div>
      {kind === "activities" && (
        <>
          <p>{activity.user?.displayName}</p>
          {activity.evidence && <p className="review-evidence">{activity.evidence}</p>}
        </>
      )}
      <label className="field">
        {t("reason")}
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={10}
          maxLength={500}
        />
      </label>
      {kind === "activities" && (
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={verified}
            onChange={(e) => setVerified(e.target.checked)}
          />
          {t("evidenceVerified")}
        </label>
      )}
      <div className="form-actions">
        <button
          className="button"
          disabled={action.busy || reason.trim().length < 10}
          onClick={() => review(kind === "campaigns" ? "APPROVE" : "VALIDATE")}
        >
          {t(kind === "campaigns" ? "approve" : "validate")}
        </button>
        <button
          className="button button-danger"
          disabled={action.busy || reason.trim().length < 10}
          onClick={() => review("REJECT")}
        >
          {t("reject")}
        </button>
      </div>
      {action.notice && <Notice message={action.notice} error={action.failed} />}
    </article>
  );
}
function ReversalCard({
  activity,
  reload,
}: {
  activity: Activity & { evidence?: string };
  reload: () => Promise<void>;
}) {
  const { t, locale } = useLocale();
  const action = useAction();
  const [reason, setReason] = useState("");
  async function reverse() {
    const result = await action.run(
      () => api(`/admin/activities/${activity.id}/reverse`, { reason }),
      t("p2ActivityReversed"),
    );
    if (result) {
      setReason("");
      await reload();
    }
  }
  return (
    <article className="review-card">
      <div className="panel-header">
        <h4>{activity.campaign.name}</h4>
        <Status value={activity.state} />
      </div>
      <p>
        {activity.user?.displayName}
        {activity.user?.handle ? ` (@${activity.user.handle})` : ""} ·{" "}
        {new Date(activity.validatedAt || activity.createdAt).toLocaleString(locale)}
      </p>
      <label className="field">
        {t("reason")}
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={10}
          maxLength={500}
        />
      </label>
      <div className="form-actions">
        <button
          className="button button-danger button-small"
          disabled={action.busy || reason.trim().length < 10}
          onClick={reverse}
        >
          {t(action.busy ? "working" : "p2ReverseActivity")}
        </button>
      </div>
      {action.notice && <Notice message={action.notice} error={action.failed} />}
    </article>
  );
}
function DistributionPanel({ reload }: { reload: () => Promise<void> }) {
  const { t, locale } = useLocale();
  const action = useAction();
  const [preview, setPreview] = useState<{
    distribution: { id: string };
    preview: {
      distributedMinor: string;
      marginDecision: {
        grossEligibleRevenueMinor?: string;
        requiredRetainedMinor?: string;
        status?: string;
        reasons?: string[];
      };
      allocations: { userId: string; category?: string; amountMinor: string }[];
    };
  } | null>(null);
  const key = useRef<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const result = await action.run(() =>
      api<NonNullable<typeof preview>>("/admin/distributions/preview", {
        startAt: new Date(String(f.get("startAt"))).toISOString(),
        endAt: new Date(String(f.get("endAt"))).toISOString(),
      }),
    );
    if (result) {
      setPreview(result);
      key.current = null;
    }
  }
  async function finalize() {
    if (!preview) return;
    key.current ??= crypto.randomUUID();
    const result = await action.run(
      () =>
        api("/admin/distributions/finalize", {
          previewId: preview.distribution.id,
          idempotencyKey: key.current,
        }),
      t("operationComplete"),
    );
    if (result) {
      setPreview(null);
      await reload();
    }
  }
  const eligibleMinor = preview?.preview.marginDecision.grossEligibleRevenueMinor;
  const retainedMinor =
    eligibleMinor !== undefined && preview
      ? (BigInt(eligibleMinor) - BigInt(preview.preview.distributedMinor)).toString()
      : (preview?.preview.marginDecision.requiredRetainedMinor ?? "0");
  return (
    <section className="panel admin-section">
      <div className="panel-header">
        <h3>{t("distribution")}</h3>
        <Layers3 size={20} />
      </div>
      <p className="panel-description">{t("distributionNote")}</p>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="field">
            {t("periodStart")}
            <input name="startAt" type="datetime-local" required />
          </label>
          <label className="field">
            {t("periodEnd")}
            <input name="endAt" type="datetime-local" required />
          </label>
        </div>
        <div className="form-actions">
          <button className="button button-secondary" disabled={action.busy}>
            {t(action.busy ? "working" : "previewDistribution")}
          </button>
        </div>
      </form>
      {preview && (
        <div className="admin-section">
          <h3>{t("distributionPreview")}</h3>
          <div className="campaign-facts">
            <p>
              {t("pool")} <strong>{minorMoney(preview.preview.distributedMinor, locale)}</strong>
            </p>
          </div>
          <dl className="dist-summary-grid">
            {eligibleMinor !== undefined && (
              <div>
                <dt>{t("p2EligibleRevenue")}</dt>
                <dd>{minorMoney(eligibleMinor, locale)}</dd>
              </div>
            )}
            <div>
              <dt>{t("p2RetainedMargin")}</dt>
              <dd>{minorMoney(retainedMinor, locale)}</dd>
            </div>
            {preview.preview.marginDecision.status && (
              <div>
                <dt>{t("p2MarginDecision")}</dt>
                <dd>{preview.preview.marginDecision.status}</dd>
              </div>
            )}
            <div>
              <dt>{t("p2AllocationsCount")}</dt>
              <dd>{preview.preview.allocations.length}</dd>
            </div>
          </dl>
          {preview.preview.allocations.length > 0 && (
            <div className="table-scroll" style={{ marginBottom: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>{t("p2ParticipantId")}</th>
                    <th>{t("type")}</th>
                    <th>{t("amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.allocations.map((row, idx) => (
                    <tr key={`${row.userId}-${row.category ?? idx}`}>
                      <td>{row.userId}</td>
                      <td>
                        {row.category ? t(`cat${row.category}` as "catUSER") || row.category : "—"}
                      </td>
                      <td className="number">{minorMoney(row.amountMinor, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="field-hint">{t("p2RawSnapshot")}</p>
          <pre className="data-json">{JSON.stringify(preview.preview, null, 2)}</pre>
          <button className="button" disabled={action.busy} onClick={finalize}>
            {t("finalizeDistribution")}
          </button>
        </div>
      )}
      {action.notice && <Notice message={action.notice} error={action.failed} />}
    </section>
  );
}
function ConfigurationPanel({
  rules,
  reload,
}: {
  rules: AdminData["rules"];
  reload: () => Promise<void>;
}) {
  const { t } = useLocale();
  const action = useAction();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const result = await action.run(
      () =>
        api("/admin/rules", {
          version: f.get("version"),
          reason: f.get("reason"),
          config: JSON.parse(String(f.get("config"))),
        }),
      t("operationComplete"),
    );
    if (result) await reload();
  }
  return (
    <section className="panel admin-section">
      <h3>{t("configuration")}</h3>
      <p className="panel-description">{t("versionedRules")}</p>
      <details>
        <summary className="text-link">{rules?.version || t("configuration")}</summary>
        <form onSubmit={submit} className="form-stack" style={{ marginTop: 20 }}>
          <label className="field">
            {t("ruleVersion")}
            <input name="version" required minLength={3} maxLength={80} />
          </label>
          <label className="field">
            {t("configuration")}
            <textarea
              className="data-json"
              name="config"
              defaultValue={JSON.stringify(rules?.config || {}, null, 2)}
              rows={18}
              required
              spellCheck={false}
            />
          </label>
          <label className="field">
            {t("reason")}
            <input name="reason" minLength={10} maxLength={500} required />
          </label>
          <div>
            <button className="button" disabled={action.busy}>
              {t(action.busy ? "working" : "continue")}
            </button>
          </div>
        </form>
      </details>
      {action.notice && <Notice message={action.notice} error={action.failed} />}
    </section>
  );
}
function HoldControl({ user, reload }: { user: User; reload: () => Promise<void> }) {
  const { t } = useLocale();
  const [reason, setReason] = useState("");
  const [suspended, setSuspended] = useState(Boolean(user.suspended));
  const action = useAction();
  async function update(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = await action.run(
      () =>
        api(`/admin/users/${user.id}/hold`, {
          economicHold: !user.economicHold,
          suspended,
          reason,
        }),
      t("operationComplete"),
    );
    if (result) {
      setReason("");
      await reload();
    }
  }
  return (
    <div className="review-card">
      <div className="panel-header">
        <h4>{user.displayName}</h4>
        {user.suspended && <span className="tag">{t("p2SuspendedBadge")}</span>}
      </div>
      <p>
        @{user.handle} · {user.roles.join(" / ")}
      </p>
      <form onSubmit={update} className="form-stack">
        <label className="field">
          {t("reason")}
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            minLength={10}
            maxLength={500}
            required
          />
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={suspended}
            onChange={(e) => setSuspended(e.target.checked)}
          />
          {t("p2SuspendAccount")}
        </label>
        <button className="button button-secondary button-small" disabled={action.busy}>
          {t(user.economicHold ? "releaseHold" : "hold")}
        </button>
      </form>
      {action.notice && <Notice message={action.notice} error={action.failed} />}
    </div>
  );
}
export function AdminScreen() {
  const { t, locale } = useLocale();
  const result = useResource<AdminData>("/admin");
  const sec = useResource<AdminSecurityStatus>("/security");
  const [auditQuery, setAuditQuery] = useState("");
  const [renderedAt] = useState(() => Date.now());
  if (result.loading) return <Loading />;
  if (result.error || !result.data) return <Notice error message={t("unavailable")} />;
  const d = result.data;
  const currentSession = sec.data?.sessions.find((s) => s.id === sec.data?.currentSessionId);
  const mfaFresh = Boolean(
    currentSession?.mfaVerifiedAt &&
    renderedAt - new Date(currentSession.mfaVerifiedAt).getTime() <= 15 * 60_000,
  );
  const needle = auditQuery.trim().toLowerCase();
  const filteredLogs = needle
    ? d.auditLogs.filter(
        (log) =>
          log.action.toLowerCase().includes(needle) || log.targetId.toLowerCase().includes(needle),
      )
    : d.auditLogs;
  return (
    <>
      <PageTitle title={t("admin")} description={t("adminIntro")} />
      {sec.data && (
        <div className={`panel mfa-status-banner ${mfaFresh ? "mfa-fresh" : "mfa-stale"}`}>
          <div>
            <strong>{t(mfaFresh ? "p2MfaStatusFresh" : "p2MfaStatusRequired")}</strong>
          </div>
          <Link className="button button-small button-secondary" href="/app/security">
            {t("p2StepUp")}
          </Link>
        </div>
      )}
      <div className="stats-grid">
        <Stat
          label={t("retained")}
          value={minorMoney(d.profitability.retainedRevenueMinor, locale)}
          hint="EUR"
          icon={<CircleDollarSign />}
        />
        <Stat
          label={t("userLiabilities")}
          value={minorMoney(d.profitability.userLiabilitiesMinor, locale)}
          hint={t("balance")}
          icon={<Wallet />}
        />
        <Stat label={t("campaignReviews")} value={d.campaigns.length} icon={<ShieldCheck />} />
        <Stat label={t("activityReviews")} value={d.activities.length} icon={<ActivityIcon />} />
      </div>
      <div className="stats-grid">
        <Stat
          label={t("p2GrossRevenue")}
          value={minorMoney(d.profitability.grossValidatedRevenueMinor, locale)}
        />
        <Stat
          label={t("p2PrizeLiability")}
          value={minorMoney(d.profitability.eventPrizeLiabilitiesMinor, locale)}
        />
        <Stat
          label={t("p2AvailableFunds")}
          value={minorMoney(d.profitability.advertiserAvailableMinor, locale)}
        />
        <Stat
          label={t("p2PoolLiability")}
          value={minorMoney(d.profitability.distributionPoolMinor, locale)}
        />
      </div>
      <div className="admin-grid">
        <section className="panel">
          <div className="panel-header">
            <h3>{t("campaignReviews")}</h3>
          </div>
          <div className="list-stack">
            {d.campaigns.length ? (
              d.campaigns.map((item) => (
                <ReviewCard key={item.id} item={item} kind="campaigns" reload={result.reload} />
              ))
            ) : (
              <Empty />
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <h3>{t("activityReviews")}</h3>
          </div>
          <div className="list-stack">
            {d.activities.length ? (
              d.activities.map((item) => (
                <ReviewCard key={item.id} item={item} kind="activities" reload={result.reload} />
              ))
            ) : (
              <Empty />
            )}
          </div>
        </section>
      </div>
      {d.validatedActivities && d.validatedActivities.length > 0 && (
        <section className="panel admin-section">
          <div className="panel-header">
            <h3>{t("p2ValidatedActivities")}</h3>
          </div>
          <details>
            <summary>{d.validatedActivities.length}</summary>
            <div className="admin-grid" style={{ marginTop: 20 }}>
              {d.validatedActivities.map((item) => (
                <ReversalCard key={item.id} activity={item} reload={result.reload} />
              ))}
            </div>
          </details>
        </section>
      )}
      <DistributionPanel reload={result.reload} />
      <ConfigurationPanel key={d.rules?.id} rules={d.rules} reload={result.reload} />
      <section className="panel admin-section">
        <div className="panel-header">
          <h3>{t("risk")}</h3>
        </div>
        <details>
          <summary>{t("hold")}</summary>
          <div className="admin-grid" style={{ marginTop: 20 }}>
            {d.users.map((user) => (
              <HoldControl key={user.id} user={user} reload={result.reload} />
            ))}
          </div>
        </details>
      </section>
      <section className="panel admin-section">
        <div className="panel-header">
          <h3>{t("audit")}</h3>
        </div>
        <label className="field audit-filter">
          {t("p2AuditFilter")}
          <input
            value={auditQuery}
            onChange={(e) => setAuditQuery(e.target.value)}
            maxLength={120}
          />
        </label>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("activity")}</th>
                <th>{t("date")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.slice(0, 20).map((log) => (
                <tr key={log.id}>
                  <td>
                    <strong>{log.action}</strong>
                    <small>{log.targetId}</small>
                  </td>
                  <td>{new Date(log.createdAt).toLocaleString(locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Pass02Admin />
    </>
  );
}
