import SiteVisitsCard from "./SiteVisitsCard";

export default function HeroMetrics() {
  return (
    <div className="stats-grid fade-in delay-4">
      <article className="stat-card">
        <p className="metric-value">20-step</p>
        <p className="metric-label">runtime gate</p>
      </article>
      <article className="stat-card">
        <p className="metric-value">1inch+</p>
        <p className="metric-label">integrations</p>
      </article>
      <article className="stat-card">
        <p className="metric-value">Local</p>
        <p className="metric-label">custody</p>
      </article>
      <div className="stat-card">
        <SiteVisitsCard />
      </div>
    </div>
  );
}
