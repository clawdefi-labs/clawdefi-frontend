"use client";

const protocols = [
  { name: "1inch", slug: "1inch" },
  { name: "Aave", slug: "aave" },
  { name: "Avantis", slug: "avantis" },
  { name: "Pendle", slug: "pendle" },
  { name: "Polymarket", slug: "polymarket" },
  { name: "Thetanuts", slug: "thetanuts" },
  { name: "Pyth", slug: "pyth" },
  { name: "CoinGecko", slug: "coingecko" },
];

export default function ProtocolTicker() {
  // Duplicate items for seamless loop
  const items = [...protocols, ...protocols];

  return (
    <div className="protocol-ticker">
      <div className="ticker-track">
        {items.map((p, i) => (
          <div className="ticker-item" key={`${p.slug}-${i}`}>
            <img
              src={`/logos/${p.slug}.svg`}
              alt={p.name}
              width={36}
              height={36}
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = "none";
                const fallback = target.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = "flex";
              }}
            />
            <span
              className="ticker-fallback"
              style={{ display: "none" }}
            >
              {p.name[0]}
            </span>
            <span className="ticker-label">{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
