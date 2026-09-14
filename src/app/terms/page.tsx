import { LegalPage } from "@/components/public-pages";
export const metadata = { title: "Platform principles", alternates: { canonical: "/terms" } };
export default function Terms() {
  return <LegalPage kind="terms" />;
}
