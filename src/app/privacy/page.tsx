import { LegalPage } from "@/components/public-pages";
export const metadata = { title: "Privacy", alternates: { canonical: "/privacy" } };
export default function Privacy() {
  return <LegalPage kind="privacy" />;
}
