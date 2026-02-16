interface VisitsSummary {
  available: boolean;
  windowDays: number;
  totalEvents: number;
  uniqueVisitors: number;
}

const CORE_API_BASE_URL = process.env.CORE_API_BASE_URL?.trim() ?? "";
const ANALYTICS_SERVICE_TOKEN = process.env.ANALYTICS_SERVICE_TOKEN?.trim() ?? "";
const DEFAULT_WINDOW_DAYS = 30;

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

async function fetchVisitsSummary(): Promise<VisitsSummary> {
  if (!CORE_API_BASE_URL || !ANALYTICS_SERVICE_TOKEN) {
    return {
      available: false,
      windowDays: DEFAULT_WINDOW_DAYS,
      totalEvents: 0,
      uniqueVisitors: 0
    };
  }

  try {
    const response = await fetch(
      `${CORE_API_BASE_URL}/api/v1/internal/analytics/summary?source=frontend&eventType=web_page_view&windowDays=${DEFAULT_WINDOW_DAYS}`,
      {
        method: "GET",
        headers: {
          "x-service-token": ANALYTICS_SERVICE_TOKEN
        },
        next: { revalidate: 60 }
      }
    );
    if (!response.ok) {
      return {
        available: false,
        windowDays: DEFAULT_WINDOW_DAYS,
        totalEvents: 0,
        uniqueVisitors: 0
      };
    }
    const payload = (await response.json()) as {
      enabled?: boolean;
      windowDays?: number;
      totalEvents?: number;
      uniqueVisitors?: number;
    };
    return {
      available: Boolean(payload.enabled),
      windowDays: payload.windowDays ?? DEFAULT_WINDOW_DAYS,
      totalEvents: payload.totalEvents ?? 0,
      uniqueVisitors: payload.uniqueVisitors ?? 0
    };
  } catch {
    return {
      available: false,
      windowDays: DEFAULT_WINDOW_DAYS,
      totalEvents: 0,
      uniqueVisitors: 0
    };
  }
}

export default async function SiteVisitsCard() {
  const data = await fetchVisitsSummary();
  const value = data.available ? formatNumber(data.totalEvents) : "N/A";
  const label = data.available
    ? `${data.windowDays}-day total site visits`
    : "site visits unavailable";
  const detail = data.available
    ? `${formatNumber(data.uniqueVisitors)} unique visitors`
    : "analytics API not configured";

  return (
    <article>
      <p className="metric-value">{value}</p>
      <p className="metric-label">{label}</p>
      <p className="metric-subtle">{detail}</p>
    </article>
  );
}
