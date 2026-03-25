import Image from "next/image";
import Link from "next/link";
import InstallSkillPanel from "@/components/InstallSkillPanel";
import HeroMetrics from "@/components/HeroMetrics";
import TronGrid from "@/components/TronGrid";
import MobileNav from "@/components/MobileNav";
import ProtocolTicker from "@/components/ProtocolTicker";
import ProtocolGrid from "@/components/ProtocolGrid";

const runtimeTrack = [
  {
    title: "Custody stays with you",
    body: "Your agent verifies signer readiness before touching any protocol. Keys never leave your wallet. Nothing executes until custody checks pass."
  },
  {
    title: "Protocol context, resolved",
    body: "Chain metadata, contract verification, action specs, and risk posture — all resolved before your agent forms a transaction intent."
  },
  {
    title: "Simulate before you sign",
    body: "Every transaction runs through a simulation gate pre-sign. Allowance policies are enforced. Nothing broadcasts without your explicit confirmation."
  },
  {
    title: "Built-in exit strategies",
    body: "Perpetual and leveraged flows execute with structured validation. Unwind paths and alert monitoring stay active so your agent always has a way out."
  }
];

const corePlanes = [
  {
    title: "Protocol Registry",
    icon: "📡",
    body: "The canonical source of protocol truth — contracts, ABIs, callable functions, chain context, and curated action mappings across major networks."
  },
  {
    title: "Vault Intelligence",
    icon: "🔐",
    body: "Structured vault data for agents comparing capital allocation surfaces — risk constraints, yield profiles, and stake-aligned access controls."
  },
  {
    title: "Strategy Templates",
    icon: "⚙️",
    body: "Battle-tested strategy blueprints with transparent assumptions, risk profiles, and pre-built unwind paths your agent can execute against."
  }
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
          <a href="#how-it-works" className="nav-link">How It Works</a>
          <a href="#intelligence" className="nav-link">Intelligence</a>
          <a href="#protocols" className="nav-link">Protocols</a>
          <a href="#install" className="nav-link">Get Started</a>
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
            We believe that, in the future, most financial decisions will be made
            by humans&apos; agentic companions. We&apos;re building the intelligence
            layer that lets agents query protocols, assess risk, and execute DeFi
            actions by intent.
          </p>

          <div className="hero-cta-row fade-in delay-3">
            <a href="#install" className="btn btn-solid">Get Started</a>
            <a href="#protocols" className="btn btn-outline">Explore Protocols</a>
          </div>

          <div className="fade-in delay-3">
            <ProtocolTicker />
          </div>

          <HeroMetrics />
        </div>
      </section>

      <div className="site-shell content-stack">
        <section id="how-it-works" className="section-block">
          <header className="section-head text-center">
            <h2>HOW IT WORKS</h2>
            <p className="section-kicker">Every action runs through deterministic execution logic before your agent touches capital.</p>
          </header>

          <div className="runtime-timeline">
            {runtimeTrack.map((item, index) => (
              <div className="timeline-step" key={item.title}>
                <div className="step-indicator">
                  <span className="step-number">0{index + 1}</span>
                  {index < runtimeTrack.length - 1 && <div className="step-line" />}
                </div>
                <div className="step-content">
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="intelligence" className="section-block">
          <header className="section-head text-center">
            <h2>INTELLIGENCE CORE</h2>
            <p className="section-kicker">Canonical data, structured for machines. The protocol context your agent needs before it acts.</p>
          </header>

          <div className="card-grid">
            {corePlanes.map((item) => (
              <article className="intel-card" key={item.title}>
                <div className="intel-icon">{item.icon}</div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="protocols" className="section-block">
          <header className="section-head text-center">
            <h2>PROTOCOL ECOSYSTEM</h2>
            <p className="section-kicker">What your agent can do today — organized by protocol, with live chain support and operation details.</p>
          </header>
          <ProtocolGrid />
        </section>

        <section id="install" className="section-block">
          <header className="section-head text-center">
            <h2>GET STARTED</h2>
            <p className="section-kicker">One skill. Infinite DeFi capabilities.</p>
          </header>
          <div className="install-wrapper">
            <InstallSkillPanel />
          </div>
        </section>
      </div>

      <footer className="site-footer">
        <p>&copy; 2026 ClawDeFi. Execution infrastructure for agent-native finance.</p>
        <p>
          <a href="/skill.md">/skill.md</a> · Powered by ClawDeFi Protocol
        </p>
      </footer>
    </main>
  );
}
