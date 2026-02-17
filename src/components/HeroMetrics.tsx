import SiteVisitsCard from "./SiteVisitsCard";
import DatabaseQueriesCard from "./DatabaseQueriesCard";

export default function HeroMetrics() {
  return (
    <div className="stats-grid fade-in delay-4">
      {/* Dynamic Site Visits (Live Data) */}
      <div className="stat-card">
        <SiteVisitsCard />
      </div>

      {/* Dynamic Database Queries (Live Data) */}
      <div className="stat-card">
        <DatabaseQueriesCard />
      </div>

      {/* Protocols Supported (Placeholder) */}
      <article className="stat-card">
        <p className="metric-value">42</p>
        <p className="metric-label">protocols supported</p>
        <p className="metric-subtle">across 8 major networks</p>
      </article>
    </div>
  );
}
