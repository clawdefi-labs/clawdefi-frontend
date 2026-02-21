import Link from "next/link";
import { Terminal, ShieldAlert, Cpu, Sword } from "lucide-react";

export default function Home() {
  return (
    <main className="retro-container">
      
      <div className="pixel-logo-container">
        {/* Simple CSS shape / typography for logo */}
        <h1 className="pixel-logo">CLAW DEFI</h1>
        <p className="retro-subtitle">THE DEFI INTELLIGENCE LAYER FOR THE AGENTIC FUTURE</p>
      </div>

      <div className="retro-box text-center">
        <h2>PRESS START TO INSTALL</h2>
        <p className="text-center" style={{ textAlign: "center" }}>
          Your OpenClaw agent — always on, fully yours, ready in minutes. <br/>
          Equip your agent with deterministic DeFi intelligence.
        </p>
        <code className="install-cmd">
          npm install @clawdefi/agent-skill
        </code>
        <div style={{ marginTop: '30px' }}>
          <Link href="/skill.md" className="retro-button blink-text">
            VIEW SKILL.MD
          </Link>
        </div>
      </div>

      <div className="pixel-art-grid">
        <div className="stat-item">
          <ShieldAlert size={48} color="var(--retro-primary)" style={{ margin: '0 auto 10px' }} />
          <div className="stat-value">SAFETY 1ST</div>
          <div className="stat-label">Deterministic Rules</div>
        </div>
        <div className="stat-item">
          <Terminal size={48} color="var(--retro-secondary)" style={{ margin: '0 auto 10px' }} />
          <div className="stat-value">LOCAL SEC</div>
          <div className="stat-label">Signer Readiness</div>
        </div>
        <div className="stat-item">
          <Cpu size={48} color="var(--retro-accent)" style={{ margin: '0 auto 10px' }} />
          <div className="stat-value">SMART SYS</div>
          <div className="stat-label">Protocol Specs</div>
        </div>
        <div className="stat-item">
          <Sword size={48} color="var(--retro-yellow)" style={{ margin: '0 auto 10px', filter: 'drop-shadow(1px 1px 0 var(--pixel-border))' }} />
          <div className="stat-value">EXECUTE</div>
          <div className="stat-label">Perp &amp; Unwind</div>
        </div>
      </div>

      <div className="retro-box">
        <h2>EXECUTION RUNTIME</h2>
        <ul>
          <li><strong>Wallet-first discovery:</strong> Keep custody local, block execution until signer checks pass.</li>
          <li><strong>Deterministic intel:</strong> Resolve chain metadata, endpoints, and risk posture.</li>
          <li><strong>Execution guardrails:</strong> Simulate before signing, enforce allowance policy.</li>
          <li><strong>Unwind discipline:</strong> Run perp flows and keep unwind paths active.</li>
        </ul>
      </div>

      <div className="retro-box">
        <h2>DATA CORE</h2>
        <ul>
          <li><strong>Protocol Registry:</strong> Contracts, ABIs, functions &amp; action mappings.</li>
          <li><strong>Curated Vaults:</strong> Structured vault intel for agentic managers.</li>
          <li><strong>Curated Strategies:</strong> Stablecoin parking paths and risk constraints.</li>
        </ul>
      </div>

      <footer className="footer-retro">
        <p>© 2026 CLAWDEFI. INSERT COIN TO CONTINUE.</p>
      </footer>
    </main>
  );
}
