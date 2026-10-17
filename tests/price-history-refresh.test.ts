import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function refresh(rows: unknown[], extra: Record<string, unknown> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'obt-history-'));
  mkdirSync(join(dir, 'scripts')); mkdirSync(join(dir, 'public/data'), { recursive: true });
  const original = '2020-01-01,1.234567890123\n2020-01-02,2\n';
  writeFileSync(join(dir, 'public/data/btc-history.csv'), original);
  copyFileSync(new URL('../scripts/refresh-price-history.ts', import.meta.url), join(dir, 'scripts/refresh-price-history.ts'));
  writeFileSync(join(dir, 'response.json'), JSON.stringify({ data: rows, ...extra }));
  const result = spawnSync(process.execPath, ['--experimental-strip-types', join(dir, 'scripts/refresh-price-history.ts'), '--file', join(dir, 'response.json')], { encoding: 'utf8' });
  const csv = readFileSync(join(dir, 'public/data/btc-history.csv'), 'utf8');
  rmSync(dir, { recursive: true, force: true });
  return { result, csv, original };
}
const row = (date: string, PriceUSD = '3.123456789012') => ({ asset: 'btc', time: `${date}T00:00:00.000000000Z`, PriceUSD });

test('refresh appends completed real days, preserves old bytes and ignores partial future days', () => {
  const { result, csv, original } = refresh([row('2020-01-02', '999'), row('2020-01-03'), row('2099-01-01')]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(csv, `${original}2020-01-03,3.123456789012\n`);
});

test('missing, invalid, unordered or truncated data leaves the entire bundle untouched', () => {
  for (const rows of [[row('2020-01-04')], [row('2020-01-03', '0')], [row('2020-01-03'), row('2020-01-03')], [row('2020-01-03'), row('2020-01-04', '')]]) {
    const { result, csv, original } = refresh(rows);
    assert.notEqual(result.status, 0);
    assert.equal(csv, original);
  }
  const { result, csv, original } = refresh([row('2020-01-03')], { next_page_url: 'https://example.com/next' });
  assert.notEqual(result.status, 0);
  assert.equal(csv, original);
});
