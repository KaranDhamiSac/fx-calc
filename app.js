/* fx Calc UI: keypad, LCD screens, and modes (Calculate, Complex, Base-N, Matrix, Vector, Statistics,
   Distribution, Table, Equation, Inequality, Ratio). */
(function () {
  'use strict';
  const E = window.CalcEngine, TOK = E.TOK, X = window.CalcEngineX;
  const $ = s => document.querySelector(s);
  const MINUS = '−';

  // ------------------------------------------------------------ persistent state
  const STORE_KEY = 'fxcalc-v1';
  const freshVars = () => ({ A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, X: 0, Y: 0, M: 0 });
  const defaultSettings = () => ({ io: 'math', angle: 'D', fmt: { t: 'norm', n: 1 }, frac: 'dc', haptic: true, input: 'math', zoom: 1 });
  const S = {
    settings: defaultSettings(),
    vars: freshVars(), ans: 0, preAns: 0, history: [], mode: 'COMP',
    stat: { type: '1', x: [], y: [] },
    table: { f: [], g: [], start: 1, end: 5, step: 1 },
    eqn: { kind: 'sim', n: 2, sim: {}, poly: {} },
    base: 'd', cfmt: 'rect', mats: {}, vcts: {}, matAns: null, vctAns: null, histX: {},
    dist: {}, ineq: { n: 2, op: '>', coef: {} }, ratio: { kind: 'x3', vals: [1, 2, 1] }
  };
  const EXTRA_KEYS = ['base', 'cfmt', 'mats', 'vcts', 'matAns', 'vctAns', 'histX', 'dist', 'ineq', 'ratio'];
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved) {
      Object.assign(S.settings, saved.settings || {});
      Object.assign(S.vars, saved.vars || {});
      ['ans', 'preAns', 'mode'].forEach(k => { if (saved[k] !== undefined) S[k] = saved[k]; });
      if (Array.isArray(saved.history)) S.history = saved.history.filter(h => h && Array.isArray(h.t) && h.t.every(k => TOK[k]));
      if (saved.stat) Object.assign(S.stat, saved.stat);
      if (saved.table) Object.assign(S.table, saved.table);
      if (saved.eqn) Object.assign(S.eqn, saved.eqn);
      EXTRA_KEYS.forEach(k => { if (saved[k] !== undefined && saved[k] !== null) S[k] = saved[k]; });
    }
  } catch (e) { /* storage unavailable */ }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        settings: S.settings, vars: S.vars, ans: S.ans, preAns: S.preAns,
        history: S.history.slice(-40), mode: S.mode, stat: S.stat, table: S.table, eqn: S.eqn,
        ...Object.fromEntries(EXTRA_KEYS.map(k => [k, S[k]]))
      }));
    } catch (e) { /* ignore */ }
  }

  const U = { shift: false, alpha: false, sto: false, stack: [], comp: null, cx: {} };
  const top = () => U.stack[U.stack.length - 1];
  const push = s => { U.stack.push(s); };
  const pop = () => { if (U.stack.length > 1) U.stack.pop(); };
  const popMenus = () => { while (U.stack.length > 1 && top().isMenu) U.stack.pop(); };

  const makeCtx = () => ({ vars: S.vars, angle: S.settings.angle, ans: S.ans, preAns: S.preAns, fmt: S.settings.fmt, multi: null });
  const makeCtxX = kind => Object.assign(makeCtx(), {
    cplx: kind === 'CMPLX', mats: S.mats, vcts: S.vcts, matAns: S.matAns, vctAns: S.vctAns, cfmt: null
  });
  function evalTokens(tokens) {
    const node = E.parse(tokens);
    if (node.k === 'eq') throw new E.CalcError(E.SYN, node.p);
    return E.finalize(E.evaluate(node, makeCtx()));
  }
  function setAns(v) { S.preAns = S.ans; S.ans = v; }
  const errType = e => (e instanceof E.CalcError ? e.type : E.MATH);

  // ------------------------------------------------------------ number formatting
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fr = (n, d) => `<span class="fr"><span class="fn">${n}</span><span class="fd">${d}</span></span>`;
  const neg = s => String(s).replace(/-/g, MINUS);
  // Group digits in threes with thin spaces: 3.161 760 458
  function groupDigits(m) {
    const sign = m[0] === '-' ? '-' : '', body = sign ? m.slice(1) : m;
    const [ip, fp] = body.split('.');
    const gi = ip.replace(/\B(?=(\d{3})+(?!\d))/g, '<span class="gs"></span>');
    const gf = fp !== undefined ? '.' + fp.replace(/(\d{3})(?=\d)/g, '$1<span class="gs"></span>') : '';
    return sign + gi + gf;
  }
  function decHTML(d) {
    return neg(groupDigits(d.m)) + (d.e !== null ? `<span class="x10">×10<sup>${neg(d.e)}</sup></span>` : '');
  }
  const surdHTML = (k, m) => (k > 1 ? k : '') + `√<span class="rad">${m}</span>`;
  function exactHTML(ex, mixed) {
    const sg = ex.s < 0 ? `<span class="sgn">${MINUS}</span>` : '';
    if (ex.t === 'rat') {
      if (mixed && ex.n > ex.d) {
        const w = Math.floor(ex.n / ex.d);
        return sg + w + fr(ex.n - w * ex.d, ex.d);
      }
      return sg + fr(ex.n, ex.d);
    }
    if (ex.t === 'surd') { const t = surdHTML(ex.k, ex.m); return sg + (ex.d > 1 ? fr(t, ex.d) : t); }
    if (ex.t === 'pi') { const t = (ex.n > 1 ? ex.n : '') + 'π'; return sg + (ex.d > 1 ? fr(t, ex.d) : t); }
    return '';
  }
  function numHTML(v, o) {
    o = o || {};
    if (v && v.t === 'c') return complexHTML(v.re, v.im, o);
    if (typeof v !== 'number') return esc(v);
    if (o.dms) {
      const t = E.toDMS(v);
      return (t.s < 0 ? MINUS : '') + `${t.d}°${t.m}′${+t.sec.toFixed(2)}″`;
    }
    if (o.eng !== undefined && o.eng !== null) return decHTML(E.fmtEng(v, o.eng));
    if (!o.decimal) {
      const ex = E.exactForm(v);
      if (ex) return exactHTML(ex, o.mixed);
      const rs = o.surd2 && E.ratSurd(v);
      if (rs) {
        const q = rs.a, b = rs.b;
        const surd = (Math.abs(b.n) === 1 && b.d === 1 ? '' : (b.d > 1 ? fr(Math.abs(b.n), b.d) : Math.abs(b.n))) + `√<span class="rad">${rs.m}</span>`;
        const ra = q.d > 1 ? fr(Math.abs(q.n), q.d) : Math.abs(q.n);
        return (q.n < 0 ? MINUS : '') + ra + (b.n < 0 ? ` ${MINUS} ` : ' + ') + surd;
      }
    }
    return decHTML(E.fmtDecimal(E.round15(v), o.fmt || S.settings.fmt));
  }
  function shortNum(v) {
    if (typeof v !== 'number') return esc(v);
    const r = E.round15(v), a = Math.abs(r);
    if (r === 0) return '0';
    if (a >= 1e-3 && a < 1e7) return neg(String(parseFloat(r.toPrecision(7))));
    const [m, e] = r.toExponential(3).split('e');
    return neg(m.replace(/\.?0+$/, '') + 'ᴇ' + parseInt(e, 10));
  }
  function complexHTML(re, im, o) {
    if (im === 0) return numHTML(re, o);
    const imAbs = Math.abs(im);
    const imPart = (imAbs === 1 ? '' : numHTML(imAbs, o)) + '<i>i</i>';
    if (Math.abs(re) < 1e-14 * imAbs) return (im < 0 ? MINUS : '') + imPart;
    return numHTML(re, o) + (im < 0 ? ` ${MINUS} ` : ' + ') + imPart;
  }

  function polarHTML(z, o) {
    const r = E.round15(Math.hypot(X.RE(z), X.IM(z)));
    const th = E.round15(E.fromRad(Math.atan2(X.IM(z), X.RE(z)), S.settings.angle));
    return numHTML(r, o) + '∠' + numHTML(th, o);
  }
  function matrixHTML(m, o) {
    const cell = v => `<td>${numHTML(v, o)}</td>`;
    return `<table class="mat">${m.a.map(r => `<tr>${r.map(cell).join('')}</tr>`).join('')}</table>`;
  }
  // Any result value: real, complex, matrix or vector.
  function valueHTML(v, o) {
    o = o || {};
    if (X.isM(v)) return matrixHTML(v, o);
    if (X.isV(v)) return `<table class="mat vec"><tr>${v.a.map(x => `<td>${numHTML(x, o)}</td>`).join('')}</tr></table>`;
    if (X.isC(v)) return (o.cfmt || S.cfmt) === 'polar' ? polarHTML(v, o) : complexHTML(v.re, v.im, o);
    if (typeof v === 'number' && (o.cfmt === 'polar')) return polarHTML(v, o);
    return numHTML(v, o);
  }
  const BASE_NAME = { d: 'Dec', h: 'Hex', b: 'Bin', o: 'Oct' };
  function baseHTML(v) {
    const main = X.fmtBase(v, S.base);
    const others = ['d', 'h', 'o', 'b'].filter(b => b !== S.base)
      .map(b => `<span><b>${BASE_NAME[b].toUpperCase()}</b> ${X.fmtBase(v, b)}</span>`).join('');
    return `<div class="baseall">${others}</div><div class="result ${S.base === 'b' ? 'mid' : ''}">${main}</div>`;
  }

  // ------------------------------------------------------------ expression editor
  // How single tokens look inside the natural-display editor.
  const ATOM = {
    frac: '/', neg: '-', sq: '<span class="nsup">2</span>', cube: '<span class="nsup">3</span>',
    inv: '<span class="nsup">−1</span>', vX: '<i>x</i>', vY: '<i>y</i>', '*': '×', '/': '÷'
  };
  const atomHTML = k => (ATOM[k] !== undefined ? ATOM[k] : esc(TOK[k] ? TOK[k].disp : k));
  class Editor extends window.MathEditor.Editor {
    constructor(row) { super(row, { linear: () => S.settings.input === 'line' }); }
    html(cursor) { return super.html(cursor, atomHTML); }
  }
  const cloneRow = r => JSON.parse(JSON.stringify(r || []));
  const linTokens = r => window.MathEditor.linearize(r || []).tokens;

  // ------------------------------------------------------------ Calculate screen
  class CompScreen {
    // kind: COMP (real), CMPLX, BASE, MATRIX or VECTOR
    constructor(kind) {
      this.kind = kind || 'COMP';
      this.ed = new Editor(); this.phase = 'edit'; this.res = null; this.hist = -1; this.err = null;
    }
    get H() { return this.kind === 'COMP' ? S.history : (S.histX[this.kind] || (S.histX[this.kind] = [])); }
    optn() {
      ({ COMP: openOptn, CMPLX: openCplxOptn, BASE: openBaseOptn, MATRIX: () => openMatVctOptn('mat'), VECTOR: () => openMatVctOptn('vct') })[this.kind]();
    }

    html() {
      if (this.phase === 'error') {
        return `<div class="error">${this.err.type}<small>[AC] : Cancel<br>[◀][▶] : Goto</small></div>`;
      }
      const r = this.res;
      let h = `<div class="input">${this.ed.html(this.phase === 'edit')}${r && r.stored && this.phase === 'result' ? '→' + r.stored : ''}</div>`;
      if (this.phase === 'result') h += this.resultHTML();
      return h;
    }
    resultHTML() {
      const r = this.res;
      const line = (lbl, body) => `<div class="result mid"><span class="lbl">${lbl}</span><span>${body}</span></div>`;
      if (r.solve) {
        return `<div class="lines">${line(r.solve.name + '=', numHTML(r.solve.x, { decimal: r.decimal }))}${line('L−R=', numHTML(r.solve.lr, { decimal: true }))}</div>`;
      }
      if (r.multi) {
        return `<div class="lines">${r.multi.map(([n, v]) => line(n + '=', numHTML(v, { decimal: r.decimal }))).join('')}</div>`;
      }
      if (r.fact) {
        return `<div class="result mid">${r.fact.map(([p, e]) => p + (e > 1 ? `<sup>${e}</sup>` : '')).join('×')}</div>`;
      }
      if (this.kind === 'BASE') return baseHTML(r.value);
      const big = X.isM(r.value) || X.isV(r.value) || X.isC(r.value);
      const o = Object.assign({}, r, { surd2: this.ed.t.some(k => k === 'sqrt(' || k === 'xrt(' || k === 'cbrt(') });
      const main = valueHTML(r.value, o);
      const dec = valueHTML(r.value, Object.assign({}, o, { decimal: true }));
      const second = !r.decimal && main !== dec && r.eng === null && !r.dms ? `<div class="result2">= ${dec}</div>` : '';
      return `<div class="lines"><div class="result ${big ? 'mid' : ''}">${main}</div>${second}</div>`;
    }

    showError(e) {
      if (!(e instanceof E.CalcError)) console.error(e);
      this.phase = 'error';
      this.err = { type: errType(e), pos: e && typeof e.pos === 'number' ? e.pos : this.ed.t.length };
    }
    showResult(v, extra) {
      this.phase = 'result';
      this.res = Object.assign({ value: v, decimal: S.settings.io === 'dec', mixed: S.settings.frac === 'abc', eng: null, dms: false }, extra || {});
    }
    pushHistory(v) {
      const H = this.H;
      H.push({ t: cloneRow(this.ed.row), v });
      if (H.length > 40) H.shift();
      this.hist = H.length - 1;
    }
    evaluate(decimal) {
      if (this.ed.empty) return;
      if (this.kind !== 'COMP') { this.evaluateX(decimal); return; }
      try {
        const ctx = makeCtx();
        const node = E.parse(this.ed.t);
        if (node.k === 'eq') throw new E.CalcError(E.SYN, node.p);
        const v = E.finalize(E.evaluate(node, ctx));
        setAns(v);
        this.pushHistory(v);
        this.showResult(v, { multi: ctx.multi, decimal: decimal || S.settings.io === 'dec' });
      } catch (e) { this.showError(e); }
    }
    evaluateX(decimal) {
      try {
        const ctx = makeCtxX(this.kind);
        let v;
        if (this.kind === 'BASE') v = X.evalBase(this.ed.t, S.base, ctx);
        else {
          const node = E.parse(this.ed.t);
          if (node.k === 'eq') throw new E.CalcError(E.SYN, node.p);
          v = X.finalize(X.evaluate(node, ctx));
        }
        if (X.isM(v)) S.matAns = v;
        else if (X.isV(v)) S.vctAns = v;
        else setAns(v);
        this.pushHistory(v);
        this.showResult(v, { decimal: decimal || S.settings.io === 'dec', cfmt: ctx.cfmt });
      } catch (e) { this.showError(e); }
    }
    // Value to use for STO / M+: current result, or evaluate what is typed.
    currentValue() {
      if (this.phase === 'result' && !this.res.solve) return this.res.value;
      if (this.phase === 'edit' && !this.ed.empty) {
        this.evaluate();
        return this.phase === 'result' ? this.res.value : null;
      }
      if (this.phase === 'edit') { this.ed = new Editor(['Ans']); this.showResult(S.ans); return S.ans; }
      return this.res && this.res.solve ? this.res.solve.x : null;
    }
    store(name) {
      const v = this.currentValue();
      if (v === null || X.isM(v) || X.isV(v)) return;
      S.vars[name] = v;
      this.res.stored = name;
    }
    memAdd(sign) {
      const v = this.currentValue();
      if (typeof v !== 'number' || typeof S.vars.M !== 'number') return;
      S.vars.M = E.round15(S.vars.M + sign * v);
    }
    startNew(k) {
      const kind = TOK[k] ? TOK[k].kind : 'tpl';
      const continues = ['op', 'post', 'pow', 'perm', 'frac', 'logic'].includes(kind) && k !== 'xrt(';
      const prev = this.res && this.res.value;
      const ans = X.isM(prev) ? 'MatAns' : X.isV(prev) ? 'VctAns' : 'Ans';
      this.ed = new Editor([]);
      if (k === 'frac' && S.settings.input !== 'line') {
        // Fraction after a result: Ans goes on top, cursor waits in the denominator.
        this.ed.row = [{ T: 'frac', s: [[ans], []] }];
        this.ed.path = [{ i: 0, s: 1 }]; this.ed.c = 0;
      } else {
        if (continues) this.ed.insert(ans);
        this.ed.insert(k);
      }
      this.phase = 'edit';
    }
    // Undo / redo of edits (toolbar arrows)
    remember() {
      this.undoStack = this.undoStack || [];
      this.undoStack.push(this.ed.snapshot());
      if (this.undoStack.length > 100) this.undoStack.shift();
      this.redoStack = [];
    }
    undo() {
      if (!this.undoStack || !this.undoStack.length) return;
      (this.redoStack = this.redoStack || []).push(this.ed.snapshot());
      this.ed.restore(this.undoStack.pop());
      this.phase = 'edit';
    }
    redo() {
      if (!this.redoStack || !this.redoStack.length) return;
      this.undoStack.push(this.ed.snapshot());
      this.ed.restore(this.redoStack.pop());
      this.phase = 'edit';
    }
    showHistory(i) {
      const h = this.H[i];
      if (!h) return;
      this.hist = i;
      this.ed = new Editor(h.t);
      this.showResult(h.v);
    }

    key(a) {
      if (this.phase === 'error') {
        if (a === 'ac') { this.phase = 'edit'; this.ed.clear(); }
        else if (a === 'left' || a === 'right' || a === 'del') {
          this.phase = 'edit';
          this.ed.gotoToken(this.err.pos);
        }
        return;
      }
      if (a.startsWith('ins:')) {
        this.remember();
        if (this.phase === 'result') this.startNew(a.slice(4));
        else this.ed.insert(a.slice(4));
        return;
      }
      const r = this.res;
      switch (a) {
        case 'left': case 'right':
          if (this.phase === 'result') { this.phase = 'edit'; this.ed.path = []; this.ed.c = a === 'left' ? this.ed.row.length : 0; }
          else this.ed.edit(a);
          break;
        case 'up':
          if (this.phase === 'edit' && this.ed.vertical('up')) break;
          if (this.phase === 'result') this.showHistory(this.hist - 1 >= 0 ? this.hist - 1 : this.hist);
          else if (this.ed.empty && this.H.length) this.showHistory(this.H.length - 1);
          break;
        case 'down':
          if (this.phase === 'edit' && this.ed.vertical('down')) break;
          if (this.phase === 'result' && this.hist < this.H.length - 1) this.showHistory(this.hist + 1);
          break;
        case 'del':
          if (this.phase === 'result') { this.phase = 'edit'; this.ed.path = []; this.ed.c = this.ed.row.length; }
          else { this.remember(); this.ed.del(); }
          break;
        case 'ac':
          if (!this.ed.empty) this.remember();
          this.ed.clear(); this.phase = 'edit'; this.res = null; this.hist = -1;
          break;
        case 'exe':
          if (this.phase === 'result' && r.calc) this.calc();
          else if (this.phase === 'result' && r.solve) this.solve();
          else this.evaluate(false);
          break;
        case 'approx':
          if (this.phase === 'result') { r.decimal = true; r.eng = null; r.dms = false; }
          else this.evaluate(true);
          break;
        case 'sd':
          if (this.phase === 'result') {
            if (r.eng !== null || r.dms) { r.eng = null; r.dms = false; }
            else r.decimal = !r.decimal;
          }
          break;
        case 'mixed':
          if (this.phase === 'result') { r.mixed = !r.mixed; r.decimal = false; }
          break;
        case 'eng': case 'engL':
          if (this.phase === 'edit' && !this.ed.empty) this.evaluate();
          if (this.phase === 'result' && !this.res.solve && !this.res.multi && typeof this.res.value === 'number' && this.kind !== 'BASE') {
            const rr = this.res;
            if (rr.eng === null) rr.eng = E.engBase(rr.value) + (a === 'engL' ? 3 : 0);
            else rr.eng += a === 'eng' ? -3 : 3;
          }
          break;
        case 'dms':
          if (this.phase === 'result') { if (typeof r.value === 'number') { r.dms = !r.dms; r.eng = null; } }
          else this.ed.insert('°');
          break;
        case 'fact':
          if (this.phase === 'edit' && !this.ed.empty) this.evaluate();
          if (this.phase === 'result') {
            const f = E.factorize(this.res.value);
            if (!f) this.showError(new E.CalcError(E.MATH, this.ed.t.length));
            else this.res.fact = this.res.fact ? null : f;
          }
          break;
        case 'mplus': this.memAdd(1); break;
        case 'mminus': this.memAdd(-1); break;
        case 'calc': if (this.kind === 'COMP') this.calc(); break;
        case 'solve': if (this.kind === 'COMP') this.solve(); break;
      }
    }

    calc() {
      if (this.ed.empty) return;
      let node;
      try { node = E.parse(this.ed.t); } catch (e) { this.showError(e); return; }
      let target = null, body = node;
      if (node.k === 'eq') {
        if (node.a.k !== 'var') { this.showError(new E.CalcError(E.SYN, node.p)); return; }
        target = node.a.n; body = node.b;
      }
      const vars = E.varsIn(body);
      const finish = () => {
        try {
          const ctx = makeCtx();
          const v = E.finalize(E.evaluate(body, ctx));
          if (target) S.vars[target] = v;
          setAns(v);
          this.showResult(v, { calc: true, multi: ctx.multi, stored: target });
        } catch (e) { this.showError(e); }
        save();
      };
      if (!vars.length) { finish(); return; }
      push(new PromptScreen({
        head: this.ed.html(false),
        items: vars.map(n => ({ label: n + '=', name: n })),
        onDone: vals => { vars.forEach((n, i) => { S.vars[n] = vals[i]; }); finish(); }
      }));
    }

    solve() {
      if (this.ed.empty) return;
      let node;
      try { node = E.parse(this.ed.t); } catch (e) { this.showError(e); return; }
      const vars = E.varsIn(node);
      if (!vars.length) { this.showError(new E.CalcError(E.SOLVE_ERR, 0)); return; }
      const solveFor = vars.includes('X') ? 'X' : vars[0];
      const others = vars.filter(v => v !== solveFor);
      const items = others.map(n => ({ label: n + '=', name: n }));
      items.push({ label: 'Solve for ' + solveFor + ' (guess)', name: solveFor });
      push(new PromptScreen({
        head: this.ed.html(false),
        items,
        onDone: vals => {
          items.forEach((it, i) => { S.vars[it.name] = vals[i]; });
          try {
            const ctx = makeCtx();
            const g = x => {
              ctx.vars[solveFor] = x;
              if (node.k === 'eq') return E.evaluate(node.a, ctx) - E.evaluate(node.b, ctx);
              return E.evaluate(node, ctx);
            };
            const guess = S.vars[solveFor];
            const raw = E.solveNumeric(g, guess);
            let lr = g(raw);
            if (Math.abs(lr) < 1e-11 * Math.max(1, Math.abs(raw))) lr = 0;
            const x = E.round15(raw);
            lr = E.round15(lr);
            S.vars[solveFor] = x;
            setAns(x);
            this.showResult(x, { solve: { name: solveFor, x, lr: Math.abs(lr) < 1e-99 ? 0 : lr } });
          } catch (e) { S.vars[solveFor] = vals[vals.length - 1]; this.showError(e); }
          save();
        }
      }));
    }
  }

  // ------------------------------------------------------------ prompt (variable entry)
  class PromptScreen {
    constructor(o) {
      this.o = o; this.i = 0; this.ed = new Editor(); this.msg = '';
      this.vals = o.items.map(it => (it.value !== undefined ? it.value : S.vars[it.name] || 0));
    }
    html() {
      const it = this.o.items[this.i];
      const cur = this.ed.empty ? `<span class="ghost">${numHTML(this.vals[this.i], { decimal: true })}</span>` : '';
      return (this.o.head ? `<div class="prompt-head">${this.o.head}</div>` : '') +
        (this.o.title ? `<div class="title"><span>${this.o.title}</span></div>` : '') +
        `<div class="input">${esc(it.label)} ${this.ed.html(true)}${cur}</div>` +
        `<div class="gridfoot"><span class="hint">${this.msg ? '<b>' + this.msg + '</b>' : '[=] OK   [AC] Cancel   ▲▼ move'}</span><span class="hint">${this.i + 1}/${this.o.items.length}</span></div>`;
    }
    key(a) {
      this.msg = '';
      if (this.ed.edit(a)) return;
      if (a === 'ac') {
        if (!this.ed.empty) this.ed.clear();
        else { pop(); if (this.o.onCancel) this.o.onCancel(); }
        return;
      }
      if ((a === 'up' || a === 'down') && this.ed.vertical(a)) return;
      if (a === 'up') { if (this.commit() && this.i > 0) this.i--; return; }
      if (a === 'down') { if (this.commit() && this.i < this.o.items.length - 1) this.i++; return; }
      if (a === 'exe') {
        if (!this.commit()) return;
        if (this.i < this.o.items.length - 1) { this.i++; return; }
        pop();
        this.o.onDone(this.vals);
      }
    }
    commit() {
      if (this.ed.empty) return true;
      try {
        this.vals[this.i] = evalTokens(this.ed.t);
        this.ed = new Editor();
        return true;
      } catch (e) { this.msg = errType(e); return false; }
    }
  }

  // ------------------------------------------------------------ menus & lists
  class MenuScreen {
    constructor(title, items, opt) {
      opt = opt || {};
      this.isMenu = true;
      this.title = title; this.items = items;
      this.sel = Math.max(0, opt.sel || 0);
      this.one = opt.one !== undefined ? opt.one : items.length > 8;
    }
    html() {
      return `<div class="title"><span>${this.title}</span><span class="hint">AC: back</span></div>` +
        `<div class="menu ${this.one ? 'one' : ''}">` +
        this.items.map((it, i) => {
          const k = it.k !== undefined ? it.k : (i < 9 ? String(i + 1) : '');
          return `<div class="it ${i === this.sel ? 'sel' : ''}" data-tap="${i}">${k ? k + ':' : ''}${it.label}${it.chk ? '<span class="chk">◂</span>' : ''}</div>`;
        }).join('') + '</div>';
    }
    key(a) {
      const n = this.items.length, cols = this.one ? 1 : 2;
      if (a.startsWith('ins:')) {
        const d = a.slice(4);
        const idx = this.items.findIndex((it, i) => (it.k !== undefined ? it.k : (i < 9 ? String(i + 1) : null)) === d);
        if (idx >= 0) this.choose(idx);
        return;
      }
      if (a === 'up') this.sel = (this.sel - cols + n * 2) % n;
      else if (a === 'down') this.sel = (this.sel + cols) % n;
      else if (a === 'left' && cols > 1) this.sel = (this.sel - 1 + n) % n;
      else if (a === 'right' && cols > 1) this.sel = (this.sel + 1) % n;
      else if (a === 'exe') this.choose(this.sel);
      else if (a === 'ac' || a === 'del' || a === 'left') pop();
    }
    tap(i) { this.choose(+i); }
    choose(i) { this.sel = i; this.items[i].act(); }
  }

  class ListScreen {
    constructor(title, rows, opt) {
      opt = opt || {};
      this.isMenu = !!opt.isMenu;
      this.title = title; this.rows = rows; this.sel = opt.sel || 0; this.opt = opt;
    }
    html() {
      return `<div class="title"><span>${this.title}</span><span class="hint">${this.opt.hint || 'AC: back'}</span></div><div class="list">` +
        this.rows.map((r, i) => `<div class="row ${i === this.sel ? 'sel' : ''}" data-tap="${i}"><span>${r[0]}</span><span class="v">${r[1]}</span></div>`).join('') + '</div>';
    }
    key(a) {
      const n = this.rows.length;
      if (a === 'up') this.sel = (this.sel - 1 + n) % n;
      else if (a === 'down') this.sel = (this.sel + 1) % n;
      else if (a === 'exe' && this.opt.onExe) this.opt.onExe(this.sel);
      else if (a === 'ac' || a === 'del' || a === 'left') { pop(); if (this.opt.onClose) this.opt.onClose(); }
      else if (a.startsWith('ins:') && this.opt.onKey) this.opt.onKey(a);
    }
    tap(i) { this.sel = +i; if (this.opt.onExe) this.opt.onExe(this.sel); }
  }

  // Spreadsheet-like editor used by Statistics and Equation, and read-only by Table.
  class GridScreen {
    constructor(o) { this.o = o; this.r = 0; this.c = 0; this.ed = null; this.topRow = 0; this.msg = ''; }
    rowCount() { return this.o.rows() + (this.o.appendable ? 1 : 0); }
    html() {
      const o = this.o, VIS = 4, cols = o.cols;
      const n = this.rowCount();
      if (this.r < this.topRow) this.topRow = this.r;
      if (this.r >= this.topRow + VIS) this.topRow = this.r - VIS + 1;
      let h = o.title ? `<div class="title"><span>${o.title}</span><span class="hint">${o.hint || ''}</span></div>` : '';
      h += `<table class="grid"><tr>${o.index !== false ? '<th class="idx"></th>' : ''}${cols.map(c => `<th>${c}</th>`).join('')}</tr>`;
      for (let r = this.topRow; r < Math.min(n, this.topRow + VIS); r++) {
        h += `<tr>${o.index !== false ? `<td class="idx">${o.rowLabel ? o.rowLabel(r) : r + 1}</td>` : ''}`;
        cols.forEach((_, c) => {
          const v = r < o.rows() ? o.get(r, c) : '';
          const sel = r === this.r && c === this.c;
          h += `<td class="${sel ? 'sel' : ''}" data-tap="${r},${c}">${v === '' || v === undefined ? '' : shortNum(v)}</td>`;
        });
        h += '</tr>';
      }
      h += '</table>';
      let foot;
      if (this.ed) foot = `<span>${this.ed.html(true)}</span>`;
      else if (this.msg) foot = `<b>${this.msg}</b>`;
      else {
        const v = this.r < o.rows() ? o.get(this.r, this.c) : '';
        foot = `<span class="hint">${o.footHint || ''}</span><span class="v">${v === '' ? '' : numHTML(v, { decimal: true })}</span>`;
      }
      return h + `<div class="gridfoot">${foot}</div>`;
    }
    move(dr, dc) {
      const n = this.rowCount(), cols = this.o.cols.length;
      this.c += dc;
      if (this.c < 0) { this.c = cols - 1; dr--; }
      if (this.c >= cols) { this.c = 0; dr++; }
      this.r = Math.max(0, Math.min(n - 1, this.r + dr));
    }
    commit() {
      try {
        const v = evalTokens(this.ed.t);
        this.o.set(this.r, this.c, v);
        this.ed = null;
        save();
        return true;
      } catch (e) { this.msg = errType(e); this.ed = null; return false; }
    }
    key(a) {
      const o = this.o;
      this.msg = '';
      if (this.ed) {
        if (this.ed.edit(a)) return;
        if (a === 'ac') { this.ed = null; return; }
        if (a === 'exe' || a === 'up' || a === 'down') {
          if (!this.commit()) return;
          if (a === 'up') this.move(-1, 0);
          else if (a === 'down') this.move(1, 0);
          else if (o.dir === 'right') this.move(0, 1);
          else this.move(1, 0);
        }
        return;
      }
      if (a.startsWith('ins:')) {
        if (o.readonly) return;
        this.ed = new Editor();
        this.ed.insert(a.slice(4));
        return;
      }
      switch (a) {
        case 'up': this.move(-1, 0); break;
        case 'down': this.move(1, 0); break;
        case 'left': this.move(0, -1); break;
        case 'right': this.move(0, 1); break;
        case 'exe': if (o.onExe) o.onExe(this); break;
        case 'ac': if (o.onAC) o.onAC(this); break;
        case 'del':
          if (o.readonly) break;
          if (o.onDelRow) { if (this.r < o.rows()) o.onDelRow(this.r); this.r = Math.min(this.r, this.rowCount() - 1); }
          else o.set(this.r, this.c, 0);
          save();
          break;
      }
    }
    optn() { if (this.o.onOptn) this.o.onOptn(this); }
    tap(rc) { const [r, c] = rc.split(',').map(Number); if (this.ed) this.commit(); this.r = r; this.c = c; }
  }

  // ------------------------------------------------------------ Statistics mode
  function statGrid() {
    const st = S.stat;
    const two = st.type === '2';
    return new GridScreen({
      title: two ? 'Statistics  y=a+bx' : 'Statistics  1-Variable',
      hint: 'OPTN: menu  AC: results',
      cols: two ? ['x', 'y'] : ['x'],
      appendable: true, dir: 'down',
      rows: () => st.x.length,
      get: (r, c) => (c === 0 ? st.x[r] : st.y[r]),
      set: (r, c, v) => {
        if (r >= st.x.length) { st.x.push(0); st.y.push(0); }
        if (c === 0) st.x[r] = v; else st.y[r] = v;
      },
      onDelRow: r => { st.x.splice(r, 1); st.y.splice(r, 1); },
      onAC: () => showStatResults(),
      onOptn: () => push(new MenuScreen('OPTN', [
        { label: 'Select Type', act: () => { pop(); push(statTypeMenu()); } },
        { label: two ? 'Regression Calc' : '1-Variable Calc', act: () => { pop(); showStatResults(); } },
        { label: 'Clear Data', act: () => { st.x = []; st.y = []; pop(); setBase(statGrid()); save(); } }
      ], { one: true })),
      footHint: 'DEL: delete row'
    });
  }
  function statTypeMenu() {
    return new MenuScreen('Statistics: Select Type', [
      { label: '1-Variable', act: () => { S.stat.type = '1'; pop(); setBase(statGrid()); } },
      { label: 'y=a+bx', act: () => { S.stat.type = '2'; pop(); setBase(statGrid()); } }
    ], { one: true, sel: S.stat.type === '2' ? 1 : 0 });
  }
  function showStatResults() {
    const st = S.stat, d = o => numHTML(o, { decimal: true });
    let rows;
    if (st.type === '2') {
      const r = E.stats2(st.x, st.y);
      if (!r) { push(new ListScreen('Regression', [['No data', '']])); return; }
      rows = [['n', d(r.n)], ['x̄', d(r.mx)], ['ȳ', d(r.my)], ['Σx', d(r.sx)], ['Σy', d(r.sy)], ['Σx²', d(r.sx2)],
        ['Σy²', d(r.sy2)], ['Σxy', d(r.sxy)], ['σx', d(r.sigx)], ['sx', d(r.sdx)], ['σy', d(r.sigy)], ['sy', d(r.sdy)],
        ['a', d(r.a)], ['b', d(r.b)], ['r', d(r.r)]];
      rows = rows.map(([k, v]) => [k, v.indexOf('NaN') >= 0 ? 'ERROR' : v]);
      push(new ListScreen('y=a+bx  ▲▼', rows));
    } else {
      const r = E.stats1(st.x);
      if (!r) { push(new ListScreen('1-Variable', [['No data', '']])); return; }
      rows = [['n', d(r.n)], ['x̄', d(r.mean)], ['Σx', d(r.sum)], ['Σx²', d(r.sum2)], ['σ²x', d(r.sigma2)], ['σx', d(r.sigma)],
        ['sx', isNaN(r.s) ? 'ERROR' : d(r.s)], ['min(x)', d(r.min)], ['Q₁', d(r.q1)], ['Med', d(r.med)], ['Q₃', d(r.q3)], ['max(x)', d(r.max)]];
      push(new ListScreen('1-Variable  ▲▼', rows));
    }
  }

  // ------------------------------------------------------------ Table mode
  class TableScreen {
    constructor() { this.which = 'f'; this.ed = new Editor(S.table.f); this.msg = ''; }
    html() {
      return `<div class="title"><span>Table: define ${this.which}(x)</span><span class="hint">▲▼ f/g</span></div>` +
        `<div class="input">${this.which}(x)=${this.ed.html(true)}</div>` +
        `<div class="gridfoot"><span class="hint">${this.msg ? '<b>' + this.msg + '</b>' : this.which === 'g' ? '[=] next (g(x) optional)' : 'Use the x key for x · [=] next'}</span></div>`;
    }
    key(a) {
      this.msg = '';
      if (this.ed.edit(a)) return;
      if (a === 'ac') { this.ed.clear(); return; }
      if ((a === 'up' || a === 'down') && this.ed.vertical(a)) return;
      if (a === 'up' || a === 'down') { S.table[this.which] = cloneRow(this.ed.row); this.which = this.which === 'f' ? 'g' : 'f'; this.ed = new Editor(S.table[this.which]); return; }
      if (a === 'exe') {
        S.table[this.which] = cloneRow(this.ed.row);
        if (this.which === 'f') {
          if (this.ed.empty) { this.msg = 'Enter f(x)'; return; }
          this.which = 'g'; this.ed = new Editor(S.table.g);
          return;
        }
        const t = S.table;
        push(new PromptScreen({
          title: 'Table Range',
          items: [{ label: 'Start:', value: t.start }, { label: 'End:', value: t.end }, { label: 'Step:', value: t.step }],
          onDone: vals => {
            [t.start, t.end, t.step] = vals;
            save();
            this.which = 'f'; this.ed = new Editor(t.f);
            this.showTable();
          }
        }));
      }
    }
    showTable() {
      const t = S.table;
      let fN, gN = null;
      try { fN = E.parse(linTokens(t.f)); if (t.g.length) gN = E.parse(linTokens(t.g)); } catch (e) { this.msg = errType(e); return; }
      if (t.step === 0 || (t.end - t.start) / t.step < 0) { this.msg = 'Range ERROR'; return; }
      const count = Math.floor((t.end - t.start) / t.step + 1e-9) + 1;
      const max = gN ? 30 : 45;
      if (count > max) { this.msg = `Range ERROR (max ${max} rows)`; return; }
      const rows = [];
      const ctx = makeCtx();
      const saveX = S.vars.X;
      const ev = (nd, x) => { try { ctx.vars.X = x; return E.round15(E.finalize(E.evaluate(nd, ctx))); } catch (e) { return 'ERROR'; } };
      for (let i = 0; i < count; i++) {
        const x = E.round15(t.start + i * t.step);
        rows.push([x, ev(fN, x), gN ? ev(gN, x) : '']);
      }
      S.vars.X = saveX;
      const cols = gN ? ['x', 'f(x)', 'g(x)'] : ['x', 'f(x)'];
      push(new GridScreen({
        title: 'Table', hint: 'AC: back', cols, readonly: true, index: false,
        rows: () => rows.length, get: (r, c) => rows[r][c], set: () => {},
        onAC: () => pop()
      }));
    }
  }

  // ------------------------------------------------------------ Equation mode
  const SUB = ['₁', '₂', '₃', '₄'];
  function eqnMatrix() {
    const q = S.eqn;
    if (q.kind === 'sim') {
      const n = q.n;
      if (!q.sim[n] || q.sim[n].length !== n) q.sim[n] = Array.from({ length: n }, () => new Array(n + 1).fill(0));
      return q.sim[n];
    }
    const n = q.n;
    if (!q.poly[n] || q.poly[n].length !== n + 1) q.poly[n] = new Array(n + 1).fill(0);
    return [q.poly[n]];
  }
  function eqnTemplate() {
    const q = S.eqn;
    if (q.kind === 'sim') return ['aₙx+bₙy=cₙ', 'aₙx+bₙy+cₙz=dₙ', 'aₙx+bₙy+cₙz+dₙt=eₙ'][q.n - 2];
    return ['ax²+bx+c=0', 'ax³+bx²+cx+d=0', 'ax⁴+bx³+cx²+dx+e=0'][q.n - 2];
  }
  function eqnGrid() {
    const q = S.eqn, M = eqnMatrix();
    const letters = 'abcde'.split('');
    const cols = M[0].map((_, i) => letters[i]);
    return new GridScreen({
      title: eqnTemplate(), hint: '[=] solve',
      cols, dir: 'right',
      index: q.kind === 'sim',
      rows: () => M.length,
      get: (r, c) => M[r][c],
      set: (r, c, v) => { M[r][c] = v; },
      onExe: () => solveEqn(),
      onOptn: () => push(eqnTypeMenu()),
      footHint: 'OPTN: type'
    });
  }
  function eqnTypeMenu() {
    const pick = (kind, n) => () => { S.eqn.kind = kind; S.eqn.n = n; U.stack.length = 1; setBase(eqnGrid()); save(); };
    return new MenuScreen('Equation: Select Type', [
      { label: 'Simul Equation', act: () => push(new MenuScreen('Number of Unknowns', [
        { label: '2 unknowns', k: '2', act: pick('sim', 2) },
        { label: '3 unknowns', k: '3', act: pick('sim', 3) },
        { label: '4 unknowns', k: '4', act: pick('sim', 4) }], { one: true })) },
      { label: 'Polynomial', act: () => push(new MenuScreen('Polynomial Degree', [
        { label: 'ax²+bx+c', k: '2', act: pick('poly', 2) },
        { label: 'ax³+bx²+cx+d', k: '3', act: pick('poly', 3) },
        { label: 'ax⁴+bx³+cx²+dx+e', k: '4', act: pick('poly', 4) }], { one: true })) }
    ], { one: true });
  }
  // Exact roots of ax²+bx+c as [{v, im?, h}] (largest real root first), or null.
  function quadRootsHTML(c) {
    if (S.settings.io === 'dec') return null;
    const ex = E.quadExact(c[0], c[1], c[2]);
    if (!ex) return null;
    const shown = ex.map(r => {
      if (r.real !== undefined) return { v: r.real, h: numHTML(E.round15(r.real)) };
      if (r.complex) {
        const g = E.gcd(Math.abs(r.B), r.C);
        const im = exactHTML({ t: 'surd', s: 1, k: Math.abs(r.B) / g, m: r.m, d: r.C / g });
        const re = r.A === 0 ? '' : numHTML(r.A / r.C) + (r.B < 0 ? ` ${MINUS} ` : ' + ');
        return { v: r.A / r.C, im: r.B, h: re + (r.A === 0 && r.B < 0 ? MINUS : '') + im + '<i>i</i>' };
      }
      const top = (r.A !== 0 ? r.A : '') + (r.B < 0 ? MINUS : (r.A !== 0 ? '+' : '')) + surdHTML(Math.abs(r.B), r.m);
      return { v: (r.A + r.B * Math.sqrt(r.m)) / r.C, h: neg(r.C > 1 ? fr(top, r.C) : top) };
    });
    if (!shown[0].im) shown.sort((x, y) => y.v - x.v);
    return shown;
  }

  function solveEqn() {
    const q = S.eqn, M = eqnMatrix();
    let rows = [];
    if (q.kind === 'sim') {
      const res = E.solveLinear(M);
      if (res.status === 'none') rows = [['No Solution', '']];
      else if (res.status === 'inf') rows = [['Infinite Solution', '']];
      else rows = res.x.map((v, i) => [['x', 'y', 'z', 't'][i] + '=', numHTML(E.round15(v), { mixed: S.settings.frac === 'abc', decimal: S.settings.io === 'dec' })]);
    } else {
      const c = M[0].slice();
      if (c[0] === 0) { push(new ListScreen('Polynomial', [['Math ERROR', 'a ≠ 0 required']])); return; }
      const deg = c.length - 1;
      let shown = deg === 2 ? quadRootsHTML(c) : null;
      if (!shown) {
        const roots = E.polyRoots(c).sort((a, b) => (a.im === 0) !== (b.im === 0) ? (a.im === 0 ? -1 : 1) : (b.re - a.re) || (b.im - a.im));
        shown = roots.map(r => ({ h: complexHTML(E.round15(r.re), E.round15(r.im), { decimal: S.settings.io === 'dec' || r.im !== 0 }) }));
      }
      rows = shown.map((s, i) => [`x${SUB[i]}=`, s.h]);
      if (deg === 2) {
        const xv = -c[1] / (2 * c[0]), yv = c[2] - c[1] * c[1] / (4 * c[0]);
        const kind = c[0] > 0 ? 'Minimum' : 'Maximum';
        rows.push([`x-Value ${kind}=`, numHTML(E.round15(xv))], [`y-Value ${kind}=`, numHTML(E.round15(yv))]);
      }
    }
    push(new ListScreen('Solution  ▲▼', rows, { hint: 'AC: edit' }));
  }

  // ------------------------------------------------------------ Matrix / Vector definitions
  const DIMS = n => Array.from({ length: n }, (_, i) => ({ label: String(i + 1), k: String(i + 1) }));
  function defineMatVct(type, name) {
    const store = type === 'mat' ? S.mats : S.vcts;
    if (type === 'vct') {
      push(new MenuScreen(`Vct${name}: Dimension?`, [2, 3].map(n => ({
        label: n + ' dimensions', k: String(n),
        act: () => { store[name] = { t: 'v', a: new Array(n).fill(0) }; save(); popMenus(); editMatVct(type, name); }
      })), { one: true }));
      return;
    }
    push(new MenuScreen(`Mat${name}: Rows?`, DIMS(4).map((it, i) => Object.assign(it, {
      label: (i + 1) + ' row' + (i ? 's' : ''),
      act: () => push(new MenuScreen(`Mat${name}: ${i + 1} rows, Columns?`, DIMS(4).map((jt, j) => Object.assign(jt, {
        label: (j + 1) + ' column' + (j ? 's' : ''),
        act: () => {
          store[name] = { t: 'm', a: Array.from({ length: i + 1 }, () => new Array(j + 1).fill(0)) };
          save(); popMenus(); editMatVct(type, name);
        }
      })), { one: false }))
    })), { one: false }));
  }
  function editMatVct(type, name) {
    const store = type === 'mat' ? S.mats : S.vcts;
    const m = store[name];
    if (!m) { defineMatVct(type, name); return; }
    const isMat = type === 'mat';
    const rows = isMat ? m.a : [m.a];
    const title = isMat ? `Mat${name} (${m.a.length}×${m.a[0].length})` : `Vct${name} (${m.a.length}D)`;
    push(new GridScreen({
      title, hint: 'AC: done', dir: 'right',
      cols: rows[0].map((_, j) => String(j + 1)),
      index: isMat,
      rows: () => rows.length,
      get: (r, c) => rows[r][c],
      set: (r, c, v) => { rows[r][c] = v; },
      onAC: () => pop(),
      footHint: '[=] next cell'
    }));
  }
  function pickName(title, type, then) {
    const pre = type === 'mat' ? 'Mat' : 'Vct', store = type === 'mat' ? S.mats : S.vcts;
    return new MenuScreen(title, ['A', 'B', 'C', 'D'].map(n => {
      const m = store[n];
      const info = !m ? 'undefined' : type === 'mat' ? `${m.a.length}×${m.a[0].length}` : `${m.a.length}D`;
      return { label: `${pre}${n} <span class="hint">${info}</span>`, act: () => { popMenus(); then(n); } };
    }), { one: true });
  }
  function openMatVctOptn(type) {
    const isMat = type === 'mat', pre = isMat ? 'Mat' : 'Vct', what = isMat ? 'Matrix' : 'Vector';
    const items = [
      { label: 'Define ' + what, act: () => push(pickName('Define ' + what, type, n => defineMatVct(type, n))) },
      { label: 'Edit ' + what, act: () => push(pickName('Edit ' + what, type, n => editMatVct(type, n))) }
    ].concat(['A', 'B', 'C', 'D', 'Ans'].map(n => ({ label: pre + n, act: () => insertTok(pre + n) })));
    if (isMat) {
      items.push({ label: 'Determinant', act: () => insertTok('det(') }, { label: 'Transposition', act: () => insertTok('trn(') },
        { label: 'Identity', act: () => insertTok('ident(') }, { label: 'Row Echelon', act: () => insertTok('ref(') },
        { label: 'Reduced Row Ech.', act: () => insertTok('rref(') }, { label: 'Abs (elementwise)', act: () => insertTok('abs(') });
    } else {
      items.push({ label: 'Dot Product ·', act: () => insertTok('dot') }, { label: 'Angle', act: () => insertTok('angle(') },
        { label: 'Unit Vector', act: () => insertTok('unitv(') }, { label: 'Abs (length)', act: () => insertTok('abs(') });
    }
    push(new MenuScreen('OPTN', items, { one: false }));
  }
  function openCplxOptn() {
    push(new MenuScreen('OPTN', [
      { label: '<i>i</i> (imaginary)', act: () => insertTok('i') },
      { label: '∠ (polar entry)', act: () => insertTok('∠') },
      { label: 'Argument', act: () => insertTok('arg(') },
      { label: 'Conjugate', act: () => insertTok('conj(') },
      { label: 'Real Part', act: () => insertTok('rep(') },
      { label: 'Imaginary Part', act: () => insertTok('imp(') },
      { label: '▶r∠θ', act: () => insertTok('toPolar') },
      { label: '▶a+bi', act: () => insertTok('toRect') }
    ], { one: false }));
  }
  function openBaseOptn() {
    push(new MenuScreen('OPTN', [
      { label: 'and', act: () => insertTok('and') }, { label: 'or', act: () => insertTok('or') },
      { label: 'xor', act: () => insertTok('xor') }, { label: 'xnor', act: () => insertTok('xnor') },
      { label: 'Not(', act: () => insertTok('bnot(') }, { label: 'Neg(', act: () => insertTok('bneg(') },
      { label: 'd (decimal)', act: () => insertTok('pd') }, { label: 'h (hex)', act: () => insertTok('ph') },
      { label: 'b (binary)', act: () => insertTok('pb') }, { label: 'o (octal)', act: () => insertTok('po') }
    ], { one: false }));
  }

  // ------------------------------------------------------------ Distribution mode
  // [label, function, [param label, key, default], result name]
  const DIST_DEFS = [
    ['Normal PD', 'normPD', [['x', 'x', 0], ['σ', 's', 1], ['μ', 'm', 0]], 'p'],
    ['Normal CD', 'normCD', [['Lower', 'lo', -1], ['Upper', 'up', 1], ['σ', 's', 1], ['μ', 'm', 0]], 'P'],
    ['Inverse Normal', 'invNorm', [['Area', 'area', 0.5], ['σ', 's', 1], ['μ', 'm', 0]], 'xInv'],
    ['Binomial PD', 'binomPD', [['x', 'x', 0], ['N', 'N', 10], ['p', 'p', 0.5]], 'p'],
    ['Binomial CD', 'binomCD', [['x', 'x', 0], ['N', 'N', 10], ['p', 'p', 0.5]], 'P'],
    ['Poisson PD', 'poissonPD', [['x', 'x', 0], ['λ', 'lam', 1]], 'p'],
    ['Poisson CD', 'poissonCD', [['x', 'x', 0], ['λ', 'lam', 1]], 'P']
  ];
  function distMenu() {
    return new MenuScreen('Distribution', DIST_DEFS.map(([label, fn, params, out]) => ({
      label,
      act: () => {
        const saved = S.dist[fn] || {};
        push(new PromptScreen({
          title: label + (fn.endsWith('CD') && fn !== 'normCD' ? ' (P(X≤x))' : ''),
          items: params.map(([l, key, def]) => ({ label: l + '=', value: saved[key] !== undefined ? saved[key] : def })),
          onDone: vals => {
            S.dist[fn] = Object.fromEntries(params.map(([, key], i) => [key, vals[i]]));
            const rows = params.map(([l], i) => [l, numHTML(vals[i], { decimal: true })]);
            try {
              const v = E.finalize(X.DIST[fn](...vals));
              setAns(v);
              rows.push([`<b>${out}=</b>`, `<b>${numHTML(v, { decimal: true })}</b>`]);
            } catch (e) { rows.push([`<b>${errType(e)}</b>`, '']); }
            save();
            push(new ListScreen(label, rows, { sel: rows.length - 1, hint: 'AC: back · Ans=result' }));
          }
        }));
      }
    })), { one: true });
  }

  // ------------------------------------------------------------ Inequality mode
  const INEQ_OPS = [['>', '&gt;'], ['<', '&lt;'], ['>=', '≥'], ['<=', '≤']];
  const opSym = op => INEQ_OPS.find(o => o[0] === op)[1];
  const polyTemplate = n => ['ax²+bx+c', 'ax³+bx²+cx+d', 'ax⁴+bx³+cx²+dx+e'][n - 2];
  function ineqCoef() {
    const q = S.ineq;
    if (!q.coef[q.n] || q.coef[q.n].length !== q.n + 1) q.coef[q.n] = new Array(q.n + 1).fill(0);
    return q.coef[q.n];
  }
  function ineqGrid() {
    const c = ineqCoef();
    return new GridScreen({
      title: polyTemplate(S.ineq.n) + opSym(S.ineq.op) + '0', hint: '[=] solve',
      cols: c.map((_, i) => 'abcde'[i]), dir: 'right', index: false,
      rows: () => 1, get: (r, j) => c[j], set: (r, j, v) => { c[j] = v; },
      onExe: () => solveIneq(), onOptn: () => push(ineqTypeMenu()), footHint: 'OPTN: type'
    });
  }
  function ineqTypeMenu() {
    return new MenuScreen('Inequality: Degree', [2, 3, 4].map(n => ({
      label: polyTemplate(n), k: String(n),
      act: () => push(new MenuScreen(polyTemplate(n) + ' ? 0', INEQ_OPS.map(([op, sym], i) => ({
        label: polyTemplate(n) + sym + '0',
        act: () => { S.ineq.n = n; S.ineq.op = op; U.stack.length = 1; setBase(ineqGrid()); save(); }
      })), { one: true }))
    })), { one: true });
  }
  function solveIneq() {
    const c = ineqCoef().slice();
    let res;
    try { res = X.solveInequality(c, S.ineq.op); } catch (e) { push(new ListScreen('Inequality', [[errType(e), 'a ≠ 0 required']])); return; }
    const exact = c.length === 3 ? quadRootsHTML(c) : null;
    const num = v => {
      const hit = exact && exact.find(r => !r.im && Math.abs(r.v - v) < 1e-9 * Math.max(1, Math.abs(v)));
      return hit ? hit.h : numHTML(v);
    };
    let rows;
    if (res.all) rows = [['All Real Numbers', '']];
    else if (res.none) rows = [['No Solution', '']];
    else rows = res.parts.map(pt => {
      const lt = incl => (incl ? '≤' : '&lt;');
      let txt;
      if (pt.lo === pt.hi) txt = `<i>x</i>=${num(pt.lo)}`;
      else if (pt.lo === -Infinity) txt = `<i>x</i>${lt(pt.hiIncl)}${num(pt.hi)}`;
      else if (pt.hi === Infinity) txt = `${num(pt.lo)}${lt(pt.loIncl)}<i>x</i>`;
      else txt = `${num(pt.lo)}${lt(pt.loIncl)}<i>x</i>${lt(pt.hiIncl)}${num(pt.hi)}`;
      return [txt, ''];
    });
    push(new ListScreen(polyTemplate(S.ineq.n) + opSym(S.ineq.op) + '0', rows, { hint: 'AC: edit' }));
  }

  // ------------------------------------------------------------ Ratio mode
  function ratioMenu() {
    const run = (kind, labels) => () => {
      const r = S.ratio;
      push(new PromptScreen({
        title: kind === 'x3' ? 'A:B = X:D' : 'A:B = C:X',
        items: labels.map((l, i) => ({ label: l + '=', value: r.vals[i] })),
        onDone: vals => {
          r.kind = kind; r.vals = vals;
          const rows = labels.map((l, i) => [l, numHTML(vals[i])]);
          try {
            const v = E.finalize(X.ratio(kind, vals[0], vals[1], vals[2]));
            setAns(v);
            rows.push(['<b>X=</b>', `<b>${numHTML(v)}</b>`]);
          } catch (e) { rows.push([`<b>${errType(e)}</b>`, '']); }
          save();
          push(new ListScreen(kind === 'x3' ? 'A:B = X:D' : 'A:B = C:X', rows, { sel: rows.length - 1 }));
        }
      }));
    };
    return new MenuScreen('Ratio', [
      { label: 'A:B = X:D', act: run('x3', ['A', 'B', 'D']) },
      { label: 'A:B = C:X', act: run('x4', ['A', 'B', 'C']) }
    ], { one: true, sel: S.ratio.kind === 'x4' ? 1 : 0 });
  }

  // ------------------------------------------------------------ modes
  function makeBase(m) {
    if (m === 'STAT') return statGrid();
    if (m === 'TABLE') return new TableScreen();
    if (m === 'EQN') return eqnGrid();
    if (m === 'DIST') return distMenu();
    if (m === 'INEQ') return ineqGrid();
    if (m === 'RATIO') return ratioMenu();
    if (['CMPLX', 'BASE', 'MATRIX', 'VECTOR'].includes(m)) return U.cx[m] || (U.cx[m] = new CompScreen(m));
    if (!U.comp) U.comp = new CompScreen();
    return U.comp;
  }
  function setBase(s) { U.stack[0] = s; }
  function setMode(m) {
    S.mode = m;
    U.stack = [makeBase(m)];
    if (m === 'STAT' && !S.stat.x.length) push(statTypeMenu());
    if (m === 'EQN') push(eqnTypeMenu());
    if (m === 'INEQ') push(ineqTypeMenu());
    if ((m === 'MATRIX' && !Object.keys(S.mats).length) || (m === 'VECTOR' && !Object.keys(S.vcts).length)) {
      const t = m === 'MATRIX' ? 'mat' : 'vct';
      push(pickName('Define ' + (t === 'mat' ? 'Matrix' : 'Vector'), t, n => defineMatVct(t, n)));
    }
    save();
  }
  const MODES = [
    ['COMP', 'Calculate', ''], ['CMPLX', 'Complex', 'CMPLX'], ['BASE', 'Base-N', 'BASE'], ['MATRIX', 'Matrix', 'MAT'],
    ['VECTOR', 'Vector', 'VCT'], ['STAT', 'Statistics', 'STAT'], ['DIST', 'Distribution', 'DIST'], ['TABLE', 'Table', 'TABLE'],
    ['EQN', 'Equation', 'EQN'], ['INEQ', 'Inequality', 'INEQ'], ['RATIO', 'Ratio', 'RATIO']
  ];
  const MODE_LABEL = Object.fromEntries(MODES.map(([m, , l]) => [m, l]));

  function openModeMenu() {
    if (top().isModeMenu) { pop(); return; }
    while (U.stack.length > 1) U.stack.pop();
    const m = new MenuScreen('MENU', MODES.map(([mode, label], i) => ({
      label, k: i < 9 ? String(i + 1) : '', act: () => setMode(mode)
    })), { one: false, sel: MODES.findIndex(x => x[0] === S.mode) });
    m.isModeMenu = true;
    push(m);
  }

  function choice(title, opts, cur, set) {
    const idx = opts.findIndex(o => o[1] === cur);
    return new MenuScreen(title, opts.map(([l, v]) => ({
      label: l, chk: v === cur,
      act: () => { set(v); save(); popMenus(); }
    })), { one: true, sel: idx });
  }
  function digitsMenu(title, from, to, set) {
    const items = [];
    for (let d = from; d <= to; d++) items.push({ label: title + ' ' + d, k: String(d), act: () => { set(d); save(); popMenus(); } });
    return new MenuScreen(title + ' ' + from + '~' + to + '?', items, { one: false });
  }
  function openSetup() {
    const st = S.settings;
    const fmtName = f => (f.t === 'norm' ? 'Norm' : f.t === 'fix' ? 'Fix' : 'Sci') + ' ' + f.n;
    push(new MenuScreen('SETUP', [
      { label: 'Input: ' + (st.input === 'line' ? 'Linear' : 'Textbook (MathI)'), act: () => push(choice('Input', [['Textbook (MathI)', 'math'], ['Linear (LineI)', 'line']], st.input, v => { st.input = v; })) },
      { label: 'Input/Output: ' + (st.io === 'math' ? 'MathO' : 'DecimalO'), act: () => push(choice('Input/Output', [['MathI/MathO (exact)', 'math'], ['MathI/DecimalO', 'dec']], st.io, v => { st.io = v; })) },
      { label: 'Angle Unit: ' + { D: 'Degree', R: 'Radian', G: 'Gradian' }[st.angle], act: () => push(choice('Angle Unit', [['Degree', 'D'], ['Radian', 'R'], ['Gradian', 'G']], st.angle, v => { st.angle = v; })) },
      { label: 'Number Format: ' + fmtName(st.fmt), act: () => push(new MenuScreen('Number Format', [
        { label: 'Fix (decimal places)', act: () => push(digitsMenu('Fix', 0, 9, d => { st.fmt = { t: 'fix', n: d }; })) },
        { label: 'Sci (significant digits)', act: () => push(digitsMenu('Sci', 0, 9, d => { st.fmt = { t: 'sci', n: d }; })) },
        { label: 'Norm', act: () => push(digitsMenu('Norm', 1, 2, d => { st.fmt = { t: 'norm', n: d }; })) }
      ], { one: true })) },
      { label: 'Complex Result: ' + (S.cfmt === 'polar' ? 'r∠θ' : 'a+bi'), act: () => push(choice('Complex Result', [['a+bi', 'rect'], ['r∠θ', 'polar']], S.cfmt, v => { S.cfmt = v; })) },
      { label: 'Fraction Result: ' + (st.frac === 'abc' ? 'ab/c' : 'd/c'), act: () => push(choice('Fraction Result', [['ab/c (mixed)', 'abc'], ['d/c (improper)', 'dc']], st.frac, v => { st.frac = v; })) },
      { label: 'Key Haptics: ' + (st.haptic ? 'On' : 'Off'), act: () => push(choice('Key Haptics', [['On', true], ['Off', false]], st.haptic, v => { st.haptic = v; })) },
      { label: 'Help (key guide)', act: () => { pop(); openHelp(); } },
      { label: 'Reset…', act: () => { pop(); openReset(); } }
    ], { one: true }));
  }
  function openReset() {
    const confirm = (title, fn) => push(new MenuScreen(title + ' — Reset?', [
      { label: 'Yes', act: () => { fn(); save(); popMenus(); } },
      { label: 'Cancel', act: () => popMenus() }
    ], { one: true, sel: 1 }));
    push(new MenuScreen('RESET', [
      { label: 'Setup Data', act: () => confirm('Setup Data', () => { S.settings = defaultSettings(); }) },
      { label: 'Variable Memory', act: () => confirm('Variables', () => { S.vars = freshVars(); S.ans = 0; S.preAns = 0; }) },
      { label: 'Calc History', act: () => confirm('History', () => { S.history = []; S.histX = {}; if (U.comp) U.comp.hist = -1; }) },
      { label: 'Matrices & Vectors', act: () => confirm('Matrices & Vectors', () => { S.mats = {}; S.vcts = {}; S.matAns = null; S.vctAns = null; }) },
      { label: 'Initialize All', act: () => confirm('Everything', () => {
        S.settings = defaultSettings(); S.vars = freshVars(); S.ans = 0; S.preAns = 0; S.history = [];
        S.stat = { type: '1', x: [], y: [] }; S.table = { f: [], g: [], start: 1, end: 5, step: 1 }; S.eqn = { kind: 'sim', n: 2, sim: {}, poly: {} };
        S.base = 'd'; S.cfmt = 'rect'; S.mats = {}; S.vcts = {}; S.matAns = null; S.vctAns = null; S.histX = {};
        S.dist = {}; S.ineq = { n: 2, op: '>', coef: {} }; S.ratio = { kind: 'x3', vals: [1, 2, 1] };
        U.comp = null; U.cx = {}; S.mode = 'COMP'; U.stack = [makeBase('COMP')];
      }) }
    ], { one: true }));
  }

  // Inserting from menus goes to whatever editor sits beneath the menus.
  function insertTok(tok) {
    popMenus();
    const t = top();
    if (t.key) t.key('ins:' + tok);
  }
  const tokItems = keys => keys.map(k => ({ label: esc(TOK[k].disp), act: () => insertTok(k) }));

  function openConst() {
    push(new MenuScreen('CONSTANT', E.CONSTS.map(([id, d, name]) => ({
      label: `${esc(d)}  <span class="hint">${name}</span>`, act: () => insertTok('k:' + id)
    })), { one: true }));
  }
  function openConv() {
    push(new MenuScreen('CONVERSION (applies to value before it)', E.CONV.map(([id, d]) => ({
      label: esc(d), act: () => insertTok('cv:' + id)
    })), { one: false }));
  }
  function openCatalog() {
    const sub = (title, keys) => () => push(new MenuScreen(title, tokItems(keys), { one: false }));
    push(new MenuScreen('CATALOG', [
      { label: 'Func Analysis', act: sub('Func Analysis', ['deriv(', 'integ(', 'sum(', 'prod(']) },
      { label: 'Probability', act: sub('Probability', ['pct', 'fact', 'P', 'C', 'Ran#', 'ranint(']) },
      { label: 'Numeric Calc', act: sub('Numeric Calc', ['abs(', 'rnd(', 'int(', 'intg(', 'gcd(', 'lcm(']) },
      { label: 'Angle/Coord/Sexa', act: sub('Angle/Coord/Sexa', ['degm', 'radm', 'gradm', 'pol(', 'rec(', '°']) },
      { label: 'Hyperbolic/Trig', act: sub('Hyperbolic/Trig', ['sinh(', 'cosh(', 'tanh(', 'asinh(', 'acosh(', 'atanh(', 'asin(', 'acos(', 'atan(']) },
      { label: 'Exp/Log/Power', act: sub('Exp/Log/Power', ['log(', 'ln(', 'p10(', 'exp(', 'sqrt(', 'cbrt(', 'xrt(', '^(', 'sq', 'cube', 'inv']) },
      { label: 'Variables', act: sub('Variables', ['vA', 'vB', 'vC', 'vD', 'vE', 'vF', 'vX', 'vY', 'vM', 'Ans', 'PreAns']) },
      { label: 'Scientific Const', act: () => openConst() },
      { label: 'Unit Conversions', act: () => openConv() },
      { label: 'Other', act: sub('Other', ['pi', 'e', ',', '=', '(', ')', 'EXP']) }
    ], { one: false }));
  }
  function openOptn() {
    const sub = (title, keys) => () => push(new MenuScreen(title, tokItems(keys), { one: false }));
    push(new MenuScreen('OPTN', [
      { label: 'Hyperbolic Func', act: sub('Hyperbolic', ['sinh(', 'cosh(', 'tanh(', 'asinh(', 'acosh(', 'atanh(']) },
      { label: 'Angle Unit', act: sub('Angle Unit', ['degm', 'radm', 'gradm']) },
      { label: 'Numeric Calc', act: sub('Numeric Calc', ['abs(', 'rnd(', 'int(', 'intg(', 'gcd(', 'lcm(', 'ranint(']) },
      { label: 'Calculus', act: sub('Calculus', ['deriv(', 'integ(', 'sum(', 'prod(']) }
    ], { one: false }));
  }
  function openRecall() {
    const names = E.VARS;
    push(new ListScreen('RECALL  [=] insert', names.map(n => [n, numHTML(S.vars[n])]).concat([['Ans', numHTML(S.ans)], ['PreAns', numHTML(S.preAns)]]), {
      isMenu: true,
      onExe: i => insertTok(i < names.length ? 'v' + names[i] : i === names.length ? 'Ans' : 'PreAns')
    }));
  }
  function openHelp() {
    const rows = [
      ['SHIFT / ALPHA', 'gold / pink labels'],
      ['a/b key', 'fraction: 3/4'],
      ['S⇔D', 'exact ⇔ decimal'],
      ['SHIFT =', 'decimal result'],
      ['▲ ▼', 'previous calculations'],
      ['◀ ▶', 'edit the expression'],
      ['STO, then key', 'store to A–F, X, Y, M'],
      ['CALC', 'evaluate for variables'],
      ['SHIFT CALC', 'SOLVE for x'],
      ['ALPHA CALC', 'type = (equations)'],
      ['log(a,b)', 'log base a of b'],
      ['∫(f,a,b)', 'integral, use x'],
      ['d/dx(f,a)', 'derivative at a'],
      ['Σ(f,a,b)', 'sum for x=a…b'],
      ['MENU', 'all 11 modes'],
      ['OPTN', 'functions for the current mode'],
      ['Complex: ENG key', 'types i'],
      ['Base-N: x² x^ log ln', 'DEC / HEX / BIN / OCT'],
      ['Base-N: (−) °′″ x⁻¹ sin cos tan', 'hex digits A–F'],
      ['Matrix/Vector: OPTN', 'define, edit, insert'],
      ['Matrix x⁻¹ / x²', 'inverse / square'],
      ['Vector × Vector', 'cross product'],
      ['⚙ key', 'settings (Deg/Rad…)'],
      ['SHIFT ⚙', 'CATALOG of every function'],
      ['Toolbar chips', 'tap DEG / FRAC / NORM to change'],
      ['Fraction key', 'stacked fraction, ▼ to denominator'],
      ['°′″ key', 'DMS input; on result: convert'],
      ['SHIFT °′″', 'prime factorization'],
      ['SHIFT 7 / 8', 'constants / conversions'],
      ['SHIFT DEL', 'undo']
    ];
    push(new ListScreen('HELP', rows, { isMenu: true }));
  }

  // ------------------------------------------------------------ keypad definition
  // l: label, a: action, s: [shiftLabel, shiftAction], al: [alphaLabel, alphaAction], c: css classes
  // l: face, a: action, s: [SHIFT label, action], al: [ALPHA label, action], c: css classes.
  // Layout and labels follow the fx-991EX keyboard.
  const BOX = '<span class="bx"></span>', SBOX = '<span class="bx s"></span>';
  const K = {
    shift: { l: 'SHIFT', a: 'shift', c: 'shiftk sm' },
    alpha: { l: 'ALPHA', a: 'alpha', c: 'alphak sm' },
    menu: { l: 'MENU', a: 'menu', c: 'sm' },
    setup: { l: '<svg viewBox="0 0 24 24" width="1.25em" height="1.25em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>', a: 'setup', s: ['CATALOG', 'catalog'], c: 'sm' },
    optn: { l: 'OPTN', a: 'optn', c: 'sm' },
    calc: { l: 'CALC', a: 'calc', s: ['SOLVE', 'solve'], al: ['=', 'ins:='], c: 'sm' },
    integ: { l: `<span class="fi">∫</span><span class="lims">${SBOX}${SBOX}</span>${BOX}`, a: 'ins:integ(', s: [`<span class="dd">d/d<i>x</i></span>${SBOX}`, 'ins:deriv('] },
    x: { l: '<i class="xv">x</i>', a: 'ins:vX', s: [`Σ${SBOX}`, 'ins:sum('], al: [`Π${SBOX}`, 'ins:prod('] },
    frac: { l: `<span class="kfrac">${BOX}${BOX}</span>`, a: 'ins:frac', s: [`${SBOX}<span class="kfrac s">${SBOX}${SBOX}</span>`, 'ins:mixed'], al: ['÷R', 'ins:divr'] },
    sqrt: { l: `√${BOX}`, a: 'ins:sqrt(', s: [`<sup>3</sup>√${SBOX}`, 'ins:cbrt('] },
    sq: { l: '<i class="xv">x</i><sup>2</sup>', a: 'ins:sq', s: ['<i>x</i><sup>3</sup>', 'ins:cube'], al: ['mod', 'ins:mod'] },
    pow: { l: `<i class="xv">x</i><sup>${BOX}</sup>`, a: 'ins:^(', s: [`<sup>${SBOX}</sup>√${SBOX}`, 'ins:xrt('], al: ['cot', 'ins:cot('] },
    log: { l: `log<sub>${BOX}</sub>${BOX}`, a: 'ins:logab', s: [`10<sup>${SBOX}</sup>`, 'ins:p10('], al: ['cot<sup>-1</sup>', 'ins:acot('] },
    ln: { l: 'ln', a: 'ins:ln(', s: [`<i>e</i><sup>${SBOX}</sup>`, 'ins:exp('] },
    neg: { l: '(−)', a: 'ins:neg', s: ['log', 'ins:log('], al: ['A', 'ins:vA'] },
    dms: { l: '°,,,', a: 'dms', s: ['FACT', 'fact'], al: ['B', 'ins:vB'] },
    inv: { l: '<i class="xv">x</i><sup>-1</sup>', a: 'ins:inv', s: ['<i>x</i>!', 'ins:fact'], al: ['C', 'ins:vC'] },
    sin: { l: 'sin', a: 'ins:sin(', s: ['sin<sup>-1</sup>', 'ins:asin('], al: ['D', 'ins:vD'] },
    cos: { l: 'cos', a: 'ins:cos(', s: ['cos<sup>-1</sup>', 'ins:acos('], al: ['E', 'ins:vE'] },
    tan: { l: 'tan', a: 'ins:tan(', s: ['tan<sup>-1</sup>', 'ins:atan('], al: ['F', 'ins:vF'] },
    sto: { l: 'STO', a: 'sto', s: ['RECALL', 'rcl'], c: 'sm' },
    eng: { l: 'ENG', a: 'eng', s: ['∠', 'ins:∠'], al: ['<i>i</i>', 'ins:i'], c: 'sm' },
    lp: { l: '(', a: 'ins:(', s: ['Abs', 'ins:abs('] },
    rp: { l: ')', a: 'ins:)', s: [',', 'ins:,'], al: ['<i>x</i>', 'ins:vX'] },
    sd: { l: 'S⇔D', a: 'sd', s: ['a<sup>b</sup>/<sub>c</sub>⇔<sup>d</sup>/<sub>c</sub>', 'mixed'], al: ['<i>y</i>', 'ins:vY'], c: 'sm' },
    mplus: { l: 'M+', a: 'mplus', s: ['M−', 'mminus'], al: ['M', 'ins:vM'] },
    n7: { l: '7', a: 'ins:7', s: ['CONST', 'const'], c: 'num' },
    n8: { l: '8', a: 'ins:8', s: ['CONV', 'conv'], c: 'num' },
    n9: { l: '9', a: 'ins:9', s: ['RESET', 'reset'], c: 'num' },
    del: { l: 'DEL', a: 'del', s: ['UNDO', 'undo'], c: 'red' },
    ac: { l: 'AC', a: 'ac', al: ['CLRv', 'clrv'], c: 'red' },
    n4: { l: '4', a: 'ins:4', s: ['MATRIX', 'mode:MATRIX'], c: 'num' },
    n5: { l: '5', a: 'ins:5', s: ['VECTOR', 'mode:VECTOR'], c: 'num' },
    n6: { l: '6', a: 'ins:6', s: ['STAT', 'mode:STAT'], c: 'num' },
    mul: { l: '×', a: 'ins:*', s: ['nPr', 'ins:P'], al: ['GCD', 'ins:gcd('], c: 'op' },
    div: { l: '÷', a: 'ins:/', s: ['nCr', 'ins:C'], al: ['LCM', 'ins:lcm('], c: 'op' },
    n1: { l: '1', a: 'ins:1', s: ['BASE', 'mode:BASE'], c: 'num' },
    n2: { l: '2', a: 'ins:2', s: ['CMPLX', 'mode:CMPLX'], c: 'num' },
    n3: { l: '3', a: 'ins:3', s: ['EQN', 'mode:EQN'], c: 'num' },
    add: { l: '+', a: 'ins:+', s: ['Pol', 'ins:pol('], al: ['Ceil', 'ins:ceil('], c: 'op' },
    sub: { l: '−', a: 'ins:-', s: ['Rec', 'ins:rec('], al: ['Floor', 'ins:floor('], c: 'op' },
    n0: { l: '0', a: 'ins:0', s: ['Rnd', 'ins:rnd('], c: 'num' },
    dot: { l: '•', a: 'ins:.', s: ['Ran#', 'ins:Ran#'], al: ['RanInt', 'ins:ranint('], c: 'num' },
    exp: { l: '×10<sup><i>x</i></sup>', a: 'ins:EXP', s: ['π', 'ins:pi'], al: ['<i>e</i>', 'ins:e'], c: 'num' },
    ans: { l: 'Ans', a: 'ins:Ans', s: ['%', 'ins:pct'], al: ['PreAns', 'ins:PreAns'], c: 'num' },
    exe: { l: '=', a: 'exe', s: ['', 'approx'], c: 'green' }
  };

  // Keys that change meaning in a mode (only when SHIFT/ALPHA are off): [face, action]
  const MODE_KEYS = {
    BASE: {
      neg: ['A', 'ins:hA'], dms: ['B', 'ins:hB'], inv: ['C', 'ins:hC'], sin: ['D', 'ins:hD'], cos: ['E', 'ins:hE'], tan: ['F', 'ins:hF'],
      sq: ['DEC', 'base:d'], pow: ['HEX', 'base:h'], log: ['BIN', 'base:b'], ln: ['OCT', 'base:o']
    },
    CMPLX: { eng: ['<i>i</i>', 'ins:i'] }
  };
  const OVERRIDDEN = [...new Set(Object.values(MODE_KEYS).flatMap(o => Object.keys(o)))];
  const ROWS = [
    ['frac', 'sqrt', 'sq', 'pow', 'log', 'ln'],
    ['neg', 'dms', 'inv', 'sin', 'cos', 'tan'],
    ['sto', 'eng', 'lp', 'rp', 'sd', 'mplus'],
    ['n7', 'n8', 'n9', 'del', 'ac'],
    ['n4', 'n5', 'n6', 'mul', 'div'],
    ['n1', 'n2', 'n3', 'add', 'sub'],
    ['n0', 'dot', 'exp', 'ans', 'exe']
  ];

  function keyCell(id) {
    const k = K[id];
    const cell = document.createElement('div');
    cell.className = 'kc';
    cell.innerHTML = `<div class="kl"><span class="s">${k.s ? k.s[0] : ''}</span><span class="a">${k.al ? k.al[0] : ''}</span></div>` +
      `<button class="k ${k.c || ''}" data-k="${id}" aria-label="${id}">${k.l}</button>`;
    return cell;
  }
  function buildKeys() {
    const keys = $('#keys');
    const topBlock = document.createElement('div');
    topBlock.className = 'top';
    ['shift', 'alpha'].forEach(id => topBlock.appendChild(keyCell(id)));
    const dpad = document.createElement('div');
    dpad.className = 'dpad';
    const chev = d => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;
    dpad.innerHTML = `<button class="up" data-nav="up" aria-label="up">${chev('M6 15l6-6 6 6')}</button>` +
      `<button class="dn" data-nav="down" aria-label="down">${chev('M6 9l6 6 6-6')}</button>` +
      `<button class="lf" data-nav="left" aria-label="left">${chev('M15 6l-6 6 6 6')}</button>` +
      `<button class="rt" data-nav="right" aria-label="right">${chev('M9 6l6 6-6 6')}</button><div class="hub"></div>`;
    topBlock.appendChild(dpad);
    ['menu', 'setup', 'optn', 'calc', 'integ', 'x'].forEach(id => topBlock.appendChild(keyCell(id)));
    keys.appendChild(topBlock);
    ROWS.forEach(r => {
      const row = document.createElement('div');
      row.className = 'row ' + (r.length === 6 ? 'six' : 'five');
      r.forEach(id => row.appendChild(keyCell(id)));
      keys.appendChild(row);
    });
  }

  // ------------------------------------------------------------ input handling
  const hapticEl = $('#haptic');
  function haptic() {
    if (!S.settings.haptic) return;
    try {
      if (window.AndroidApp) window.AndroidApp.tick(); // native Android app
      else if (navigator.vibrate) navigator.vibrate(6);
      else if (hapticEl) hapticEl.click(); // iOS 18+: toggling a switch input gives a haptic tick
    } catch (e) { /* ignore */ }
  }

  function press(id) {
    const k = K[id];
    let act = k.a;
    if (U.sto) {
      U.sto = false;
      const v = k.al && k.al[1].startsWith('ins:v') ? k.al[1] : k.a === 'ins:vX' ? k.a : null;
      if (v && top().store) top().store(v.slice(5));
      U.shift = U.alpha = false;
      afterAction();
      return;
    }
    if (act === 'shift') { U.shift = !U.shift; U.alpha = false; render(); return; }
    if (act === 'alpha') { U.alpha = !U.alpha; U.shift = false; render(); return; }
    const ov = MODE_KEYS[S.mode] && MODE_KEYS[S.mode][id];
    if (U.shift && k.s) act = k.s[1];
    else if (U.alpha && k.al) act = k.al[1];
    else if (ov) act = ov[1];
    U.shift = U.alpha = false;
    dispatch(act);
  }

  function dispatch(act) {
    switch (act) {
      case 'menu': openModeMenu(); break;
      case 'setup': openSetup(); break;
      case 'reset': openReset(); break;
      case 'catalog': openCatalog(); break;
      case 'help': openHelp(); break;
      case 'const': if (top().ed !== undefined || top() === U.comp) openConst(); break;
      case 'conv': if (top().ed !== undefined || top() === U.comp) openConv(); break;
      case 'rcl': openRecall(); break;
      case 'hyp': push(new MenuScreen('Hyperbolic', tokItems(['sinh(', 'cosh(', 'tanh(', 'asinh(', 'acosh(', 'atanh(']), { one: false })); break;
      case 'sto': if (top().store) U.sto = true; break;
      case 'base:d': case 'base:h': case 'base:b': case 'base:o': S.base = act.slice(5); break;
      case 'optn': if (top().optn) top().optn(); else if (top() === U.comp || top() instanceof PromptScreen) openOptn(); break;
      case 'undo': case 'redo': if (top()[act]) top()[act](); break;
      case 'clrv': push(new MenuScreen('Clear all variables?', [
        { label: 'Yes', act: () => { S.vars = freshVars(); S.ans = 0; S.preAns = 0; save(); popMenus(); } },
        { label: 'Cancel', act: () => popMenus() }
      ], { one: true, sel: 1 })); break;
      case 'angle': S.settings.angle = { D: 'R', R: 'G', G: 'D' }[S.settings.angle]; break;
      case 'io': S.settings.io = S.settings.io === 'math' ? 'dec' : 'math'; if (top().res) top().res.decimal = S.settings.io === 'dec'; break;
      case 'fmt': openSetup(); top().choose(3); break;
      case 'zoomin': case 'zoomout':
        S.settings.zoom = Math.max(0.7, Math.min(1.6, +(S.settings.zoom + (act === 'zoomin' ? 0.1 : -0.1)).toFixed(1)));
        break;
      default:
        if (act && act.startsWith('mode:')) { setMode(act.slice(5)); break; }
        if (act) top().key(act);
    }
    afterAction();
  }
  function afterAction() { render(); save(); }

  const ICON = {
    zoomout: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M8 10.5h5M15.5 15.5 20 20"/></svg>',
    zoomin: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M8 10.5h5M10.5 8v5M15.5 15.5 20 20"/></svg>',
    undo: '<svg viewBox="0 0 24 24"><path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="m15 7 5 5-5 5M20 12H9a5 5 0 0 0 0 10h2"/></svg>'
  };
  function render() {
    const st = S.settings;
    const chip = (act, txt, cls) => `<button class="chip ${cls || ''}" data-act="${act}">${txt}</button>`;
    const fmt = st.fmt.t === 'norm' ? 'NORM' : st.fmt.t.toUpperCase() + ' ' + st.fmt.n;
    const t = top(), canUndo = !!(t.undoStack && t.undoStack.length), canRedo = !!(t.redoStack && t.redoStack.length);
    $('#status').innerHTML =
      chip('angle', { D: 'DEG', R: 'RAD', G: 'GRA' }[st.angle], 'pill') +
      chip('io', st.io === 'math' ? 'FRAC' : 'DECI', 'pill') +
      (U.shift ? '<span class="badge s">S</span>' : '') + (U.alpha ? '<span class="badge a">A</span>' : '') +
      (U.sto ? '<span class="badge sto">STO</span>' : '') +
      chip('fmt', fmt, 'plain') +
      (S.vars.M !== 0 && typeof S.vars.M === 'number' ? '<span class="flag">M</span>' : '') +
      (S.mode === 'BASE' ? `<span class="flag">${BASE_NAME[S.base].toUpperCase()}</span>` : '') +
      (MODE_LABEL[S.mode] ? `<span class="flag">${MODE_LABEL[S.mode]}</span>` : '') +
      '<span class="grow"></span>' +
      chip('zoomout', ICON.zoomout, 'icon') + chip('zoomin', ICON.zoomin, 'icon') +
      chip('undo', ICON.undo, 'icon' + (canUndo ? '' : ' dim')) + chip('redo', ICON.redo, 'icon' + (canRedo ? '' : ' dim'));
    document.body.classList.toggle('mod-shift', U.shift);
    document.body.classList.toggle('mod-alpha', U.alpha);
    document.documentElement.style.setProperty('--zoom', st.zoom || 1);
    const scr = $('#screen');
    scr.innerHTML = top().html();
    const focus = scr.querySelector('.cur') || scr.querySelector('.sel');
    if (focus) focus.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    OVERRIDDEN.forEach(id => {
      const b = document.querySelector(`.k[data-k="${id}"]`);
      const ov = MODE_KEYS[S.mode] && MODE_KEYS[S.mode][id];
      const face = ov ? ov[0] : K[id].l;
      if (b && b.dataset.face !== face) { b.innerHTML = face; b.dataset.face = face; b.classList.toggle('modek', !!ov); }
    });
    document.querySelectorAll('.k.shiftk').forEach(b => b.classList.toggle('lit', U.shift));
    document.querySelectorAll('.k.alphak').forEach(b => b.classList.toggle('lit', U.alpha));
  }

  function attachInput() {
    const REPEAT = new Set(['del', 'up', 'down', 'left', 'right']);
    let timer = null;
    const stop = () => { clearTimeout(timer); clearInterval(timer); timer = null; document.querySelectorAll('.down').forEach(b => b.classList.remove('down')); };
    $('#keys').addEventListener('pointerdown', e => {
      const b = e.target.closest('button');
      if (!b) return;
      e.preventDefault();
      stop();
      b.classList.add('down');
      haptic();
      const id = b.dataset.k, nav = b.dataset.nav;
      const fire = () => { if (nav) { U.shift = U.alpha = false; dispatch(nav); } else press(id); };
      fire();
      if (nav || (id && REPEAT.has(K[id].a))) {
        timer = setTimeout(() => { timer = setInterval(fire, 70); }, 420);
      }
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => document.addEventListener(ev, stop));
    document.addEventListener('contextmenu', e => e.preventDefault());

    $('#status').addEventListener('pointerdown', e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      e.preventDefault();
      haptic();
      U.shift = U.alpha = false;
      dispatch(b.dataset.act);
    });
    $('#lcd').addEventListener('click', e => {
      const t = e.target.closest('[data-tap]');
      if (t && top().tap) { haptic(); top().tap(t.dataset.tap); afterAction(); }
    });

    // Hardware keyboard (desktop / tablets)
    const map = {
      Enter: 'exe', '=': 'exe', Backspace: 'del', Delete: 'ac', Escape: 'ac',
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      '+': 'ins:+', '-': 'ins:-', '*': 'ins:*', '/': 'ins:/', '(': 'ins:(', ')': 'ins:)', '^': 'ins:^(',
      ',': 'ins:,', '!': 'ins:fact', '%': 'ins:pct', '.': 'ins:.', s: 'ins:sin(', c: 'ins:cos(', t: 'ins:tan(',
      l: 'ins:ln(', g: 'ins:log(', r: 'ins:sqrt(', p: 'ins:pi', x: 'ins:vX', e: 'ins:e', a: 'ins:Ans', m: 'menu', o: 'optn'
    };
    document.addEventListener('keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      let act = /^[0-9]$/.test(e.key) ? 'ins:' + e.key : map[e.key];
      if (S.mode === 'BASE' && /^[a-fA-F]$/.test(e.key)) act = 'ins:h' + e.key.toUpperCase();
      if (!act) return;
      e.preventDefault();
      dispatch(act);
    });
  }

  // ------------------------------------------------------------ boot
  buildKeys();
  attachInput();
  if (!MODES.some(m => m[0] === S.mode)) S.mode = 'COMP';
  U.stack = [makeBase(S.mode)];
  if (U.comp && S.history.length) U.comp.hist = S.history.length - 1;
  render();

  // Android back button: close the top menu/screen; returns false on the main screen so the app exits.
  window.__fxBack = () => {
    U.shift = U.alpha = U.sto = false;
    if (U.stack.length > 1) { pop(); afterAction(); return true; }
    return false;
  };

  // Exposed for automated tests
  window.__fx = { S, U, dispatch, press, render };
})();
