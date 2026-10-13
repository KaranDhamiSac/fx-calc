/* Extended engine: Complex, Matrix, Vector and Base-N evaluation, probability distributions,
   polynomial inequalities and ratios. Builds on engine.js (CalcEngine). */
(function (root) {
  'use strict';
  const E = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.CalcEngine;
  const { CalcError, SYN, MATH, TOK } = E;
  const DIM = 'Dimension ERROR';
  const fail = (type, p) => { throw new CalcError(type, p); };

  // ---------------------------------------------------------------- value types
  // number | {t:'c', re, im} | {t:'m', a:[[...]]} | {t:'v', a:[...]}
  const cx = (re, im) => (im === 0 ? re : { t: 'c', re, im });
  const isC = v => !!v && v.t === 'c';
  const isM = v => !!v && v.t === 'm';
  const isV = v => !!v && v.t === 'v';
  const isScalar = v => typeof v === 'number' || isC(v);
  const RE = v => (typeof v === 'number' ? v : v.re);
  const IM = v => (typeof v === 'number' ? 0 : v.im);
  const mat = a => ({ t: 'm', a });
  const vec = a => ({ t: 'v', a });
  const realOf = (v, p) => {
    if (typeof v === 'number') return v;
    if (isC(v)) return fail(MATH, p);
    return fail(DIM, p);
  };

  // ---------------------------------------------------------------- complex arithmetic
  const cadd = (a, b) => cx(RE(a) + RE(b), IM(a) + IM(b));
  const csub = (a, b) => cx(RE(a) - RE(b), IM(a) - IM(b));
  const cmul = (a, b) => cx(RE(a) * RE(b) - IM(a) * IM(b), RE(a) * IM(b) + IM(a) * RE(b));
  function cdiv(a, b, p) {
    const br = RE(b), bi = IM(b), d = br * br + bi * bi;
    if (d === 0) fail(MATH, p);
    return cx((RE(a) * br + IM(a) * bi) / d, (IM(a) * br - RE(a) * bi) / d);
  }
  const cabs = z => Math.hypot(RE(z), IM(z));
  const carg = z => Math.atan2(IM(z), RE(z));
  const cexp = z => { const m = Math.exp(RE(z)); return cx(m * Math.cos(IM(z)), m * Math.sin(IM(z))); };
  function cln(z, p) { if (RE(z) === 0 && IM(z) === 0) fail(MATH, p); return cx(Math.log(cabs(z)), carg(z)); }
  function csqrt(z) {
    if (IM(z) === 0 && RE(z) >= 0) return Math.sqrt(RE(z));
    const r = cabs(z), a = RE(z), b = IM(z);
    const re = Math.sqrt((r + a) / 2), im = Math.sqrt((r - a) / 2);
    return cx(re, b < 0 ? -im : im);
  }
  function cpowInt(z, n) {
    let r = 1, b = z, k = Math.abs(n);
    while (k) { if (k & 1) r = cmul(r, b); b = cmul(b, b); k >>= 1; }
    return n < 0 ? cdiv(1, r, 0) : r;
  }
  function cpow(a, b, p, ctx) {
    if (!isC(a) && !isC(b)) {
      try { return E.powReal(a, b, p); } catch (e) { if (!ctx.cplx) throw e; }
    }
    if (!isC(b) && Number.isInteger(b) && Math.abs(b) <= 1024) {
      if (RE(a) === 0 && IM(a) === 0 && b <= 0) fail(MATH, p);
      return cpowInt(a, b);
    }
    if (RE(a) === 0 && IM(a) === 0) { if (RE(b) > 0) return 0; fail(MATH, p); }
    return cexp(cmul(b, cln(a, p)));
  }
  const conj = z => cx(RE(z), -IM(z));

  // ---------------------------------------------------------------- matrices & vectors
  const dims = m => [m.a.length, m.a[0].length];
  function madd(A, B, sign, p) {
    const [r, c] = dims(A), [r2, c2] = dims(B);
    if (r !== r2 || c !== c2) fail(DIM, p);
    return mat(A.a.map((row, i) => row.map((v, j) => v + sign * B.a[i][j])));
  }
  function mmul(A, B, p) {
    const [r, c] = dims(A), [r2, c2] = dims(B);
    if (c !== r2) fail(DIM, p);
    const out = [];
    for (let i = 0; i < r; i++) {
      out.push([]);
      for (let j = 0; j < c2; j++) { let s = 0; for (let k = 0; k < c; k++) s += A.a[i][k] * B.a[k][j]; out[i].push(s); }
    }
    return mat(out);
  }
  const mscale = (A, s) => mat(A.a.map(row => row.map(v => v * s)));
  const identity = n => mat(Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
  function det(A, p) {
    const [n, c] = dims(A);
    if (n !== c) fail(DIM, p);
    const a = A.a.map(r => r.slice());
    let d = 1;
    for (let k = 0; k < n; k++) {
      let piv = k;
      for (let i = k + 1; i < n; i++) if (Math.abs(a[i][k]) > Math.abs(a[piv][k])) piv = i;
      if (a[piv][k] === 0) return 0;
      if (piv !== k) { [a[piv], a[k]] = [a[k], a[piv]]; d = -d; }
      d *= a[k][k];
      for (let i = k + 1; i < n; i++) {
        const f = a[i][k] / a[k][k];
        for (let j = k; j < n; j++) a[i][j] -= f * a[k][j];
      }
    }
    return d;
  }
  function minv(A, p) {
    const [n, c] = dims(A);
    if (n !== c) fail(DIM, p);
    const a = A.a.map((r, i) => r.concat(identity(n).a[i]));
    const scale = Math.max(1, ...A.a.flat().map(Math.abs));
    for (let k = 0; k < n; k++) {
      let piv = k;
      for (let i = k + 1; i < n; i++) if (Math.abs(a[i][k]) > Math.abs(a[piv][k])) piv = i;
      if (Math.abs(a[piv][k]) <= 1e-13 * scale) fail(MATH, p);
      [a[piv], a[k]] = [a[k], a[piv]];
      const pv = a[k][k];
      for (let j = 0; j < 2 * n; j++) a[k][j] /= pv;
      for (let i = 0; i < n; i++) {
        if (i === k) continue;
        const f = a[i][k];
        for (let j = 0; j < 2 * n; j++) a[i][j] -= f * a[k][j];
      }
    }
    return mat(a.map(r => r.slice(n)));
  }
  function mpow(A, n, p) {
    const [r, c] = dims(A);
    if (r !== c || !Number.isInteger(n)) fail(DIM, p);
    let base = n < 0 ? minv(A, p) : A, res = identity(r), k = Math.abs(n);
    if (k > 1024) fail(MATH, p);
    while (k) { if (k & 1) res = mmul(res, base, p); base = mmul(base, base, p); k >>= 1; }
    return res;
  }
  // Row echelon form (reduced when full=true), Gaussian elimination with partial pivoting.
  function echelon(A, full) {
    const a = A.a.map(r => r.slice());
    const rows = a.length, cols = a[0].length;
    const eps = 1e-12 * Math.max(1, ...A.a.flat().map(Math.abs));
    let r = 0;
    for (let c = 0; c < cols && r < rows; c++) {
      let piv = r;
      for (let i = r + 1; i < rows; i++) if (Math.abs(a[i][c]) > Math.abs(a[piv][c])) piv = i;
      if (Math.abs(a[piv][c]) <= eps) continue;
      [a[piv], a[r]] = [a[r], a[piv]];
      const pv = a[r][c];
      for (let j = 0; j < cols; j++) a[r][j] /= pv;
      for (let i = full ? 0 : r + 1; i < rows; i++) {
        if (i === r) continue;
        const f = a[i][c];
        for (let j = 0; j < cols; j++) a[i][j] -= f * a[r][j];
      }
      r++;
    }
    return mat(a.map(row => row.map(v => (Math.abs(v) <= eps ? 0 : v))));
  }
  function vbin(A, B, f, p) {
    if (A.a.length !== B.a.length) fail(DIM, p);
    return vec(A.a.map((v, i) => f(v, B.a[i])));
  }
  function vdot(A, B, p) { if (A.a.length !== B.a.length) fail(DIM, p); return A.a.reduce((s, v, i) => s + v * B.a[i], 0); }
  function vcross(A, B) {
    const a = A.a.concat([0, 0, 0]).slice(0, 3), b = B.a.concat([0, 0, 0]).slice(0, 3);
    return vec([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]);
  }
  const vnorm = A => Math.hypot(...A.a);

  // ---------------------------------------------------------------- generic operators
  function add(a, b, sign, p) {
    if (isScalar(a) && isScalar(b)) return sign > 0 ? cadd(a, b) : csub(a, b);
    if (isM(a) && isM(b)) return madd(a, b, sign, p);
    if (isV(a) && isV(b)) return vbin(a, b, (x, y) => x + sign * y, p);
    return fail(DIM, p);
  }
  function mul(a, b, p) {
    if (isScalar(a) && isScalar(b)) return cmul(a, b);
    if (isM(a) && isM(b)) return mmul(a, b, p);
    if (isV(a) && isV(b)) return vcross(a, b);
    if (isM(a) && isV(b)) {
      const col = mat(b.a.map(v => [v]));
      const r = mmul(a, col, p);
      return vec(r.a.map(row => row[0]));
    }
    if (typeof a === 'number' && isM(b)) return mscale(b, a);
    if (isM(a) && typeof b === 'number') return mscale(a, b);
    if (typeof a === 'number' && isV(b)) return vec(b.a.map(v => v * a));
    if (isV(a) && typeof b === 'number') return vec(a.a.map(v => v * b));
    return fail(DIM, p);
  }
  function div(a, b, p) {
    if (isScalar(a) && isScalar(b)) return cdiv(a, b, p);
    if (typeof b === 'number') {
      if (b === 0) fail(MATH, p);
      if (isM(a)) return mscale(a, 1 / b);
      if (isV(a)) return vec(a.a.map(v => v / b));
    }
    return fail(DIM, p);
  }
  function negate(a) {
    if (isScalar(a)) return cx(-RE(a), -IM(a));
    if (isM(a)) return mscale(a, -1);
    return vec(a.a.map(v => -v));
  }

  // Delegate real-only operations to the main evaluator so behaviour stays identical.
  const num = v => ({ k: 'num', v });
  const realFn = (f, vals, p, ctx) => E.evaluate({ k: 'fn', f, args: vals.map(num), p }, ctx);
  const realPost = (node, v, ctx) => E.evaluate({ k: 'post', f: node.f, conv: node.conv, a: num(v), p: node.p }, ctx);
  const realBin = (op, a, b, p, ctx) => E.evaluate({ k: 'bin', op, a: num(a), b: num(b), p }, ctx);

  function evaluate(node, ctx) {
    const ev = n => evaluate(n, ctx);
    const p = node.p;
    switch (node.k) {
      case 'num': return node.v;
      case 'var': { const v = ctx.vars[node.n]; return v === undefined ? 0 : v; }
      case 'const': {
        const n = node.n;
        if (n === 'i') { if (!ctx.cplx) fail(SYN, p); return cx(0, 1); }
        if (n === 'Ans') return ctx.ans || 0;
        if (n === 'PreAns') return ctx.preAns || 0;
        if (n.startsWith('Mat') || n.startsWith('Vct')) {
          const isMat = n.startsWith('Mat'), key = n.slice(3);
          const store = isMat ? ctx.mats : ctx.vcts;
          const v = key === 'Ans' ? (isMat ? ctx.matAns : ctx.vctAns) : store && store[key];
          if (!v) fail(DIM, p);
          return isMat ? mat(v.a.map(r => r.slice())) : vec(v.a.slice());
        }
        return E.evaluate(node, ctx);
      }
      case 'neg': return negate(ev(node.a));
      case 'eq': return fail(SYN, p);
      case 'bin': {
        const a = ev(node.a), b = ev(node.b);
        switch (node.op) {
          case '+': return add(a, b, 1, p);
          case '-': return add(a, b, -1, p);
          case '*': return mul(a, b, p);
          case '/': case 'frac': return div(a, b, p);
          case 'dot':
            if (isV(a) && isV(b)) return vdot(a, b, p);
            return mul(a, b, p);
          case '^(':
            if (isM(a)) return mpow(a, realOf(b, p), p);
            if (isScalar(a) && isScalar(b)) return cpow(a, b, p, ctx);
            return fail(DIM, p);
          case '∠': {
            if (!ctx.cplx) fail(SYN, p);
            const r = realOf(a, p), th = realOf(b, p);
            return cx(r * E.cosA(th, ctx.angle, p), r * E.sinA(th, ctx.angle, p));
          }
          default:
            return realBin(node.op, realOf(a, p), realOf(b, p), p, ctx);
        }
      }
      case 'post': {
        const a = ev(node.a);
        switch (node.f) {
          case 'sq': return isM(a) ? mpow(a, 2, p) : isScalar(a) ? cmul(a, a) : fail(DIM, p);
          case 'cube': return isM(a) ? mpow(a, 3, p) : isScalar(a) ? cmul(a, cmul(a, a)) : fail(DIM, p);
          case 'inv': return isM(a) ? minv(a, p) : isScalar(a) ? cdiv(1, a, p) : fail(DIM, p);
          case 'toPolar': ctx.cfmt = 'polar'; return a;
          case 'toRect': ctx.cfmt = 'rect'; return a;
          default: return realPost(node, realOf(a, p), ctx);
        }
      }
      case 'fn': return evalFn(node, ctx);
    }
    return fail(SYN, p);
  }

  function evalFn(node, ctx) {
    const { f, args, p } = node;
    if (['integ', 'deriv', 'sum', 'prod'].includes(f)) return E.evaluate(node, ctx);
    const v = args.map(a => evaluate(a, ctx));
    const one = () => { if (v.length !== 1) fail(SYN, p); return v[0]; };
    const x = v[0];
    const allReal = v.every(t => typeof t === 'number');
    switch (f) {
      case 'abs':
        one();
        if (isM(x)) return mat(x.a.map(r => r.map(Math.abs)));
        if (isV(x)) return vnorm(x);
        return cabs(x);
      case 'arg': one(); if (!isScalar(x)) fail(DIM, p); return E.fromRad(carg(x), ctx.angle);
      case 'conj': one(); if (!isScalar(x)) fail(DIM, p); return conj(x);
      case 'rep': one(); if (!isScalar(x)) fail(DIM, p); return RE(x);
      case 'imp': one(); if (!isScalar(x)) fail(DIM, p); return IM(x);
      case 'det': one(); if (!isM(x)) fail(DIM, p); return det(x, p);
      case 'trn': one(); if (!isM(x)) fail(DIM, p); return mat(x.a[0].map((_, j) => x.a.map(r => r[j])));
      case 'ident': {
        const n = realOf(one(), p);
        if (!Number.isInteger(n) || n < 1 || n > 4) fail(MATH, p);
        return identity(n);
      }
      case 'ref': one(); if (!isM(x)) fail(DIM, p); return echelon(x, false);
      case 'rref': one(); if (!isM(x)) fail(DIM, p); return echelon(x, true);
      case 'angle': {
        if (v.length !== 2 || !isV(v[0]) || !isV(v[1])) fail(DIM, p);
        const n = vnorm(v[0]) * vnorm(v[1]);
        if (n === 0) fail(MATH, p);
        const c = Math.max(-1, Math.min(1, vdot(v[0], v[1], p) / n));
        return E.fromRad(Math.acos(c), ctx.angle);
      }
      case 'unitv': {
        one();
        if (!isV(x)) fail(DIM, p);
        const n = vnorm(x);
        if (n === 0) fail(MATH, p);
        return vec(x.a.map(t => t / n));
      }
    }
    if (allReal) {
      try { return realFn(f, v, p, ctx); } catch (e) { if (!ctx.cplx) throw e; }
    }
    // Complex-valued elementary functions (arguments in radians when complex)
    if (!v.every(isScalar)) fail(DIM, p);
    switch (f) {
      case 'sqrt': return csqrt(one());
      case 'exp': return cexp(one());
      case 'p10': return cexp(cmul(one(), Math.LN10));
      case 'ln': return cln(one(), p);
      case 'log':
        if (v.length === 1) return cdiv(cln(x, p), Math.LN10, p);
        return cdiv(cln(v[1], p), cln(v[0], p), p);
      case 'sin': { const a = RE(one()), b = IM(x); return cx(Math.sin(a) * Math.cosh(b), Math.cos(a) * Math.sinh(b)); }
      case 'cos': { const a = RE(one()), b = IM(x); return cx(Math.cos(a) * Math.cosh(b), -Math.sin(a) * Math.sinh(b)); }
      case 'tan': {
        const a = RE(one()), b = IM(x);
        return cdiv(cx(Math.sin(a) * Math.cosh(b), Math.cos(a) * Math.sinh(b)), cx(Math.cos(a) * Math.cosh(b), -Math.sin(a) * Math.sinh(b)), p);
      }
      case 'sinh': { const a = RE(one()), b = IM(x); return cx(Math.sinh(a) * Math.cos(b), Math.cosh(a) * Math.sin(b)); }
      case 'cosh': { const a = RE(one()), b = IM(x); return cx(Math.cosh(a) * Math.cos(b), Math.sinh(a) * Math.sin(b)); }
      case 'tanh': {
        const a = RE(one()), b = IM(x);
        return cdiv(cx(Math.sinh(a) * Math.cos(b), Math.cosh(a) * Math.sin(b)), cx(Math.cosh(a) * Math.cos(b), Math.sinh(a) * Math.sin(b)), p);
      }
    }
    return fail(MATH, p);
  }

  // Round to 15 digits and range-check every component.
  function finalize(v) {
    const fin = x => E.finalize(x);
    if (typeof v === 'number') return fin(v);
    if (isC(v)) {
      const re = fin(v.re), im = fin(v.im);
      // Drop rounding noise like 1e-17 next to a normal-sized part.
      const big = Math.max(Math.abs(re), Math.abs(im));
      return cx(Math.abs(re) < 1e-13 * big ? 0 : re, Math.abs(im) < 1e-13 * big ? 0 : im);
    }
    if (isM(v) || isV(v)) {
      // Snap entries to 13 digits relative to the largest entry, so A·A⁻¹ shows exactly I.
      const flat = isM(v) ? v.a.flat() : v.a;
      const big = Math.max(0, ...flat.map(t => Math.abs(fin(t))));
      const q = big ? Math.pow(10, Math.floor(Math.log10(big)) - 12) : 1;
      const clean = t => { t = fin(t); return big ? fin(Math.round(t / q) * q) : t; };
      return isM(v) ? mat(v.a.map(r => r.map(clean))) : vec(v.a.map(clean));
    }
    return fail(MATH, 0);
  }

  // ---------------------------------------------------------------- Base-N (32-bit integers)
  const BASES = { d: 10, h: 16, b: 2, o: 8 };
  const DIGITS = '0123456789ABCDEF';
  function evalBase(tokens, base, ctx) {
    let i = 0;
    const n = tokens.length;
    const peek = () => tokens[i];
    const syn = () => fail(SYN, i);
    const chk32 = (v, p) => { if (!Number.isInteger(v) || v < -2147483648 || v > 2147483647) fail(MATH, p); return v; };
    const close = () => { if (peek() === ')') { i++; return; } if (i < n) syn(); };

    function literal() {
      const p = i;
      let b = BASES[base];
      if (TOK[peek()] && TOK[peek()].kind === 'bpre') { b = BASES[tokens[i].slice(1)]; i++; }
      let s = '';
      while (i < n && (TOK[tokens[i]].kind === 'num' || TOK[tokens[i]].kind === 'hex')) {
        const ch = tokens[i] === '.' ? '.' : tokens[i].replace(/^h/, '');
        if (ch === '.' || DIGITS.indexOf(ch) < 0 || DIGITS.indexOf(ch) >= b) fail(SYN, i);
        s += ch; i++;
      }
      if (!s) fail(SYN, p);
      const v = parseInt(s, b);
      if (b === 10) return chk32(v, p);
      if (v > 0xFFFFFFFF) fail(MATH, p);
      return v | 0;
    }
    function primary() {
      const t = peek(), k = t !== undefined ? TOK[t].kind : null, p = i;
      if (k === 'num' || k === 'hex' || k === 'bpre') return literal();
      if (t === '(') { i++; const v = orx(); close(); return v; }
      if (t === 'bnot(' || t === 'bneg(') {
        i++; const v = orx(); close();
        return t === 'bnot(' ? ~v : chk32(-v, p);
      }
      if (k === 'var') { i++; const v = ctx.vars[TOK[t].n] || 0; return chk32(Math.trunc(typeof v === 'number' ? v : 0), p); }
      if (t === 'Ans') { i++; return chk32(Math.trunc(typeof ctx.ans === 'number' ? ctx.ans : 0), p); }
      return syn();
    }
    function unary() {
      if (peek() === 'neg' || peek() === '-') { const p = i++; return chk32(-unary(), p); }
      return primary();
    }
    function mulx() {
      let a = unary();
      while (peek() === '*' || peek() === '/') {
        const op = peek(), p = i++;
        const b = unary();
        if (op === '/') { if (b === 0) fail(MATH, p); a = chk32(Math.trunc(a / b), p); }
        else a = chk32(a * b, p);
      }
      return a;
    }
    function addx() {
      let a = mulx();
      while (peek() === '+' || peek() === '-') {
        const op = peek(), p = i++;
        const b = mulx();
        a = chk32(op === '+' ? a + b : a - b, p);
      }
      return a;
    }
    function andx() {
      let a = addx();
      while (peek() === 'and') { i++; a = a & addx(); }
      return a;
    }
    function orx() {
      let a = andx();
      while (peek() === 'or' || peek() === 'xor' || peek() === 'xnor') {
        const op = tokens[i++], b = andx();
        a = op === 'or' ? a | b : op === 'xor' ? a ^ b : ~(a ^ b);
      }
      return a;
    }
    if (!n) syn();
    const v = orx();
    if (i < n) syn();
    return v;
  }
  function fmtBase(v, base) {
    if (base === 'd') return String(v);
    const u = v >>> 0;
    if (base === 'h') return u.toString(16).toUpperCase().padStart(8, '0');
    if (base === 'o') return u.toString(8).padStart(11, '0');
    const bits = u.toString(2).padStart(u > 0xFFFF ? 32 : 16, '0');
    return bits.replace(/(.{4})(?=.)/g, '$1 ');
  }

  // ---------------------------------------------------------------- distributions
  const SQRT2PI = Math.sqrt(2 * Math.PI);
  const phi = x => Math.exp(-x * x / 2) / SQRT2PI;
  // Upper tail Q(x) = 1 − Φ(x) for x ≥ 0: Taylor series for small x, continued fraction for large x.
  function upperTail(x) {
    if (x < 3) {
      let term = x, sum = x;
      for (let k = 1; k < 500; k++) {
        term *= x * x / (2 * k + 1);
        sum += term;
        if (term < 1e-17 * sum) break;
      }
      return 0.5 - phi(x) * sum;
    }
    // Lentz evaluation of Q(x) = φ(x) / (x + 1/(x + 2/(x + 3/(x + …))))
    let f = x, C = x, D = 0;
    for (let k = 1; k < 500; k++) {
      D = x + k * D; D = D === 0 ? 1e-300 : 1 / D;
      C = x + k / C; if (C === 0) C = 1e-300;
      const delta = C * D;
      f *= delta;
      if (Math.abs(delta - 1) < 1e-16) break;
    }
    return phi(x) / f;
  }
  const normCdf = z => (z >= 0 ? 1 - upperTail(z) : upperTail(-z));
  // P(a ≤ X ≤ b), computed on the tail side where it is most precise.
  function normBetween(a, b) {
    if (a >= 0) return upperTail(a) - (b === Infinity ? 0 : upperTail(b));
    if (b <= 0) return upperTail(-b) - (a === -Infinity ? 0 : upperTail(-a));
    return 1 - upperTail(-a) - upperTail(b);
  }
  function normInv(area) {
    let lo = -40, hi = 40, x = 0;
    for (let k = 0; k < 200; k++) {
      const f = normCdf(x) - area;
      if (Math.abs(f) < 1e-17) break;
      if (f > 0) hi = x; else lo = x;
      const d = phi(x);
      let nx = d > 1e-300 ? x - f / d : NaN;
      if (!(nx > lo && nx < hi)) nx = (lo + hi) / 2;
      if (Math.abs(nx - x) < 1e-15 * Math.max(1, Math.abs(x))) { x = nx; break; }
      x = nx;
    }
    return x;
  }
  function lnFact(n) { let s = 0; for (let k = 2; k <= n; k++) s += Math.log(k); return s; }
  function binomPD(x, N, pr) {
    if (x < 0 || x > N) return 0;
    if (pr === 0) return x === 0 ? 1 : 0;
    if (pr === 1) return x === N ? 1 : 0;
    return Math.exp(lnFact(N) - lnFact(x) - lnFact(N - x) + x * Math.log(pr) + (N - x) * Math.log(1 - pr));
  }
  function poissonPD(x, lam) {
    if (x < 0) return 0;
    if (lam === 0) return x === 0 ? 1 : 0;
    return Math.exp(-lam + x * Math.log(lam) - lnFact(x));
  }
  const isNat = v => Number.isInteger(v) && v >= 0;
  const DIST = {
    normPD: (x, s, m) => { if (!(s > 0)) fail(MATH, 0); return phi((x - m) / s) / s; },
    normCD: (lo, up, s, m) => { if (!(s > 0) || lo > up) fail(MATH, 0); return normBetween((lo - m) / s, (up - m) / s); },
    invNorm: (area, s, m) => { if (!(s > 0) || !(area > 0 && area < 1)) fail(MATH, 0); return m + s * normInv(area); },
    binomPD: (x, N, pr) => { if (!isNat(x) || !isNat(N) || N > 100000 || !(pr >= 0 && pr <= 1)) fail(MATH, 0); return binomPD(x, N, pr); },
    binomCD: (x, N, pr) => {
      if (!isNat(x) || !isNat(N) || N > 100000 || !(pr >= 0 && pr <= 1)) fail(MATH, 0);
      let s = 0; for (let k = 0; k <= Math.min(x, N); k++) s += binomPD(k, N, pr);
      return Math.min(1, s);
    },
    poissonPD: (x, lam) => { if (!isNat(x) || !(lam > 0) || lam > 1e8) fail(MATH, 0); return poissonPD(x, lam); },
    poissonCD: (x, lam) => {
      if (!isNat(x) || x > 1e6 || !(lam > 0) || lam > 1e8) fail(MATH, 0);
      let s = 0; for (let k = 0; k <= x; k++) s += poissonPD(k, lam);
      return Math.min(1, s);
    }
  };

  // ---------------------------------------------------------------- inequalities
  // coef: highest degree first; op: '>', '<', '>=', '<='. Returns
  // { all:true } | { none:true } | { parts:[{lo, loIncl, hi, hiIncl}] } with ±Infinity for unbounded ends.
  function solveInequality(coef, op) {
    if (coef[0] === 0) fail(MATH, 0);
    const f = x => coef.reduce((acc, c) => acc * x + c, 0);
    const scale = Math.max(1, ...coef.map(Math.abs));
    let roots = E.polyRoots(coef.slice()).filter(r => r.im === 0).map(r => E.round15(r.re)).sort((a, b) => a - b);
    roots = roots.filter((r, k) => k === 0 || Math.abs(r - roots[k - 1]) > 1e-9 * Math.max(1, Math.abs(r)));
    const strict = op === '>' || op === '<';
    const want = v => (op === '>' || op === '>=' ? v > 0 : v < 0);
    const near0 = v => Math.abs(v) <= 1e-12 * scale;
    // Sample the sign of f strictly inside each interval between roots.
    const pts = [-Infinity].concat(roots, [Infinity]);
    const inside = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      const m = a === -Infinity && b === Infinity ? 0 : a === -Infinity ? b - 1 - Math.abs(b) : b === Infinity ? a + 1 + Math.abs(a) : (a + b) / 2;
      const v = f(m);
      inside.push(!near0(v) && want(v));
    }
    // Walk interval0, root0, interval1, root1, … and merge consecutive satisfied pieces.
    const atoms = [];
    inside.forEach((ok, k) => {
      atoms.push({ ok, lo: pts[k], hi: pts[k + 1], incl: false });
      if (k < roots.length) atoms.push({ ok: !strict, lo: roots[k], hi: roots[k], incl: true });
    });
    const parts = [];
    let cur = null;
    atoms.forEach(at => {
      if (at.ok) {
        if (!cur) cur = { lo: at.lo, loIncl: at.incl };
        cur.hi = at.hi; cur.hiIncl = at.incl;
      } else if (cur) { parts.push(cur); cur = null; }
    });
    if (cur) parts.push(cur);
    if (!parts.length) return { none: true };
    if (parts.length === 1 && parts[0].lo === -Infinity && parts[0].hi === Infinity) return { all: true };
    return { parts };
  }

  // ---------------------------------------------------------------- ratio
  // A:B = X:D → X = A·D/B ;  A:B = C:X → X = B·C/A
  function ratio(kind, a, b, c) {
    if (kind === 'x3') { if (b === 0) fail(MATH, 0); return a * c / b; }
    if (a === 0) fail(MATH, 0);
    return b * c / a;
  }

  const api = {
    DIM, cx, isC, isM, isV, isScalar, RE, IM, evaluate, finalize, det, minv, echelon,
    evalBase, fmtBase, DIST, normCdf, solveInequality, ratio
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CalcEngineX = api;
})(typeof window !== 'undefined' ? window : globalThis);
