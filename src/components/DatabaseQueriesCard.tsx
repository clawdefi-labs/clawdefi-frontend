interface DbQueriesSummary {
  available: boolean;
  totalQueries: number;
}

const CORE_API_BASE_URL = process.env.CORE_API_BASE_URL?.trim() ?? "";
const ANALYTICS_SERVICE_TOKEN = process.env.ANALYTICS_SERVICE_TOKEN?.trim() ?? "";

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

async function fetchDbQueriesSummary(): Promise<DbQueriesSummary> {
  if (!CORE_API_BASE_URL || !ANALYTICS_SERVICE_TOKEN) {
    return {
      available: false,
      totalQueries: 0
    };
  }

  try {
    const response = await fetch(
      `${CORE_API_BASE_URL}/api/v1/internal/analytics/db-queries/summary`,
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
        totalQueries: 0
      };
    }

    const payload = (await response.json()) as {
      enabled?: boolean;
      totalQueries?: number;
    };
    return {
      available: Boolean(payload.enabled),
      totalQueries: payload.totalQueries ?? 0
    };
  } catch {
    return {
      available: false,
      totalQueries: 0
    };
  }
}

export default async function DatabaseQueriesCard() {
  const data = await fetchDbQueriesSummary();
  const value = data.available ? formatNumber(data.totalQueries) : "N/A";
  const label = data.available ? "total database queries" : "database queries unavailable";
  const detail = data.available
    ? "verified agentic operations"
    : "analytics API not configured";

  return (
    <article>
      <p className="metric-value">{value}</p>
      <p className="metric-label">{label}</p>
      <p className="metric-subtle">{detail}</p>
    </article>
  );
}
