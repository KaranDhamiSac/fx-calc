/* Natural ("textbook") expression editor.
   An expression is a row: an array of items. An item is either a token key (string, see engine TOK)
   or a template {T, s:[row, row, …]} such as a fraction with numerator/denominator rows.
   linearize() turns the tree into the flat token list the engine parser understands. */
(function (root) {
  'use strict';

  // n: number of slots, lin: slots → flat tokens, vert: slot moves for ▲/▼
  const TPL = {
    frac: { n: 2, lin: s => ['(', '(', ...s[0], ')', '/', '(', ...s[1], ')', ')'], vert: { down: { 0: 1 }, up: { 1: 0 } } },
    mixed: { n: 3, lin: s => ['(', ...s[0], '+', '(', ...s[1], ')', '/', '(', ...s[2], ')', ')'], vert: { down: { 1: 2 }, up: { 2: 1 } } },
    'sqrt(': { n: 1, lin: s => ['sqrt(', ...s[0], ')'] },
    'cbrt(': { n: 1, lin: s => ['cbrt(', ...s[0], ')'] },
    'xrt(': { n: 2, lin: s => ['(', ...s[0], ')', 'xrt(', ...s[1], ')'] },
    '^(': { n: 1, lin: s => ['^(', ...s[0], ')'] },
    'p10(': { n: 1, lin: s => ['p10(', ...s[0], ')'] },
    'exp(': { n: 1, lin: s => ['exp(', ...s[0], ')'] },
    'abs(': { n: 1, lin: s => ['abs(', ...s[0], ')'] },
    logab: { n: 2, lin: s => ['log(', ...s[0], ',', ...s[1], ')'] },
    'integ(': { n: 3, lin: s => ['integ(', ...s[0], ',', ...s[1], ',', ...s[2], ')'], vert: { up: { 1: 2 }, down: { 2: 1 } } },
    'deriv(': { n: 2, lin: s => ['deriv(', ...s[0], ',', ...s[1], ')'] },
    'sum(': { n: 3, lin: s => ['sum(', ...s[0], ',', ...s[1], ',', ...s[2], ')'], vert: { up: { 1: 2 }, down: { 2: 1 } } },
    'prod(': { n: 3, lin: s => ['prod(', ...s[0], ',', ...s[1], ',', ...s[2], ')'], vert: { up: { 1: 2 }, down: { 2: 1 } } }
  };
  const isT = it => it !== null && typeof it === 'object' && !!it.T;
  const clone = row => JSON.parse(JSON.stringify(row || []));

  // Flatten a row into parser tokens. map[i] = where token i came from: {path, idx} — the cursor
  // position before that item — plus `empty` when its template still has an unfilled box.
  function linearize(row, path) {
    path = path || [];
    const tokens = [], map = [];
    row.forEach((it, i) => {
      const here = { path, idx: i };
      if (!isT(it)) { tokens.push(it); map.push(here); return; }
      const subs = it.s.map((sr, k) => linearize(sr, path.concat([{ i, s: k }])));
      const k0 = it.s.findIndex(sr => !sr.length);
      const at = k0 >= 0 ? { path, idx: i, empty: { path: path.concat([{ i, s: k0 }]), idx: 0 } } : here;
      // Each slot token is replaced by a marker so we can keep its origin through the template.
      const marked = TPL[it.T].lin(subs.map((sb, k) => sb.tokens.map((_, j) => ({ k, j }))));
      marked.forEach(m => {
        if (typeof m === 'string') { tokens.push(m); map.push(at); }
        else { tokens.push(subs[m.k].tokens[m.j]); map.push(subs[m.k].map[m.j]); }
      });
    });
    return { tokens, map };
  }

  class Editor {
    constructor(row, opts) {
      this.row = clone(Array.isArray(row) ? row : []);
      this.path = [];
      this.c = this.row.length;
      this.opts = opts || {};
    }
    get empty() { return this.row.length === 0; }
    get t() { return linearize(this.row).tokens; }
    snapshot() { return JSON.stringify({ r: this.row, p: this.path, c: this.c }); }
    restore(s) { const o = JSON.parse(s); this.row = o.r; this.path = o.p; this.c = o.c; }
    rowAt(path) {
      let r = this.row;
      for (const st of path) r = r[st.i].s[st.s];
      return r;
    }
    get cur() { return this.rowAt(this.path); }
    clear() { this.row = []; this.path = []; this.c = 0; }
    count() { return linearize(this.row).tokens.length; }

    insert(k) {
      if (this.count() >= 199) return;
      const line = this.opts.linear && this.opts.linear();
      const r = this.cur;
      if (!line && TPL[k]) {
        const tpl = { T: k, s: Array.from({ length: TPL[k].n }, () => []) };
        r.splice(this.c, 0, tpl);
        this.path = this.path.concat([{ i: this.c, s: 0 }]);
        this.c = 0;
        return;
      }
      // Linear-input fallbacks for template keys that have no single token.
      if (line && k === 'logab') { r.splice(this.c, 0, 'log('); this.c++; return; }
      if (line && k === 'mixed') { r.splice(this.c, 0, 'frac'); this.c++; return; }
      r.splice(this.c, 0, k);
      this.c++;
    }
    right() {
      const r = this.cur;
      if (this.c < r.length) {
        if (isT(r[this.c])) { this.path = this.path.concat([{ i: this.c, s: 0 }]); this.c = 0; }
        else this.c++;
        return;
      }
      if (!this.path.length) { this.c = 0; return; } // wrap around like the real calculator
      const last = this.path[this.path.length - 1], parent = this.path.slice(0, -1);
      const tpl = this.rowAt(parent)[last.i];
      if (last.s < tpl.s.length - 1) { this.path = parent.concat([{ i: last.i, s: last.s + 1 }]); this.c = 0; }
      else { this.path = parent; this.c = last.i + 1; }
    }
    left() {
      const r = this.cur;
      if (this.c > 0) {
        const it = r[this.c - 1];
        if (isT(it)) { const s = it.s.length - 1; this.path = this.path.concat([{ i: this.c - 1, s }]); this.c = it.s[s].length; }
        else this.c--;
        return;
      }
      if (!this.path.length) { this.c = r.length; return; }
      const last = this.path[this.path.length - 1], parent = this.path.slice(0, -1);
      if (last.s > 0) {
        const tpl = this.rowAt(parent)[last.i];
        this.path = parent.concat([{ i: last.i, s: last.s - 1 }]);
        this.c = tpl.s[last.s - 1].length;
      } else { this.path = parent; this.c = last.i; }
    }
    // ▲/▼ between numerator and denominator (or integral limits). Returns false if not inside one.
    vertical(dir) {
      for (let d = this.path.length - 1; d >= 0; d--) {
        const st = this.path[d], parent = this.path.slice(0, d);
        const tpl = this.rowAt(parent)[st.i];
        const v = TPL[tpl.T].vert && TPL[tpl.T].vert[dir];
        if (v && v[st.s] !== undefined) {
          const to = v[st.s];
          this.path = parent.concat([{ i: st.i, s: to }]);
          this.c = Math.min(this.c, tpl.s[to].length);
          return true;
        }
      }
      return false;
    }
    del() {
      const r = this.cur;
      if (this.c > 0) { r.splice(this.c - 1, 1); this.c--; return; }
      if (this.path.length) {
        // At the start of a box: remove the template but keep what was typed inside it.
        const last = this.path[this.path.length - 1], parent = this.path.slice(0, -1);
        const pr = this.rowAt(parent), tpl = pr[last.i];
        const before = tpl.s.slice(0, last.s).reduce((n, sr) => n + sr.length, 0);
        pr.splice(last.i, 1, ...tpl.s.flat());
        this.path = parent;
        this.c = last.i + before;
        return;
      }
      if (r.length) r.splice(0, 1);
    }
    edit(a) {
      if (a.startsWith('ins:')) { this.insert(a.slice(4)); return true; }
      if (a === 'left') { this.left(); return true; }
      if (a === 'right') { this.right(); return true; }
      if (a === 'del') { this.del(); return true; }
      return false;
    }
    // Put the cursor where a parser error happened (index into linearize().tokens).
    gotoToken(pos) {
      const { tokens, map } = linearize(this.row);
      let at = pos < tokens.length ? map[pos] : null;
      if (at && at.empty) at = at.empty;
      if (!at) { this.path = []; this.c = this.row.length; return; }
      this.path = at.path.slice();
      this.c = Math.min(at.idx, this.cur.length);
    }

    // ---------------------------------------------------------------- rendering
    html(cursor, atomHTML) {
      const curKey = cursor ? JSON.stringify(this.path) : null;
      const CUR = '<span class="cur"></span>';
      const self = this;
      function row(r, path, isRoot) {
        const here = cursor && JSON.stringify(path) === curKey;
        let h = '';
        r.forEach((it, i) => {
          if (here && i === self.c) h += CUR;
          h += isT(it) ? tpl(it, path, i) : atomHTML(it);
        });
        if (here && self.c === r.length) h += CUR;
        if (isRoot) return h;
        return r.length ? `<span class="nrow">${h}</span>` : `<span class="nrow slot">${h}</span>`;
      }
      function tpl(t, path, i) {
        const S = t.s.map((sr, k) => row(sr, path.concat([{ i, s: k }]), false));
        const frac = (a, b) => `<span class="nfrac"><span class="nnum">${a}</span><span class="nden">${b}</span></span>`;
        const radical = body => `<span class="nsqrt"><span class="nrad">√</span><span class="nbody">${body}</span></span>`;
        switch (t.T) {
          case 'frac': return frac(S[0], S[1]);
          case 'mixed': return `<span class="nmixed">${S[0]}${frac(S[1], S[2])}</span>`;
          case 'sqrt(': return radical(S[0]);
          case 'cbrt(': return `<span class="nroot"><span class="nidx">3</span>${radical(S[0])}</span>`;
          case 'xrt(': return `<span class="nroot"><span class="nidx">${S[0]}</span>${radical(S[1])}</span>`;
          case '^(': return `<span class="nsup">${S[0]}</span>`;
          case 'p10(': return `10<span class="nsup">${S[0]}</span>`;
          case 'exp(': return `<i class="ne">e</i><span class="nsup">${S[0]}</span>`;
          case 'abs(': return `<span class="nabs">${S[0]}</span>`;
          case 'logab': return `log<span class="nsub">${S[0]}</span><span class="nparen">(</span>${S[1]}<span class="nparen">)</span>`;
          case 'integ(':
            return `<span class="nbigop"><span class="nlim">${S[2]}</span><span class="nsym">∫</span><span class="nlim">${S[1]}</span></span>${S[0]}<i class="ndx">dx</i>`;
          case 'deriv(':
            return `${frac('d', 'd<i>x</i>')}<span class="nparen">(</span>${S[0]}<span class="nparen">)</span><span class="nat">|<span class="nsub"><i>x</i>=${S[1]}</span></span>`;
          case 'sum(': case 'prod(':
            return `<span class="nbigop"><span class="nlim">${S[2]}</span><span class="nsym">${t.T === 'sum(' ? 'Σ' : '∏'}</span><span class="nlim"><i>x</i>=${S[1]}</span></span><span class="nparen">(</span>${S[0]}<span class="nparen">)</span>`;
        }
        return '';
      }
      return row(this.row, [], true);
    }
  }

  const api = { Editor, TPL, linearize, isT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MathEditor = api;
})(typeof window !== 'undefined' ? window : globalThis);
