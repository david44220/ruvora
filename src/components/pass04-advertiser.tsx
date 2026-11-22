"use client";
import { useState, type FormEvent } from "react";
import { Copy, KeyRound, Plug, Trash2, UserPlus, Users, Webhook } from "lucide-react";
import { useLocale } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/messages";
import { api } from "@/lib/api";
import { useAction, useResource } from "@/lib/hooks";
import type { Campaign } from "@/lib/types";
import { Eyebrow, Notice, Empty, Loading } from "./ui";

interface IntegrationData {
  configured: boolean;
  keyPrefix: string | null;
  lastRotatedAt: string | null;
  development: boolean;
  snippets: {
    endpoint: string;
    devEndpoint: string;
    shopify: string;
    stripe: string;
    zapier: string;
  };
}

export function AdvertiserIntegrationsHub({ campaigns }: { campaigns: Campaign[] }) {
  const { t, locale } = useLocale();
  const res = useResource<IntegrationData>("/advertiser/integrations");
  const action = useAction();
  const [tab, setTab] = useState<"shopify" | "stripe" | "zapier">("shopify");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [testCampaignId, setTestCampaignId] = useState<string>("");

  async function rotate() {
    const out = await action.run(
      () =>
        api<{ keyPrefix: string; signingKey: string; lastRotatedAt: string }>(
          "/advertiser/integrations/rotate",
          {},
        ),
      t("p4KeyStatusConfigured"),
    );
    if (out) {
      setRevealedKey(out.signingKey);
      await res.reload();
    }
  }

  async function runDevTest() {
    const targetId = testCampaignId || conversionCampaigns[0]?.id;
    if (!targetId) return;
    await action.run(
      () => api("/advertiser/integrations/test", { campaignId: targetId }),
      t("p4DevTestConvSuccess"),
    );
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
                ["stripe", "Stripe"],
                ["zapier", "Zapier / WooCommerce / Webflow"],
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
