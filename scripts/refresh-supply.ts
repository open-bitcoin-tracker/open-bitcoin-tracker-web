import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { importReviewedMoney, refreshedSnapshot, type ReviewedMoneyImport } from '../src/features/supply/refresh.ts';
import type { SupplySnapshot } from '../src/features/supply/model.ts';

const target = fileURLToPath(new URL('../src/features/supply/snapshot.json', import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || !['--file', '--import'].includes(args[0]))) {
  console.error('Usage: npm run refresh:supply [-- --file downloaded-h6.html | --import reviewed-money.json]');
  process.exit(1);
}
try {
  const current = JSON.parse(await readFile(target, 'utf8')) as SupplySnapshot;
  const checkedAt = new Date().toISOString().slice(0, 10);
  let next: SupplySnapshot;
  if (args[0] === '--import') {
    const entries = JSON.parse(await readFile(args[1], 'utf8')) as ReviewedMoneyImport[];
    next = importReviewedMoney(current, entries, checkedAt);
  } else {
    const usd = current.fiat.find(({ id }) => id === 'usd')!;
    const html = args[0] === '--file' ? await readFile(args[1], 'utf8') : await (async () => {
      const response = await fetch(usd.source, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OpenBitcoinTrackerDataRefresh/1.0)' } });
      if (!response.ok) throw new Error('Official release download failed.');
      return response.text();
    })();
    next = refreshedSnapshot(current, html, checkedAt);
  }
  const temporary = `${target}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`);
    await rename(temporary, target);
  } finally { await unlink(temporary).catch(() => {}); }
  console.log('Monetary snapshot validated. Other currencies and population remain unchanged unless explicitly imported.');
  console.log('Review official source definitions, units and dates, then run npm run check:supply, npm test and npm run build.');
} catch {
  // Keep diagnostics free of local paths, contacts, and raw provider responses.
  console.error('Supply refresh failed; the bundled snapshot was preserved. Verify official data and import units/windows before retrying.');
  process.exitCode = 1;
}
