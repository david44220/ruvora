"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/provider";
import { api } from "@/lib/api";
import { useAction, useResource } from "@/lib/hooks";
import { PageTitle } from "./workspace-ui";
import { Notice, Loading, Empty, PublicNav, Footer } from "./ui";
interface SecurityData {
  development: boolean;
  emailVerified: boolean;
  mfaEnabled: boolean;
  currentSessionId: string;
  recoveryCodesRemaining: number;
  sessions: { id: string; createdAt: string; expiresAt: string; mfaVerifiedAt: string | null }[];
}
function PasswordField() {
  const { t } = useLocale();
  return (
    <label className="field">
      {t("password")}
      <input
        name="password"
        type="password"
        autoComplete="current-password"
        minLength={12}
        maxLength={128}
        required
      />
    </label>
  );
}
function CodeField() {
  const { t } = useLocale();
  return (
    <label className="field">
      {t("p2MfaCode")}
      <input
        name="code"
        autoComplete="one-time-code"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        required
      />
    </label>
  );
}
export function SecurityScreen() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const state = useResource<SecurityData>("/security");
  const action = useAction();
  const [enrollment, setEnrollment] = useState<{
    enrollmentId: string;
    secret: string;
    otpauthUrl: string;
  } | null>(null);
  const [recovery, setRecovery] = useState<string[]>([]);
  const [mail, setMail] = useState<
    | {
        id: string;
        purpose: string;
        createdAt: string;
        message: { template: string; variables: Record<string, string> };
      }[]
    | null
  >(null);
  async function form(e: FormEvent<HTMLFormElement>, path: string) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    const result = await action.run(
      () =>
        api<{
          enrollmentId?: string;
          secret?: string;
          otpauthUrl?: string;
          recoveryCodes?: string[];
        }>(path, {
          ...values,
          ...(path.endsWith("confirm") ? { enrollmentId: enrollment!.enrollmentId } : {}),
        }),
      t(
        path.endsWith("step-up")
          ? "p2StepUpSuccess"
          : path.endsWith("confirm")
            ? "p2MfaConfirmed"
            : "saved",
      ),
    );
    if (result) {
      if (result.enrollmentId)
        setEnrollment(result as { enrollmentId: string; secret: string; otpauthUrl: string });
      if (result.recoveryCodes) {
        setRecovery(result.recoveryCodes);
        setEnrollment(null);
      }
      if (path.endsWith("revoke") || path.endsWith("recover")) {
        router.push("/login");
        router.refresh();
      } else await state.reload();
    }
  }
  if (state.loading) return <Loading />;
  if (!state.data) return <Notice error message={t("unavailable")} />;
  return (
    <>
      <PageTitle title={t("p2AccountSecurity")} description={t("p2SecurityIntro")} />
      {action.notice && <Notice message={action.notice} error={action.failed} />}
      <div className="security-grid">
        <section className="panel">
          <h3>{t("p2EmailVerification")}</h3>
          <p className="panel-description">
            {t(state.data.emailVerified ? "p2EmailVerified" : "p2EmailUnverified")}
          </p>
          <button
            className="button button-small"
            disabled={state.data.emailVerified || action.busy}
            onClick={() => action.run(() => api("/security/email/request", {}), t("p2EmailQueued"))}
          >
            {t("p2SendVerification")}
          </button>
        </section>
        <section className="panel">
          <h3>{t("p2Authenticator")}</h3>
          <p className="panel-description">
            {t(state.data.mfaEnabled ? "p2MfaEnabled" : "p2MfaDisabled")}
          </p>
          {!state.data.mfaEnabled && !enrollment && (
            <form className="form-stack" onSubmit={(e) => form(e, "/security/mfa/begin")}>
              <PasswordField />
              <button className="button button-small" disabled={action.busy}>
                {t("p2BeginMfa")}
              </button>
            </form>
          )}
          {enrollment && (
            <form className="form-stack" onSubmit={(e) => form(e, "/security/mfa/confirm")}>
              <p className="panel-description">{t("p2MfaSetup")}</p>
              <label className="field">
                {t("p2MfaSecret")}
                <input readOnly value={enrollment.secret} autoComplete="off" />
              </label>
              <CodeField />
              <button className="button button-small" disabled={action.busy}>
                {t("p2ConfirmMfa")}
              </button>
            </form>
          )}
          {recovery.length > 0 && (
            <div className="recovery-codes">
              <p>{t("p2RecoveryNote")}</p>
              <pre>{recovery.join("\n")}</pre>
            </div>
          )}
        </section>
        <section className="panel">
          <h3>{t("p2StepUp")}</h3>
          <p className="panel-description">{t("p2StepUpIntro")}</p>
          <form className="form-stack" onSubmit={(e) => form(e, "/security/mfa/step-up")}>
            <PasswordField />
            <CodeField />
            <button
              className="button button-small"
              disabled={action.busy || !state.data.mfaEnabled}
            >
              {t("p2StepUp")}
            </button>
          </form>
        </section>
        <section className="panel">
          <h3>{t("p2Sessions")}</h3>
          <div className="compact-list">
            {state.data.sessions.map((session) => (
              <div key={session.id}>
                <span>
                  {session.id === state.data!.currentSessionId
                    ? t("p2CurrentSession")
                    : t("p2OtherSession")}
                </span>
                <time>{new Date(session.createdAt).toLocaleString(locale)}</time>
              </div>
            ))}
          </div>
          <form className="form-stack" onSubmit={(e) => form(e, "/security/sessions/revoke")}>
            <PasswordField />
            <button className="button button-secondary button-small" disabled={action.busy}>
              {t("p2RevokeSessions")}
            </button>
          </form>
        </section>
      </div>
      <details className="panel admin-section">
        <summary>{t("p2MfaRecovery")}</summary>
        <p className="panel-description">{t("p2RecoveryIntro")}</p>
        <form className="form-stack" onSubmit={(e) => form(e, "/security/mfa/recover")}>
          <PasswordField />
          <label className="field">
            {t("p2RecoveryCode")}
            <input name="recoveryCode" autoComplete="off" required />
          </label>
          <button className="button button-secondary" disabled={action.busy}>
            {t("p2MfaRecovery")}
          </button>
        </form>
      </details>
      {state.data.development && (
        <DevMailbox
          messages={mail}
          busy={action.busy}
          onLoad={async () => {
            const result = await action.run(() =>
              api<{ messages: NonNullable<typeof mail> }>("/security/mailbox"),
            );
            if (result) setMail(result.messages);
          }}
        />
      )}
    </>
  );
}
function DevMailbox({
  messages,
  busy,
  onLoad,
}: {
  messages:
    | {
        id: string;
        purpose: string;
        createdAt: string;
        message: { template: string; variables: Record<string, string> };
      }[]
    | null;
  busy: boolean;
  onLoad: () => void;
}) {
  const { t } = useLocale();
  return (
    <details className="panel admin-section">
      <summary>{t("p2DevInbox")}</summary>
      <p className="panel-description">{t("p2DevInboxNote")}</p>
      <button className="button button-secondary button-small" onClick={onLoad} disabled={busy}>
        {t("p2OpenMail")}
      </button>
      {messages?.map((item) => {
        const mailUrl = item.message.variables.url;
        return (
          <article className="mail-item" key={item.id}>
            <h4>
              {t(
                item.message.template === "VERIFY_EMAIL"
                  ? "p2EmailVerification"
                  : item.message.template === "RESET_PASSWORD"
                    ? "p2ResetPassword"
                    : item.message.template === "ACCOUNT_SECURITY_CHANGED"
                      ? "p2AccountSecurity"
                      : "p2ResetComplete",
              )}
            </h4>
            {mailUrl && (
              <Link href={mailUrl} className="text-link">
                {t("p2OpenMail")}
              </Link>
            )}
          </article>
        );
      })}
      {messages?.length === 0 && <Empty />}
    </details>
  );
}
export function SecurityLinkPage({ mode }: { mode: "request" | "reset" | "verify" }) {
  const { t } = useLocale();
  const action = useAction();
  const [token, setToken] = useState("");
  const tokenRead = useRef(false);
  useEffect(() => {
    if (tokenRead.current) return;
    tokenRead.current = true;
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    queueMicrotask(() => setToken(value));
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    await action.run(
      () =>
        api(
          mode === "request"
            ? "/security/password/request"
            : mode === "reset"
              ? "/security/password/reset"
              : "/security/email/redeem",
          mode === "request" ? values : { ...values, token },
        ),
      t(
        mode === "request"
          ? "p2EmailQueued"
          : mode === "reset"
            ? "p2ResetComplete"
            : "p2VerificationComplete",
      ),
    );
  }
  return (
    <>
      <PublicNav />
      <main className="wrap security-link-page" id="main">
        <PageTitle
          title={t(
            mode === "request"
              ? "p2ForgotPassword"
              : mode === "reset"
                ? "p2ResetPassword"
                : "p2EmailVerification",
          )}
        />
        <form className="panel form-stack" onSubmit={submit}>
          {mode === "request" && (
            <label className="field">
              {t("email")}
              <input name="email" type="email" autoComplete="email" required />
            </label>
          )}
          {mode === "reset" && (
            <label className="field">
              {t("p2NewPassword")}
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </label>
          )}
          {action.notice && <Notice message={action.notice} error={action.failed} />}
          <button className="button" disabled={action.busy || (mode !== "request" && !token)}>
            {t(
              mode === "request"
                ? "p2RequestReset"
                : mode === "reset"
                  ? "p2ResetPassword"
                  : "p2EmailVerification",
            )}
          </button>
          <Link className="text-link" href="/login">
            {t("login")}
          </Link>
        </form>
      </main>
      <Footer />
    </>
  );
}
