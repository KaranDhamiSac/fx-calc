/* fx Calc UI: keypad, LCD screens, modes (Calculate / Statistics / Table / Equation). */
(function () {
  'use strict';
  const E = window.CalcEngine, TOK = E.TOK;
  const $ = s => document.querySelector(s);
  const MINUS = '−';

  // ------------------------------------------------------------ persistent state
  const STORE_KEY = 'fxcalc-v1';
  const freshVars = () => ({ A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, X: 0, Y: 0, M: 0 });
  const defaultSettings = () => ({ io: 'math', angle: 'D', fmt: { t: 'norm', n: 1 }, frac: 'dc', haptic: true });
  const S = {
    settings: defaultSettings(),
    vars: freshVars(), ans: 0, preAns: 0, history: [], mode: 'COMP',
    stat: { type: '1', x: [], y: [] },
    table: { f: [], g: [], start: 1, end: 5, step: 1 },
    eqn: { kind: 'sim', n: 2, sim: {}, poly: {} }
  };
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
    }
  } catch (e) { /* storage unavailable */ }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        settings: S.settings, vars: S.vars, ans: S.ans, preAns: S.preAns,
        history: S.history.slice(-40), mode: S.mode, stat: S.stat, table: S.table, eqn: S.eqn
      }));
    } catch (e) { /* ignore */ }
  }

  const U = { shift: false, alpha: false, sto: false, stack: [], comp: null };
  const top = () => U.stack[U.stack.length - 1];
  const push = s => { U.stack.push(s); };
  const pop = () => { if (U.stack.length > 1) U.stack.pop(); };
  const popMenus = () => { while (U.stack.length > 1 && top().isMenu) U.stack.pop(); };

  const makeCtx = () => ({ vars: S.vars, angle: S.settings.angle, ans: S.ans, preAns: S.preAns, fmt: S.settings.fmt, multi: null });
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
  function decHTML(d) {
    return neg(d.m) + (d.e !== null ? `<span class="x10">×10<sup>${neg(d.e)}</sup></span>` : '');
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
    if (typeof v !== 'number') return esc(v);
    if (o.dms) {
      const t = E.toDMS(v);
      return (t.s < 0 ? MINUS : '') + `${t.d}°${t.m}′${+t.sec.toFixed(2)}″`;
    }
    if (o.eng !== undefined && o.eng !== null) return decHTML(E.fmtEng(v, o.eng));
    if (!o.decimal) {
      const ex = E.exactForm(v);
      if (ex) return exactHTML(ex, o.mixed);
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

  // ------------------------------------------------------------ expression editor
  const DISP = { frac: '/', neg: '-' };
  class Editor {
    constructor(tokens) { this.t = (tokens || []).slice(); this.c = this.t.length; }
    insert(k) { if (this.t.length >= 199) return; this.t.splice(this.c, 0, k); this.c++; }
    del() {
      if (this.c > 0) { this.t.splice(this.c - 1, 1); this.c--; }
      else if (this.t.length) this.t.splice(0, 1);
    }
    left() { this.c = this.c > 0 ? this.c - 1 : this.t.length; }
    right() { this.c = this.c < this.t.length ? this.c + 1 : 0; }
    clear() { this.t = []; this.c = 0; }
    get empty() { return this.t.length === 0; }
    html(cursor) {
      let s = '';
      this.t.forEach((k, i) => {
        if (cursor && i === this.c) s += '<span class="cur"></span>';
        s += esc(DISP[k] || TOK[k].disp);
      });
      if (cursor && this.c === this.t.length) s += '<span class="cur"></span>';
      return s;
    }
    // Shared editing keys; returns true if handled.
    edit(a) {
      if (a.startsWith('ins:')) { this.insert(a.slice(4)); return true; }
      if (a === 'left') { this.left(); return true; }
      if (a === 'right') { this.right(); return true; }
      if (a === 'del') { this.del(); return true; }
      return false;
    }
  }

  // ------------------------------------------------------------ Calculate screen
  class CompScreen {
    constructor() { this.ed = new Editor(); this.phase = 'edit'; this.res = null; this.hist = -1; this.err = null; }
    get title() { return ''; }

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
      return `<div class="result">${numHTML(r.value, r)}</div>`;
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
      S.history.push({ t: this.ed.t.slice(), v });
      if (S.history.length > 40) S.history.shift();
      this.hist = S.history.length - 1;
    }
    evaluate(decimal) {
      if (this.ed.empty) return;
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
      if (v === null) return;
      S.vars[name] = v;
      this.res.stored = name;
    }
    memAdd(sign) {
      const v = this.currentValue();
      if (v === null) return;
      S.vars.M = E.round15(S.vars.M + sign * v);
    }
    startNew(k) {
      const kind = TOK[k].kind;
      const continues = ['op', 'post', 'pow', 'perm', 'frac'].includes(kind) && k !== 'xrt(';
      this.ed = new Editor(continues ? ['Ans', k] : [k]);
      this.phase = 'edit';
    }
    showHistory(i) {
      const h = S.history[i];
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
          this.ed.c = Math.min(this.err.pos, this.ed.t.length);
        }
        return;
      }
      if (a.startsWith('ins:')) {
        if (this.phase === 'result') this.startNew(a.slice(4));
        else this.ed.insert(a.slice(4));
        return;
      }
      const r = this.res;
      switch (a) {
        case 'left': case 'right':
          if (this.phase === 'result') { this.phase = 'edit'; this.ed.c = a === 'left' ? this.ed.t.length : 0; }
          else this.ed.edit(a);
          break;
        case 'up':
          if (this.phase === 'result') this.showHistory(this.hist - 1 >= 0 ? this.hist - 1 : this.hist);
          else if (this.ed.empty && S.history.length) this.showHistory(S.history.length - 1);
          break;
        case 'down':
          if (this.phase === 'result' && this.hist < S.history.length - 1) this.showHistory(this.hist + 1);
          break;
        case 'del':
          if (this.phase === 'result') { this.phase = 'edit'; this.ed.c = this.ed.t.length; }
          else this.ed.del();
          break;
        case 'ac':
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
          if (this.phase === 'result' && !r.solve && !r.multi) {
            const rr = this.res;
            if (rr.eng === null) rr.eng = E.engBase(rr.value) + (a === 'engL' ? 3 : 0);
            else rr.eng += a === 'eng' ? -3 : 3;
          }
          break;
        case 'dms':
          if (this.phase === 'result') { r.dms = !r.dms; r.eng = null; }
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
        case 'calc': this.calc(); break;
        case 'solve': this.solve(); break;
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
      this.title = title; this.rows = rows; this.sel = 0; this.opt = opt;
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
      if (a === 'up' || a === 'down') { S.table[this.which] = this.ed.t; this.which = this.which === 'f' ? 'g' : 'f'; this.ed = new Editor(S.table[this.which]); return; }
      if (a === 'exe') {
        S.table[this.which] = this.ed.t.slice();
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
      try { fN = E.parse(t.f); if (t.g.length) gN = E.parse(t.g); } catch (e) { this.msg = errType(e); return; }
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
      let shown = null;
      if (deg === 2 && S.settings.io !== 'dec') {
        const ex = E.quadExact(c[0], c[1], c[2]);
        if (ex) {
          shown = ex.map(r => {
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
          if (!shown[0].im) shown.sort((a, b) => b.v - a.v);
        }
      }
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

  // ------------------------------------------------------------ modes
  function makeBase(m) {
    if (m === 'STAT') return statGrid();
    if (m === 'TABLE') return new TableScreen();
    if (m === 'EQN') return eqnGrid();
    if (!U.comp) U.comp = new CompScreen();
    return U.comp;
  }
  function setBase(s) { U.stack[0] = s; }
  function setMode(m) {
    S.mode = m;
    U.stack = [makeBase(m)];
    if (m === 'STAT' && !S.stat.x.length) push(statTypeMenu());
    if (m === 'EQN') push(eqnTypeMenu());
    save();
  }
  const MODE_LABEL = { COMP: '', STAT: 'STAT', TABLE: 'TABLE', EQN: 'EQN' };

  function openModeMenu() {
    if (top().isModeMenu) { pop(); return; }
    while (U.stack.length > 1) U.stack.pop();
    const m = new MenuScreen('MENU', [
      { label: 'Calculate', act: () => setMode('COMP') },
      { label: 'Statistics', act: () => setMode('STAT') },
      { label: 'Table', act: () => setMode('TABLE') },
      { label: 'Equation', act: () => setMode('EQN') }
    ], { one: true, sel: ['COMP', 'STAT', 'TABLE', 'EQN'].indexOf(S.mode) });
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
      { label: 'Input/Output: ' + (st.io === 'math' ? 'MathO' : 'DecimalO'), act: () => push(choice('Input/Output', [['MathI/MathO (exact)', 'math'], ['MathI/DecimalO', 'dec']], st.io, v => { st.io = v; })) },
      { label: 'Angle Unit: ' + { D: 'Degree', R: 'Radian', G: 'Gradian' }[st.angle], act: () => push(choice('Angle Unit', [['Degree', 'D'], ['Radian', 'R'], ['Gradian', 'G']], st.angle, v => { st.angle = v; })) },
      { label: 'Number Format: ' + fmtName(st.fmt), act: () => push(new MenuScreen('Number Format', [
        { label: 'Fix (decimal places)', act: () => push(digitsMenu('Fix', 0, 9, d => { st.fmt = { t: 'fix', n: d }; })) },
        { label: 'Sci (significant digits)', act: () => push(digitsMenu('Sci', 0, 9, d => { st.fmt = { t: 'sci', n: d }; })) },
        { label: 'Norm', act: () => push(digitsMenu('Norm', 1, 2, d => { st.fmt = { t: 'norm', n: d }; })) }
      ], { one: true })) },
      { label: 'Fraction Result: ' + (st.frac === 'abc' ? 'ab/c' : 'd/c'), act: () => push(choice('Fraction Result', [['ab/c (mixed)', 'abc'], ['d/c (improper)', 'dc']], st.frac, v => { st.frac = v; })) },
      { label: 'Key Haptics: ' + (st.haptic ? 'On' : 'Off'), act: () => push(choice('Key Haptics', [['On', true], ['Off', false]], st.haptic, v => { st.haptic = v; })) },
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
      { label: 'Calc History', act: () => confirm('History', () => { S.history = []; if (U.comp) U.comp.hist = -1; }) },
      { label: 'Initialize All', act: () => confirm('Everything', () => {
        S.settings = defaultSettings(); S.vars = freshVars(); S.ans = 0; S.preAns = 0; S.history = [];
        S.stat = { type: '1', x: [], y: [] }; S.table = { f: [], g: [], start: 1, end: 5, step: 1 }; S.eqn = { kind: 'sim', n: 2, sim: {}, poly: {} };
        U.comp = null; S.mode = 'COMP'; U.stack = [makeBase('COMP')];
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
      ['MENU', 'Stat / Table / Equation'],
      ['SHIFT MENU', 'settings (Deg/Rad…)'],
      ['°′″ key', 'DMS input; on result: convert'],
      ['SHIFT °′″', 'prime factorization'],
      ['SHIFT 7 / 8', 'constants / conversions'],
      ['CATALOG', 'every function by category']
    ];
    push(new ListScreen('HELP', rows, { isMenu: true }));
  }

  // ------------------------------------------------------------ keypad definition
  // l: label, a: action, s: [shiftLabel, shiftAction], al: [alphaLabel, alphaAction], c: css classes
  const K = {
    shift: { l: 'SHIFT', a: 'shift', c: 'shiftk' },
    alpha: { l: 'ALPHA', a: 'alpha', c: 'alphak' },
    menu: { l: 'MENU', a: 'menu', s: ['SETUP', 'setup'], c: 'sm' },
    catalog: { l: 'CATALOG', a: 'catalog', s: ['HELP', 'help'], c: 'sm' },
    optn: { l: 'OPTN', a: 'optn', c: 'sm' },
    calc: { l: 'CALC', a: 'calc', s: ['SOLVE', 'solve'], al: ['=', 'ins:='], c: 'sm' },
    integ: { l: '∫▫', a: 'ins:integ(', s: ['d/dx', 'ins:deriv('] },
    x: { l: '<i>x</i>', a: 'ins:vX', s: ['Σ', 'ins:sum('], al: ['∏', 'ins:prod('] },
    frac: { l: '▫/▫', a: 'ins:frac' },
    sqrt: { l: '√▫', a: 'ins:sqrt(', s: ['∛', 'ins:cbrt('] },
    sq: { l: '<i>x</i><sup>2</sup>', a: 'ins:sq', s: ['x³', 'ins:cube'] },
    pow: { l: '<i>x</i><sup>▫</sup>', a: 'ins:^(', s: ['ˣ√', 'ins:xrt('] },
    log: { l: 'log', a: 'ins:log(', s: ['10ˣ', 'ins:p10('] },
    ln: { l: 'ln', a: 'ins:ln(', s: ['eˣ', 'ins:exp('] },
    neg: { l: '(−)', a: 'ins:neg', al: ['A', 'ins:vA'] },
    dms: { l: '°′″', a: 'dms', s: ['FACT', 'fact'], al: ['B', 'ins:vB'] },
    inv: { l: '<i>x</i><sup>−1</sup>', a: 'ins:inv', s: ['x!', 'ins:fact'], al: ['C', 'ins:vC'] },
    sin: { l: 'sin', a: 'ins:sin(', s: ['sin⁻¹', 'ins:asin('], al: ['D', 'ins:vD'] },
    cos: { l: 'cos', a: 'ins:cos(', s: ['cos⁻¹', 'ins:acos('], al: ['E', 'ins:vE'] },
    tan: { l: 'tan', a: 'ins:tan(', s: ['tan⁻¹', 'ins:atan('], al: ['F', 'ins:vF'] },
    sto: { l: 'STO', a: 'sto', s: ['RECALL', 'rcl'], c: 'sm' },
    eng: { l: 'ENG', a: 'eng', s: ['←ENG', 'engL'], c: 'sm' },
    lp: { l: '(', a: 'ins:(', s: ['Abs', 'ins:abs('] },
    rp: { l: ')', a: 'ins:)', s: [',', 'ins:,'], al: ['X', 'ins:vX'] },
    sd: { l: 'S⇔D', a: 'sd', s: ['a<sup>b</sup>/c', 'mixed'], al: ['Y', 'ins:vY'], c: 'sm' },
    mplus: { l: 'M+', a: 'mplus', s: ['M−', 'mminus'], al: ['M', 'ins:vM'] },
    n7: { l: '7', a: 'ins:7', s: ['CONST', 'const'], c: 'num' },
    n8: { l: '8', a: 'ins:8', s: ['CONV', 'conv'], c: 'num' },
    n9: { l: '9', a: 'ins:9', s: ['RESET', 'reset'], c: 'num' },
    del: { l: 'DEL', a: 'del', c: 'red' },
    ac: { l: 'AC', a: 'ac', c: 'red' },
    n4: { l: '4', a: 'ins:4', s: ['Int', 'ins:int('], c: 'num' },
    n5: { l: '5', a: 'ins:5', s: ['Intg', 'ins:intg('], c: 'num' },
    n6: { l: '6', a: 'ins:6', s: ['hyp', 'hyp'], c: 'num' },
    mul: { l: '×', a: 'ins:*', s: ['nPr', 'ins:P'], al: ['GCD', 'ins:gcd('], c: 'op' },
    div: { l: '÷', a: 'ins:/', s: ['nCr', 'ins:C'], al: ['LCM', 'ins:lcm('], c: 'op' },
    n1: { l: '1', a: 'ins:1', c: 'num' },
    n2: { l: '2', a: 'ins:2', c: 'num' },
    n3: { l: '3', a: 'ins:3', c: 'num' },
    add: { l: '+', a: 'ins:+', s: ['Pol', 'ins:pol('], c: 'op' },
    sub: { l: '−', a: 'ins:-', s: ['Rec', 'ins:rec('], c: 'op' },
    n0: { l: '0', a: 'ins:0', s: ['Rnd', 'ins:rnd('], c: 'num' },
    dot: { l: '.', a: 'ins:.', s: ['Ran#', 'ins:Ran#'], al: ['RanInt', 'ins:ranint('], c: 'num' },
    exp: { l: '×10<sup><i>x</i></sup>', a: 'ins:EXP', s: ['π', 'ins:pi'], al: ['e', 'ins:e'] },
    ans: { l: 'Ans', a: 'ins:Ans', s: ['%', 'ins:pct'], al: ['PreAns', 'ins:PreAns'], c: 'sm' },
    exe: { l: '=', a: 'exe', s: ['≈', 'approx'], c: 'green' }
  };
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
    dpad.innerHTML = '<button class="up" data-nav="up" aria-label="up">▲</button><button class="dn" data-nav="down" aria-label="down">▼</button>' +
      '<button class="lf" data-nav="left" aria-label="left">◀</button><button class="rt" data-nav="right" aria-label="right">▶</button><div class="hub"></div>';
    topBlock.appendChild(dpad);
    ['menu', 'catalog', 'optn', 'calc', 'integ', 'x'].forEach(id => topBlock.appendChild(keyCell(id)));
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
      if (navigator.vibrate) navigator.vibrate(6);
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
    if (U.shift && k.s) act = k.s[1];
    else if (U.alpha && k.al) act = k.al[1];
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
      case 'optn': if (top().optn) top().optn(); else if (top() === U.comp || top() instanceof PromptScreen) openOptn(); break;
      default: top().key(act);
    }
    afterAction();
  }
  function afterAction() { render(); save(); }

  function render() {
    const st = S.settings;
    const ind = (on, t) => `<span class="${on ? 'on' : 'off'}">${t}</span>`;
    $('#status').innerHTML =
      ind(U.shift, 'S') + ind(U.alpha, 'A') + ind(S.vars.M !== 0, 'M') + ind(U.sto, 'STO') +
      `<span class="on inv">${st.angle}</span>` +
      (st.fmt.t !== 'norm' ? `<span class="on">${st.fmt.t.toUpperCase()}${st.fmt.n}</span>` : '') +
      '<span class="grow"></span>' +
      (MODE_LABEL[S.mode] ? `<span class="on">${MODE_LABEL[S.mode]}</span>` : '') +
      (st.io === 'math' ? '<span class="on">Math▲</span>' : '<span class="on">Dec</span>');
    const scr = $('#screen');
    scr.innerHTML = top().html();
    const focus = scr.querySelector('.cur') || scr.querySelector('.sel');
    if (focus) focus.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
      if (!act) return;
      e.preventDefault();
      dispatch(act);
    });
  }

  // ------------------------------------------------------------ boot
  buildKeys();
  attachInput();
  if (!['COMP', 'STAT', 'TABLE', 'EQN'].includes(S.mode)) S.mode = 'COMP';
  U.stack = [makeBase(S.mode)];
  if (U.comp && S.history.length) U.comp.hist = S.history.length - 1;
  render();

  // Exposed for automated tests
  window.__fx = { S, U, dispatch, press, render };
})();
