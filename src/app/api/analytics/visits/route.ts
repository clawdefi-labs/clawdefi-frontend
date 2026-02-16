import { NextResponse } from "next/server";

const CORE_API_BASE_URL = process.env.CORE_API_BASE_URL?.trim() ?? "";
const ANALYTICS_SERVICE_TOKEN = process.env.ANALYTICS_SERVICE_TOKEN?.trim() ?? "";

interface CoreSummaryResponse {
  enabled: boolean;
  source: string;
  eventType: string;
  windowDays: number | null;
  route: string | null;
  totalEvents: number;
  uniqueVisitors: number;
  uniqueWallets: number;
  lastEventAt: string | null;
}

export async function GET() {
  if (!CORE_API_BASE_URL || !ANALYTICS_SERVICE_TOKEN) {
    return NextResponse.json(
      {
        available: false,
        windowDays: null,
        totalEvents: 0,
        uniqueVisitors: 0,
        lastEventAt: null,
        reason: "analytics_not_configured"
      },
      { status: 200 }
    );
  }

  try {
    const response = await fetch(
      `${CORE_API_BASE_URL}/api/v1/internal/analytics/summary?source=frontend&eventType=web_page_view`,
      {
        method: "GET",
        headers: {
          "x-service-token": ANALYTICS_SERVICE_TOKEN
        },
        cache: "no-store"
      }
    );
    if (!response.ok) {
      return NextResponse.json(
        {
          available: false,
          windowDays: null,
          totalEvents: 0,
          uniqueVisitors: 0,
          lastEventAt: null,
          reason: "analytics_summary_fetch_failed"
        },
        { status: 200 }
      );
    }

    const payload = (await response.json()) as CoreSummaryResponse;
    return NextResponse.json(
      {
        available: payload.enabled,
        windowDays: payload.windowDays ?? null,
        totalEvents: payload.totalEvents ?? 0,
        uniqueVisitors: payload.uniqueVisitors ?? 0,
        lastEventAt: payload.lastEventAt ?? null
      },
      {
        status: 200,
        headers: {
          "cache-control": "public, s-maxage=60, stale-while-revalidate=120"
        }
      }
    );
  } catch {
    return NextResponse.json(
      {
        available: false,
        windowDays: null,
        totalEvents: 0,
        uniqueVisitors: 0,
        lastEventAt: null,
        reason: "analytics_summary_unavailable"
      },
      { status: 200 }
    );
  }
}
