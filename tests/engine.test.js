// Engine tests. Run with: node tests/engine.test.js
'use strict';
const assert = require('assert');
const path = require('path');
const E = require(path.join(__dirname, '..', 'engine.js'));
const X = require(path.join(__dirname, '..', 'engine-x.js'));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failed++; console.error('✗ ' + name + '\n   ' + e.message); }
}
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

// Tokenizer helper: space-separated token keys, e.g. T('sin( 3 0')
const T = s => s.split(' ').filter(Boolean);
const ctx = (o = {}) => Object.assign({
  vars: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, X: 0, Y: 0, M: 0 }, angle: 'D', ans: 0, preAns: 0,
  fmt: { t: 'norm', n: 1 }, multi: null, cplx: false, mats: {}, vcts: {}
}, o);
const calc = (s, o) => E.finalize(E.evaluate(E.parse(T(s)), ctx(o)));
const calcX = (s, o) => X.finalize(X.evaluate(E.parse(T(s)), ctx(o)));
const errOf = fn => { try { fn(); return null; } catch (e) { return e.type || e.message; } };

// ------------------------------------------------------------ core arithmetic & precedence
test('basic precedence', () => assert.strictEqual(calc('2 + 3 * 4'), 14));
test('implicit multiplication binds tighter than ÷', () => near(calc('1 / 2 pi'), 1 / (2 * Math.PI)));
test('powers left to right', () => assert.strictEqual(calc('2 ^( 3 ) ^( 2'), 64));
test('negation below power', () => assert.strictEqual(calc('neg 2 sq'), -4));
test('auto-closing parentheses', () => assert.strictEqual(calc('( 2 + 3'), 5));
test('fraction token', () => assert.strictEqual(calc('3 frac 4 + 1 frac 4'), 1));
test('0.1 + 0.2 = 0.3 exactly after rounding', () => assert.strictEqual(calc('0 . 1 + 0 . 2'), 0.3));
test('scientific entry', () => assert.strictEqual(calc('1 EXP neg 3'), 0.001));
test('DMS entry', () => assert.strictEqual(calc('1 ° 3 0 °'), 1.5));
test('Ans', () => assert.strictEqual(calc('Ans * 2', { ans: 21 }), 42));
test('syntax error position', () => assert.strictEqual(errOf(() => E.parse(T('2 + *'))), E.SYN));
test('division by zero', () => assert.strictEqual(errOf(() => calc('1 / 0')), E.MATH));
test('overflow beyond 1e100', () => assert.strictEqual(errOf(() => calc('7 0 fact')), E.MATH));

// ------------------------------------------------------------ functions
test('sin 30° exact', () => assert.strictEqual(calc('sin( 3 0'), 0.5));
test('sin π = 0 in radians', () => assert.strictEqual(calc('sin( pi', { angle: 'R' }), 0));
test('tan 90° error', () => assert.strictEqual(errOf(() => calc('tan( 9 0')), E.MATH));
test('asin(1/2) = 30°', () => assert.strictEqual(calc('asin( 1 frac 2'), 30));
test('log base', () => assert.strictEqual(calc('log( 2 , 8'), 3));
test('real cube root of negative', () => assert.strictEqual(calc('3 xrt( neg 8'), -2));
test('(−8)^(1/3) = −2', () => assert.strictEqual(calc('( neg 8 ) ^( 1 frac 3'), -2));
test('nCr / nPr', () => { assert.strictEqual(calc('5 C 2'), 10); assert.strictEqual(calc('5 P 2'), 20); });
test('GCD / LCM', () => { assert.strictEqual(calc('gcd( 1 2 , 1 8'), 6); assert.strictEqual(calc('lcm( 4 , 6'), 12); });
test('integral of x² from 0 to 3', () => near(calc('integ( vX sq , 0 , 3'), 9, 1e-12));
test('integral of 1/x', () => near(calc('integ( 1 frac vX , 1 , e'), 1, 1e-12));
test('derivative of x³ at 2', () => near(calc('deriv( vX cube , 2'), 12, 1e-9));
test('summation', () => assert.strictEqual(calc('sum( vX , 1 , 1 0 0'), 5050));
test('Pol(1,1)', () => { const c = ctx(); E.evaluate(E.parse(T('pol( 1 , 1')), c); near(c.multi[1][1], 45); });
test('unit conversion °F→°C', () => near(calc('2 1 2 cv:F-C'), 100));

