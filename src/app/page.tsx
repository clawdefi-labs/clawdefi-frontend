import BinarySignalField from "@/components/BinarySignalField";

export default function Home() {
  return (
    <main className="home">
      <section className="home-content">
        <section className="signal-hero">
          <section className="binary-surface" aria-label="Binary signal field">
            <BinarySignalField />
          </section>

          <section className="card hero-card">
            <p className="eyebrow">ClawDeFi Frontend</p>
            <h1>The source of DeFi intelligence for agents</h1>
            <p>
              This app is the authenticated dashboard for protocol intelligence, risk alerts, and
              permissionless DeFi action guidance.
            </p>
          </section>
        </section>
      </section>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <p className="site-footer-left">
            © 2026 ClawDeFi. The DeFi Intelligence empowering the agentic future.
          </p>
          <p className="site-footer-right">Powered by ClawDeFi Protocol</p>
        </div>
      </footer>
    </main>
  );
}
