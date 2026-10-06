#!/usr/bin/env node
/**
 * Vendors the TradeLoop domain code (types, reference data and pure business rules) from the
 * frontend repository into src/ops/domain, so the API runs exactly the same stop planning,
 * trip metrics, billing and matching rules as the screens.
 *
 *   npm run domain:sync            copy from the frontend
 *   npm run domain:sync -- --check fail when src/ops/domain differs from the frontend (CI)
 *
 * The frontend location defaults to ../../NextJS/trade-route-frontend; override with
 * TRADELOOP_FRONTEND_DIR.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontend = resolve(
  root,
  process.env.TRADELOOP_FRONTEND_DIR ?? '../../NextJS/trade-route-frontend',
);
const target = join(root, 'src/ops/domain');
const check = process.argv.includes('--check');

/** Frontend path → path inside src/ops/domain. */
const FILES = {
  'types/index.ts': 'types.ts',
  'data/areas.ts': 'data/areas.ts',
  'data/cargo.ts': 'data/cargo.ts',
  'data/company.ts': 'data/company.ts',
  'data/fleet.ts': 'data/fleet.ts',
  'data/finance.ts': 'data/finance.ts',
  'data/tenant.ts': 'data/tenant.ts',
  'data/products.ts': 'data/products.ts',
  'data/suppliers.ts': 'data/suppliers.ts',
  'lib/collections.ts': 'lib/collections.ts',
  'lib/ops-data.ts': 'lib/ops-data.ts',
  'lib/format.ts': 'lib/format.ts',
  'lib/calc.ts': 'lib/calc.ts',
  'lib/selectors.ts': 'lib/selectors.ts',
  'lib/logistics.ts': 'lib/logistics.ts',
  'lib/load-board.ts': 'lib/load-board.ts',
  'lib/backhaul-marketplace.ts': 'lib/backhaul-marketplace.ts',
};
const ALIASES = { '@/types': 'types/index.ts' };

if (!existsSync(join(frontend, 'types/index.ts'))) {
  console.error(`Frontend not found at ${frontend}. Set TRADELOOP_FRONTEND_DIR.`);
  process.exit(1);
}

/** Rewrites `@/…` imports to relative paths between the vendored files. */
function rewrite(source, from) {
  const here = posix.dirname(FILES[from]);
  return source.replace(/from "(@\/[^"]+)"/g, (match, spec) => {
    const src = ALIASES[spec] ?? `${spec.slice(2)}.ts`;
    const dest = FILES[src];
    if (!dest) throw new Error(`${from} imports ${spec}, which is not vendored. Add it to FILES.`);
    let rel = posix.relative(here, dest).replace(/\.ts$/, '');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return `from "${rel}"`;
  });
}

const header = (from) =>
  `// GENERATED from trade-route-frontend/${from} by scripts/sync-domain.mjs. Do not edit here:\n` +
  `// change the frontend file and run \`npm run domain:sync\`.\n`;

const expected = new Map(
  Object.entries(FILES).map(([from, to]) => [
    to,
    header(from) + rewrite(readFileSync(join(frontend, from), 'utf8'), from),
  ]),
);

const listed = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((d) => d.isFile())
        .map((d) => relative(target, join(d.parentPath ?? d.path, d.name)).split('\\').join('/'))
    : [];

if (check) {
  const stale = [...expected].filter(
    ([to, body]) => !existsSync(join(target, to)) || readFileSync(join(target, to), 'utf8') !== body,
  );
  const extra = listed(target).filter((f) => !expected.has(f));
  if (stale.length || extra.length) {
    for (const [to] of stale) console.error(`out of date: src/ops/domain/${to}`);
    for (const f of extra) console.error(`not in the frontend: src/ops/domain/${f}`);
    console.error('Run `npm run domain:sync`.');
    process.exit(1);
  }
  console.log(`src/ops/domain is in sync with ${frontend}`);
} else {
  rmSync(target, { recursive: true, force: true });
  for (const [to, body] of expected) {
    mkdirSync(dirname(join(target, to)), { recursive: true });
    writeFileSync(join(target, to), body);
  }
  console.log(`Vendored ${expected.size} files from ${frontend} into src/ops/domain`);
}