// ------------------------------------------------------------ exact display forms
test('1/3 is a fraction', () => assert.deepStrictEqual(E.exactForm(calc('1 / 3')), { t: 'rat', s: 1, n: 1, d: 3 }));
test('√8 = 2√2', () => assert.deepStrictEqual(E.exactForm(calc('sqrt( 8')), { t: 'surd', s: 1, k: 2, m: 2, d: 1 }));
test('sin 45° = √2/2', () => assert.deepStrictEqual(E.exactForm(calc('sin( 4 5')), { t: 'surd', s: 1, k: 1, m: 2, d: 2 }));
test('acos(0) rad = π/2', () => assert.deepStrictEqual(E.exactForm(calc('acos( 0', { angle: 'R' })), { t: 'pi', s: 1, n: 1, d: 2 }));
test('ln 2 has no exact form', () => assert.strictEqual(E.exactForm(calc('ln( 2')), null));
test('decimal formatting', () => {
  assert.deepStrictEqual(E.fmtDecimal(1 / 3), { m: '0.3333333333', e: null });
  assert.deepStrictEqual(E.fmtDecimal(123456789012), { m: '1.23456789', e: 11 });
  assert.deepStrictEqual(E.fmtDecimal(0.001), { m: '1', e: -3 });
});

// ------------------------------------------------------------ solvers
test('solve x² = 2', () => near(E.solveNumeric(x => x * x - 2, 1), Math.SQRT2, 1e-14));
test('solve x³ − 2x = 5', () => near(E.solveNumeric(x => x ** 3 - 2 * x - 5, 0), 2.0945514815423265, 1e-12));
test('linear system', () => assert.deepStrictEqual(E.solveLinear([[1, 1, 3], [1, -1, 1]]), { status: 'ok', x: [2, 1] }));
test('singular system', () => assert.strictEqual(E.solveLinear([[1, 1, 1], [2, 2, 2]]).status, 'inf'));
test('cubic roots', () => {
  const r = E.polyRoots([1, -6, 11, -6]).map(z => z.re).sort();
  r.forEach((v, i) => near(v, i + 1, 1e-12));
});
test('quadratic exact (1±√5)/2', () => assert.deepStrictEqual(E.quadExact(1, -1, -1)[0], { t: 'qs', A: 1, B: 1, m: 5, C: 2, complex: false }));

// ------------------------------------------------------------ complex mode
const C = { cplx: true };
test('i² = −1', () => assert.strictEqual(calcX('i sq', C), -1));
test('(1+2i)(3−i) = 5+5i', () => assert.deepStrictEqual(calcX('( 1 + 2 i ) ( 3 - i )', C), { t: 'c', re: 5, im: 5 }));
test('complex division', () => assert.deepStrictEqual(calcX('( 1 + i ) / ( 1 - i )', C), { t: 'c', re: 0, im: 1 }));
test('√(−4) = 2i', () => assert.deepStrictEqual(calcX('sqrt( neg 4', C), { t: 'c', re: 0, im: 2 }));
test('abs/arg', () => { assert.strictEqual(calcX('abs( 3 + 4 i', C), 5); assert.strictEqual(calcX('arg( 1 + i', C), 45); });
test('polar entry 2∠90 = 2i', () => assert.deepStrictEqual(calcX('2 ∠ 9 0', C), { t: 'c', re: 0, im: 2 }));
test('conjugate / ReP / ImP', () => {
  assert.deepStrictEqual(calcX('conj( 2 + 3 i', C), { t: 'c', re: 2, im: -3 });
  assert.strictEqual(calcX('rep( 2 + 3 i', C), 2);
  assert.strictEqual(calcX('imp( 2 + 3 i', C), 3);
});
test('e^(iπ) = −1 (radians)', () => assert.strictEqual(calcX('exp( i pi', { cplx: true, angle: 'R' }), -1));
test('i not allowed outside complex mode', () => assert.strictEqual(errOf(() => calcX('i')), E.SYN));
test('real results stay exact in complex mode', () => assert.strictEqual(calcX('sin( 3 0', C), 0.5));

