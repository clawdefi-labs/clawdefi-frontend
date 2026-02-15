import Image from "next/image";
import Link from "next/link";
import BinarySignalField from "@/components/BinarySignalField";
import InstallSkillPanel from "@/components/InstallSkillPanel";

const runtimeTrack = [
  {
    title: "Wallet-first discovery",
    body: "Ask signer readiness first, keep custody local, and block execution until signer checks pass."
  },
  {
    title: "Deterministic protocol intelligence",
    body: "Resolve chain metadata, protocol action specs, endpoints, contract verification, and risk posture before tx intent."
  },
  {
    title: "Execution guardrails",
    body: "Simulate before signing, enforce allowance policy, and require explicit user confirmation before broadcast."
  },
  {
    title: "Perp and unwind discipline",
    body: "Run Avantis perp flow locally for market and limit actions, then keep unwind paths and alert polling active."
  }
];

const corePlanes = [
  {
    title: "Protocol Registry",
    body: "Chain-aware protocol records with contracts, ABIs, callable functions, and curated action mappings."
  },
  {
    title: "Curated Vaults",
    body: "Structured vault intelligence for agentic managers, stake-aligned access, and observable risk constraints."
  },
  {
    title: "Curated Strategies",
    body: "Stablecoin parking paths and strategy templates with transparent assumptions and unwind metadata."
  }
];

const activeModules = [
  "query-chain-registry",
  "query-protocol",
  "query-action-spec",
  "query-integration-endpoint",
  "query-contract-verification",
  "query-coingecko",
  "wallet-readiness-check",
  "token-balance-check",
  "simulate-transaction",
  "allowance-manager",
  "swap (1inch-first)",
  "trade-perp (Avantis local Python)",
  "build-unwind-plan",
  "subscribe-alerts / poll / close"
];

const nextModules = [
  "trade-options",
  "position-health-check",
  "contract-trust-check",
  "connect-prediction-market"
];

export default function Home() {
  return (
    <main className="site-shell">
      <div className="site-aura" aria-hidden="true" />

      <header className="top-nav">
        <Link href="/" className="brand-mark">
          <Image
            src="/brand/clawdefi-logo.png"
            alt="ClawDeFi logo"
            width={146}
            height={108}
            priority
          />
          <span>ClawDeFi</span>
        </Link>

        <nav className="top-links" aria-label="Primary navigation">
          <a href="#install">Install</a>
          <a href="#runtime">Runtime</a>
          <a href="#modules">Modules</a>
          <a href="/skill.md">skill.md</a>
        </nav>
      </header>

      <section className="hero-grid reveal">
        <div className="hero-copy">
          <p className="kicker">The DeFi Intelligence Layer for the Agentic Future</p>
          <h1>Install a DeFi brain on your agent.</h1>
          <p className="hero-lead">
            ClawDeFi combines protocol intelligence, deterministic risk checks, and operator-safe
            workflows so agents can execute swap, perps, options, and yield actions with intent.
          </p>

          <div className="hero-cta">
            <a href="#install" className="btn btn-solid">
              Install Skill
            </a>
            <a href="/skill.md" className="btn btn-outline">
              Read /skill.md
            </a>
          </div>

          <div className="hero-metrics">
            <article>
              <p className="metric-value">19-step</p>
              <p className="metric-label">runtime gate before signing</p>
            </article>
            <article>
              <p className="metric-value">1inch + Avantis</p>
              <p className="metric-label">swap + perp integrations</p>
            </article>
            <article>
              <p className="metric-value">User-custodied</p>
              <p className="metric-label">local signer and secret storage</p>
            </article>
          </div>
        </div>

        <section className="signal-stage" aria-label="Binary signal field">
          <BinarySignalField />
        </section>
      </section>

      <section className="section reveal" id="install">
        <header className="section-head">
          <p className="section-kicker">Install Surface</p>
          <h2>One canonical skill, two delivery channels.</h2>
          <p>
            ClawHub for standard installs. Raw channel for direct domain-based bootstrap and
            reproducible artifact hosting.
          </p>
        </header>
        <InstallSkillPanel />
      </section>

      <section className="section reveal" id="runtime">
        <header className="section-head">
          <p className="section-kicker">Execution Runtime</p>
          <h2>Operator flow tuned for safety and speed.</h2>
        </header>

        <div className="card-grid runtime-grid">
          {runtimeTrack.map((item, index) => (
            <article className="info-card" key={item.title}>
              <p className="card-index">0{index + 1}</p>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section reveal">
        <header className="section-head">
          <p className="section-kicker">Data Core</p>
          <h2>Databases built for deterministic agent decisions.</h2>
        </header>

        <div className="card-grid">
          {corePlanes.map((item) => (
            <article className="info-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section reveal" id="modules">
        <header className="section-head">
          <p className="section-kicker">Skill Modules</p>
          <h2>Active modules now, expansion modules next.</h2>
        </header>

        <div className="module-columns">
          <article className="module-box active">
            <h3>Active in MVP</h3>
            <ul>
              {activeModules.map((module) => (
                <li key={module}>{module}</li>
              ))}
            </ul>
          </article>
          <article className="module-box pending">
            <h3>Next expansion</h3>
            <ul>
              {nextModules.map((module) => (
                <li key={module}>{module}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="section reveal">
        <div className="trust-band">
          <div>
            <p className="section-kicker">Policy Commitments</p>
            <h2>No secret custody. No blind execution.</h2>
            <p>
              ClawDeFi agents do not ask users to paste private keys or seed phrases. Every
              fund-impacting action passes explicit confirmation, simulation gates, and risk checks.
            </p>
          </div>
          <div className="trust-actions">
            <a className="btn btn-solid" href="/skill.md">
              Open Skill Contract
            </a>
            <a className="btn btn-outline" href="#install">
              Install Now
            </a>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <p>© 2026 ClawDeFi. The DeFi Intelligence empowering the agentic future.</p>
        <p>
          <a href="/skill.md">/skill.md</a> · Powered by ClawDeFi Protocol
        </p>
      </footer>
    </main>
  );
}
