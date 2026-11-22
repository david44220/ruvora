import type { User } from "@prisma/client";
import { db } from "./db";
import { assert } from "./errors";

export type WorkspacePermission = "VIEW" | "MANAGE_CAMPAIGNS" | "BILLING" | "OWNER_ONLY";

export type ResolvedWorkspace = {
  ownerId: string;
  actorId: string;
  role: "OWNER" | "CAMPAIGN_MANAGER" | "BILLING" | "VIEWER" | "ADMIN";
  isDelegated: boolean;
};

const ROLE_PERMISSIONS: Record<string, Set<WorkspacePermission>> = {
  OWNER: new Set(["VIEW", "MANAGE_CAMPAIGNS", "BILLING", "OWNER_ONLY"]),
  ADMIN: new Set(["VIEW", "MANAGE_CAMPAIGNS", "BILLING", "OWNER_ONLY"]),
  CAMPAIGN_MANAGER: new Set(["VIEW", "MANAGE_CAMPAIGNS"]),
  BILLING: new Set(["VIEW", "BILLING"]),
  VIEWER: new Set(["VIEW"]),
};

/**
 * Resolves the active advertiser workspace for a user and enforces WorkspaceMember RBAC.
 * - Without workspaceId (or workspaceId === user.id): requires ADVERTISER or ADMIN role on self.
 * - With delegated workspaceId !== user.id: verifies active WorkspaceMember row and role permission.
 */
export async function resolveAdvertiserWorkspace(
  user: User,
  workspaceId: string | null | undefined,
  permission: WorkspacePermission,
): Promise<ResolvedWorkspace> {
  const requested = workspaceId?.trim();
  if (!requested || requested === user.id) {
    assert(
      user.roles.includes("ADVERTISER") || user.roles.includes("ADMIN"),
      "FORBIDDEN",
      "Advertiser workspace access is required.",
      403,
    );
    return {
      ownerId: user.id,
      actorId: user.id,
      role: user.roles.includes("ADMIN") && !user.roles.includes("ADVERTISER") ? "ADMIN" : "OWNER",
      isDelegated: false,
    };
  }

  if (user.roles.includes("ADMIN")) {
    const owner = await db.user.findUnique({ where: { id: requested }, select: { id: true } });
    assert(owner, "WORKSPACE_NOT_FOUND", "Advertiser workspace not found.", 404);
    return { ownerId: owner.id, actorId: user.id, role: "ADMIN", isDelegated: true };
  }

  const membership = await db.workspaceMember.findUnique({
    where: { ownerId_memberId: { ownerId: requested, memberId: user.id } },
  });
  assert(membership, "FORBIDDEN", "You are not a member of this advertiser workspace.", 403);
  const allowed = ROLE_PERMISSIONS[membership.role];
  assert(
    allowed && allowed.has(permission),
    "WORKSPACE_PERMISSION_DENIED",
    `Workspace role ${membership.role} does not allow ${permission}.`,
    403,
  );
  return {
    ownerId: membership.ownerId,
    actorId: user.id,
    role: membership.role as ResolvedWorkspace["role"],
    isDelegated: true,
  };
}

export async function listAccessibleWorkspaces(user: User) {
  const memberships = await db.workspaceMember.findMany({
    where: { memberId: user.id },
    include: { owner: { select: { id: true, displayName: true, handle: true } } },
    orderBy: { createdAt: "desc" },
  });

  const workspaces: {
    ownerId: string;
    displayName: string;
    handle: string | null;
    role: string;
    isOwn: boolean;
  }[] = [];

  if (user.roles.includes("ADVERTISER") || user.roles.includes("ADMIN")) {
    workspaces.push({
      ownerId: user.id,
      displayName: user.displayName,
      handle: user.handle,
      role: "OWNER",
      isOwn: true,
    });
  }
  for (const m of memberships) {
    if (m.owner.id === user.id) continue;
    workspaces.push({
      ownerId: m.owner.id,
      displayName: m.owner.displayName,
      handle: m.owner.handle,
      role: m.role,
      isOwn: false,
    });
  }
  return workspaces;
}