// ------------------------------------------------------------ matrices
const M = {
  mats: { A: { t: 'm', a: [[1, 2], [3, 4]] }, B: { t: 'm', a: [[0, 1], [1, 0]] }, C: { t: 'm', a: [[1, 2, 3], [4, 5, 6]] } }
};
test('matrix add', () => assert.deepStrictEqual(calcX('MatA + MatB', M).a, [[1, 3], [4, 4]]));
test('matrix multiply', () => assert.deepStrictEqual(calcX('MatA MatB', M).a, [[2, 1], [4, 3]]));
test('determinant', () => assert.strictEqual(calcX('det( MatA', M), -2));
test('inverse', () => assert.deepStrictEqual(calcX('MatA inv', M).a, [[-2, 1], [1.5, -0.5]]));
test('A × A⁻¹ = I', () => assert.deepStrictEqual(calcX('MatA MatA inv', M).a, [[1, 0], [0, 1]]));
test('square', () => assert.deepStrictEqual(calcX('MatA sq', M).a, [[7, 10], [15, 22]]));
test('transpose', () => assert.deepStrictEqual(calcX('trn( MatC', M).a, [[1, 4], [2, 5], [3, 6]]));
test('scalar multiple', () => assert.deepStrictEqual(calcX('2 MatA', M).a, [[2, 4], [6, 8]]));
test('identity', () => assert.deepStrictEqual(calcX('ident( 2', M).a, [[1, 0], [0, 1]]));
test('rref', () => assert.deepStrictEqual(calcX('rref( MatC', M).a, [[1, 0, -1], [0, 1, 2]]));
test('dimension mismatch', () => assert.strictEqual(errOf(() => calcX('MatA + MatC', M)), X.DIM));
test('singular inverse', () => assert.strictEqual(errOf(() => calcX('( 2 MatB - MatB MatB ) inv', { mats: { B: { t: 'm', a: [[1, 1], [1, 1]] } } })), E.MATH));
test('undefined matrix', () => assert.strictEqual(errOf(() => calcX('MatD', M)), X.DIM));

// ------------------------------------------------------------ vectors
const V = { vcts: { A: { t: 'v', a: [1, 0, 0] }, B: { t: 'v', a: [0, 1, 0] }, C: { t: 'v', a: [3, 4] } } };
test('cross product', () => assert.deepStrictEqual(calcX('VctA VctB', V).a, [0, 0, 1]));
test('dot product', () => assert.strictEqual(calcX('VctA dot VctB', V), 0));
test('magnitude', () => assert.strictEqual(calcX('abs( VctC', V), 5));
test('angle', () => assert.strictEqual(calcX('angle( VctA , VctB', V), 90));
test('unit vector', () => assert.deepStrictEqual(calcX('unitv( VctC', V).a, [0.6, 0.8]));
test('vector dims mismatch', () => assert.strictEqual(errOf(() => calcX('VctA + VctC', V)), X.DIM));

// ------------------------------------------------------------ Base-N
const B = (s, base) => X.evalBase(T(s), base, ctx());
test('hex arithmetic', () => assert.strictEqual(B('hF + 1', 'h'), 16));
test('binary literal', () => assert.strictEqual(B('1 0 1 1', 'b'), 11));
test('prefixed literals', () => assert.strictEqual(B('ph hF + pb 1 0', 'd'), 17));
test('integer division truncates', () => assert.strictEqual(B('7 / 2', 'd'), 3));
test('logic ops', () => {
  assert.strictEqual(B('1 2 and 1 0', 'd'), 8);
  assert.strictEqual(B('1 2 or 3', 'd'), 15);
  assert.strictEqual(B('1 2 xor 1 0', 'd'), 6);
  assert.strictEqual(B('bnot( 0', 'd'), -1);
  assert.strictEqual(B('bneg( 5', 'd'), -5);
});
test('two\'s complement display', () => {
  assert.strictEqual(X.fmtBase(-1, 'h'), 'FFFFFFFF');
  assert.strictEqual(X.fmtBase(10, 'b'), '0000 0000 0000 1010');
  assert.strictEqual(X.fmtBase(8, 'o'), '00000000010');
});
test('FFFFFFFF = −1', () => assert.strictEqual(B('hF hF hF hF hF hF hF hF', 'h'), -1));
test('invalid digit for base', () => assert.strictEqual(errOf(() => B('2', 'b')), E.SYN));
test('DEC overflow', () => assert.strictEqual(errOf(() => B('2 1 4 7 4 8 3 6 4 7 + 1', 'd')), E.MATH));

