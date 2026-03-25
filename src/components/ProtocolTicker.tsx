"use client";

const protocols = [
  { name: "0x Protocol", slug: "0x", ext: "svg" },
  { name: "Aave", slug: "aave", ext: "svg" },
  { name: "Avantis", slug: "avantis", ext: "svg" },
  { name: "Pendle", slug: "pendle", ext: "svg" },
  { name: "Polymarket", slug: "polymarket", ext: "svg" },
  { name: "Thetanuts", slug: "thetanuts", ext: "svg" },
  { name: "Pyth", slug: "pyth", ext: "svg" },
  { name: "CoinGecko", slug: "coingecko", ext: "png" },
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
              src={`/logos/${p.slug}.${p.ext}`}
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
