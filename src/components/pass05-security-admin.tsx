"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Download, Fingerprint, Scale, ShieldAlert, Trash2, Wallet } from "lucide-react";
import { api, minorMoney } from "@/lib/api";
import { useAction, useResource } from "@/lib/hooks";
import { useLocale } from "@/i18n/provider";
import { Empty, Notice } from "./ui";

interface PasskeyItem {
  id: string;
  label: string;
  algorithm: number;
  createdAt: string;
  lastUsedAt: string | null;
}

function bytesToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function PasskeysAndGdprPanel() {
  const { t } = useLocale();
  const router = useRouter();
  const { data, reload } = useResource<{ items: PasskeyItem[] }>("/security/passkeys");
  const action = useAction();
  const [label, setLabel] = useState("");
  const [showAnon, setShowAnon] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");

  async function registerPasskey(e: FormEvent) {
    e.preventDefault();
    if (typeof window === "undefined" || !("PublicKeyCredential" in window)) {
      await action.run(async () => {
        throw new Error(t("p5PasskeyUnsupported"));
      });
      return;
    }
    const ok = await action.run(async () => {
      const options = await api<{
        challenge: string;
        rp: { id: string; name: string };
        user: { id: string; name: string; displayName: string };
        pubKeyCredParams: PublicKeyCredentialParameters[];
        timeout: number;
      }>("/security/passkeys/register/begin", {});

      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge: base64UrlToBytes(options.challenge),
          rp: options.rp,
          user: {
            id: base64UrlToBytes(options.user.id),
            name: options.user.name,
            displayName: options.user.displayName,
          },
          pubKeyCredParams: options.pubKeyCredParams,
          timeout: options.timeout,
          attestation: "none",
        },
      })) as PublicKeyCredential | null;

      if (!cred) throw new Error(t("p5PasskeyUnsupported"));
      const resp = cred.response as AuthenticatorAttestationResponse;
      const spki = resp.getPublicKey?.();
      if (!spki) throw new Error(t("p5PasskeyUnsupported"));

      return api("/security/passkeys/register/confirm", {
        challenge: options.challenge,
        credentialId: cred.id,
        publicKeySpki: bytesToBase64Url(spki),
        algorithm: resp.getPublicKeyAlgorithm?.() ?? -7,
        label: label.trim() || "Passkey",
        clientDataJSON: bytesToBase64Url(resp.clientDataJSON),
      });
    }, t("p5PasskeyRegistered"));
    if (ok) void reload();
  }

  async function removePasskey(id: string) {
    const ok = await action.run(() => api(`/security/passkeys/${id}/delete`, {}));
    if (ok) void reload();
  }

  async function anonymize(e: FormEvent) {
    e.preventDefault();
    const res = await action.run(() =>
      api<{ anonymized: boolean }>("/security/gdpr/anonymize", {
        password,
        confirmation: confirmText,
      }),
    );
    if (res?.anonymized) {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="admin-section">
      {action.notice && <Notice message={action.notice} error={action.failed} />}

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h3>{t("p5PasskeysTitle")}</h3>
              <p className="panel-description">{t("p5PasskeysSubtitle")}</p>
            </div>
            <Fingerprint size={18} aria-hidden="true" />
          </div>
          <form
            className="form-actions passkey-form"
            onSubmit={registerPasskey}
            style={{ marginTop: 12 }}
          >
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("p5PasskeyLabel")}
              maxLength={80}
            />
            <button
              type="submit"
              className="button button-secondary button-small"
              disabled={action.busy}
            >
              <Fingerprint size={14} aria-hidden="true" /> {t("p5PasskeyRegisterBtn")}
            </button>
          </form>
          {!data?.items?.length ? (
            <Empty>{t("p5PasskeysEmpty")}</Empty>
          ) : (
            <div className="list-stack" style={{ marginTop: 12 }}>
              {data.items.map((pk) => (
                <div className="passkey-row" key={pk.id}>
                  <div className="panel-header">
                    <strong>{pk.label}</strong>
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={() => removePasskey(pk.id)}
                    >
                      <Trash2 size={14} aria-hidden="true" /> {t("p5PasskeyDelete")}
                    </button>
                  </div>
                  <p className="field-hint">alg {pk.algorithm}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h3>{t("p5GdprTitle")}</h3>
              <p className="panel-description">{t("p5GdprSubtitle")}</p>
            </div>
            <ShieldAlert size={18} aria-hidden="true" />
          </div>
          <div className="form-actions" style={{ marginTop: 12 }}>
            <a
              className="button button-secondary button-small"
              href="/api/security/gdpr/export"
              download
            >
              <Download size={14} aria-hidden="true" /> {t("p5GdprExportBtn")}
            </a>
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => setShowAnon((v) => !v)}
            >
              {t("p5GdprAnonymizeToggle")}
            </button>
          </div>
          {showAnon && (
            <form className="form-stack" onSubmit={anonymize} style={{ marginTop: 14 }}>
              <label className="field">
                {t("p5GdprPasswordLabel")}
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                {t("p5GdprConfirmLabel")}
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="ANONYMIZE_MY_ACCOUNT"
                  required
                />
              </label>
              <button
                type="submit"
                className="button button-secondary button-small"
                disabled={action.busy}
              >
                {t("p5GdprAnonymizeBtn")}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

interface AdminPayoutItem {
  id: string;
  amountMinor: string;
  provider: string;
  state: string;
  destinationSummary: string;
  user: { displayName: string; handle: string | null; kycStatus: string };
}

interface AdminDisputeItem {
  id: string;
  activityId: string;
  campaignName: string;
  reason: string;
  evidenceNote: string;
  state: string;
  originalReviewerId: string | null;
  creator: { displayName: string; handle: string | null };
}

export function AdminPass05Queues({ onChanged }: { onChanged?: () => void }) {
  const { t, locale } = useLocale();
  const payouts = useResource<{ items: AdminPayoutItem[] }>("/payouts?scope=admin");
  const disputes = useResource<{ items: AdminDisputeItem[] }>("/disputes?scope=admin");
  const action = useAction();
  const [reasons, setReasons] = useState<Record<string, string>>({});

  async function reviewPayout(id: string, decision: "SETTLE" | "REJECT") {
    const reason =
      (reasons[id] || "").trim() ||
      (decision === "SETTLE"
        ? "Verified payout ledger settlement"
        : "Payout rejected after review");
    const ok = await action.run(() => api(`/admin/payouts/${id}/review`, { decision, reason }));
    if (ok) {
      void payouts.reload();
      onChanged?.();
    }
  }

  async function resolveDispute(id: string, decision: "OVERTURN_AND_REOPEN" | "UPHOLD_REJECTION") {
    const resolutionNote =
      (reasons[id] || "").trim() ||
      (decision === "OVERTURN_AND_REOPEN"
        ? "Independent second review upheld creator evidence"
        : "Independent second review confirmed initial rejection");
    const ok = await action.run(() =>
      api(`/admin/disputes/${id}/resolve`, { decision, resolutionNote }),
    );
    if (ok) {
      void disputes.reload();
      onChanged?.();
    }
  }

  const pendingPayouts = (payouts.data?.items ?? []).filter((p) => p.state === "REQUESTED");
  const openDisputes = (disputes.data?.items ?? []).filter((d) => d.state === "OPEN");

  return (
    <div className="dashboard-grid admin-section">
      <section className="panel">
        <div className="panel-header">
          <h3>{t("p5AdminPayoutsTitle")}</h3>
          <Wallet size={16} aria-hidden="true" />
        </div>
        {action.notice && <Notice message={action.notice} error={action.failed} />}
        {pendingPayouts.length === 0 ? (
          <Empty>{t("p5AdminPayoutsEmpty")}</Empty>
        ) : (
          <div className="list-stack">
            {pendingPayouts.map((p) => (
              <div className="payout-row" key={p.id}>
                <div className="panel-header">
                  <strong>
                    {p.user.displayName} — {minorMoney(p.amountMinor, locale)}
                  </strong>
                  <span className="tag">KYC: {p.user.kycStatus}</span>
                </div>
                <p className="panel-description">
                  {p.destinationSummary} · {p.provider}
                </p>
                <input
                  placeholder={t("p5AdminPayoutReasonPlaceholder")}
                  value={reasons[p.id] ?? ""}
                  onChange={(e) => setReasons((prev) => ({ ...prev, [p.id]: e.target.value }))}
                />
                <div className="form-actions">
                  <button
                    type="button"
                    className="button button-small"
                    disabled={action.busy}
                    onClick={() => reviewPayout(p.id, "SETTLE")}
                  >
                    {t("p5AdminPayoutSettle")}
                  </button>
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    disabled={action.busy}
                    onClick={() => reviewPayout(p.id, "REJECT")}
                  >
                    {t("p5AdminPayoutReject")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h3>{t("p5AdminDisputesTitle")}</h3>
            <p className="field-hint">{t("p5AdminFourEyesHint")}</p>
          </div>
          <Scale size={16} aria-hidden="true" />
        </div>
        {openDisputes.length === 0 ? (
          <Empty>{t("p5AdminDisputesEmpty")}</Empty>
        ) : (
          <div className="list-stack">
            {openDisputes.map((d) => (
              <div className="dispute-row" key={d.id}>
                <div className="panel-header">
                  <strong>
                    {d.campaignName} — {d.creator.displayName}
                  </strong>
                  <span className="tag">{d.state}</span>
                </div>
                <p className="panel-description">{d.reason}</p>
                {d.evidenceNote && <p className="field-hint">{d.evidenceNote}</p>}
                <input
                  placeholder={t("p5AdminDisputeNotePlaceholder")}
                  value={reasons[d.id] ?? ""}
                  onChange={(e) => setReasons((prev) => ({ ...prev, [d.id]: e.target.value }))}
                />
                <div className="form-actions">
                  <button
                    type="button"
                    className="button button-small"
                    disabled={action.busy}
                    onClick={() => resolveDispute(d.id, "OVERTURN_AND_REOPEN")}
                  >
                    {t("p5AdminDisputeOverturn")}
                  </button>
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    disabled={action.busy}
                    onClick={() => resolveDispute(d.id, "UPHOLD_REJECTION")}
                  >
                    {t("p5AdminDisputeUphold")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
