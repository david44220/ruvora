"use client";
import { useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Copy,
  KeyRound,
  Plug,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
  Webhook,
} from "lucide-react";
import { useLocale } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/messages";
import { api } from "@/lib/api";
import { useAction, useResource } from "@/lib/hooks";
import type { Campaign } from "@/lib/types";
import { Eyebrow, Notice, Empty, Loading, Status } from "./ui";

interface IntegrationData {
  configured: boolean;
  keyPrefix: string | null;
  lastRotatedAt: string | null;
  graceWindowUntil?: string | null;
  development: boolean;
  snippets: {
    endpoint: string;
    devEndpoint: string;
    shopify: string;
    woocommerce: string;
    stripe: string;
    zapier: string;
    curl: string;
  };
}

interface WorkspaceWebhookRow {
  id: string;
  provider: string;
  externalId: string;
  eventType: string;
  status: string;
  attempts: number;
  lastErrorCode: string | null;
  occurredAt: string;
  processedAt: string | null;
  isDemo: boolean;
  createdAt: string;
}

export function AdvertiserIntegrationsHub({
  campaigns,
  workspaceId,
}: {
  campaigns: Campaign[];
  workspaceId?: string;
}) {
  const { t, locale } = useLocale();
  const wsQuery = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
  const res = useResource<IntegrationData>(`/advertiser/integrations${wsQuery}`);
  const eventsRes = useResource<{ events: WorkspaceWebhookRow[] }>(
    `/advertiser/integrations/events${wsQuery}`,
  );
  const action = useAction();
  const [tab, setTab] = useState<"shopify" | "woocommerce" | "stripe" | "zapier" | "curl">(
    "shopify",
  );
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<{
    pingId: string;
    keyPrefix: string;
    latencyMs: number;
  } | null>(null);
  const [testCampaignId, setTestCampaignId] = useState<string>("");

  async function rotate() {
    const out = await action.run(
      () =>
        api<{ keyPrefix: string; signingKey: string; lastRotatedAt: string }>(
          `/advertiser/integrations/rotate${wsQuery}`,
          {},
        ),
      t("p4KeyStatusConfigured"),
    );
    if (out) {
      setRevealedKey(out.signingKey);
      await res.reload();
    }
  }

  async function runSignedPing() {
    const out = await action.run(
      () =>
        api<{ ok: boolean; pingId: string; keyPrefix: string; latencyMs: number }>(
          `/advertiser/integrations/ping${wsQuery}`,
          {},
        ),
      t("p7WebhookPingSuccess"),
    );
    if (out) {
      setPingResult({ pingId: out.pingId, keyPrefix: out.keyPrefix, latencyMs: out.latencyMs });
    }
  }

  async function runDevTest() {
    const targetId = testCampaignId || conversionCampaigns[0]?.id;
    if (!targetId) return;
    const out = await action.run(
      () => api(`/advertiser/integrations/test${wsQuery}`, { campaignId: targetId }),
      t("p4DevTestConvSuccess"),
    );
    if (out) await eventsRes.reload();
  }

  const conversionCampaigns = campaigns.filter((c) => c.objective === "CONVERSION");

  return (
    <section className="panel admin-section">
      <div className="panel-header">
        <div>
          <Eyebrow>{t("p4IntegrationsTitle")}</Eyebrow>
          <h3>{t("p4IntegrationsDesc")}</h3>
        </div>
        <Plug size={18} />
      </div>
      {res.loading ? (
        <Loading />
      ) : res.data ? (
        <>
          <div className="integration-key-bar">
            <div>
              <strong>
                {res.data.configured ? t("p4KeyStatusConfigured") : t("p4KeyStatusNone")}
              </strong>
              {res.data.keyPrefix && (
                <small style={{ display: "block", marginTop: 4 }}>
                  <code>{res.data.keyPrefix}••••••••</code>
                  {res.data.lastRotatedAt
                    ? ` · ${new Date(res.data.lastRotatedAt).toLocaleDateString(locale)}`
                    : ""}
                </small>
              )}
            </div>
            <div className="form-actions" style={{ margin: 0 }}>
              <button
                type="button"
                className="button button-small button-secondary"
                disabled={action.busy || !res.data.configured}
                onClick={() => void runSignedPing()}
                title={!res.data.configured ? t("p7WebhookPingNeedKey") : undefined}
              >
                <CheckCircle2 size={15} />
                {t("p7WebhookPingBtn")}
              </button>
              <button
                type="button"
                className="button button-small button-secondary"
                disabled={action.busy}
                onClick={() => void rotate()}
              >
                <KeyRound size={15} />
                {t("p4RotateKeyBtn")}
              </button>
            </div>
          </div>

          {pingResult && (
            <div className="notice" role="status" style={{ marginBottom: 14 }}>
              <CheckCircle2 size={17} />
              <span>
                {t("p7WebhookPingSuccess")} ({pingResult.keyPrefix}•• · {pingResult.pingId} ·{" "}
                {pingResult.latencyMs}ms)
              </span>
            </div>
          )}

          {revealedKey && (
            <div className="challenge-code-box" style={{ marginBottom: 16 }}>
              <small>{t("p4KeyShownOnce")}</small>
              <div className="share-copy">
                <code>{revealedKey}</code>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("p2CopyLink")}
                  onClick={() =>
                    void action.run(
                      () => navigator.clipboard.writeText(revealedKey),
                      t("p2CopySuccess"),
                    )
                  }
                >
                  <Copy size={15} />
                </button>
              </div>
            </div>
          )}

          <div className="snippet-tabs" role="tablist">
            {(
              [
                ["shopify", "Shopify"],
                ["woocommerce", t("p7WebhookSnippetWoo")],
                ["stripe", "Stripe"],
                ["zapier", "Zapier / Make"],
                ["curl", t("p7WebhookSnippetCurl")],
              ] as const
            ).map(([id, label]) => (
              <button
                type="button"
                role="tab"
                aria-selected={tab === id}
                key={id}
                className={`tab-chip ${tab === id ? "active" : ""}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="snippet-box">
            <pre className="data-json">{res.data.snippets[tab]}</pre>
            <button
              type="button"
              className="button button-small button-secondary"
              onClick={() =>
                void action.run(
                  () => navigator.clipboard.writeText(res.data!.snippets[tab]),
                  t("p2CopySuccess"),
                )
              }
            >
              <Copy size={14} />
              {t("p2CopyLink")}
            </button>
          </div>

          {res.data.development && conversionCampaigns.length > 0 && (
            <div className="dev-test-conv">
              <div className="form-grid">
                <label className="field">
                  {t("p4DevTestConvBtn")}
                  <select
                    value={testCampaignId || conversionCampaigns[0]?.id || ""}
                    onChange={(e) => setTestCampaignId(e.target.value)}
                  >
                    {conversionCampaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="field" style={{ justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="button button-small button-secondary"
                    disabled={action.busy}
                    onClick={() => void runDevTest()}
                  >
                    <Webhook size={15} />
                    {t("p4DevTestConvBtn")}
                  </button>
                </div>
              </div>
              <p className="field-hint">{t("p4DevTestConvNote")}</p>
            </div>
          )}

          <div className="p7-webhook-inspector">
            <div className="panel-header" style={{ marginBottom: 10 }}>
              <div>
                <strong>{t("p7WebhookInspectorTitle")}</strong>
                <p className="field-hint" style={{ margin: "4px 0 0" }}>
                  {t("p7WebhookInspectorDesc")}
                </p>
              </div>
              <button
                type="button"
                className="button button-small button-secondary"
                disabled={eventsRes.loading}
                onClick={() => void eventsRes.reload()}
              >
                <RefreshCw size={14} />
                {t("p7WebhookRefreshBtn")}
              </button>
            </div>
            {eventsRes.loading ? (
              <Loading />
            ) : !eventsRes.data?.events.length ? (
              <Empty>{t("p7WebhookEmpty")}</Empty>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t("p7WebhookColEvent")}</th>
                      <th>{t("p7WebhookColExternalId")}</th>
                      <th>{t("p7WebhookColStatus")}</th>
                      <th>{t("p7WebhookColAttempts")}</th>
                      <th>{t("p7WebhookColError")}</th>
                      <th>{t("p7WebhookColTime")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventsRes.data.events.map((ev) => (
                      <tr key={ev.id}>
                        <td>
                          <code>{ev.eventType}</code>
                        </td>
                        <td>
                          <code>{ev.externalId}</code>
                        </td>
                        <td>
                          <Status value={ev.status} />
                        </td>
                        <td className="number">{ev.attempts}</td>
                        <td>{ev.lastErrorCode ? <code>{ev.lastErrorCode}</code> : "—"}</td>
                        <td>{new Date(ev.createdAt).toLocaleString(locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
      {action.notice && <Notice message={action.notice} error={action.failed} />}
    </section>
  );
}

interface WorkspaceMemberRow {
  id: string;
  role: "CAMPAIGN_MANAGER" | "BILLING" | "VIEWER";
  member: { id: string; displayName: string; email: string; handle: string | null };
}

export function WorkspaceTeamPanel() {
  const { t } = useLocale();
  const res = useResource<{ members: WorkspaceMemberRow[] }>("/advertiser/team");
  const action = useAction();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"CAMPAIGN_MANAGER" | "BILLING" | "VIEWER">("CAMPAIGN_MANAGER");

  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const out = await action.run(
      () => api("/advertiser/team", { email: email.trim(), role }),
      t("p4TeamAdded"),
    );
    if (out) {
      setEmail("");
      await res.reload();
    }
  }

  async function remove(memberId: string) {
    const out = await action.run(
      () => api("/advertiser/team/remove", { memberId }),
      t("p4TeamRemoved"),
    );
    if (out) await res.reload();
  }

  return (
    <section className="panel admin-section">
      <div className="panel-header">
        <div>
          <Eyebrow>{t("p4TeamTitle")}</Eyebrow>
          <h3>{t("p4TeamDesc")}</h3>
        </div>
        <Users size={18} />
      </div>
      <form onSubmit={invite} className="form-grid" style={{ marginBottom: 18 }}>
        <label className="field">
          {t("p4TeamEmail")}
          <input
            type="email"
            required
            placeholder="collaborator@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          {t("p4TeamRole")}
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="CAMPAIGN_MANAGER">{t("p4TeamRoleCAMPAIGN_MANAGER")}</option>
            <option value="BILLING">{t("p4TeamRoleBILLING")}</option>
            <option value="VIEWER">{t("p4TeamRoleVIEWER")}</option>
          </select>
        </label>
        <div className="full-width">
          <button className="button button-small" disabled={action.busy}>
            <UserPlus size={15} />
            {t("p4TeamInviteBtn")}
          </button>
        </div>
      </form>
      {res.loading ? (
        <Loading />
      ) : !res.data?.members.length ? (
        <Empty>{t("p4TeamEmpty")}</Empty>
      ) : (
        <div className="allocation-list">
          {res.data.members.map((m) => (
            <div key={m.id} className="team-member-row">
              <span>
                <strong>{m.member.displayName}</strong>
                <small>
                  {m.member.email} · {t(`p4TeamRole${m.role}` as MessageKey)}
                </small>
              </span>
              <button
                type="button"
                className="button button-small button-secondary"
                disabled={action.busy}
                onClick={() => void remove(m.member.id)}
              >
                <Trash2 size={14} />
                {t("remove")}
              </button>
            </div>
          ))}
        </div>
      )}
      {action.notice && <Notice message={action.notice} error={action.failed} />}
    </section>
  );
}
