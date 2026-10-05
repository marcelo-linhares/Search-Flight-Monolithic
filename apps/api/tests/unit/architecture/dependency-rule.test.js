'use strict';

/**
 * Architecture fitness test: the dependency rule between bounded contexts.
 *
 *  1. A context may require only its own files, `src/shared`, and Node built-ins
 *     or packages. Never another context (contexts talk through events only).
 *  2. A composition root (`src/app.js`, `src/services/*.js`) reaches a context only
 *     through its public entry points (`index.js`, and `client.js` for the contract
 *     other processes use to read it), never its internals.
 *  3. The HTTP layer never requires context internals (it receives use cases).
 *  4. `src/shared` knows no context (no domain concepts in the kernel).
 *
 * This proves the rule HELD. It does not prove the rule was worth having; that
 * is what the experiment in docs/EXPERIMENT_REFACTORING.md measures.
 */

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../../src');
const CONTEXTS = ['billing', 'ledger', 'watch', 'scheduler', 'search', 'integration'];
const ROOTS = ['app.js', ...fs.readdirSync(path.join(SRC, 'services')).map((f) => path.join('services', f))];

// './billing' resolves to billing/index.js; client.js is the remote read contract of a context.
const isPublicEntry = (target) => CONTEXTS.some((ctx) => target === path.join(SRC, ctx) || target === path.join(SRC, ctx, 'client'));

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return jsFiles(full);
    return e.name.endsWith('.js') ? [full] : [];
  });
}

// Relative requires only, resolved to absolute paths without extension.
function localRequires(file) {
  const text = fs.readFileSync(file, 'utf8');
  const found = [];
  const re = /require\(\s*['"](\.{1,2}\/[^'"]*|\.{1,2})['"]\s*\)/g;
  let m = re.exec(text);
  while (m) {
    found.push(path.resolve(path.dirname(file), m[1]));
    m = re.exec(text);
  }
  return found;
}

const inside = (target, dir) => target === dir || target.startsWith(dir + path.sep);

describe('dependency rule between bounded contexts', () => {
  it.each(CONTEXTS)('context "%s" requires only itself and src/shared', (ctx) => {
    const ctxDir = path.join(SRC, ctx);
    const violations = [];
    jsFiles(ctxDir).forEach((file) => {
      localRequires(file).forEach((target) => {
        if (!inside(target, ctxDir) && !inside(target, path.join(SRC, 'shared'))) {
          violations.push(`${path.relative(SRC, file)} -> ${path.relative(SRC, target)}`);
        }
      });
    });

    expect(violations).toEqual([]);
  });

  it.each(ROOTS)('composition root "%s" uses only the public entry points of the contexts', (root) => {
    const violations = localRequires(path.join(SRC, root))
      .filter((target) => CONTEXTS.some((ctx) => inside(target, path.join(SRC, ctx))))
      .filter((target) => !isPublicEntry(target))
      .map((t) => path.relative(SRC, t));

    expect(violations).toEqual([]);
  });

  it('the HTTP layer requires no context internals', () => {
    const violations = [];
    jsFiles(path.join(SRC, 'http')).forEach((file) => {
      localRequires(file).forEach((target) => {
        if (CONTEXTS.some((ctx) => inside(target, path.join(SRC, ctx)))) {
          violations.push(`${path.relative(SRC, file)} -> ${path.relative(SRC, target)}`);
        }
      });
    });

    expect(violations).toEqual([]);
  });

  it('the shared kernel requires no context', () => {
    const violations = [];
    jsFiles(path.join(SRC, 'shared')).forEach((file) => {
      localRequires(file).forEach((target) => {
        if (CONTEXTS.some((ctx) => inside(target, path.join(SRC, ctx)))) {
          violations.push(`${path.relative(SRC, file)} -> ${path.relative(SRC, target)}`);
        }
      });
    });

    expect(violations).toEqual([]);
  });

  // Guards the guard: the same detection logic must catch a real violation.
  it('detects a cross-context require in a fixture (the checker can fail)', () => {
    const os = require('os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-'));
    const ledgerDir = path.join(dir, 'ledger');
    fs.mkdirSync(ledgerDir, { recursive: true });
    fs.writeFileSync(path.join(ledgerDir, 'bad.js'), "const x = require('../billing/domain/aggregates');\n");

    const targets = localRequires(path.join(ledgerDir, 'bad.js'));

    expect(targets).toHaveLength(1);
    expect(inside(targets[0], ledgerDir)).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
