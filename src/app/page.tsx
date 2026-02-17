import Image from "next/image";
import Link from "next/link";
import InstallSkillPanel from "@/components/InstallSkillPanel";
import HeroMetrics from "@/components/HeroMetrics";
import TronGrid from "@/components/TronGrid";
import MobileNav from "@/components/MobileNav";

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
  "query-pyth",
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
    <main className="main-wrapper">
      <TronGrid />
      
      <header className="nav-bar">
        <Link href="/" className="brand-mark">
          <Image
            src="/brand/clawdefi-logo.png?v=20260217"
            alt="ClawDeFi logo"
            width={120}
            height={30}
            className="brand-logo"
            priority
            unoptimized
          />
        </Link>

        <nav className="nav-menu">
          <a href="#install" className="nav-link">Install</a>
          <a href="#runtime" className="nav-link">What can ClawDeFi do</a>
          <a href="#modules" className="nav-link">Roadmap</a>
          <a href="#runtime" className="nav-link">Runtime</a>
          <a href="#modules" className="nav-link">Modules</a>
          <a href="/skill.md" className="nav-pill">skill.md</a>
        </nav>

        <MobileNav />
      </header>

      <section className="hero-edge">
        <div className="hero-content">
          <p className="kicker fade-in">The DeFi Intelligence Layer for the Agentic Future</p>
          
          <h1 className="hero-title fade-in delay-1">
            Install a DeFi brain<br />on your agent.
          </h1>
          
          <p className="hero-desc fade-in delay-2">
            We believe that, in the future, most financial decisions will be made by humans&apos;
            agentic companions. We&apos;re building the intelligence layer that lets agents query
            protocols, assess risk, and execute DeFi actions by intent.
          </p>

          <HeroMetrics />
        </div>
      </section>

      <div className="site-shell content-stack">
        <section id="install" className="section-block">
          <header className="section-head text-center">
            <h2>INSTALL INSTRUCTIONS</h2>
            <p className="section-kicker">One canonical skill that your agent needs.</p>
          </header>
          <div className="install-wrapper">
             <InstallSkillPanel />
          </div>
        </section>

        <section id="runtime" className="section-block">
          <header className="section-head text-center">
             <h2>EXECUTION RUNTIME</h2>
             <p className="section-kicker">Safety first.</p>
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

        <section className="section-block">
           <header className="section-head text-center">
             <h2>DATA CORE</h2>
             <p className="section-kicker">Deterministic intelligence.</p>
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

        <section id="modules" className="section-block">
           <header className="section-head text-center">
             <h2>SKILL MODULES</h2>
             <p className="section-kicker">Capabilities.</p>
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
      </div>

      <footer className="site-footer">
        <p>© 2026 ClawDeFi. The DeFi Intelligence empowering the agentic future.</p>
        <p>
          <a href="/skill.md">/skill.md</a> · Powered by ClawDeFi Protocol
        </p>
      </footer>
    </main>
  );
}
