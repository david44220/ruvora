import { redirect } from "next/navigation";
import { getCurrentUser, publicUser } from "@/server/auth";
import { AppShell } from "@/components/dashboard";
import { AdminScreen } from "@/components/admin";
import type { User } from "@/lib/types";
export const dynamic = "force-dynamic";
export default async function Admin() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.roles.includes("ADMIN")) redirect("/app");
  return (
    <AppShell
      user={JSON.parse(JSON.stringify(publicUser(user))) as User}
      development={process.env.APP_ENV !== "production"}
    >
      <AdminScreen />
    </AppShell>
  );
}
