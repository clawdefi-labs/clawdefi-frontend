"use client";

import { useEffect, useState } from "react";

interface VisitsResponse {
  available: boolean;
  windowDays: number;
  totalEvents: number;
  uniqueVisitors: number;
  lastEventAt: string | null;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export default function SiteVisitsCard() {
  const [data, setData] = useState<VisitsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch("/api/analytics/visits", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`visits_fetch_failed_${response.status}`);
        }
        const payload = (await response.json()) as VisitsResponse;
        if (active) {
          setData(payload);
        }
      } catch {
        if (active) {
          setData(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 60_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const value = loading
    ? "Loading..."
    : data?.available
      ? formatNumber(data.totalEvents)
      : "N/A";
  const label = loading
    ? "site visits"
    : data?.available
      ? `${data.windowDays}-day total site visits`
      : "site visits unavailable";
  const detail = loading
    ? "fetching metrics"
    : data?.available
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
