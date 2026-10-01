// CoinGecko public API — free, no key, sends CORS headers so it works on web and
// native alike.
export interface CryptoCoin {
  symbol: string; // BTC, ETH
  price: number; // USD
  change: number; // 24h % change
}

export interface CryptoMarketCoin extends CryptoCoin {
  rank: number;
  name: string;
  marketCap: number;
}

export async function getCrypto(): Promise<CryptoCoin[] | null> {
  try {
    const url =
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true";
    const d = await (await fetch(url)).json();
    const mk = (id: string, symbol: string): CryptoCoin | null =>
      d && d[id] ? { symbol, price: d[id].usd, change: d[id].usd_24h_change ?? 0 } : null;
    const coins = [mk("bitcoin", "BTC"), mk("ethereum", "ETH")].filter(Boolean) as CryptoCoin[];
    return coins.length ? coins : null;
  } catch {
    return null;
  }
}

/** Top coins by market cap, for the expanded table. Fetched only when the sheet
 * is opened — it is a much heavier response than the two-coin summary and
 * CoinGecko's free tier is rate-limited, so it must not run on every feed
 * render. */
export async function getTopCrypto(limit = 10): Promise<CryptoMarketCoin[] | null> {
  try {
    const url =
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd` +
      `&order=market_cap_desc&per_page=${limit}&page=1&price_change_percentage=24h`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    if (!Array.isArray(d)) return null;
    return d.map((c: any, i: number) => ({
      rank: c.market_cap_rank ?? i + 1,
      name: c.name || "",
      symbol: (c.symbol || "").toUpperCase(),
      price: Number(c.current_price) || 0,
      change: Number(c.price_change_percentage_24h) || 0,
      marketCap: Number(c.market_cap) || 0,
    }));
  } catch {
    return null;
  }
}

/** Compact market cap — "1.28T", "412.0B" — so the table column stays narrow. */
export function shortCap(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  return String(Math.round(n));
}

/** Prices span BTC (~64,000) to meme coins (~0.00002), so a fixed number of
 * decimals is wrong at one end or the other. */
export function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  if (p >= 0.01) return p.toFixed(4);
  return p.toPrecision(2);
}
