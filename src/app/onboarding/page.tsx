import { cookies } from "next/headers";
import { OnboardingPage } from "@/components/auth";
import { safeReturnTo } from "@/lib/navigation";
export default async function Onboarding() {
  const jar = await cookies();
  return <OnboardingPage returnTo={safeReturnTo(jar.get("ruvora_return")?.value)} />;
}
