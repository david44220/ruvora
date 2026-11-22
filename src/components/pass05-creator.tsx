"use client";
import { useState, type ChangeEvent, type FormEvent } from "react";
import {
  ArrowUpRight,
  Code2,
  Copy,
  FileText,
  Mail,
  Scale,
  Send,
  Sparkles,
  Upload,
  Wallet,
} from "lucide-react";
import { api, minorMoney } from "@/lib/api";
import { useAction, useResource } from "@/lib/hooks";
import type { Activity, User } from "@/lib/types";
import { useLocale } from "@/i18n/provider";
import { Empty, Notice } from "./ui";

interface PayoutItem {
  id: string;
  amountMinor: string;
  currency: string;
  provider: string;
  state: string;
  destinationSummary: string;
  reviewReason: string | null;
  externalReference: string | null;
  isDemo: boolean;
  createdAt: string;
  settledAt: string | null;
}

export function WalletPayoutsAndStatementPanel({
  user,
  availableMinor,
  onPayoutCreated,
}: {
  user: User;
  availableMinor: string;
  onPayoutCreated?: () => void;
}) {
  const { t, locale } = useLocale();
  const { data, reload } = useResource<{ items: PayoutItem[]; nextCursor: string | null }>(
    "/payouts",
  );
  const action = useAction();
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [amountEur, setAmountEur] = useState("5.00");
  const [destLabel, setDestLabel] = useState("SEPA");
  const [destAccount, setDestAccount] = useState("");

  async function submitPayout(e: FormEvent) {
    e.preventDefault();
    const numeric = Number.parseFloat(amountEur.replace(",", "."));
    if (!Number.isFinite(numeric) || numeric < 5) return;
    const amountMinor = Math.round(numeric * 100);
    const created = await action.run(
      () =>
        api("/payouts", {
          amountMinor,
          destinationLabel: destLabel.trim(),
          destinationAccount: destAccount.trim(),
        }),
      t("p5PayoutRequestedOk"),
    );
    if (created) {
      setDestAccount("");
      void reload();
      onPayoutCreated?.();
    }
  }

  return (
    <div className="admin-section">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3>{t("p5PayoutTitle")}</h3>
            <p className="panel-description">{t("p5PayoutSubtitle")}</p>
          </div>
          <span className="tag">
            <Wallet size={14} aria-hidden="true" /> {t("p5KycLabel")}:{" "}
            {user.kycStatus || "UNVERIFIED"}
          </span>
        </div>

        <p className="field-hint">{t("p5PayoutDevNote")}</p>

        <form className="form-grid" onSubmit={submitPayout} style={{ marginTop: 14 }}>
          <label className="field">
            {t("p5PayoutAmountEur")}
            <input
              type="number"
              min="5"
              step="0.01"
              value={amountEur}
              onChange={(e) => setAmountEur(e.target.value)}
              required
            />
          </label>
          <label className="field">
            {t("p5PayoutDestLabel")}
            <input
              value={destLabel}
              onChange={(e) => setDestLabel(e.target.value)}
              minLength={4}
              maxLength={120}
              required
            />
          </label>
          <label className="field full-width">
            {t("p5PayoutDestAccount")}
            <input
              value={destAccount}
              onChange={(e) => setDestAccount(e.target.value)}
              placeholder="FR76 3000 6000 0112 3456 7890 189"
              minLength={8}
              maxLength={160}
              required
            />
          </label>
          <div className="form-actions full-width">
            <button
              className="button button-small"
              type="submit"
              disabled={action.busy || BigInt(availableMinor || "0") < 500n}
            >
              {t("p5PayoutSubmit")}
            </button>
          </div>
        </form>
        {action.notice && <Notice message={action.notice} error={action.failed} />}

        <div style={{ marginTop: 20 }}>
          <h4>{t("p5PayoutHistory")}</h4>
          {!data?.items?.length ? (
            <Empty>{t("p5PayoutEmpty")}</Empty>
          ) : (
            <div className="list-stack">
              {data.items.map((item) => (
                <div className="payout-row" key={item.id}>
                  <div className="panel-header">
                    <strong>{minorMoney(item.amountMinor, locale)}</strong>
                    <span className="tag">{item.state}</span>
                  </div>
                  <p className="panel-description">
                    {item.destinationSummary} · {item.provider}
                    {item.externalReference ? ` · ${item.externalReference}` : ""}
                  </p>
                  {item.reviewReason && <p className="field-hint">{item.reviewReason}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="panel admin-section">
        <div className="panel-header">
          <div>
            <h3>{t("p5StatementPdfTitle")}</h3>
            <p className="panel-description">
              {user.billingEntityName || user.displayName}
              {user.vatNumber ? ` · ${user.vatNumber}` : ""}
            </p>
          </div>
          <FileText size={18} aria-hidden="true" />
        </div>
        <div className="pdf-period-row">
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            aria-label={t("p5StatementPdfTitle")}
          />
          <a
            className="button button-secondary button-small"
            href={`/api/statements/creator/${encodeURIComponent(period)}`}
            download
          >
            <FileText size={14} aria-hidden="true" /> {t("p5StatementPdfBtn")}
          </a>
        </div>
      </section>
    </div>
  );
}

export function EmbeddableWidgetCard({ handle }: { handle: string | null }) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);
  if (!handle) return null;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const embedUrl = `${origin}/embed/${encodeURIComponent(handle)}`;
  const snippet = `<iframe src="${embedUrl}" width="420" height="250" style="border:0;border-radius:18px;overflow:hidden" loading="lazy" title="Ruvora @${handle}"></iframe>`;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard unavailable in restricted contexts
    }
  }

  return (
    <section className="panel admin-section">
      <div className="panel-header">
        <div>
          <h3>{t("p5EmbedTitle")}</h3>
          <p className="panel-description">{t("p5EmbedSubtitle")}</p>
        </div>
        <Code2 size={18} aria-hidden="true" />
      </div>
      <pre className="snippet-code">{snippet}</pre>
      <div className="form-actions">
        <button type="button" className="button button-secondary button-small" onClick={copyCode}>
          <Copy size={14} aria-hidden="true" />{" "}
          {copied ? t("p5EmbedCopied") : t("p5EmbedCopySnippet")}
        </button>
        <a
          className="text-link"
          href={`/embed/${encodeURIComponent(handle)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("p5EmbedPreview")} <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}

interface InvitationItem {
  id: string;
  state: string;
  message: string;
  createdAt: string;
  campaign: { id: string; name: string; deliveryMode: string; objective: string };
  advertiser: { displayName: string; handle: string | null };
}

interface UgcDeliverableItem {
  id: string;
  campaignId: string;
  state: string;
  pitch: string;
  draftUrl: string | null;
  publishedUrl: string | null;
  feedback: string | null;
  campaign: { id: string; name: string; deliveryMode: string };
}

export function CreatorInvitationsAndUgcPanel() {
  const { t } = useLocale();
  const invRes = useResource<{ items: InvitationItem[] }>("/invitations");
  const ugcRes = useResource<{ items: UgcDeliverableItem[] }>("/ugc?scope=creator");
  const action = useAction();
  const [draftUrls, setDraftUrls] = useState<Record<string, { draft: string; published: string }>>(
    {},
  );

  async function respond(id: string, decision: "ACCEPTED" | "DECLINED") {
    const ok = await action.run(() => api(`/invitations/${id}/respond`, { decision }));
    if (ok) void invRes.reload();
  }

  async function submitDraft(id: string) {
    const entry = draftUrls[id];
    if (!entry?.draft) return;
    const ok = await action.run(
      () =>
        api(`/ugc/${id}/draft`, {
          draftUrl: entry.draft.trim(),
          ...(entry.published?.trim() ? { publishedUrl: entry.published.trim() } : {}),
        }),
      t("p5UgcDraftSent"),
    );
    if (ok) void ugcRes.reload();
  }

  const invitations = invRes.data?.items ?? [];
  const deliverables = ugcRes.data?.items ?? [];
  if (invitations.length === 0 && deliverables.length === 0) return null;

  return (
    <div className="admin-section">
      {action.notice && <Notice message={action.notice} error={action.failed} />}
      {invitations.length > 0 && (
        <section className="panel admin-section">
          <div className="panel-header">
            <h3>{t("p5InvitationsTitle")}</h3>
            <Mail size={16} aria-hidden="true" />
          </div>
          <div className="list-stack">
            {invitations.map((inv) => (
              <div className="ugc-row" key={inv.id}>
                <div className="panel-header">
                  <strong>{inv.campaign.name}</strong>
                  <span className="tag">{inv.state}</span>
                </div>
                <p className="panel-description">
                  {inv.advertiser.displayName}
                  {inv.message ? ` — ${inv.message}` : ""}
                </p>
                {inv.state === "PENDING" && (
                  <div className="form-actions">
                    <button
                      type="button"
                      className="button button-small"
                      disabled={action.busy}
                      onClick={() => respond(inv.id, "ACCEPTED")}
                    >
                      {t("p5InviteAccept")}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      disabled={action.busy}
                      onClick={() => respond(inv.id, "DECLINED")}
                    >
                      {t("p5InviteDecline")}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {deliverables.length > 0 && (
        <section className="panel admin-section">
          <div className="panel-header">
            <h3>{t("p5UgcMyDeliverables")}</h3>
            <Sparkles size={16} aria-hidden="true" />
          </div>
          <div className="list-stack">
            {deliverables.map((deliv) => (
              <div className="ugc-row" key={deliv.id}>
                <div className="panel-header">
                  <strong>{deliv.campaign.name}</strong>
                  <span className="tag">{deliv.state}</span>
                </div>
                <p className="panel-description">{deliv.pitch}</p>
                {deliv.feedback && <p className="field-hint">{deliv.feedback}</p>}
                {(deliv.state === "APPROVED_TO_CREATE" || deliv.state === "REVISION_REQUESTED") && (
                  <div className="form-grid">
                    <label className="field">
                      {t("p5UgcDraftUrl")}
                      <input
                        type="url"
                        placeholder="https://..."
                        value={draftUrls[deliv.id]?.draft ?? ""}
                        onChange={(e) =>
                          setDraftUrls((prev) => ({
                            ...prev,
                            [deliv.id]: {
                              draft: e.target.value,
                              published: prev[deliv.id]?.published ?? "",
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      {t("p5UgcPublishedUrl")}
                      <input
                        type="url"
                        placeholder="https://..."
                        value={draftUrls[deliv.id]?.published ?? ""}
                        onChange={(e) =>
                          setDraftUrls((prev) => ({
                            ...prev,
                            [deliv.id]: {
                              draft: prev[deliv.id]?.draft ?? "",
                              published: e.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                    <div className="form-actions full-width">
                      <button
                        type="button"
                        className="button button-small"
                        disabled={action.busy}
                        onClick={() => submitDraft(deliv.id)}
                      >
                        <Send size={14} aria-hidden="true" /> {t("p5UgcSubmitDraft")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

interface DisputeItem {
  id: string;
  activityId: string;
  campaignName: string;
  reason: string;
  state: string;
  resolutionNote: string | null;
  createdAt: string;
}

export function ActivityDisputePanel({ activities }: { activities: Activity[] }) {
  const { t } = useLocale();
  const disputesRes = useResource<{ items: DisputeItem[] }>("/disputes");
  const action = useAction();
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [attachmentId, setAttachmentId] = useState<string | null>(null);

  const rejected = activities.filter((a) => a.state === "REJECTED");
  const disputedIds = new Set((disputesRes.data?.items ?? []).map((d) => d.activityId));

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const uploaded = await action.run<{ id: string }>(
        () =>
          api("/evidence/upload", {
            filename: file.name,
            mimeType: file.type,
            dataBase64: dataUrl,
            ...(openId ? { activityId: openId } : {}),
          }),
        t("p5EvidenceUploaded"),
      );
      if (uploaded?.id) setAttachmentId(uploaded.id);
    };
    reader.readAsDataURL(file);
  }

  async function submitDispute(e: FormEvent) {
    e.preventDefault();
    if (!openId) return;
    const ok = await action.run(
      () =>
        api(`/activities/${openId}/dispute`, {
          reason: reason.trim(),
          ...(note.trim() ? { evidenceNote: note.trim() } : {}),
          ...(attachmentId ? { attachmentId } : {}),
        }),
      t("p5DisputeSubmitted"),
    );
    if (ok) {
      setOpenId(null);
      setReason("");
      setNote("");
      setAttachmentId(null);
      void disputesRes.reload();
    }
  }

  if (rejected.length === 0 && !disputesRes.data?.items?.length) return null;

  return (
    <section className="panel admin-section">
      <div className="panel-header">
        <div>
          <h3>{t("p5DisputesListTitle")}</h3>
          <p className="panel-description">{t("p5DisputeSubtitle")}</p>
        </div>
        <Scale size={18} aria-hidden="true" />
      </div>

      {action.notice && <Notice message={action.notice} error={action.failed} />}

      <div className="list-stack">
        {rejected
          .filter((a) => !disputedIds.has(a.id))
          .map((act) => (
            <div className="dispute-row" key={act.id}>
              <div className="panel-header">
                <strong>{act.campaign.name}</strong>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={() => setOpenId(openId === act.id ? null : act.id)}
                >
                  {t("p5DisputeBtn")}
                </button>
              </div>
              {openId === act.id && (
                <form className="form-stack" onSubmit={submitDispute}>
                  <label className="field">
                    {t("p5DisputeReason")}
                    <textarea
                      rows={3}
                      minLength={10}
                      maxLength={600}
                      required
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    {t("p5DisputeNote")}
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={1000}
                    />
                  </label>
                  <label className="field">
                    <span>
                      <Upload size={14} aria-hidden="true" /> {t("p5EvidenceUploadLabel")}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleFileChange}
                    />
                  </label>
                  <button type="submit" className="button button-small" disabled={action.busy}>
                    {t("p5DisputeSubmit")}
                  </button>
                </form>
              )}
            </div>
          ))}

        {(disputesRes.data?.items ?? []).map((dispute) => (
          <div className="dispute-row" key={dispute.id}>
            <div className="panel-header">
              <strong>{dispute.campaignName}</strong>
              <span className="tag">{dispute.state}</span>
            </div>
            <p className="panel-description">{dispute.reason}</p>
            {dispute.resolutionNote && <p className="field-hint">{dispute.resolutionNote}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
