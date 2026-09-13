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
import { getPublicProfile, saveProfile } from "./profiles";
import {
  createCampaign,
  fundCampaign,
  listCampaigns,
  reviewCampaign,
  submitCampaign,
} from "./campaigns";
import { reviewActivity, reverseActivity, submitActivity } from "./activities";
import { getEvent, joinEvent, listEvents } from "./events";
import { commitDistribution, createDistributionPreview } from "./distributions";
import { getAdmin, getDashboard, setAccountHold, updateEconomicRules } from "./views";
async function readJson(request: Request): Promise<unknown> {
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
function response(value: unknown, requestId: string, status = 200) {
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
  try {
    if (request.method === "GET") {
      if (route === "health") return response({ status: "ok", service: "ruvora" }, requestId);
      if (route === "ready") {
        await db.$queryRaw`SELECT 1`;
        if (process.env.NODE_ENV === "production")
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
      if (route === "events") return response(await listEvents(), requestId);
      if (path[0] === "events" && path.length === 2)
        return response(await getEvent(path[1]!, await getCurrentUser()), requestId);
      if (route === "campaigns")
        return response(await listCampaigns(await getCurrentUser()), requestId);
      if (route === "dashboard")
        return response(await getDashboard(await requireUser()), requestId);
      if (route === "admin") return response(await getAdmin(await requireUser()), requestId);
    }
    if (request.method === "POST") {
      assertOrigin(request);
      const input = await readJson(request);
      if (route === "auth/register" || route === "auth/login") {
        const result = await (route === "auth/register" ? register(input) : login(input));
        const output = response(
          { user: result.user },
          requestId,
          route === "auth/register" ? 201 : 200,
        );
        output.cookies.set(SESSION_COOKIE, result.session.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          expires: result.session.expiresAt,
        });
        return output;
      }
      if (route === "auth/logout") {
        await logout(request.cookies.get(SESSION_COOKIE)?.value);
        const output = response({ ok: true }, requestId);
        output.cookies.set(SESSION_COOKIE, "", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 0,
        });
        return output;
      }
      const user = await requireUser();
      if (route === "profile") return response(await saveProfile(user, input), requestId);
      if (route === "campaigns") return response(await createCampaign(user, input), requestId, 201);
      if (path[0] === "campaigns" && path.length === 3 && path[2] === "fund")
        return response(await fundCampaign(user, path[1]!, input), requestId);
      if (path[0] === "campaigns" && path.length === 3 && path[2] === "submit")
        return response(await submitCampaign(user, path[1]!), requestId);
      if (route === "activities")
        return response(await submitActivity(user, input), requestId, 201);
      if (path[0] === "events" && path.length === 3 && path[2] === "join")
        return response(await joinEvent(user, path[1]!), requestId);
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
