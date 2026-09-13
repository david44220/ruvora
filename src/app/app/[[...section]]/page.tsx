import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { DashboardScreen } from "@/components/dashboard";
export default async function AppPage({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section } = await params;
  const screen = section?.[0] || "overview";
  if (
    (section?.length || 0) > 1 ||
    ![
      "overview",
      "creator",
      "advertiser",
      "opportunities",
      "events",
      "wallet",
      "activity",
      "settings",
    ].includes(screen)
  )
    notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (screen === "creator" && !user.roles.includes("CREATOR")) redirect("/app/settings");
  if (screen === "advertiser" && !user.roles.includes("ADVERTISER")) redirect("/app/settings");
  return <DashboardScreen screen={screen} />;
}
