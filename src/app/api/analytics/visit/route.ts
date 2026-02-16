import { NextRequest, NextResponse } from "next/server";

const CORE_API_BASE_URL = process.env.CORE_API_BASE_URL?.trim() ?? "";
const ANALYTICS_SERVICE_TOKEN = process.env.ANALYTICS_SERVICE_TOKEN?.trim() ?? "";

function resolveIp(request: NextRequest): string | undefined {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || undefined;
}

function normalizePathname(value: unknown): string {
  if (typeof value !== "string") {
    return "/";
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.length > 256) {
    return "/";
  }
  return trimmed;
}

export async function POST(request: NextRequest) {
  if (!CORE_API_BASE_URL || !ANALYTICS_SERVICE_TOKEN) {
    return NextResponse.json(
      { accepted: false, reason: "analytics_not_configured" },
      { status: 202 }
    );
  }

  let pathname = "/";
  try {
    const payload = (await request.json()) as { pathname?: unknown };
    pathname = normalizePathname(payload.pathname);
  } catch {
    pathname = "/";
  }

  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const referer = request.headers.get("referer");
  const ip = resolveIp(request);

  try {
    await fetch(`${CORE_API_BASE_URL}/api/v1/internal/analytics/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-service-token": ANALYTICS_SERVICE_TOKEN
      },
      body: JSON.stringify({
        source: "frontend",
        eventType: "web_page_view",
        status: "ok",
        route: pathname,
        ip,
        metadata: {
          userAgent,
          referer: referer ?? null
        }
      }),
      cache: "no-store"
    });
  } catch {
    // Ignore failures so frontend rendering is never blocked by analytics.
  }

  return NextResponse.json({ accepted: true }, { status: 202 });
}
