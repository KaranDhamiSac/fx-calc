/* Calculator engine: token table, parser, evaluator, numeric solvers, result formatting.
   Works in the browser (window.CalcEngine) and in Node (module.exports) for testing. */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- tokens
  const TOK = {};
  function def(key, disp, kind, extra) {
    TOK[key] = Object.assign({ key, disp, kind }, extra || {});
  }

  '0123456789'.split('').forEach(d => def(d, d, 'num'));
  def('.', '.', 'num');
  def('EXP', 'ᴇ', 'exp');
  def('+', '+', 'op');
  def('-', '−', 'op');
  def('*', '×', 'op');
  def('/', '÷', 'op');
  def('frac', '⌟', 'frac');
  def('neg', '-', 'neg');
  def('(', '(', 'lp');
  def(')', ')', 'rp');
  def(',', ',', 'comma');
  def('=', '=', 'eq');
  def('°', '°', 'dms');
  def('^(', '^(', 'pow');
  def('xrt(', 'ˣ√(', 'pow');
  def('P', 'P', 'perm');
  def('mod', ' mod ', 'op');
  def('divr', '÷R', 'op');
  def('C', 'C', 'perm');

  [
    ['sin', 'sin('], ['cos', 'cos('], ['tan', 'tan('],
    ['asin', 'sin⁻¹('], ['acos', 'cos⁻¹('], ['atan', 'tan⁻¹('],
    ['sinh', 'sinh('], ['cosh', 'cosh('], ['tanh', 'tanh('],
    ['asinh', 'sinh⁻¹('], ['acosh', 'cosh⁻¹('], ['atanh', 'tanh⁻¹('],
    ['log', 'log('], ['ln', 'ln('], ['p10', '10^('], ['exp', 'e^('],
    ['sqrt', '√('], ['cbrt', '∛('], ['abs', 'Abs('],
    ['pol', 'Pol('], ['rec', 'Rec('],
    ['int', 'Int('], ['intg', 'Intg('], ['rnd', 'Rnd('],
    ['gcd', 'GCD('], ['lcm', 'LCM('], ['ranint', 'RanInt#('],
    ['integ', '∫('], ['deriv', 'd/dx('], ['sum', 'Σ('], ['prod', '∏('],
    ['cot', 'cot('], ['acot', 'cot⁻¹('], ['ceil', 'Ceil('], ['floor', 'Floor(']
  ].forEach(([f, d]) => def(f + '(', d, 'func', { f }));

  [
    ['sq', '²'], ['cube', '³'], ['inv', '⁻¹'], ['fact', '!'], ['pct', '%'],
    ['degm', 'ᵒ'], ['radm', 'ʳ'], ['gradm', 'ᵍ']
  ].forEach(([f, d]) => def(f, d, 'post', { f }));

  // Unit conversions (postfix). Linear ones are a factor; temperatures are functions.
  const CONV = [
    ['in-cm', 'in▶cm', 2.54], ['cm-in', 'cm▶in', 1 / 2.54],
    ['ft-m', 'ft▶m', 0.3048], ['m-ft', 'm▶ft', 1 / 0.3048],
    ['yd-m', 'yd▶m', 0.9144], ['m-yd', 'm▶yd', 1 / 0.9144],
    ['mi-km', 'mile▶km', 1.609344], ['km-mi', 'km▶mile', 1 / 1.609344],
    ['nmi-m', 'n mile▶m', 1852], ['m-nmi', 'm▶n mile', 1 / 1852],
    ['lb-kg', 'lb▶kg', 0.45359237], ['kg-lb', 'kg▶lb', 1 / 0.45359237],
    ['oz-g', 'oz▶g', 28.349523125], ['g-oz', 'g▶oz', 1 / 28.349523125],
    ['gal-L', 'gal(US)▶L', 3.785411784], ['L-gal', 'L▶gal(US)', 1 / 3.785411784],
    ['mph-kmh', 'mph▶km/h', 1.609344], ['kmh-mph', 'km/h▶mph', 1 / 1.609344],
    ['ms-kmh', 'm/s▶km/h', 3.6], ['kmh-ms', 'km/h▶m/s', 1 / 3.6],
    ['acre-m2', 'acre▶m²', 4046.8564224], ['m2-acre', 'm²▶acre', 1 / 4046.8564224],
    ['atm-Pa', 'atm▶Pa', 101325], ['Pa-atm', 'Pa▶atm', 1 / 101325],
    ['hp-kW', 'hp▶kW', 0.745699872], ['kW-hp', 'kW▶hp', 1 / 0.745699872],
    ['cal-J', 'cal▶J', 4.184], ['J-cal', 'J▶cal', 1 / 4.184],
    ['F-C', '°F▶°C', x => (x - 32) * 5 / 9], ['C-F', '°C▶°F', x => x * 9 / 5 + 32],
    ['K-C', 'K▶°C', x => x - 273.15], ['C-K', '°C▶K', x => x + 273.15]
  ];
  CONV.forEach(([id, d, f]) => def('cv:' + id, d, 'post', { f: 'cv', conv: f }));

  def('pi', 'π', 'const', { v: Math.PI });
  def('e', 'e', 'const', { v: Math.E });
  def('Ans', 'Ans', 'const');
  def('PreAns', 'PreAns', 'const');
  def('Ran#', 'Ran#', 'const');

  // Physical constants (CODATA 2018)
  const CONSTS = [
    ['c', 'c₀', 'speed of light', 299792458],
    ['h', 'h', 'Planck constant', 6.62607015e-34],
    ['G', 'G', 'gravitational const', 6.6743e-11],
    ['qe', 'e⁻', 'elementary charge', 1.602176634e-19],
    ['me', 'mₑ', 'electron mass', 9.1093837015e-31],
    ['mp', 'mₚ', 'proton mass', 1.67262192369e-27],
    ['mn', 'mₙ', 'neutron mass', 1.67492749804e-27],
    ['NA', 'Nₐ', 'Avogadro constant', 6.02214076e23],
    ['k', 'k', 'Boltzmann constant', 1.380649e-23],
    ['R', 'R', 'molar gas constant', 8.314462618],
    ['g', 'g', 'standard gravity', 9.80665],
    ['e0', 'ε₀', 'vacuum permittivity', 8.8541878128e-12],
    ['mu0', 'μ₀', 'vacuum permeability', 1.25663706212e-6],
    ['F', 'F', 'Faraday constant', 96485.33212],
    ['atm', 'atm', 'standard atmosphere', 101325],
    ['sigma', 'σ', 'Stefan-Boltzmann', 5.670374419e-8]
  ];
  CONSTS.forEach(([id, d, name, v]) => def('k:' + id, d, 'const', { v, name }));

  // Complex / Matrix / Vector / Base-N tokens (evaluated by engine-x.js)
  def('i', 'i', 'const', { ext: true });
  def('∠', '∠', 'perm');
  def('dot', '·', 'op');
  ['A', 'B', 'C', 'D', 'Ans'].forEach(n => { def('Mat' + n, 'Mat' + n, 'const', { ext: true }); def('Vct' + n, 'Vct' + n, 'const', { ext: true }); });
  [
    ['arg', 'arg('], ['conj', 'Conjg('], ['rep', 'ReP('], ['imp', 'ImP('],
    ['det', 'det('], ['trn', 'Trn('], ['ident', 'Identity('], ['ref', 'Ref('], ['rref', 'Rref('],
    ['angle', 'Angle('], ['unitv', 'UnitV('], ['bnot', 'Not('], ['bneg', 'Neg(']
  ].forEach(([f, d]) => def(f + '(', d, 'func', { f, ext: true }));
  def('toPolar', '▶r∠θ', 'post', { f: 'toPolar' });
  def('toRect', '▶a+bi', 'post', { f: 'toRect' });
  ['A', 'B', 'C', 'D', 'E', 'F'].forEach(h => def('h' + h, h, 'hex'));
  [['and', ' and '], ['or', ' or '], ['xor', ' xor '], ['xnor', ' xnor ']].forEach(([k, d]) => def(k, d, 'logic'));
  [['pd', 'd'], ['ph', 'h'], ['pb', 'b'], ['po', 'o']].forEach(([k, d]) => def(k, d, 'bpre'));

  const VARS = ['A', 'B', 'C', 'D', 'E', 'F', 'X', 'Y', 'M'];
  VARS.forEach(n => def('v' + n, n, 'var', { n }));

  // ---------------------------------------------------------------- errors
  const SYN = 'Syntax ERROR', MATH = 'Math ERROR', SOLVE_ERR = "Can't Solve", ARG = 'Argument ERROR';
  class CalcError extends Error {
    constructor(type, pos) { super(type); this.type = type; this.pos = pos; }
  }
  const mathErr = p => { throw new CalcError(MATH, p); };

  // ---------------------------------------------------------------- parser
  function parse(tokens) {
    let i = 0;
    const n = tokens.length;
    const peek = () => tokens[i];
    const kind = () => (i < n ? TOK[tokens[i]].kind : null);
    const err = () => { throw new CalcError(SYN, i); };
    const closeParen = () => {
      if (tokens[i] === ')') { i++; return; }
      if (i >= n) return; // missing closing parens are added automatically
      err();
    };
    const startsPrimary = () => {
      const k = kind();
      return k === 'num' || k === 'exp' || k === 'const' || k === 'var' || k === 'func' || k === 'lp';
    };

    function expr() { return add(); }
    function add() {
      let a = mul();
      while (peek() === '+' || peek() === '-') {
        const op = peek(), p = i++;
        a = { k: 'bin', op, a, b: mul(), p };
      }
      return a;
    }
    function mul() {
      let a = imp();
      while (peek() === '*' || peek() === '/' || peek() === 'dot' || peek() === 'mod' || peek() === 'divr') {
        const op = peek(), p = i++;
        a = { k: 'bin', op, a, b: imp(), p };
      }
      return a;
    }
    // Implicit multiplication binds tighter than × and ÷ (1÷2π = 1÷(2π)), like Casio.
    function imp() {
      let a = perm();
      while (startsPrimary()) {
        const p = i;
        a = { k: 'bin', op: '*', a, b: perm(), p };
      }
      return a;
    }
    function perm() {
      let a = unary();
      while (peek() === 'P' || peek() === 'C' || peek() === '∠') {
        const op = peek(), p = i++;
        a = { k: 'bin', op, a, b: unary(), p };
      }
      return a;
    }
    function unary() {
      if (peek() === 'neg') { const p = i++; return { k: 'neg', a: unary(), p }; }
      return frac();
    }
    function frac() {
      let a = pow();
      while (peek() === 'frac') {
        const p = i++;
        a = { k: 'bin', op: 'frac', a, b: negPow(), p };
      }
      return a;
    }
    function negPow() {
      if (peek() === 'neg') { const p = i++; return { k: 'neg', a: negPow(), p }; }
      return pow();
    }
    // Powers evaluate left to right (2^3^2 = 64), matching Casio.
    function pow() {
      let a = post(primary());
      while (peek() === '^(' || peek() === 'xrt(') {
        const op = peek(), p = i++;
        const b = expr();
        closeParen();
        a = post({ k: 'bin', op, a, b, p });
      }
      return a;
    }
    function post(a) {
      while (kind() === 'post') {
        const t = TOK[tokens[i]], p = i++;
        a = { k: 'post', f: t.f, conv: t.conv, a, p };
      }
      return a;
    }
    function primary() {
      const k = kind(), p = i;
      if (k === 'num' || k === 'exp') return number();
      if (k === 'const') { i++; return { k: 'const', n: tokens[p], p }; }
      if (k === 'var') { i++; return { k: 'var', n: TOK[tokens[p]].n, p }; }
      if (k === 'lp') { i++; const e = expr(); closeParen(); return e; }
      if (k === 'func') {
        i++;
        const args = [expr()];
        while (peek() === ',') { i++; args.push(expr()); }
        closeParen();
        return { k: 'fn', f: TOK[tokens[p]].f, args, p };
      }
      return err();
    }
    function digits() {
      let s = '';
      while (kind() === 'num') { s += tokens[i]; i++; }
      return s;
    }
    function number() {
      const p = i;
      let s = digits();
      if (s.split('.').length > 2 || s === '.') throw new CalcError(SYN, p);
      let v = s === '' ? 1 : parseFloat(s);
      if (peek() === 'EXP') {
        i++;
        let sign = '';
        if (peek() === 'neg' || peek() === '-') { sign = '-'; i++; }
        else if (peek() === '+') i++;
        const ePos = i;
        const e = digits();
        if (e === '' || e.includes('.')) throw new CalcError(SYN, ePos);
        v = parseFloat((s === '' ? '1' : s) + 'e' + sign + e);
      }
      if (peek() === '°') {
        // Degrees-minutes-seconds: 12°34°56° → 12 + 34/60 + 56/3600
        i++;
        let total = v, div = 60;
        for (let j = 0; j < 2; j++) {
          const save = i;
          const s2 = digits();
          if (s2 !== '' && peek() === '°') { i++; total += parseFloat(s2) / div; div *= 60; continue; }
          i = save;
          break;
        }
        return { k: 'num', v: total, p, dms: true };
      }
      return { k: 'num', v, p };
    }

    if (n === 0) err();
    let res = expr();
    if (peek() === '=') {
      const p = i++;
      res = { k: 'eq', a: res, b: expr(), p };
    }
    if (i < n) err();
    return res;
  }

  // ---------------------------------------------------------------- math helpers
  const toRad = (x, u) => (u === 'D' ? x * Math.PI / 180 : u === 'G' ? x * Math.PI / 200 : x);
  const fromRad = (x, u) => (u === 'D' ? x * 180 / Math.PI : u === 'G' ? x * 200 / Math.PI : x);

  // If x is an exact multiple of a quarter turn, return that multiple.
  function quarterTurns(x, u) {
    const q = u === 'D' ? 90 : u === 'G' ? 100 : Math.PI / 2;
    const k = x / q, r = Math.round(k);
    return Math.abs(k - r) <= 1e-13 * Math.max(1, Math.abs(k)) ? r : null;
  }
  function checkTrigArg(x, u, p) {
    const lim = u === 'D' ? 9e9 : u === 'G' ? 1e10 : 157079632.7;
    if (!(Math.abs(x) < lim)) mathErr(p);
  }
  function sinA(x, u, p) {
    checkTrigArg(x, u, p);
    const k = quarterTurns(x, u);
    if (k !== null) return [0, 1, 0, -1][((k % 4) + 4) % 4];
    if (u === 'D') { const r = x % 360; if (Math.abs(Math.abs(r) % 180 - 30) < 1e-12) return Math.sign(Math.sin(toRad(r, u))) * 0.5; }
    return Math.sin(toRad(x, u));
  }
  function cosA(x, u, p) {
    checkTrigArg(x, u, p);
    const k = quarterTurns(x, u);
    if (k !== null) return [1, 0, -1, 0][((k % 4) + 4) % 4];
    if (u === 'D') { const r = x % 360; if (Math.abs(Math.abs(r) % 180 - 60) < 1e-12) return Math.sign(Math.cos(toRad(r, u))) * 0.5; }
    return Math.cos(toRad(x, u));
  }
  function tanA(x, u, p) {
    checkTrigArg(x, u, p);
    const k = quarterTurns(x, u);
    if (k !== null) { if (k % 2 !== 0) mathErr(p); return 0; }
    if (u === 'D') { const r = ((x % 180) + 180) % 180; if (Math.abs(r - 45) < 1e-12) return 1; if (Math.abs(r - 135) < 1e-12) return -1; }
    return Math.tan(toRad(x, u));
  }

  const isInt = x => Number.isInteger(x);
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }

  function factorial(x, p) {
    if (!isInt(x) || x < 0 || x > 69) mathErr(p);
    let r = 1;
    for (let i = 2; i <= x; i++) r *= i;
    return r;
  }
  function nPr(n, r, p) {
    if (!isInt(n) || !isInt(r) || n < 0 || r < 0 || r > n || n >= 1e10) mathErr(p);
    let v = 1;
    for (let i = 0; i < r; i++) { v *= n - i; if (v >= 1e100) mathErr(p); }
    return v;
  }
  function nCr(n, r, p) {
    if (!isInt(n) || !isInt(r) || n < 0 || r < 0 || r > n || n >= 1e10) mathErr(p);
    r = Math.min(r, n - r);
    let v = 1;
    for (let i = 1; i <= r; i++) { v = v * (n - r + i) / i; if (v >= 1e100) mathErr(p); }
    return Math.round(v) === v || v > 1e15 ? v : Math.round(v);
  }
  function powReal(a, b, p) {
    if (a === 0 && b <= 0) mathErr(p);
    if (a < 0 && !isInt(b)) {
      const f = approxFrac(Math.abs(b), 1000, 1e-12);
      if (f && f[1] % 2 === 1) {
        const r = Math.pow(-a, b);
        return f[0] % 2 === 1 ? -r : r;
      }
      mathErr(p);
    }
    return Math.pow(a, b);
  }
  function rootReal(nIdx, x, p) {
    if (nIdx === 0) mathErr(p);
    if (x < 0) {
      if (isInt(nIdx) && Math.abs(nIdx) % 2 === 1) return -Math.pow(-x, 1 / nIdx);
      mathErr(p);
    }
    if (nIdx === 3) return Math.cbrt(x);
    if (nIdx === 2) return Math.sqrt(x);
    return Math.pow(x, 1 / nIdx);
  }

  function chk(v, p) {
    if (typeof v !== 'number' || isNaN(v) || !isFinite(v) || Math.abs(v) >= 1e100) mathErr(p);
    return v;
  }

  // ---------------------------------------------------------------- evaluator
  // ctx: { vars, angle:'D'|'R'|'G', ans, preAns, fmt, multi }
  function evaluate(node, ctx) {
    const ev = nd => evaluate(nd, ctx);
    switch (node.k) {
      case 'num': return node.v;
      case 'var': return realOnly(ctx.vars[node.n] || 0, node.p);
      case 'const': {
        if (node.n === 'Ans') return realOnly(ctx.ans || 0, node.p);
        if (node.n === 'PreAns') return realOnly(ctx.preAns || 0, node.p);
        if (TOK[node.n].ext) throw new CalcError(SYN, node.p);
        if (node.n === 'Ran#') return Math.floor(Math.random() * 1000) / 1000;
        return TOK[node.n].v;
      }
      case 'neg': return -ev(node.a);
      case 'eq': throw new CalcError(SYN, node.p);
      case 'bin': {
        const a = ev(node.a), b = ev(node.b), p = node.p;
        switch (node.op) {
          case '+': return chk(a + b, p);
          case '-': return chk(a - b, p);
          case '*': return chk(a * b, p);
          case '/': case 'frac': if (b === 0) mathErr(p); return chk(a / b, p);
          case 'mod': if (b === 0) mathErr(p); return chk(a - b * Math.floor(a / b), p);
          case 'divr': {
            if (b === 0 || !isInt(a) || !isInt(b) || a < 0 || b < 0) mathErr(p);
            const q = Math.floor(a / b), r = a - b * q;
            ctx.multi = [['Q', q], ['R', r]];
            return q;
          }
          case '^(': return chk(powReal(a, b, p), p);
          case 'xrt(': return chk(rootReal(a, b, p), p);
          case 'P': return chk(nPr(a, b, p), p);
          case '∠': case 'dot': throw new CalcError(SYN, p);
          case 'C': return chk(nCr(a, b, p), p);
        }
        break;
      }
      case 'post': {
        const a = ev(node.a), p = node.p, u = ctx.angle;
        switch (node.f) {
          case 'sq': return chk(a * a, p);
          case 'cube': return chk(a * a * a, p);
          case 'inv': if (a === 0) mathErr(p); return chk(1 / a, p);
          case 'fact': return chk(factorial(a, p), p);
          case 'pct': return a / 100;
          case 'degm': return u === 'D' ? a : fromRad(toRad(a, 'D'), u);
          case 'radm': return u === 'R' ? a : fromRad(a, u);
          case 'gradm': return u === 'G' ? a : fromRad(toRad(a, 'G'), u);
          case 'cv': return chk(typeof node.conv === 'function' ? node.conv(a) : a * node.conv, p);
          case 'toPolar': case 'toRect': throw new CalcError(SYN, p);
        }
        break;
      }
      case 'fn': return evalFn(node, ctx);
    }
    throw new CalcError(SYN, node.p);
  }

  // Complex values stored in variables (from Complex mode) are not usable in real calculations.
  function realOnly(v, p) {
    if (typeof v === 'number') return v;
    if (v && v.t === 'c' && v.im === 0) return v.re;
    return mathErr(p);
  }

  function withVar(ctx, name, value, fn) {
    const old = ctx.vars[name];
    ctx.vars[name] = value;
    try { return fn(); } finally { ctx.vars[name] = old; }
  }

  function evalFn(node, ctx) {
    const { f, args, p } = node;
    const u = ctx.angle;
    const argc = c => { if (Array.isArray(c) ? !c.includes(args.length) : args.length !== c) throw new CalcError(SYN, p); };

    // Calculus functions take an unevaluated expression in X.
    if (f === 'integ' || f === 'deriv' || f === 'sum' || f === 'prod') {
      const body = args[0];
      const fx = x => withVar(ctx, 'X', x, () => evaluate(body, ctx));
      if (f === 'integ') {
        argc([3, 4]);
        const a = evaluate(args[1], ctx), b = evaluate(args[2], ctx);
        return chk(integrate(fx, a, b, p), p);
      }
      if (f === 'deriv') {
        argc([2, 3]);
        return chk(derivative(fx, evaluate(args[1], ctx), p), p);
      }
      argc(3);
      const a = evaluate(args[1], ctx), b = evaluate(args[2], ctx);
      if (!isInt(a) || !isInt(b) || b < a || b - a > 1e6) mathErr(p);
      let acc = f === 'sum' ? 0 : 1;
      for (let x = a; x <= b; x++) {
        const v = fx(x);
        acc = f === 'sum' ? acc + v : acc * v;
        chk(acc, p);
      }
      return acc;
    }

    const v = args.map(a => evaluate(a, ctx));
    const x = v[0];
    switch (f) {
      case 'sin': argc(1); return sinA(x, u, p);
      case 'cos': argc(1); return cosA(x, u, p);
      case 'tan': argc(1); return chk(tanA(x, u, p), p);
      case 'asin': argc(1); if (Math.abs(x) > 1) mathErr(p); return fromRad(Math.asin(x), u);
      case 'acos': argc(1); if (Math.abs(x) > 1) mathErr(p); return fromRad(Math.acos(x), u);
      case 'atan': argc(1); return fromRad(Math.atan(x), u);
      case 'cot': {
        argc(1); checkTrigArg(x, u, p);
        const k = quarterTurns(x, u);
        if (k !== null) { if (k % 2 === 0) mathErr(p); return 0; }
        return chk(1 / tanA(x, u, p), p);
      }
      case 'acot': argc(1); return fromRad(Math.PI / 2 - Math.atan(x), u);
      case 'ceil': argc(1); return Math.ceil(x);
      case 'floor': argc(1); return Math.floor(x);
      case 'sinh': argc(1); return chk(Math.sinh(x), p);
      case 'cosh': argc(1); return chk(Math.cosh(x), p);
      case 'tanh': argc(1); return Math.tanh(x);
      case 'asinh': argc(1); return Math.asinh(x);
      case 'acosh': argc(1); if (x < 1) mathErr(p); return Math.acosh(x);
      case 'atanh': argc(1); if (Math.abs(x) >= 1) mathErr(p); return Math.atanh(x);
      case 'log':
        argc([1, 2]);
        if (v.length === 1) { if (x <= 0) mathErr(p); return Math.log10(x); }
        if (v[0] <= 0 || v[0] === 1 || v[1] <= 0) mathErr(p);
        return chk(Math.log(v[1]) / Math.log(v[0]), p);
      case 'ln': argc(1); if (x <= 0) mathErr(p); return Math.log(x);
      case 'p10': argc(1); return chk(Math.pow(10, x), p);
      case 'exp': argc(1); return chk(Math.exp(x), p);
      case 'sqrt': argc(1); if (x < 0) mathErr(p); return Math.sqrt(x);
      case 'cbrt': argc(1); return Math.cbrt(x);
      case 'abs': argc(1); return Math.abs(x);
      case 'int': argc(1); return Math.trunc(x);
      case 'intg': argc(1); return Math.floor(x);
      case 'rnd': argc(1); return roundDisplay(x, ctx.fmt);
      case 'gcd': case 'lcm': {
        argc(2);
        if (!isInt(v[0]) || !isInt(v[1]) || Math.abs(v[0]) >= 1e10 || Math.abs(v[1]) >= 1e10) mathErr(p);
        const g = gcd(v[0], v[1]);
        if (f === 'gcd') return g;
        if (g === 0) return 0;
        return Math.abs(v[0] / g * v[1]);
      }
      case 'ranint': {
        argc(2);
        if (!isInt(v[0]) || !isInt(v[1]) || v[0] > v[1]) mathErr(p);
        return v[0] + Math.floor(Math.random() * (v[1] - v[0] + 1));
      }
      case 'pol': {
        argc(2);
        if (v[0] === 0 && v[1] === 0) mathErr(p);
        const r = Math.hypot(v[0], v[1]), th = fromRad(Math.atan2(v[1], v[0]), u);
        ctx.vars.X = r; ctx.vars.Y = th;
        ctx.multi = [['r', r], ['θ', th]];
        return r;
      }
      case 'rec': {
        argc(2);
        const xr = v[0] * cosA(v[1], u, p), yr = v[0] * sinA(v[1], u, p);
        ctx.vars.X = xr; ctx.vars.Y = yr;
        ctx.multi = [['x', xr], ['y', yr]];
        return xr;
      }
    }
    throw new CalcError(SYN, p);
  }

  // Final result: Casio range is ±1e-99 … ±9.999999999e99
  function finalize(v) {
    chk(v, 0);
    if (Math.abs(v) < 1e-99) return 0;
    return parseFloat(v.toPrecision(15)); // Casio keeps 15 significant digits
  }
  const round15 = v => (v === 0 ? 0 : parseFloat(v.toPrecision(15)));

  // ---------------------------------------------------------------- numerics
  const XGK = [0.991455371120812639, 0.949107912342758525, 0.864864423359769073, 0.741531185599394440,
    0.586087235467691130, 0.405845151377397167, 0.207784955007898468, 0];
  const WGK = [0.022935322010529225, 0.063092092629978553, 0.104790010322250184, 0.140653259715525919,
    0.169004726639267903, 0.190350578064785410, 0.204432940075298892, 0.209482141084727828];
  const WG = [0.129484966168869693, 0.279705391489276668, 0.381830050505118945, 0.417959183673469388];

  function gk15(f, a, b) {
    const c = (a + b) / 2, h = (b - a) / 2;
    const fc = f(c);
    let rk = fc * WGK[7], rg = fc * WG[3];
    for (let j = 0; j < 7; j++) {
      const dx = h * XGK[j];
      const s = f(c - dx) + f(c + dx);
      rk += WGK[j] * s;
      if (j % 2 === 1) rg += WG[(j - 1) / 2] * s;
    }
    return { a, b, v: rk * h, e: Math.abs((rk - rg) * h) };
  }

  // Globally adaptive Gauss–Kronrod quadrature.
  function integrate(f, a, b, p) {
    if (a === b) return 0;
    let parts = [gk15(f, a, b)];
    for (let iter = 0; iter < 500; iter++) {
      let tot = 0, err = 0, worst = 0;
      for (let i = 0; i < parts.length; i++) {
        tot += parts[i].v; err += parts[i].e;
        if (parts[i].e > parts[worst].e) worst = i;
      }
      if (err <= Math.max(1e-13, 1e-12 * Math.abs(tot))) return tot;
      const w = parts[worst], m = (w.a + w.b) / 2;
      if (m === w.a || m === w.b) return tot;
      parts.splice(worst, 1, gk15(f, w.a, m), gk15(f, m, w.b));
    }
    let tot = 0, err = 0;
    parts.forEach(q => { tot += q.v; err += q.e; });
    if (err > 1e-6 * Math.max(1, Math.abs(tot))) throw new CalcError(MATH, p);
    return tot;
  }

  // Ridders' method: Richardson extrapolation of central differences.
  function derivative(f, x, p) {
    let h = x === 0 ? 0.1 : Math.min(0.1 * Math.max(1, Math.abs(x)), Math.abs(x) * 0.5);
    for (let attempt = 0; attempt < 6; attempt++, h /= 8) {
      try {
        const CON = 1.4, CON2 = CON * CON, NTAB = 12;
        const a = [];
        for (let i = 0; i < NTAB; i++) a.push(new Array(NTAB));
        let hh = h, err = Infinity, ans = NaN;
        a[0][0] = (f(x + hh) - f(x - hh)) / (2 * hh);
        for (let i = 1; i < NTAB; i++) {
          hh /= CON;
          a[0][i] = (f(x + hh) - f(x - hh)) / (2 * hh);
          let fac = CON2;
          for (let j = 1; j <= i; j++) {
            a[j][i] = (a[j - 1][i] * fac - a[j - 1][i - 1]) / (fac - 1);
            fac *= CON2;
            const errt = Math.max(Math.abs(a[j][i] - a[j - 1][i]), Math.abs(a[j][i] - a[j - 1][i - 1]));
            if (errt <= err) { err = errt; ans = a[j][i]; }
          }
          if (Math.abs(a[i][i] - a[i - 1][i - 1]) >= 2 * err) break;
        }
        if (isNaN(ans)) mathErr(p);
        if (err > 1e-5 * Math.max(1, Math.abs(ans))) mathErr(p);
        return Math.abs(ans) < 1e-12 * Math.max(1, Math.abs(err) * 1e6) && err < 1e-10 ? 0 : ans;
      } catch (e) {
        if (attempt === 5) throw e;
      }
    }
    return mathErr(p);
  }

  // Solve g(x)=0 near guess: Newton first, then scan outward for a sign change and bisect.
  function solveNumeric(g, guess) {
    const safe = x => { try { const v = g(x); return isFinite(v) ? v : NaN; } catch (e) { return NaN; } };
    let x = guess;
    for (let it = 0; it < 200; it++) {
      const fx = safe(x);
      if (isNaN(fx)) break;
      if (fx === 0) return x;
      const h = 1e-7 * Math.max(1, Math.abs(x));
      const d = (safe(x + h) - safe(x - h)) / (2 * h);
      if (!isFinite(d) || d === 0) break;
      let step = fx / d, nx = x - step;
      // Damping keeps Newton from jumping into a domain error.
      let tries = 0;
      while ((isNaN(safe(nx)) || Math.abs(safe(nx)) > Math.abs(fx) * 4) && tries < 20) { step /= 2; nx = x - step; tries++; }
      if (Math.abs(nx - x) <= 1e-15 * Math.max(1, Math.abs(x))) {
        x = nx;
        const r = safe(x);
        if (Math.abs(r) < 1e-9 * Math.max(1, Math.abs(x))) return x;
        break;
      }
      x = nx;
    }
    // Check the Newton result.
    if (!isNaN(safe(x)) && Math.abs(safe(x)) < 1e-12) return x;

    // Bracket search outward from the guess.
    let prevL = guess, fPrevL = safe(guess), prevR = guess, fPrevR = fPrevL;
    for (let k = 0; k < 400; k++) {
      const d = 0.01 * Math.pow(1.12, k);
      if (d > 1e12) break;
      const R = guess + d, fR = safe(R);
      if (!isNaN(fR) && !isNaN(fPrevR) && Math.sign(fR) !== Math.sign(fPrevR)) return bisect(safe, prevR, R, fPrevR);
      prevR = R; fPrevR = fR;
      const L = guess - d, fL = safe(L);
      if (!isNaN(fL) && !isNaN(fPrevL) && Math.sign(fL) !== Math.sign(fPrevL)) return bisect(safe, L, prevL, fL);
      prevL = L; fPrevL = fL;
    }
    throw new CalcError(SOLVE_ERR, 0);
  }
  function bisect(f, a, b, fa) {
    for (let i = 0; i < 200; i++) {
      const m = (a + b) / 2;
      if (m === a || m === b) break;
      const fm = f(m);
      if (isNaN(fm)) break;
      if (fm === 0) return m;
      if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else b = m;
    }
    const m = (a + b) / 2, fm = f(m);
    // A sign change across a pole is not a root.
    if (isNaN(fm) || Math.abs(fm) > 1e-6 * Math.max(1, Math.abs(m))) throw new CalcError(SOLVE_ERR, 0);
    return m;
  }

  function varsIn(node, out) {
    out = out || [];
    if (!node || typeof node !== 'object') return out;
    if (node.k === 'var' && !out.includes(node.n)) out.push(node.n);
    if (node.k === 'fn' && ['integ', 'deriv', 'sum', 'prod'].includes(node.f)) {
      // X inside calculus bodies is bound, not free.
      const inner = varsIn(node.args[0], []).filter(v => v !== 'X');
      inner.forEach(v => { if (!out.includes(v)) out.push(v); });
      node.args.slice(1).forEach(a => varsIn(a, out));
      return out;
    }
    ['a', 'b'].forEach(key => { if (node[key]) varsIn(node[key], out); });
    if (node.args) node.args.forEach(a => varsIn(a, out));
    return out;
  }

  // Linear system: rows of [a1..an, rhs]. Returns {status:'ok'|'none'|'inf', x}
  function solveLinear(M) {
    const n = M.length;
    const A = M.map(r => r.slice());
    const scale = Math.max(1, ...A.flat().map(Math.abs));
    const eps = 1e-12 * scale;
    let rank = 0;
    const pivCols = [];
    for (let c = 0; c < n && rank < n; c++) {
      let best = rank;
      for (let r = rank + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[best][c])) best = r;
      if (Math.abs(A[best][c]) <= eps) continue;
      [A[rank], A[best]] = [A[best], A[rank]];
      for (let r = 0; r < n; r++) {
        if (r === rank) continue;
        const fct = A[r][c] / A[rank][c];
        for (let k = c; k <= n; k++) A[r][k] -= fct * A[rank][k];
      }
      pivCols.push(c);
      rank++;
    }
    if (rank < n) {
      for (let r = rank; r < n; r++) if (Math.abs(A[r][n]) > eps) return { status: 'none' };
      return { status: 'inf' };
    }
    const x = new Array(n);
    for (let r = 0; r < n; r++) x[pivCols[r]] = A[r][n] / A[r][pivCols[r]];
    return { status: 'ok', x: x.map(v => (Math.abs(v) < 1e-13 * scale ? 0 : v)) };
  }

  // Polynomial roots, coefficients highest degree first. Returns [{re, im}]
  function polyRoots(coef) {
    while (coef.length > 1 && coef[0] === 0) coef = coef.slice(1);
    const deg = coef.length - 1;
    if (deg < 1) return [];
    const a0 = coef[0];
    const c = coef.map(v => v / a0);
    if (deg === 1) return [{ re: -c[1], im: 0 }];
    if (deg === 2) {
      const b = c[1], cc = c[2], D = b * b - 4 * cc;
      if (D >= 0) {
        const q = -0.5 * (b + Math.sign(b || 1) * Math.sqrt(D));
        const r1 = q, r2 = q !== 0 ? cc / q : 0;
        return [{ re: r1, im: 0 }, { re: r2, im: 0 }];
      }
      const s = Math.sqrt(-D) / 2;
      return [{ re: -b / 2, im: s }, { re: -b / 2, im: -s }];
    }
    // Durand–Kerner
    let z = [];
    const R = 1 + Math.max(...c.slice(1).map(Math.abs));
    for (let i = 0; i < deg; i++) {
      const ang = 2 * Math.PI * i / deg + 0.4;
      z.push([R * 0.9 * Math.cos(ang), R * 0.9 * Math.sin(ang)]);
    }
    const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
    const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
    const peval = (zz, cs) => { let r = [1, 0]; for (let k = 1; k < cs.length; k++) { r = cmul(r, zz); r[0] += cs[k]; } return r; };
    for (let it = 0; it < 2000; it++) {
      let delta = 0;
      const nz = z.map((zi, i) => {
        let den = [1, 0];
        z.forEach((zj, j) => { if (i !== j) den = cmul(den, [zi[0] - zj[0], zi[1] - zj[1]]); });
        const step = cdiv(peval(zi, c), den);
        delta = Math.max(delta, Math.hypot(step[0], step[1]));
        return [zi[0] - step[0], zi[1] - step[1]];
      });
      z = nz;
      if (delta < 1e-15 * R) break;
    }
    // Newton polish and clean-up
    const dc = c.slice(0, -1).map((v, k) => v * (deg - k));
    z = z.map(zi => {
      for (let k = 0; k < 5; k++) {
        const fz = peval(zi, c), dz = (() => { let r = [dc[0], 0]; for (let j = 1; j < dc.length; j++) { r = cmul(r, zi); r[0] += dc[j]; } return r; })();
        if (dz[0] === 0 && dz[1] === 0) break;
        const st = cdiv(fz, dz);
        zi = [zi[0] - st[0], zi[1] - st[1]];
      }
      return zi;
    });
    return z.map(([re, im]) => {
      const sc = Math.max(1, Math.abs(re));
      if (Math.abs(im) < 1e-9 * sc) {
        // Snap to the real axis and refine with real Newton
        let x = re;
        for (let k = 0; k < 8; k++) {
          let f = 1, d = 0;
          for (let j = 1; j < c.length; j++) { d = d * x + f; f = f * x + c[j]; }
          if (d === 0) break;
          x -= f / d;
        }
        return { re: x, im: 0 };
      }
      return { re, im };
    });
  }

  // ---------------------------------------------------------------- formatting
  // Continued-fraction rational approximation.
  function approxFrac(x, maxDen, tol) {
    if (!isFinite(x)) return null;
    const s = x < 0 ? -1 : 1;
    x = Math.abs(x);
    let h0 = 0, h1 = 1, k0 = 1, k1 = 0, b = x;
    for (let it = 0; it < 64; it++) {
      const a = Math.floor(b);
      const h2 = a * h1 + h0, k2 = a * k1 + k0;
      if (k2 > maxDen || h2 > 1e15) break;
      h0 = h1; h1 = h2; k0 = k1; k1 = k2;
      if (Math.abs(x - h1 / k1) <= tol * Math.max(x, 1e-300)) return [s * h1, k1];
      const fr = b - a;
      if (fr < 1e-18) break;
      b = 1 / fr;
    }
    return null;
  }

  const ndigits = n => String(Math.abs(n)).length;

  function squareFactor(R) {
    // R = k² · m with m square-free
    let k = 1, m = R;
    for (let p = 2; p * p <= m; p++) {
      while (m % (p * p) === 0) { m /= p * p; k *= p; }
    }
    return [k, m];
  }

  // Try to express v exactly as a fraction, a surd (k√m/d) or a π multiple.
  function exactForm(v) {
    if (!isFinite(v) || v === 0 || isInt(v)) return null;
    const s = v < 0 ? -1 : 1, av = Math.abs(v);
    if (av >= 1e10 || av < 1e-9) return null;
    const f = approxFrac(av, 1e6, 1e-14);
    if (f && f[1] > 1 && ndigits(f[0]) + ndigits(f[1]) <= 10) return { t: 'rat', s, n: f[0], d: f[1] };
    const q = approxFrac(av * av, 10000, 1e-13);
    if (q) {
      const [k0, m] = squareFactor(q[0] * q[1]);
      if (m > 1 && q[0] * q[1] < 1e9) {
        let k = k0, d = q[1];
        const g = gcd(k, d);
        k /= g; d /= g;
        if (k < 1000 && m < 10000 && d < 1000) return { t: 'surd', s, k, m, d };
      }
    }
    const pf = approxFrac(av / Math.PI, 1000, 1e-13);
    if (pf && pf[0] < 1000) return { t: 'pi', s, n: pf[0], d: pf[1] };
    return null;
  }

  // v = a + b·√m with small rationals a, b (e.g. 1/3 + 2√2). Only used when the input contained a root.
  const SQUAREFREE = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 17, 19, 21, 22, 23, 26, 29, 30];
  function ratSurd(v) {
    if (!isFinite(v) || Math.abs(v) >= 1e6 || isInt(v)) return null;
    const tol = 1e-12 * Math.max(1, Math.abs(v));
    for (let q = 1; q <= 6; q++) {
      for (let ap = 1; ap <= 30 * q; ap++) {
        for (const p of [ap, -ap]) {
          if (gcd(p, q) !== 1) continue;
          for (const m of SQUAREFREE) {
            const rest = v - p / q * Math.sqrt(m);
            const f = approxFrac(rest, 100, 1e-9);
            if (f && f[0] !== 0 && Math.abs(rest - f[0] / f[1]) < tol) return { a: { n: f[0], d: f[1] }, b: { n: p, d: q }, m };
          }
        }
      }
    }
    return null;
  }

  // Exact quadratic roots for rational coefficients: (A ± B√m)/C, possibly complex.
  function quadExact(a, b, c) {
    const fr = [a, b, c].map(v => approxFrac(v, 10000, 1e-13) || (v === 0 ? [0, 1] : null));
    if (fr.some(f => !f)) return null;
    let L = 1;
    fr.forEach(f => { L = L / gcd(L, f[1]) * f[1]; });
    if (L > 1e6) return null;
    const [A, B, Cc] = fr.map(f => Math.round(f[0] * L / f[1]));
    if (A === 0) return null;
    const D = B * B - 4 * A * Cc;
    if (Math.abs(D) > 9e15) return null;
    const complex = D < 0;
    const [k, m] = squareFactor(Math.abs(D));
    // roots = (-B ± k√m) / (2A)
    let num = -B, coef = k, den = 2 * A;
    if (den < 0) { den = -den; num = -num; }
    if (m === 1 && !complex) {
      const r1 = (num + coef) / den, r2 = (num - coef) / den;
      return [r1, r2].map(r => ({ real: r }));
    }
    const g = gcd(gcd(num, coef), den);
    num /= g; coef /= g; den /= g;
    if (coef >= 1e6 || m >= 1e6) return null;
    return [1, -1].map(sg => ({ t: 'qs', A: num, B: sg * coef, m, C: den, complex }));
  }

  function stripZeros(s) {
    return s.indexOf('.') >= 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  }

  // Returns { m: mantissa string, e: exponent or null }
  function fmtDecimal(x, fmt) {
    fmt = fmt || { t: 'norm', n: 1 };
    const sci = (digits, strip) => {
      let [m, e] = x.toExponential(Math.max(0, digits - 1)).split('e');
      if (strip) m = stripZeros(m);
      return { m, e: parseInt(e, 10) };
    };
    if (x === 0) {
      if (fmt.t === 'fix') return { m: (0).toFixed(fmt.n), e: null };
      if (fmt.t === 'sci') { const d = fmt.n || 10; return { m: d > 1 ? (0).toFixed(d - 1) : '0', e: 0 }; }
      return { m: '0', e: null };
    }
    if (fmt.t === 'sci') return sci(fmt.n || 10, false);
    const ax = Math.abs(x);
    if (fmt.t === 'fix') {
      if (ax >= 1e10) return sci(10, true);
      return { m: x.toFixed(fmt.n), e: null };
    }
    const r = parseFloat(x.toPrecision(10)), ar = Math.abs(r);
    const lo = fmt.n === 2 ? 1e-9 : 0.01;
    if (ar < lo || ar >= 1e10) return sci(10, true);
    const dp = Math.min(20, Math.max(0, 9 - Math.floor(Math.log10(ar))));
    return { m: stripZeros(r.toFixed(dp)), e: null };
  }

  function fmtEng(x, exp) {
    const m = x / Math.pow(10, exp);
    return { m: stripZeros(parseFloat(m.toPrecision(10)).toFixed(Math.max(0, Math.min(20, 9 - Math.floor(Math.log10(Math.abs(m) || 1)))))), e: exp };
  }
  function engBase(x) {
    if (x === 0) return 0;
    return Math.floor(Math.floor(Math.log10(Math.abs(parseFloat(x.toPrecision(10))))) / 3) * 3;
  }

  function roundDisplay(x, fmt) {
    const d = fmtDecimal(x, fmt);
    return parseFloat(d.m + (d.e !== null ? 'e' + d.e : ''));
  }

  function toDMS(x) {
    const s = x < 0 ? -1 : 1;
    let a = Math.abs(x);
    let d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf + 1e-9), sec = (mf - m) * 60;
    sec = Math.round(sec * 100) / 100;
    if (sec >= 60) { sec -= 60; m++; }
    if (m >= 60) { m -= 60; d++; }
    return { s, d, m, sec: Math.abs(sec) < 1e-9 ? 0 : sec };
  }

  function factorize(n) {
    if (!isInt(n) || n < 2 || n > 9999999999) return null;
    const out = [];
    for (let p = 2; p * p <= n; p += (p === 2 ? 1 : 2)) {
      let e = 0;
      while (n % p === 0) { n /= p; e++; }
      if (e) out.push([p, e]);
    }
    if (n > 1) out.push([n, 1]);
    return out;
  }

  // ---------------------------------------------------------------- statistics
  function median(a) {
    const n = a.length;
    if (!n) return NaN;
    return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  }
  function stats1(xs, freq) {
    const pts = [];
    xs.forEach((x, i) => { const f = freq ? freq[i] : 1; for (let k = 0; k < f; k++) pts.push(x); });
    const n = pts.length;
    if (!n) return null;
    const sx = pts.reduce((a, b) => a + b, 0), sx2 = pts.reduce((a, b) => a + b * b, 0);
    const mean = sx / n;
    const ss = pts.reduce((a, b) => a + (b - mean) * (b - mean), 0);
    const s = pts.slice().sort((a, b) => a - b);
    const half = Math.floor(n / 2);
    return {
      n, mean, sum: sx, sum2: sx2,
      sigma2: ss / n, sigma: Math.sqrt(ss / n), s: n > 1 ? Math.sqrt(ss / (n - 1)) : NaN,
      min: s[0], q1: n > 1 ? median(s.slice(0, half)) : s[0], med: median(s),
      q3: n > 1 ? median(s.slice(n % 2 ? half + 1 : half)) : s[0], max: s[n - 1]
    };
  }
  function stats2(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    if (n < 1) return null;
    let sx = 0, sy = 0, sx2 = 0, sy2 = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sx2 += xs[i] * xs[i]; sy2 += ys[i] * ys[i]; sxy += xs[i] * ys[i]; }
    const mx = sx / n, my = sy / n;
    const Sxx = sx2 - n * mx * mx, Syy = sy2 - n * my * my, Sxy = sxy - n * mx * my;
    const b = Sxx !== 0 ? Sxy / Sxx : NaN, a = my - b * mx;
    const r = Sxx > 0 && Syy > 0 ? Sxy / Math.sqrt(Sxx * Syy) : NaN;
    return {
      n, mx, my, sx, sy, sx2, sy2, sxy,
      sigx: Math.sqrt(Math.max(0, Sxx) / n), sdx: n > 1 ? Math.sqrt(Math.max(0, Sxx) / (n - 1)) : NaN,
      sigy: Math.sqrt(Math.max(0, Syy) / n), sdy: n > 1 ? Math.sqrt(Math.max(0, Syy) / (n - 1)) : NaN,
      a, b, r
    };
  }

  const api = {
    TOK, CONV, CONSTS, VARS, CalcError, SYN, MATH, SOLVE_ERR, ARG, mathErr, chk,
    toRad, fromRad, sinA, cosA, tanA, powReal,
    parse, evaluate, finalize, round15, varsIn, solveNumeric, integrate, derivative,
    solveLinear, polyRoots, approxFrac, exactForm, ratSurd, quadExact, fmtDecimal, fmtEng, engBase,
    roundDisplay, toDMS, factorize, stats1, stats2, gcd
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CalcEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
