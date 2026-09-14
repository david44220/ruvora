"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useLocale } from "@/i18n/provider";
import { api, minorMoney } from "@/lib/api";
import { useAction, useResource } from "@/lib/hooks";
import { Notice, Loading, Empty, Status } from "./ui";
import type { ManagedEvent } from "./event-studio";
import { AdminGrowth } from "./growth";
interface SettlementPreview {
  settlement: { id: string; fingerprint: string; ruleVersion: string };
  preview: {
    awardedMinor: string;
    refundMinor: string;
    fundedMinor: string;
    allocations: { userId: string; rank: number; amountMinor: string }[];
    ranking: { userId: string; rank: number; points: number }[];
  };
}
interface Approval {
  id: string;
  requesterId: string;
  approverId: string | null;
  operation: string;
  targetId: string;
  payload: unknown;
  ruleVersion: string;
  reason: string;
  state: string;
  expiresAt: string;
}
function AdminEvent({ event, reload }: { event: ManagedEvent; reload: () => Promise<void> }) {
  const { t, locale } = useLocale();
  const action = useAction();
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [approvalId, setApprovalId] = useState("");
  const [userId, setUserId] = useState("");
  const key = useRef<string | null>(null);
  async function review(decision: string) {
    const result = await action.run(
      () => api(`/admin/events/${event.id}/review`, { decision, reason }),
      t("reviewed"),
    );
    if (result) await reload();
  }
  async function freeze() {
    const result = await action.run(() =>
      api<SettlementPreview>(`/admin/events/${event.id}/preview`, {}),
    );
    if (result) {
      setPreview(result);
      key.current = null;
      await reload();
    }
  }
  async function request() {
    if (!preview) return;
    const result = await action.run(
      () =>
        api<{ approval: Approval }>("/admin/approvals", {
          operation: "EVENT_SETTLEMENT",
          targetId: event.id,
          payload: {
            previewId: preview.settlement.id,
            fingerprint: preview.settlement.fingerprint,
          },
          ruleVersion: preview.settlement.ruleVersion,
          reason,
        }),
      t("p2ApprovalRequested"),
    );
    if (result) setApprovalId(result.approval.id);
  }
  async function settle() {
    if (!preview) return;
    key.current ??= crypto.randomUUID();
    const result = await action.run(
      () =>
        api(`/admin/events/${event.id}/settle`, {
          previewId: preview.settlement.id,
          idempotencyKey: key.current,
          approvalId,
        }),
      t("p2EventUpdated"),
    );
    if (result) await reload();
  }
  return (
    <article className="panel admin-event-card">
      <div className="panel-header">
        <h3>
          <Link href={`/events/${event.slug}`}>{event.title}</Link>
        </h3>
        <Status value={event.state} />
      </div>
      <div className="campaign-facts">
        <div>
          <small>{t("p2PrizePool")}</small>
          <strong>{minorMoney(event.fundedMinor, locale)}</strong>
        </div>
        <div>
          <small>{t("p2RulesVersion")}</small>
          <strong>{event.configVersion}</strong>
        </div>
      </div>
      <p className="panel-description">{event.description}</p>
      <label className="field">
        {t("reason")}
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={10}
          maxLength={500}
        />
      </label>
      <div className="form-actions">
        {event.state === "PENDING_REVIEW" && (
          <>
            <button
              className="button button-small"
              disabled={action.busy || reason.trim().length < 10}
              onClick={() => review("APPROVE")}
            >
              {t("approve")}
            </button>
            <button
              className="button button-secondary button-small"
              disabled={action.busy || reason.trim().length < 10}
              onClick={() => review("REJECT")}
            >
              {t("reject")}
            </button>
          </>
        )}
        {["COMPLETED", "SETTLING"].includes(event.state) && (
          <button className="button button-small" onClick={freeze} disabled={action.busy}>
            {t("p2PreviewSettlement")}
          </button>
        )}
      </div>
      {preview && (
        <div className="settlement-preview">
          <h4>{t("p2SettlementPreview")}</h4>
          <div className="allocation-list">
            {preview.preview.allocations.map((row) => (
              <div key={row.userId}>
                <span>
                  #{row.rank}
                  <small>{row.userId}</small>
                </span>
                <strong>{minorMoney(row.amountMinor, locale)}</strong>
              </div>
            ))}
            <div>
              <span>{t("p2ReturnedFunds")}</span>
              <strong>{minorMoney(preview.preview.refundMinor, locale)}</strong>
            </div>
          </div>
          <p className="field-hint">{t("p2ApprovalIntro")}</p>
          <button
            className="button button-secondary button-small"
            disabled={action.busy || reason.trim().length < 10}
            onClick={request}
          >
            {t("p2RequestApproval")}
          </button>
          <label className="field">
            {t("p2ApprovalId")}
            <input value={approvalId} onChange={(e) => setApprovalId(e.target.value)} />
          </label>
          <button
            className="button button-small"
            disabled={action.busy || !approvalId}
            onClick={settle}
          >
            {t("p2FinalizeSettlement")}
          </button>
        </div>
      )}
      {["ACTIVE", "PAUSED", "COMPLETED"].includes(event.state) && (
        <details className="admin-section">
          <summary>{t("p2Disqualify")}</summary>
          <label className="field">
            {t("p2ParticipantId")}
            <input value={userId} onChange={(e) => setUserId(e.target.value)} />
          </label>
          <button
            className="button button-danger button-small"
            disabled={action.busy || !userId || reason.trim().length < 10}
            onClick={() =>
              action.run(
                () => api(`/admin/events/${event.id}/disqualify`, { userId, reason }),
                t("reviewed"),
              )
            }
          >
            {t("p2Disqualify")}
          </button>
        </details>
      )}
      {action.notice && <Notice message={action.notice} error={action.failed} />}
    </article>
  );
}
function ApprovalCard({ approval, reload }: { approval: Approval; reload: () => Promise<void> }) {
  const { t, locale } = useLocale();
  const action = useAction();
  const [reason, setReason] = useState("");
  async function review(decision: "APPROVED" | "REJECTED") {
    const result = await action.run(
      () => api(`/admin/approvals/${approval.id}/review`, { decision, reason }),
      t(decision === "APPROVED" ? "p2ApprovalApproved" : "p2ApprovalRejected"),
    );
    if (result) await reload();
  }
  return (
    <article className="panel approval-card">
      <div className="panel-header">
        <h4>
          {t("p2ApprovalType")}: {approval.operation}
        </h4>
        <Status value={approval.state} />
      </div>
      <p>{approval.reason}</p>
      <dl>
        <dt>{t("p2ApprovalId")}</dt>
        <dd>{approval.id}</dd>
        <dt>{t("p2RulesVersion")}</dt>
        <dd>{approval.ruleVersion}</dd>
        <dt>{t("ends")}</dt>
        <dd>{new Date(approval.expiresAt).toLocaleString(locale)}</dd>
      </dl>
      <details>
        <summary>{t("p2ApprovalPayload")}</summary>
        <pre>{JSON.stringify(approval.payload, null, 2)}</pre>
      </details>
      {approval.state === "REQUESTED" && (
        <>
          <label className="field">
            {t("p2ApprovalReason")}
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={10}
              maxLength={500}
            />
          </label>
          <div className="form-actions">
            <button
              className="button button-small"
              onClick={() => review("APPROVED")}
              disabled={action.busy || reason.trim().length < 10}
            >
              {t("p2ApproveRequest")}
            </button>
            <button
              className="button button-secondary button-small"
              onClick={() => review("REJECTED")}
              disabled={action.busy || reason.trim().length < 10}
            >
              {t("p2RejectRequest")}
            </button>
          </div>
        </>
      )}
      {action.notice && <Notice message={action.notice} error={action.failed} />}
    </article>
  );
}
export function Pass02Admin() {
  const { t } = useLocale();
  const events = useResource<{ events: ManagedEvent[] }>("/events/manage");
  const approvals = useResource<{ approvals: Approval[] }>("/admin/approvals");
  const callbacks = useResource<{
    webhooks: {
      id: string;
      provider: string;
      externalId: string;
      eventType: string;
      status: string;
      attempts: number;
      lastErrorCode: string | null;
    }[];
  }>("/admin/webhooks");
  const action = useAction();
  const [reason, setReason] = useState("");
  return (
    <>
      <section className="panel admin-section">
        <h2>{t("p2StepUp")}</h2>
        <p className="panel-description">{t("p2StepUpIntro")}</p>
        <Link className="button button-small" href="/app/security">
          {t("p2AccountSecurity")}
        </Link>
      </section>
      <section className="admin-section">
        <h2>{t("p2ManageEvents")}</h2>
        <p className="section-copy">{t("p2SettlementIntro")}</p>
        {events.loading ? (
          <Loading />
        ) : events.data?.events.length ? (
          <div className="metric-card-list">
            {events.data.events.map((event) => (
              <AdminEvent key={event.id} event={event} reload={events.reload} />
            ))}
          </div>
        ) : (
          <Empty />
        )}
      </section>
      <section className="admin-section">
        <div className="panel-header">
          <h2>{t("p2Approvals")}</h2>
          <button className="button button-small button-secondary" onClick={approvals.reload}>
            {t("retry")}
          </button>
        </div>
        <p className="section-copy">{t("p2ApprovalIntro")}</p>
        {approvals.loading ? (
          <Loading />
        ) : approvals.data?.approvals.length ? (
          <div className="metric-card-list">
            {approvals.data.approvals.map((approval) => (
              <ApprovalCard key={approval.id} approval={approval} reload={approvals.reload} />
            ))}
          </div>
        ) : (
          <Empty />
        )}
      </section>
      <AdminGrowth />
      <section className="panel admin-section">
        <h2>{t("p2ProviderInbox")}</h2>
        <p className="panel-description">{t("p2ProviderInboxIntro")}</p>
        <label className="field">
          {t("reason")}
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </label>
        {callbacks.data?.webhooks?.length ? (
          <div className="metric-card-list">
            {callbacks.data.webhooks.map((item) => (
              <article className="metric-card" key={item.id}>
                <div className="panel-header">
                  <strong>
                    {item.provider} · {item.eventType}
                  </strong>
                  <Status value={item.status} />
                </div>
                <p>{item.externalId}</p>
                <p>{item.lastErrorCode}</p>
                {["FAILED", "RETRY", "DEAD_LETTER"].includes(item.status) && (
                  <button
                    className="button button-small button-secondary"
                    disabled={action.busy || reason.trim().length < 10}
                    onClick={async () => {
                      const result = await action.run(() =>
                        api(`/admin/webhooks/${item.id}/retry`, { reason }),
                      );
                      if (result) await callbacks.reload();
                    }}
                  >
                    {t("p2RetryCallback")}
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <Empty />
        )}
        {action.notice && <Notice message={action.notice} error={action.failed} />}
      </section>
    </>
  );
}
