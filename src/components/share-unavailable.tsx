"use client";
import { useLocale } from "@/i18n/provider";
import { errorMessage } from "@/i18n/errors";
import type { ShareRecoveryCode } from "@/lib/share-recovery";
import { PublicNav, Footer, ButtonLink, Notice } from "./ui";
export function ShareUnavailable({
  code,
  retryPath,
}: {
  code: ShareRecoveryCode;
  retryPath: string | null;
}) {
  const { t, locale } = useLocale();
  return (
    <>
      <PublicNav />
      <main className="public-page" id="main">
        <div className="error-page">
          <h1>{t("p2ShareUnavailableTitle")}</h1>
          <Notice error message={errorMessage(code, locale)} />
          {retryPath && (
            <>
              <p>{t("p2ShareContextReset")}</p>
              <a href={retryPath} className="button">
                {t("p2ShareRetry")}
              </a>
              <ButtonLink href="/login" secondary>
                {t("login")}
              </ButtonLink>
            </>
          )}
          {code === "SELF_ATTRIBUTION" && (
            <ButtonLink href="/app">{t("returnDashboard")}</ButtonLink>
          )}
          <ButtonLink href="/" secondary>
            {t("backHome")}
          </ButtonLink>
        </div>
      </main>
      <Footer />
    </>
  );
}
