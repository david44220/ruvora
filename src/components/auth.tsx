"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, Fingerprint, Aperture, Users } from "lucide-react";
import { useLocale } from "@/i18n/provider";
import { api } from "@/lib/api";
import { useAction, useResource } from "@/lib/hooks";
import { type Role, type User } from "@/lib/types";
import { Brand, LanguageSwitch, Orb, Eyebrow, Notice, Loading } from "./ui";
import { ProfileForm } from "./profile-editor";
export { ProfileForm } from "./profile-editor";
export function AuthPage({
  mode,
  initialRole = "USER",
  referral,
}: {
  mode: "login" | "register";
  initialRole?: Role;
  referral?: string;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [role, setRole] = useState<Role>(initialRole === "ADMIN" ? "USER" : initialRole);
  const action = useAction();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    const body =
      mode === "login"
        ? { email: values.get("email"), password: values.get("password") }
        : {
            email: values.get("email"),
            password: values.get("password"),
            displayName: values.get("displayName"),
            role,
            locale,
            ...(referral ? { referralHandle: referral } : {}),
          };
    const result = await action.run(() => api<{ user: User }>(`/auth/${mode}`, body));
    if (result) {
      router.push(result.user.onboarded ? "/app" : "/onboarding");
      router.refresh();
    }
  }
  return (
    <main className="auth-page" id="main">
      <div className="auth-visual">
        <Brand />
        <Orb size={750} priority sizes="(max-width: 760px) 440px, 750px" />
        <div className="auth-visual-copy">
          <Eyebrow>{t("heroEyebrow")}</Eyebrow>
          <h1>
            {t("heroLine1")}
            <br />
            {t("heroLine2")}
          </h1>
          <p>{t("heroDescription")}</p>
        </div>
      </div>
      <div className="auth-main">
        <div className="auth-language">
          <LanguageSwitch />
        </div>
        <div className="auth-form">
          <Eyebrow>{t("brand")}</Eyebrow>
          <h2>{t(mode === "login" ? "login" : "register")}</h2>
          <p>{t(mode === "login" ? "loginIntro" : "registerIntro")}</p>
          {referral && <Notice message={t("referralNote")} />}
          <form onSubmit={submit} className="form-stack">
            {mode === "register" && (
              <label className="field">
                {t("name")}
                <input
                  name="displayName"
                  autoComplete="name"
                  minLength={2}
                  maxLength={60}
                  required
                />
              </label>
            )}
            <label className="field">
              {t("email")}
              <input name="email" type="email" autoComplete="email" required maxLength={254} />
            </label>
            <label className="field">
              {t("password")}
              <input
                name="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={12}
                maxLength={128}
                required
              />
              {mode === "register" && <span className="field-hint">{t("passwordHint")}</span>}
            </label>
            {mode === "register" && (
              <fieldset className="role-options">
                <legend>{t("roleQuestion")}</legend>
                {(["USER", "CREATOR", "ADVERTISER"] as const).map((r) => (
                  <label className="role-option" key={r}>
                    <input
                      type="radio"
                      name="role"
                      value={r}
                      checked={role === r}
                      onChange={() => setRole(r)}
                    />
                    {r === "USER" ? (
                      <Users size={18} />
                    ) : r === "CREATOR" ? (
                      <Fingerprint size={18} />
                    ) : (
                      <Aperture size={18} />
                    )}
                    <span>{t(`role${r}`)}</span>
                  </label>
                ))}
                <span className="field-hint">{t("authNote")}</span>
              </fieldset>
            )}
            {action.notice && <Notice message={action.notice} error={action.failed} />}
            <button className="button" disabled={action.busy}>
              {t(action.busy ? "working" : mode === "login" ? "login" : "continue")}
              <ArrowRight size={17} />
            </button>
            {mode === "register" && (
              <p className="form-legal">
                {t("registrationTerms")} <Link href="/terms">{t("terms")}</Link> ·{" "}
                <Link href="/privacy">{t("privacy")}</Link>
              </p>
            )}
          </form>
          <div className="form-footer">
            {t(mode === "login" ? "accountNew" : "accountAlready")}
            <Link href={mode === "login" ? "/register" : "/login"}>
              {t(mode === "login" ? "register" : "login")}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
export function OnboardingPage() {
  const { t } = useLocale();
  const router = useRouter();
  const resource = useResource<{ user: User | null }>("/session");
  if (resource.loading) return <Loading />;
  if (!resource.data?.user)
    return (
      <div className="error-page">
        <Notice error message={t("sessionExpired")} />
        <Link className="button" href="/login">
          {t("login")}
        </Link>
      </div>
    );
  return (
    <>
      <div className="nav-inner">
        <Brand />
        <LanguageSwitch />
      </div>
      <main className="wrap onboarding-page" id="main">
        <div className="section-title">
          <Eyebrow>{t("brand")}</Eyebrow>
          <h1>{t("onboardingTitle")}</h1>
          <p>{t("onboardingIntro")}</p>
        </div>
        <div className="panel">
          <ProfileForm
            user={resource.data.user}
            onSaved={() => {
              router.push("/app");
              router.refresh();
            }}
          />
        </div>
      </main>
    </>
  );
}
