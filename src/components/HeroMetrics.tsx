import SiteVisitsCard from "./SiteVisitsCard";

export default function HeroMetrics() {
  return (
    <div className="stats-grid fade-in delay-4">
      {/* Dynamic Site Visits (Live Data) */}
      <div className="stat-card">
        <SiteVisitsCard />
      </div>

      {/* Database Queries (Placeholder) */}
      <article className="stat-card">
        <p className="metric-value">13,702</p>
        <p className="metric-label">total database queries</p>
        <p className="metric-subtle">verified agentic operations</p>
      </article>

      {/* Protocols Supported (Placeholder) */}
      <article className="stat-card">
        <p className="metric-value">42</p>
        <p className="metric-label">protocols supported</p>
        <p className="metric-subtle">across 8 major networks</p>
      </article>
    </div>
  );
}