// ------------------------------------------------------------ distributions
test('normal PD at mean', () => near(X.DIST.normPD(0, 1, 0), 0.3989422804014327, 1e-14));
test('normal CD ±1σ', () => near(X.DIST.normCD(-1, 1, 1, 0), 0.6826894921370859, 1e-13));
test('normal CD far tail', () => near(X.DIST.normCD(5, 1e99, 1, 0), 2.866515718791939e-7, 1e-10));
test('normal CD ±1.96σ', () => near(X.DIST.normCD(-1.96, 1.96, 1, 0), 0.9500042097035593, 1e-13));
test('inverse normal', () => near(X.DIST.invNorm(0.975, 1, 0), 1.959963984540054, 1e-12));
test('inverse normal with σ, μ', () => near(X.DIST.invNorm(0.5, 2, 10), 10, 1e-12));
test('binomial PD', () => near(X.DIST.binomPD(3, 10, 0.5), 0.1171875, 1e-13));
test('binomial CD', () => near(X.DIST.binomCD(3, 10, 0.5), 0.171875, 1e-13));
test('poisson PD', () => near(X.DIST.poissonPD(2, 3), 0.22404180765538775, 1e-13));
test('poisson CD', () => near(X.DIST.poissonCD(2, 3), 0.42319008112684353, 1e-13));
test('invalid distribution args', () => assert.strictEqual(errOf(() => X.DIST.normPD(0, 0, 0)), E.MATH));

// ------------------------------------------------------------ inequalities
const ineq = (c, op) => JSON.stringify(X.solveInequality(c, op));
test('x² − 3x + 2 > 0', () => assert.strictEqual(ineq([1, -3, 2], '>'),
  JSON.stringify({ parts: [{ lo: -Infinity, loIncl: false, hi: 1, hiIncl: false }, { lo: 2, loIncl: false, hi: Infinity, hiIncl: false }] })));
test('x² − 3x + 2 ≤ 0', () => assert.strictEqual(ineq([1, -3, 2], '<='), JSON.stringify({ parts: [{ lo: 1, loIncl: true, hi: 2, hiIncl: true }] })));
test('x² + 1 > 0 all reals', () => assert.strictEqual(ineq([1, 0, 1], '>'), '{"all":true}'));
test('x² + 1 < 0 none', () => assert.strictEqual(ineq([1, 0, 1], '<'), '{"none":true}'));
test('(x−1)² ≤ 0 → x = 1', () => assert.strictEqual(ineq([1, -2, 1], '<='), JSON.stringify({ parts: [{ lo: 1, loIncl: true, hi: 1, hiIncl: true }] })));
test('(x−1)² ≥ 0 all reals', () => assert.strictEqual(ineq([1, -2, 1], '>='), '{"all":true}'));
test('(x−1)² > 0 → x≠1', () => assert.strictEqual(X.solveInequality([1, -2, 1], '>').parts.length, 2));
test('cubic x³ − x > 0', () => assert.strictEqual(ineq([1, 0, -1, 0], '>'),
  JSON.stringify({ parts: [{ lo: -1, loIncl: false, hi: 0, hiIncl: false }, { lo: 1, loIncl: false, hi: Infinity, hiIncl: false }] })));

// ------------------------------------------------------------ ratio
test('ratio A:B = X:D', () => assert.strictEqual(X.ratio('x3', 2, 4, 10), 5));
test('ratio A:B = C:X', () => assert.strictEqual(X.ratio('x4', 2, 4, 10), 20));

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
