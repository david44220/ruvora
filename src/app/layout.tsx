import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LocaleProvider } from "@/i18n/provider";
import "./globals.css";
import { messages } from "@/i18n/messages";
const origin = process.env.PUBLIC_SITE_URL || "http://localhost:3000";
export const metadata: Metadata = {
  metadataBase: new URL(origin),
  title: { default: "Ruvora — Your presence. Real potential.", template: "%s · Ruvora" },
  description:
    "Turn your social presence into an economy. The independent home for creators, communities and meaningful participation.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Ruvora",
    title: "Ruvora — Your presence. Real potential.",
    description: "Turn your social presence into an economy.",
    images: [{ url: "/assets/share/ruvora-home.webp", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/favicon.svg" },
  robots:
    process.env.APP_ENV === "production"
      ? { index: true, follow: true }
      : { index: false, follow: false },
};
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = (await cookies()).get("ruvora_locale")?.value === "fr" ? "fr" : "en";
  return (
    <html lang={locale}>
      <body>
        <LocaleProvider initialLocale={locale}>
          <a className="skip-link" href="#main">
            {messages[locale].skipContent}
          </a>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
