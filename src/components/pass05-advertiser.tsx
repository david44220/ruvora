"use client";
import { useState, type FormEvent } from "react";
import { Building2, FileText, Search, Send, Sparkles, UserCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAction, useResource } from "@/lib/hooks";
import type { Campaign } from "@/lib/types";
import { useLocale } from "@/i18n/provider";
import { Empty, Notice } from "./ui";

export interface WorkspaceOption {
  ownerId: string;
  displayName: string;
  handle: string | null;
  role: string;
  isOwn: boolean;
}

export function WorkspaceSwitcherBar({
  selectedWorkspaceId,
  onSelect,
}: {
  selectedWorkspaceId: string;
  onSelect: (ownerId: string) => void;
}) {
  const { t } = useLocale();
  const { data } = useResource<{ workspaces: WorkspaceOption[] }>("/workspaces");
  const workspaces = data?.workspaces ?? [];
  if (workspaces.length <= 1) return null;

  return (
    <div className="workspace-bar">
      <label>
        <Building2 size={16} aria-hidden="true" />
        <span>{t("p5WorkspaceLabel")}</span>
        <select
          value={selectedWorkspaceId}
          onChange={(e) => onSelect(e.target.value)}
          aria-label={t("p5WorkspaceLabel")}
        >
          {workspaces.map((ws) => (
            <option key={ws.ownerId} value={ws.ownerId}>
              {ws.isOwn
                ? `${ws.displayName} (${t("p5WorkspaceOwn")})`
                : `${ws.displayName} · ${ws.role}`}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function MonthlyInvoicePdfBar({ workspaceId }: { workspaceId?: string }) {
  const { t } = useLocale();
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";

  return (
    <section className="panel admin-section">
      <div className="panel-header">
        <h3>{t("p5InvoicePdfTitle")}</h3>
        <FileText size={16} aria-hidden="true" />
      </div>
      <div className="pdf-period-row">
        <input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          aria-label={t("p5InvoicePdfTitle")}
        />
        <a
          className="button button-secondary button-small"
          href={`/api/invoices/advertiser/${encodeURIComponent(period)}${query}`}
          download
        >
          <FileText size={14} aria-hidden="true" /> {t("p5InvoicePdfBtn")}
        </a>
      </div>
    </section>
  );
}

interface DirectoryCreator {
  id: string;
  displayName: string;
  handle: string | null;
  bio: string;
  category: string;
  country: string | null;
  city: string | null;
  preferredLanguages: string[];
  followers: number;
  audienceStatus: string;
  platforms: string[];
  reliabilityScore: number;
  trustTier: string;
  validatedCount: number;
}

export function CreatorDirectoryPanel({
  campaigns,
  workspaceId,
}: {
  campaigns: Campaign[];
  workspaceId?: string;
}) {
  const { t, locale } = useLocale();
  const [city, setCity] = useState("");
  const [platform, setPlatform] = useState("");
  const [maxFollowers, setMaxFollowers] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [queryPath, setQueryPath] = useState(() =>
    workspaceId
      ? `/directory/creators?workspaceId=${encodeURIComponent(workspaceId)}`
      : "/directory/creators",
  );
  const { data } = useResource<{ items: DirectoryCreator[]; nextCursor: string | null }>(queryPath);
  const [inviteCampaignId, setInviteCampaignId] = useState(() => campaigns[0]?.id ?? "");
  const action = useAction();

  function runSearch(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (city.trim()) params.set("city", city.trim());
    if (platform.trim()) params.set("platform", platform.trim());
    if (maxFollowers.trim()) params.set("maxFollowers", maxFollowers.trim());
    if (verifiedOnly) params.set("verifiedOnly", "true");
    if (workspaceId) params.set("workspaceId", workspaceId);
    const qs = params.toString();
    setQueryPath(qs ? `/directory/creators?${qs}` : "/directory/creators");
  }

  async function inviteCreator(creatorId: string) {
    const targetCamp = inviteCampaignId || campaigns.find((c) => c.state === "ACTIVE")?.id;
    if (!targetCamp) return;
    const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
    await action.run(
      () =>
        api(`/campaigns/${targetCamp}/invitations${qs}`, {
          creatorId,
          message: "Direct invitation via Ruvora Creator Directory",
        }),
      t("p5DirectoryInviteSent"),
    );
  }

  const activeCampaigns = campaigns.filter(
    (c) => c.state === "ACTIVE" || c.state === "PENDING_REVIEW",
  );

  return (
    <section className="panel admin-section">
      <div className="panel-header">
        <div>
          <h3>{t("p5DirectoryTitle")}</h3>
          <p className="panel-description">{t("p5DirectorySubtitle")}</p>
        </div>
        <UserCheck size={18} aria-hidden="true" />
      </div>

      <form className="directory-filters" onSubmit={runSearch}>
        <label className="field">
          {t("p5DirectoryCity")}
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Paris" />
        </label>
        <label className="field">
          {t("p5DirectoryPlatform")}
          <input
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            placeholder="Instagram"
          />
        </label>
        <label className="field">
          {t("p5DirectoryMaxFollowers")}
          <input
            type="number"
            min="10"
            value={maxFollowers}
            onChange={(e) => setMaxFollowers(e.target.value)}
            placeholder="5000"
          />
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
          />
          {t("p5DirectoryVerifiedOnly")}
        </label>
        <button type="submit" className="button button-secondary button-small">
          <Search size={14} aria-hidden="true" /> {t("p5DirectorySearch")}
        </button>
      </form>

      {activeCampaigns.length > 0 && (
        <label className="field" style={{ maxWidth: 360 }}>
          {t("p5DirectoryInviteBtn")}
          <select
            value={inviteCampaignId || activeCampaigns[0]!.id}
            onChange={(e) => setInviteCampaignId(e.target.value)}
          >
            {activeCampaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {action.notice && <Notice message={action.notice} error={action.failed} />}

      {!data?.items?.length ? (
        <Empty>{t("p5DirectoryEmpty")}</Empty>
      ) : (
        <div className="directory-grid">
          {data.items.map((creator) => (
            <article className="directory-card" key={creator.id}>
              <div className="panel-header">
                <strong>{creator.displayName}</strong>
                {creator.audienceStatus === "VERIFIED" && (
                  <span className="verified-badge">✓ {t("p4AudienceVerifiedBadge")}</span>
                )}
              </div>
              <p className="panel-description">
                @{creator.handle}
                {creator.city ? ` · ${creator.city}` : ""} ·{" "}
                {creator.followers.toLocaleString(locale)} {t("p5FollowersUnit")}
              </p>
              <div className="profile-badge-row" style={{ margin: 0 }}>
                <span className="tag">{creator.category}</span>
                <span className="tag">
                  {creator.reliabilityScore}% · {creator.trustTier}
                </span>
                {creator.platforms.slice(0, 3).map((p) => (
                  <span className="tag" key={p}>
                    {p}
                  </span>
                ))}
              </div>
              {activeCampaigns.length > 0 && (
                <button
                  type="button"
                  className="button button-small"
                  disabled={action.busy}
                  onClick={() => inviteCreator(creator.id)}
                >
                  <Send size={14} aria-hidden="true" /> {t("p5DirectoryInviteBtn")}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

interface AdvertiserUgcItem {
  id: string;
  state: string;
  pitch: string;
  draftUrl: string | null;
  publishedUrl: string | null;
  feedback: string | null;
  campaign: { id: string; name: string };
  creator: { id: string; displayName: string; handle: string | null; followers: number };
}

export function UgcDeliverablesInboxPanel({ workspaceId }: { workspaceId?: string }) {
  const { t } = useLocale();
  const path = workspaceId
    ? `/ugc?scope=advertiser&workspaceId=${encodeURIComponent(workspaceId)}`
    : "/ugc?scope=advertiser";
  const { data, reload } = useResource<{ items: AdvertiserUgcItem[] }>(path);
  const action = useAction();
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({});

  async function decide(
    id: string,
    reviewAction: "APPROVE_TO_CREATE" | "REQUEST_REVISION" | "ACCEPT" | "DECLINE",
  ) {
    const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
    const ok = await action.run(() =>
      api(`/ugc/${id}/review${qs}`, {
        action: reviewAction,
        ...(feedbackMap[id]?.trim() ? { feedback: feedbackMap[id]!.trim() } : {}),
      }),
    );
    if (ok) void reload();
  }

  return (
    <section className="panel admin-section">
      <div className="panel-header">
        <h3>{t("p5UgcInboxTitle")}</h3>
        <Sparkles size={16} aria-hidden="true" />
      </div>
      {action.notice && <Notice message={action.notice} error={action.failed} />}
      {!data?.items?.length ? (
        <Empty>{t("p5UgcInboxEmpty")}</Empty>
      ) : (
        <div className="list-stack">
          {data.items.map((item) => (
            <div className="ugc-row" key={item.id}>
              <div className="panel-header">
                <strong>
                  {item.campaign.name} — {item.creator.displayName} (@{item.creator.handle})
                </strong>
                <span className="tag">{item.state}</span>
              </div>
              <p className="panel-description">{item.pitch}</p>
              {item.draftUrl && (
                <a
                  href={item.draftUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-link"
                >
                  {item.draftUrl}
                </a>
              )}
              {item.state !== "ACCEPTED" && item.state !== "DECLINED" && (
                <>
                  <input
                    placeholder={t("p5UgcFeedbackPlaceholder")}
                    value={feedbackMap[item.id] ?? ""}
                    onChange={(e) =>
                      setFeedbackMap((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                  />
                  <div className="form-actions">
                    {item.state === "APPLIED" && (
                      <button
                        type="button"
                        className="button button-small"
                        disabled={action.busy}
                        onClick={() => decide(item.id, "APPROVE_TO_CREATE")}
                      >
                        {t("p5UgcApproveCreate")}
                      </button>
                    )}
                    {item.state === "DRAFT_SUBMITTED" && (
                      <>
                        <button
                          type="button"
                          className="button button-small"
                          disabled={action.busy}
                          onClick={() => decide(item.id, "ACCEPT")}
                        >
                          {t("p5UgcAcceptDeliverable")}
                        </button>
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          disabled={action.busy}
                          onClick={() => decide(item.id, "REQUEST_REVISION")}
                        >
                          {t("p5UgcRequestRevision")}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      disabled={action.busy}
                      onClick={() => decide(item.id, "DECLINE")}
                    >
                      {t("p5UgcDecline")}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
