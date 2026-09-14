import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { EconomicError } from "../domains/economy/shared";
import { db } from "./db";
import { AppError, assert } from "./errors";
import {
  assertOrigin,
  getCurrentUser,
  login,
  logout,
  publicUser,
  register,
  requireUser,
  SESSION_COOKIE,
} from "./auth";
import { getPublicProfile, saveProfile, saveProfileModules } from "./profiles";
import {
  createCampaign,
  fundCampaign,
  listCampaigns,
  reviewCampaign,
  submitCampaign,
} from "./campaigns";
import { reviewActivity, reverseActivity, submitActivity } from "./activities";
import {
  getEvent,
  joinEvent,
  listEvents,
  listManagedEvents,
  createEvent,
  reviewEvent,
  transitionEvent,
  fundEventPrize,
  disqualifyEventParticipant,
} from "./events";
import { commitDistribution, createDistributionPreview } from "./distributions";
import { getAdmin, getDashboard, setAccountHold, updateEconomicRules } from "./views";
import { z } from "zod";
import {
  ATTRIBUTION_COOKIE,
  VISITOR_COOKIE,
  startAttribution,
  bindAttribution,
  createShareLink,
} from "./attribution";
import { getCreatorAnalytics, getAdvertiserAnalytics, getGrowthAnalytics } from "./analytics";
import { createEventSettlementPreview, finalizeEventSettlement } from "./event-settlement";
import {
  beginMfaEnrollment,
  confirmMfaEnrollment,
  stepUp,
  recoverMfa,
  securityStatus,
  revokeSessions,
  requireFreshMfa,
} from "./security/mfa";
import {
  requestEmailVerification,
  requestPasswordReset,
  redeemEmailVerification,
  redeemPasswordReset,
  developmentMailbox,
} from "./security/email";
import { requestApproval, reviewApproval, listApprovals } from "./security/approvals";
import {
  depositAdvertiserBalance,
  refundAdvertiserDeposit,
  paymentSummary,
} from "./providers/payments";
import { listWebhookEvents, retryWebhook } from "./webhooks";
import { isDevelopment, validateRuntimeEnvironment } from "./environment";
import { safeReturnTo } from "../lib/navigation";
export async function readJson(request: Request): Promise<unknown> {
  assert(
    request.headers.get("content-type")?.split(";")[0] === "application/json",
    "JSON_REQUIRED",
    "Send application/json.",
    415,
  );
  const reader = request.body?.getReader();
  if (!reader) return {};
  let length = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > 32768) {
      await reader.cancel();
      throw new AppError("BODY_TOO_LARGE", "Request exceeds 32 KB.", 413);
    }
    chunks.push(chunk.value);
  }
  const joined = Buffer.concat(chunks);
  try {
    return joined.length ? JSON.parse(joined.toString("utf8")) : {};
  } catch {
    throw new AppError("INVALID_JSON", "Request body is not valid JSON.");
  }
}
export function response(value: unknown, requestId: string, status = 200) {
  return new NextResponse(
    JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item)),
    {
      status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-request-id": requestId,
      },
    },
  );
}
export async function handleApi(request: NextRequest, path: string[]) {
  const requestId = randomUUID();
  const route = path.join("/");
  const tokens = {
    attributionToken: request.cookies.get(ATTRIBUTION_COOKIE)?.value,
    visitorToken: request.cookies.get(VISITOR_COOKIE)?.value,
  };
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  try {
    if (route !== "health") validateRuntimeEnvironment();
    if (request.method === "GET") {
      if (route === "health") return response({ status: "ok", service: "ruvora" }, requestId);
      if (route === "ready") {
        await db.$queryRaw`SELECT 1`;
        if (!isDevelopment())
          assert(
            (await db.ledgerTransaction.count({ where: { isDemo: true } })) === 0 &&
              (await db.user.count({ where: { isDemo: true } })) === 0,
            "DEMO_PRODUCTION_BLOCKED",
            "A production database must not contain development seed records.",
            503,
          );
        const configured = await db.economicRule.count({ where: { active: true } });
        assert(configured > 0, "NOT_READY", "Economic policy configuration is required.", 503);
        return response(
          { status: "ready", database: "connected", policy: "configured" },
          requestId,
        );
      }
      if (route === "session") {
        const user = await getCurrentUser();
        return response({ user: user ? publicUser(user) : null }, requestId);
      }
      if (path[0] === "profiles" && path.length === 2)
        return response(await getPublicProfile(path[1]!), requestId);
      if (route === "payments/account") {
        const data = await paymentSummary(await requireUser());
        return response({ ...data, development: data.developmentFundingAvailable }, requestId);
      }
      if (route === "admin/webhooks")
        return response(await listWebhookEvents(await requireUser()), requestId);
      if (route === "events/manage")
        return response(await listManagedEvents(await requireUser()), requestId);
      if (route === "security")
        return response(
          {
            ...(await securityStatus(await requireUser(), sessionToken)),
            development: isDevelopment(),
          },
          requestId,
        );
      if (route === "security/mailbox")
        return response(await developmentMailbox(await requireUser()), requestId);
      if (route === "admin/approvals")
        return response(await listApprovals(await requireUser()), requestId);
      if (route === "analytics/creator")
        return response(await getCreatorAnalytics(await requireUser()), requestId);
      if (route === "analytics/advertiser")
        return response(await getAdvertiserAnalytics(await requireUser()), requestId);
      if (route === "admin/growth")
        return response(await getGrowthAnalytics(await requireUser()), requestId);
      if (route === "events") return response(await listEvents(), requestId);
      if (path[0] === "events" && path.length === 2)
        return response(await getEvent(path[1]!, await getCurrentUser()), requestId);
      if (route === "campaigns")
        return response(
          await listCampaigns(await getCurrentUser(), {
            forCreator: request.nextUrl.searchParams.get("forCreator") === "true",
            objective: request.nextUrl.searchParams.get("objective") || undefined,
            category: request.nextUrl.searchParams.get("category") || undefined,
          }),
          requestId,
        );
      if (route === "dashboard")
        return response(await getDashboard(await requireUser()), requestId);
      if (route === "admin") return response(await getAdmin(await requireUser()), requestId);
    }
    if (request.method === "POST") {
      assertOrigin(request);
      const input = await readJson(request);
      if (route === "attribution/start") {
        const { slug } = z
          .object({ slug: z.string().min(12).max(64) })
          .strict()
          .parse(input);
        const started = await startAttribution(slug, tokens, await getCurrentUser());
        const output = response({ ok: true, redirectTo: started.redirectTo }, requestId);
        for (const [name, value] of [
          [ATTRIBUTION_COOKIE, started.attributionToken],
          [VISITOR_COOKIE, started.visitorToken],
        ])
          output.cookies.set(name!, value!, {
            httpOnly: true,
            secure: !isDevelopment(),
            sameSite: "lax",
            path: "/",
            expires: started.expiresAt,
          });
        return output;
      }
      if (route === "security/password/request")
        return response(await requestPasswordReset(input), requestId);
      if (route === "security/password/reset")
        return response(await redeemPasswordReset(input), requestId);
      if (route === "security/email/redeem")
        return response(await redeemEmailVerification(input), requestId);
      if (route === "auth/register" || route === "auth/login") {
        const result = await (route === "auth/register" ? register(input) : login(input));
        const output = response(
          {
            user: result.user,
            returnTo: safeReturnTo(request.cookies.get("ruvora_return")?.value),
          },
          requestId,
          route === "auth/register" ? 201 : 200,
        );
        output.cookies.set(SESSION_COOKIE, result.session.token, {
          httpOnly: true,
          secure: !isDevelopment(),
          sameSite: "lax",
          path: "/",
          expires: result.session.expiresAt,
        });
        const registered = route === "auth/register";
        const fresh = await db.user.findUniqueOrThrow({ where: { id: result.user.id } });
        try {
          await bindAttribution(fresh, tokens, { registration: registered });
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          output.cookies.delete(ATTRIBUTION_COOKIE);
          output.cookies.delete(VISITOR_COOKIE);
          if (registered) await bindAttribution(fresh, undefined, { registration: true });
        }
        return output;
      }
      if (route === "auth/logout") {
        await logout(request.cookies.get(SESSION_COOKIE)?.value);
        const output = response({ ok: true }, requestId);
        output.cookies.set(SESSION_COOKIE, "", {
          httpOnly: true,
          secure: !isDevelopment(),
          sameSite: "lax",
          path: "/",
          maxAge: 0,
        });
        return output;
      }
      const user = await requireUser();
      if (route === "payments/deposit")
        return response(await depositAdvertiserBalance(user, input), requestId);
      if (route === "payments/refund")
        return response(await refundAdvertiserDeposit(user, input), requestId);
      if (path[0] === "admin" && path[1] === "webhooks" && path.length === 4 && path[3] === "retry")
        return response(await retryWebhook(user, sessionToken, path[2]!, input), requestId);
      if (route === "shares") return response(await createShareLink(user, input), requestId, 201);
      if (route === "profile/modules")
        return response(await saveProfileModules(user, input), requestId);
      if (route === "security/email/request")
        return response(await requestEmailVerification(user), requestId);
      if (route === "security/mfa/begin")
        return response(await beginMfaEnrollment(user, sessionToken, input), requestId);
      if (route === "security/mfa/confirm")
        return response(await confirmMfaEnrollment(user, sessionToken, input), requestId);
      if (route === "security/mfa/step-up")
        return response(await stepUp(user, sessionToken, input), requestId);
      if (route === "security/mfa/recover")
        return response(await recoverMfa(user, sessionToken, input), requestId);
      if (route === "security/sessions/revoke")
        return response(await revokeSessions(user, sessionToken, input), requestId);
      if (route === "admin/approvals")
        return response(await requestApproval(user, sessionToken, input), requestId, 201);
      if (
        path[0] === "admin" &&
        path[1] === "approvals" &&
        path.length === 4 &&
        path[3] === "review"
      )
        return response(await reviewApproval(user, sessionToken, path[2]!, input), requestId);
      if (route === "events") return response(await createEvent(user, input), requestId, 201);
      if (path[0] === "events" && path.length === 3 && path[2] === "fund")
        return response(await fundEventPrize(user, path[1]!, input), requestId);
      if (path[0] === "events" && path.length === 3 && path[2] === "transition")
        return response(await transitionEvent(user, path[1]!, input), requestId);
      if (path[0] === "admin" && path[1] === "events" && path.length === 4) {
        const id = path[2]!;
        if (path[3] === "review") return response(await reviewEvent(user, id, input), requestId);
        if (path[3] === "preview")
          return response(await createEventSettlementPreview(user, id), requestId);
        if (path[3] === "settle") {
          await requireFreshMfa(user, sessionToken);
          return response(await finalizeEventSettlement(user, id, input), requestId);
        }
        if (path[3] === "disqualify") {
          await requireFreshMfa(user, sessionToken);
          return response(await disqualifyEventParticipant(user, id, input), requestId);
        }
      }
      if (
        route === "admin/rules" ||
        route === "admin/distributions/finalize" ||
        (path[0] === "admin" && ["reverse", "hold"].includes(path.at(-1) || ""))
      )
        await requireFreshMfa(user, sessionToken);
      if (route === "profile") return response(await saveProfile(user, input), requestId);
      if (route === "campaigns") return response(await createCampaign(user, input), requestId, 201);
      if (path[0] === "campaigns" && path.length === 3 && path[2] === "fund")
        return response(await fundCampaign(user, path[1]!, input), requestId);
      if (path[0] === "campaigns" && path.length === 3 && path[2] === "submit")
        return response(await submitCampaign(user, path[1]!), requestId);
      if (route === "activities")
        return response(await submitActivity(user, input, tokens), requestId, 201);
      if (path[0] === "events" && path.length === 3 && path[2] === "join")
        return response(await joinEvent(user, path[1]!, tokens), requestId);
      if (
        path[0] === "admin" &&
        path[1] === "campaigns" &&
        path.length === 4 &&
        path[3] === "review"
      )
        return response(await reviewCampaign(user, path[2]!, input), requestId);
      if (
        path[0] === "admin" &&
        path[1] === "activities" &&
        path.length === 4 &&
        path[3] === "review"
      )
        return response(await reviewActivity(user, path[2]!, input), requestId);
      if (
        path[0] === "admin" &&
        path[1] === "activities" &&
        path.length === 4 &&
        path[3] === "reverse"
      )
        return response(await reverseActivity(user, path[2]!, input), requestId);
      if (path[0] === "admin" && path[1] === "users" && path.length === 4 && path[3] === "hold")
        return response(await setAccountHold(user, path[2]!, input), requestId);
      if (route === "admin/rules")
        return response(await updateEconomicRules(user, input), requestId);
      if (route === "admin/distributions/preview")
        return response(await createDistributionPreview(user, input), requestId);
      if (route === "admin/distributions/finalize")
        return response(await commitDistribution(user, input), requestId);
    }
    return response(
      { error: { code: "NOT_FOUND", message: "Endpoint not found." }, requestId },
      requestId,
      404,
    );
  } catch (error) {
    let status = 500,
      code = "INTERNAL_ERROR",
      message = "The operation could not be completed. Try again later.";
    if (error instanceof AppError) {
      status = error.status;
      code = error.code;
      message = error.message;
    } else if (error instanceof ZodError) {
      status = 400;
      code = "VALIDATION_ERROR";
      message = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .slice(0, 5)
        .join("; ");
    } else if (error instanceof EconomicError) {
      status = 409;
      code = error.code;
      message = "The economic operation did not meet integrity requirements.";
    } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      status = 409;
      code = "CONFLICT";
      message = "This record or operation key already exists.";
    } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      status = 404;
      code = "NOT_FOUND";
      message = "Record not found.";
    }
    if (route === "ready" && status === 500) {
      status = 503;
      code = "NOT_READY";
      message = "A required service is unavailable.";
    }
    console.error(
      JSON.stringify({
        level: status >= 500 ? "error" : "warn",
        requestId,
        method: request.method,
        route,
        code,
        status,
      }),
    );
    return response({ error: { code, message }, requestId }, requestId, status);
  }
}
