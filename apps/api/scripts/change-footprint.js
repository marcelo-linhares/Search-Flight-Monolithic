#!/usr/bin/env node
'use strict';

/**
 * Change footprint: how big is one change, and how much code that has nothing
 * to do with it sits in the files that had to be edited?
 *
 *   node scripts/change-footprint.js <repoPath> <baseRef> <headRef> <targetContext> [--json]
 *
 * For every file changed between baseRef and headRef it reports lines added and
 * removed, and measures "foreign code": lines in headRef's version of the file
 * that belong to a concept of a context other than <targetContext>.
 *
 * A "concept" is a top-level `class X` (production code) or a top-level
 * `describe('X'` block (tests). Which context a concept belongs to is decided by
 * the rules in CONTEXT_RULES below (explicit, reviewable, no guessing).
 *
 * What it does NOT measure: effort, correctness or readability. It is a
 * structural proxy and should be reported as one.
 */

const { execFileSync } = require('child_process');

// Concept name -> owning context. First matching rule wins.
const CONTEXT_RULES = [
  ['ledger',  /Ledger|EntryType|CreditBalance|OnUserRegistered|OnCreditsPurchased|OnPriceSnapshotCaptured|OnCreditsRefunded|OnRefundRequested|GetCreditBalance|GetLedgerHistory|CR1|CR2/],
  ['billing', /Payment|Pack|Gateway|OnRefundAccepted|OnRefundRejected|ConfirmPayment|InitiatePayment|RefundPayment|CR3|Billing/],
];

function contextOf(name) {
  const hit = CONTEXT_RULES.find(([, re]) => re.test(name));
  return hit ? hit[0] : 'other';
}

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// Splits a source file into top-level blocks: { name, lines }.
function blocks(text) {
  const lines = text.split('\n');
  const out = [];
  let current = null;
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/^(?:class\s+(\w+)|describe\(\s*['"`]([^'"`]+))/);
    if (m) {
      if (current) out.push(current);
      current = { name: m[1] || m[2], lines: 0 };
    }
    if (current) {
      current.lines += 1;
      if (/^\}\)?;?\s*$/.test(lines[i])) { out.push(current); current = null; }
    }
  }
  if (current) out.push(current);
  return out;
}

function footprint(repo, baseRef, headRef, target) {
  const numstat = git(repo, ['diff', '--numstat', baseRef, headRef]).trim().split('\n').filter(Boolean);
  const files = numstat.map((row) => {
    const [added, removed, path] = row.split('\t');
    let text = '';
    try { text = git(repo, ['show', `${headRef}:${path}`]); } catch (e) { /* deleted file */ }
    const bs = blocks(text);
    const total = text.split('\n').length;
    const foreign = bs.filter((b) => { const c = contextOf(b.name); return c !== 'other' && c !== target; });
    const own = bs.filter((b) => contextOf(b.name) === target);
    return {
      path,
      kind: /^apps\/api\/tests\//.test(path) ? 'test' : 'src',
      added: Number(added),
      removed: Number(removed),
      fileLines: total,
      concepts: bs.map((b) => `${b.name} [${contextOf(b.name)}]`),
      ownLines: own.reduce((s, b) => s + b.lines, 0),
      foreignLines: foreign.reduce((s, b) => s + b.lines, 0),
      foreignConcepts: foreign.map((b) => b.name),
    };
  });

  const sum = (f) => files.reduce((s, x) => s + f(x), 0);
  return {
    repo, baseRef, headRef, target,
    files,
    totals: {
      filesTouched: files.length,
      srcFiles: files.filter((f) => f.kind === 'src').length,
      testFiles: files.filter((f) => f.kind === 'test').length,
      linesAdded: sum((f) => f.added),
      linesRemoved: sum((f) => f.removed),
      linesInTouchedFiles: sum((f) => f.fileLines),
      foreignLinesInTouchedFiles: sum((f) => f.foreignLines),
    },
  };
}

if (require.main === module) {
  const [repo, baseRef, headRef, target, flag] = process.argv.slice(2);
  if (!repo || !baseRef || !headRef || !target) {
    console.error('usage: change-footprint.js <repoPath> <baseRef> <headRef> <targetContext> [--json]');
    process.exit(2);
  }
  const result = footprint(repo, baseRef, headRef, target);
  if (flag === '--json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.table(result.files.map((f) => ({
      file: f.path.replace('apps/api/', ''), '+': f.added, '-': f.removed,
      fileLines: f.fileLines, foreignLines: f.foreignLines, foreign: f.foreignConcepts.join(', '),
    })));
    console.log(result.totals);
  }
}

module.exports = { footprint, blocks, contextOf };
