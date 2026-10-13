// Natural-display editor tests. Run with: node tests/editor.test.js
'use strict';
const assert = require('assert');
const path = require('path');
const E = require(path.join(__dirname, '..', 'engine.js'));
const { Editor } = require(path.join(__dirname, '..', 'editor.js'));

let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; } catch (e) { failed++; console.error('✗ ' + name + '\n   ' + e.message); } }
const ctx = () => ({ vars: { X: 0 }, angle: 'D', ans: 0, preAns: 0, fmt: { t: 'norm', n: 1 } });
const val = ed => E.finalize(E.evaluate(E.parse(ed.t), ctx()));
const type = (ed, seq) => seq.split(' ').forEach(a => {
  if (a === '!down' || a === '!up') ed.vertical(a.slice(1));
  else ed.edit(a.startsWith('!') ? a.slice(1) : 'ins:' + a);
});

test('fraction 1/3 + √8 like the reference', () => {
  const ed = new Editor();
  type(ed, 'frac 1 !right 3 !right + sqrt( 8');
  assert.ok(Math.abs(val(ed) - (1 / 3 + Math.sqrt(8))) < 1e-12);
});
test('▼ moves numerator → denominator', () => {
  const ed = new Editor();
  ed.insert('frac'); ed.insert('2'); assert.ok(ed.vertical('down')); ed.insert('5');
  assert.strictEqual(val(ed), 0.4);
});
test('fraction binds as a unit: 2 × (1/4)', () => {
  const ed = new Editor(); type(ed, '2 * frac 1 !down 4'); assert.strictEqual(val(ed), 0.5);
});
test('power template', () => { const ed = new Editor(); type(ed, '2 ^( 1 0'); assert.strictEqual(val(ed), 1024); });
test('power then continue outside', () => { const ed = new Editor(); type(ed, '2 ^( 3 !right + 1'); assert.strictEqual(val(ed), 9); });
test('nth root template', () => { const ed = new Editor(); type(ed, 'xrt( 3 !right 2 7'); assert.strictEqual(val(ed), 3); });
test('log_a b template', () => { const ed = new Editor(); type(ed, 'logab 2 !right 8'); assert.strictEqual(val(ed), 3); });
test('integral template', () => {
  const ed = new Editor(); type(ed, 'integ( vX sq !right 0 !right 3');
  assert.ok(Math.abs(val(ed) - 9) < 1e-12);
});
test('mixed fraction 1 2/3', () => { const ed = new Editor(); type(ed, 'mixed 1 !right 2 !right 3'); assert.ok(Math.abs(val(ed) - 5 / 3) < 1e-13); });
test('◀ from after a template enters its last box', () => {
  const ed = new Editor(); type(ed, 'frac 1 !right 2 !right'); ed.left();
  assert.strictEqual(JSON.stringify(ed.path), '[{"i":0,"s":1}]');
  assert.strictEqual(ed.c, 1);
});
test('▶ at end wraps to start', () => { const ed = new Editor(); type(ed, '1 2'); ed.right(); assert.strictEqual(ed.c, 0); });
test('DEL at start of a box unwraps the template', () => {
  const ed = new Editor(); type(ed, 'sqrt( 9'); ed.left(); ed.del();
  assert.deepStrictEqual(ed.row, ['9']);
});
test('empty box is a syntax error pointing at that box', () => {
  const ed = new Editor(); type(ed, '5 + frac 1');
  let pos = null;
  try { E.parse(ed.t); } catch (e) { pos = e.pos; }
  assert.notStrictEqual(pos, null);
  ed.gotoToken(pos);
  assert.strictEqual(JSON.stringify(ed.path), '[{"i":2,"s":1}]');
});
test('old linear history still loads', () => {
  const ed = new Editor(['1', 'frac', '3', '+', 'sqrt(', '8', ')']);
  assert.ok(Math.abs(val(ed) - (1 / 3 + Math.sqrt(8))) < 1e-12);
});
test('linear input mode inserts tokens', () => {
  const ed = new Editor([], { linear: () => true }); type(ed, '1 frac 4');
  assert.deepStrictEqual(ed.row, ['1', 'frac', '4']);
});
test('render produces stacked fraction and cursor', () => {
  const ed = new Editor(); type(ed, 'frac 1');
  const h = ed.html(true, k => k);
  assert.ok(h.includes('nfrac') && h.includes('class="cur"') && h.includes('slot'));
});
test('snapshot / restore (undo)', () => {
  const ed = new Editor(); type(ed, '1 2'); const snap = ed.snapshot(); type(ed, '+ 3'); ed.restore(snap);
  assert.deepStrictEqual(ed.row, ['1', '2']);
});

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
