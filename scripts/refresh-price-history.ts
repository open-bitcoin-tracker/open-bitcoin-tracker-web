import { readFile, rename, writeFile } from 'node:fs/promises';

const target = new URL('../public/data/btc-history.csv', import.meta.url);
const existing = await readFile(target, 'utf8');
const lastDate = existing.trim().split('\n').at(-1)!.split(',')[0];
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--file')) {
  throw new Error('Usage: npm run refresh:prices [-- --file coinmetrics-response.json]');
}
const url = new URL('https://community-api.coinmetrics.io/v4/timeseries/asset-metrics');
url.search = new URLSearchParams({ assets: 'btc', metrics: 'PriceUSD', frequency: '1d', start_time: lastDate, page_size: '10000' }).toString();
const response = args.length ? JSON.parse(await readFile(args[1], 'utf8')) : await (async () => {
  const result = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!result.ok) throw new Error(`Coin Metrics: HTTP ${result.status}`);
  return result.json();
})();
if (!Array.isArray(response.data) || response.next_page_url) throw new Error('Incomplete Coin Metrics response');
const today = new Date().toISOString().slice(0, 10);
const additions: string[] = [];
let previous = lastDate;
for (const row of response.data) {
  const date = typeof row.time === 'string' ? row.time.slice(0, 10) : '';
  if (row.asset !== 'btc' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !row.time.startsWith(`${date}T00:00:00`)) {
    throw new Error('Invalid Coin Metrics observation');
  }
  if (date <= lastDate || date >= today) continue;
  const price = Number(row.PriceUSD);
  if (!Number.isFinite(price) || price <= 0 || typeof row.PriceUSD !== 'string' || !/^\d+(\.\d+)?$/.test(row.PriceUSD)) {
    throw new Error(`Price unavailable on ${date}; bundle left unchanged`);
  }
  if (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`) !== 86_400_000) {
    throw new Error(`Missing or unordered daily observations before ${date}; bundle left unchanged`);
  }
  additions.push(`${date},${row.PriceUSD}`);
  previous = date;
}
if (additions.length) {
  const temporary = new URL('../public/data/btc-history.csv.tmp', import.meta.url);
  await writeFile(temporary, `${existing}${existing.endsWith('\n') ? '' : '\n'}${additions.join('\n')}\n`);
  await rename(temporary, target);
}
console.log(`Appended ${additions.length} Coin Metrics daily prices; bundle ends ${previous}. Sync the reviewed CSV with Android assets/btc_history.csv.`);
