import { NextRequest, NextResponse } from "next/server";
import { ATTRIBUTION_COOKIE, VISITOR_COOKIE, startAttribution } from "@/server/attribution";
import { clientIp, getCurrentUser, limitRate } from "@/server/auth";
import { isDevelopment, validateRuntimeEnvironment } from "@/server/environment";
import { AppError } from "@/server/errors";
import { safeReturnTo } from "@/lib/navigation";
import { isShareRecoveryCode, isShareSlug, type ShareRecoveryCode } from "@/lib/share-recovery";

function redirectBase(request: NextRequest): string {
  const configured = process.env.APP_URL;
  if (configured) {
    try {
      const canonical = new URL(configured);
      if (isDevelopment()) {
        const reqUrl = new URL(request.url);
        if (reqUrl.hostname === "localhost" || reqUrl.hostname === "127.0.0.1") {
          return reqUrl.origin;
        }
      }
      return canonical.origin;
    } catch {
      // Fall back to request URL only if APP_URL is unparseable in isolated tests.
    }
  }
  return request.url;
}

function recoverShare(request: NextRequest, code: ShareRecoveryCode, slug: string) {
  const destination = new URL("/share-unavailable", redirectBase(request));
  destination.searchParams.set("code", code);
  const resetContext = code === "ATTRIBUTION_ACCOUNT_MISMATCH";
  if (resetContext && isShareSlug(slug)) destination.searchParams.set("retry", slug);
  const output = NextResponse.redirect(destination);
  output.headers.set("Cache-Control", "private, no-store");
  if (resetContext)
    for (const name of [ATTRIBUTION_COOKIE, VISITOR_COOKIE, "ruvora_return"])
      output.cookies.set(name, "", {
        httpOnly: true,
        secure: !isDevelopment(),
        sameSite: "lax",
        path: "/",
        maxAge: 0,
        expires: new Date(0),
      });
  return output;
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  validateRuntimeEnvironment();
  try {
    await limitRate("go-ip", clientIp(request), 120, 60);
  } catch (error) {
    if (error instanceof AppError && error.code === "RATE_LIMITED") {
      return new NextResponse("Too many requests.", {
        status: 429,
        headers: { "cache-control": "no-store", "retry-after": "60" },
      });
    }
    throw error;
  }
  const { slug } = await params;
  if (!isShareSlug(slug)) return recoverShare(request, "SHARE_LINK_INVALID", slug);
  const user = await getCurrentUser();
  const userAgent = request.headers.get("user-agent");
  const acceptLanguage = request.headers.get("accept-language");
  const tokens = {
    attributionToken: request.cookies.get(ATTRIBUTION_COOKIE)?.value,
    visitorToken: request.cookies.get(VISITOR_COOKIE)?.value,
  };
  let started: Awaited<ReturnType<typeof startAttribution>>;
  try {
    started =
      userAgent || acceptLanguage
        ? await startAttribution(slug, tokens, user, { userAgent, acceptLanguage })
        : await startAttribution(slug, tokens, user);
  } catch (error) {
    if (error instanceof AppError && error.status < 500 && isShareRecoveryCode(error.code))
      return recoverShare(request, error.code, slug);
    throw error;
  }
  const destination = user
    ? started.redirectTo === "/register"
      ? "/app"
      : started.redirectTo
    : started.redirectTo.startsWith("/app/")
      ? "/register"
      : started.redirectTo;
  const output = NextResponse.redirect(new URL(destination, redirectBase(request)));
  output.headers.set("Cache-Control", "private, no-store");
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
  if (started.redirectTo.startsWith("/app/") || started.redirectTo.startsWith("/events/"))
    output.cookies.set("ruvora_return", safeReturnTo(started.redirectTo), {
      httpOnly: true,
      secure: !isDevelopment(),
      sameSite: "lax",
      path: "/",
      maxAge: 3600,
    });
  return output;
}
