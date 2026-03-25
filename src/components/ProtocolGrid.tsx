"use client";

type ChainId = "ETH" | "Base" | "BNB" | "MATIC" | "OP" | "ARB" | "AVAX";

interface ProtocolEntry {
  category: string;
  protocol: string;
  slug: string;
  description: string;
  operations: string[];
  chains: ChainId[];
  status: "live" | "paused" | "coming-soon";
}

const CHAIN_COLORS: Record<ChainId, string> = {
  ETH: "#627EEA",
  Base: "#0052FF",
  BNB: "#F0B90B",
  MATIC: "#8247E5",
  OP: "#FF0420",
  ARB: "#28A0F0",
  AVAX: "#E84142",
};

const liveProtocols: ProtocolEntry[] = [
  {
    category: "Trading",
    protocol: "0x",
    slug: "0x",
    description:
      "Token swaps and cross-chain routing via 0x aggregator with optimized execution paths.",
    operations: ["Swap", "Cross-chain Route", "Quote"],
    chains: ["ETH", "Base", "BNB", "MATIC", "OP", "ARB", "AVAX"],
    status: "live",
  },
  {
    category: "Perpetuals",
    protocol: "Avantis",
    slug: "avantis",
    description:
      "Leveraged perpetual positions with structured entry/exit, stop-loss, and referral tracking.",
    operations: ["Open", "Close", "Modify", "SL/TP", "Referral"],
    chains: ["Base"],
    status: "live",
  },
  {
    category: "Lending",
    protocol: "Aave V3",
    slug: "aave",
    description:
      "Supply, borrow, and manage lending positions across Aave V3 markets with risk-aware execution.",
    operations: ["Supply", "Borrow", "Repay", "Withdraw"],
    chains: ["ETH", "Base", "MATIC", "OP", "ARB", "AVAX"],
    status: "live",
  },
  {
    category: "Yield",
    protocol: "Pendle",
    slug: "pendle",
    description:
      "Yield tokenization — mint principal and yield tokens, scan markets for optimal yield surfaces.",
    operations: ["Mint PT/YT", "Yield Scan"],
    chains: ["ETH", "Base", "ARB"],
    status: "live",
  },
  {
    category: "Predictions",
    protocol: "Polymarket",
    slug: "polymarket",
    description:
      "Browse prediction markets, get quotes, and build structured positions on real-world outcomes.",
    operations: ["Browse Markets", "Quote", "Build Position"],
    chains: ["MATIC"],
    status: "live",
  },
  {
    category: "Options",
    protocol: "Thetanuts",
    slug: "thetanuts",
    description:
      "Structured options vaults — browse available markets and vault data for options strategies.",
    operations: ["Market Data", "Vault Browse"],
    chains: ["ETH", "Base", "ARB"],
    status: "paused",
  },
  {
    category: "Market Intel",
    protocol: "Pyth + CoinGecko",
    slug: "pyth",
    description:
      "Real-time price feeds, token rankings, and market signals from decentralized oracles and aggregators.",
    operations: ["Price Feed", "Rankings", "Signals"],
    chains: ["ETH", "Base", "ARB", "MATIC", "OP", "AVAX"],
    status: "live",
  },
  {
    category: "Wallet",
    protocol: "WDK",
    slug: "wdk",
    description:
      "Wallet development kit — create, import, sign transactions, and manage token transfers across EVM chains.",
    operations: ["Create", "Import", "Sign", "Transfer"],
    chains: ["ETH", "Base", "BNB", "MATIC", "OP", "ARB", "AVAX"],
    status: "live",
  },
];

const comingSoon = [
  {
    title: "Position Health Monitoring",
    description: "Automated health factor tracking and liquidation alerts",
  },
  {
    title: "Contract Trust Verification",
    description: "On-chain contract audit status and risk scoring",
  },
  {
    title: "Advanced Meme Analytics",
    description: "Social signal aggregation and token momentum tracking",
  },
];

function ProtocolLogo({
  slug,
  protocol,
}: {
  slug: string;
  protocol: string;
}) {
  return (
    <div className="protocol-logo-wrap">
      <img
        src={`/logos/${slug}.svg`}
        alt={protocol}
        width={40}
        height={40}
        onError={(e) => {
          const target = e.currentTarget;
          target.style.display = "none";
          const fallback = target.nextElementSibling as HTMLElement;
          if (fallback) fallback.style.display = "flex";
        }}
      />
      <span className="protocol-logo-fallback" style={{ display: "none" }}>
        {protocol[0]}
      </span>
    </div>
  );
}

export default function ProtocolGrid() {
  return (
    <div>
      <div className="protocol-grid">
        {liveProtocols.map((p) => (
          <article
            className={`protocol-card protocol-card--${p.status}`}
            key={p.slug}
          >
            <div className="protocol-status-row">
              <span className={`status-dot status-dot--${p.status}`} />
              <span className="status-label">
                {p.status === "live"
                  ? "Live"
                  : p.status === "paused"
                    ? "Paused"
                    : "Coming Soon"}
              </span>
            </div>

            <div className="protocol-identity">
              <ProtocolLogo slug={p.slug} protocol={p.protocol} />
              <div>
                <p className="protocol-category">{p.category}</p>
                <p className="protocol-name">{p.protocol}</p>
              </div>
            </div>

            <p className="protocol-desc">{p.description}</p>

            <div className="protocol-ops">
              {p.operations.map((op) => (
                <span className="op-badge" key={op}>
                  {op}
                </span>
              ))}
            </div>

            <div className="protocol-divider" />

            <div className="protocol-chains">
              {p.chains.map((chain) => (
                <span
                  className="chain-pill"
                  key={chain}
                  style={
                    { "--chain-color": CHAIN_COLORS[chain] } as React.CSSProperties
                  }
                >
                  {chain}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>

      <div className="coming-soon-strip">
        <h3 className="coming-soon-heading">Coming Soon</h3>
        <div className="coming-soon-items">
          {comingSoon.map((item) => (
            <article className="coming-soon-card" key={item.title}>
              <h4>{item.title}</h4>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
