import { redirect } from "next/navigation";
import { getCurrentUser, publicUser } from "@/server/auth";
import { AppShell } from "@/components/dashboard";
import type { User } from "@/lib/types";
export const dynamic = "force-dynamic";
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.onboarded) redirect("/onboarding");
  return (
    <AppShell user={publicUser(user) as User} development={process.env.APP_ENV !== "production"}>
      {children}
    </AppShell>
  );
}
