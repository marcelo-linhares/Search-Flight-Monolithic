'use strict';

// Size and coupling per bounded context (thesis metrics).
//   node scripts/context-metrics.js [--json]
// For each folder in src/<context>: files, lines, outgoing requires to other
// contexts (must be 0, enforced by tests/unit/architecture) and the event types
// it subscribes to (read from the source text).

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const NOT_CONTEXTS = new Set(['shared', 'http', 'services']);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}

function metrics() {
  const contexts = fs.readdirSync(SRC, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !NOT_CONTEXTS.has(e.name)).map((e) => e.name);

  return contexts.map((ctx) => {
    const files = walk(path.join(SRC, ctx));
    const text = files.map((f) => fs.readFileSync(f, 'utf8'));
    const all = text.join('\n');
    const lines = text.reduce((s, t) => s + t.split('\n').length, 0);
    const foreign = new Set();
    for (const t of text) {
      for (const m of t.matchAll(/require\(['"]((?:\.\.\/)+)([\w-]+)/g)) {
        if (contexts.includes(m[2]) && m[2] !== ctx) foreign.add(m[2]);
      }
    }
    const subscribes = [...all.matchAll(/subscribe\(\s*['"](\w+)['"]/g)].map((m) => m[1]);
    return {
      context: ctx, files: files.length, lines,
      foreignContextImports: [...foreign],
      subscribesTo: [...new Set(subscribes)].sort(),
    };
  });
}

if (require.main === module) {
  const rows = metrics();
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 2));
  else console.table(rows.map((r) => ({ ...r, foreignContextImports: r.foreignContextImports.length, subscribesTo: r.subscribesTo.length })));
}

module.exports = { metrics };
