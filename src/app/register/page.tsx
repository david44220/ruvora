import { AuthPage } from "@/components/auth";
import { type Role } from "@/lib/types";
export default async function Register({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; ref?: string }>;
}) {
  const p = await searchParams;
  const role: Role =
    p.role === "CREATOR" ? "CREATOR" : p.role === "ADVERTISER" ? "ADVERTISER" : "USER";
  return <AuthPage mode="register" initialRole={role} referral={p.ref} />;
}
