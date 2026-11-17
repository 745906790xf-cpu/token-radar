// Token Radar dashboard: one static page, zero network.
// Every byte it shows comes from window.RADAR (data.js, written by main.ts
// from the sealed snapshot). Filters, sorting and the detail view all run
// in the page; nothing is fetched.
//
// Deterministic scenes for the screenshots, read from the URL hash:
//   #shot=board                      the full board
//   #shot=detail&slug=<slug>         one protocol's detail view
//   #shot=filter&watchlist=1         watchlist-only view
//   #shot=filter&category=<name>     one category's view
// The page sets window.__shotReady once it has rendered.

(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) {
    document.getElementById('meta').textContent = 'No data: data.js did not load.';
    window.__shotReady = true;
    return;
  }

  var state = { q: '', category: '', chain: '', watchlist: false, minTvl: 0, sort: 'rank', dir: 1, sel: null };

  function $(id) { return document.getElementById(id); }
  function money(n) {
    if (n === null || n === undefined) return '—';
    return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function compact(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    var s = (n > 0 ? '+' : '') + n.toFixed(1) + '%';
    return '<span class="' + (n > 0 ? 'pos' : n < 0 ? 'neg' : '') + '">' + s + '</span>';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function catLabel(c) { return c === null ? 'Uncategorised' : c; }

  // ---- header ------------------------------------------------------------
  $('meta').innerHTML =
    '<b>Snapshot ' + esc(DATA.as_of) + '</b><br>' +
    DATA.watchlist_size + ' watchlist · ' + DATA.board_size + ' rows · ' +
    DATA.early_size + ' early finds<br>' +
    'Watchlist floor ' + money(DATA.floor_usd) + ' · market multiple ' + DATA.global_multiple.toFixed(3);
  $('source-line').textContent = 'Source: ' + DATA.source + ' · Model ' + DATA.model_version +
    ' · Board rows are pre-token protocols only; every row records no token.';

  // ---- filters -----------------------------------------------------------
  var cats = [];
  var chains = [];
  DATA.rows.forEach(function (r) {
    if (cats.indexOf(r.category) < 0) cats.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(function (a, b) { return catLabel(a) < catLabel(b) ? -1 : 1; });
  chains.sort();

  function option(value, label) { return '<option value="' + esc(value) + '">' + esc(label) + '</option>'; }
  $('filters').innerHTML =
    '<div><label for="q">Search</label><input type="search" id="q" placeholder="Name, category or chain" value="' + esc(state.q) + '"></div>' +
    '<div><label for="cat">Category</label><select id="cat"><option value="">All categories</option>' +
    cats.map(function (c) { return option(c === null ? '' : c, catLabel(c)); }).join('') + '</select></div>' +
    '<div><label for="chain">Chain</label><select id="chain"><option value="">All chains</option>' +
    chains.map(function (c) { return option(c, c); }).join('') + '</select></div>' +
    '<div><label for="tvl">Min TVL</label><select id="tvl">' +
    [[0, 'Any TVL'], [5000000, '$5M+'], [20000000, '$20M+'], [50000000, '$50M+'], [100000000, '$100M+'], [500000000, '$500M+']]
      .map(function (t) { return option(String(t[0]), t[1]); }).join('') + '</select></div>' +
    '<label class="check"><input type="checkbox" id="wl"> Watchlist only</label>';

  $('q').addEventListener('input', function () { state.q = this.value; writeHash(); renderBoard(); });
  $('cat').addEventListener('change', function () { state.category = this.value; writeHash(); renderBoard(); });
  $('chain').addEventListener('change', function () { state.chain = this.value; writeHash(); renderBoard(); });
  $('tvl').addEventListener('change', function () { state.minTvl = Number(this.value); writeHash(); renderBoard(); });
  $('wl').addEventListener('change', function () { state.watchlist = this.checked; writeHash(); renderBoard(); });

  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category) p.set('category', state.category);
    if (state.chain) p.set('chain', state.chain);
    if (state.watchlist) p.set('watchlist', '1');
    if (state.minTvl) p.set('minTvl', String(state.minTvl));
    if (state.sel) p.set('slug', state.sel);
    var h = p.toString();
    window.history.replaceState(null, '', h ? '#' + h : window.location.pathname + window.location.search);
  }

  // ---- board -------------------------------------------------------------
  var SORTS = {
    rank: function (a, b) { return a.rank - b.rank; },
    implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
    tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
    change: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
    age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); },
  };

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlist && !r.watchlist) return false;
      if (state.category && (r.category || '') !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (q) {
        var hay = (r.name + ' ' + catLabel(r.category) + ' ' + r.chains.join(' ')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function headerCell(key, label) {
    var arrow = state.sort === key ? (state.dir === 1 ? ' ▲' : ' ▼') : '';
    return '<th class="sortable" data-sort="' + key + '">' + label + arrow + '</th>';
  }

  function renderBoard() {
    var rows = filtered().slice();
    var sortFn = SORTS[state.sort] || SORTS.rank;
    rows.sort(function (a, b) { return sortFn(a, b) * state.dir; });
    var html = '<thead><tr>' +
      headerCell('rank', '#') +
      '<th>Protocol</th><th>Category</th><th>Chains</th>' +
      headerCell('tvl', 'TVL') +
      headerCell('change', '7d') +
      headerCell('age', 'Age') +
      headerCell('implied', 'Implied value') +
      '</tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr data-slug="' + esc(r.slug) + '"' + (state.sel === r.slug ? ' class="sel"' : '') + '>' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><b>' + esc(r.name) + '</b> ' + (r.watchlist ? '<span class="star" title="On the watchlist">★</span>' : '') + '</td>' +
        '<td><span class="pill">' + esc(catLabel(r.category)) + '</span></td>' +
        '<td>' + esc(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</td>' +
        '<td class="num">' + compact(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + (r.age_days === null ? '—' : r.age_days + 'd') + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td></tr>';
    });
    html += '</tbody>';
    $('board').innerHTML = html;
    $('count').textContent = rows.length + ' of ' + DATA.board_size + ' protocols shown · ★ = on the snapshot watchlist · values are this entry\u2019s implied values, not market prices.';
    var heads = $('board').querySelectorAll('th.sortable');
    for (var i = 0; i < heads.length; i++) {
      heads[i].addEventListener('click', function () {
        var k = this.getAttribute('data-sort');
        if (state.sort === k) state.dir = -state.dir;
        else { state.sort = k; state.dir = k === 'rank' ? 1 : 1; }
        renderBoard();
      });
    }
    var trs = $('board').querySelectorAll('tbody tr');
    for (var j = 0; j < trs.length; j++) {
      trs[j].addEventListener('click', function () { select(this.getAttribute('data-slug')); });
    }
  }

  // ---- detail ------------------------------------------------------------
  function select(slug) {
    state.sel = slug;
    writeHash();
    renderBoard();
    renderDetail();
    var panel = $('detail-panel');
    if (panel && panel.scrollIntoView) panel.scrollIntoView({ block: 'nearest' });
  }

  function renderDetail() {
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) {
      if (DATA.rows[i].slug === state.sel) { row = DATA.rows[i]; break; }
    }
    if (!row) {
      $('detail').innerHTML = '<p class="dim">Select any row of the board to see its implied-value arithmetic and its farm plan.</p>';
      return;
    }
    var base = row.tvl_usd * row.category_multiple;
    var steps = row.farm_steps.map(function (s, k) {
      return '<li><b>Step ' + (k + 1) + '.</b> ' + esc(s) + '</li>';
    }).join('');
    $('detail').innerHTML =
      '<div class="detail-head"><h3>' + esc(row.name) + ' ' + (row.watchlist ? '<span class="star">★ watchlist</span>' : '') + '</h3>' +
      '<span class="pill">Rank #' + row.rank + ' · ' + esc(catLabel(row.category)) + ' · ' + esc(row.chains.slice(0, 3).join(', ')) + (row.chains.length > 3 ? ' +' + (row.chains.length - 3) : '') + '</span></div>' +
      '<div class="kv">' +
      '<div><b>' + money(row.implied_value_usd) + '</b><span>Implied value</span></div>' +
      '<div><b>' + money(row.tvl_usd) + '</b><span>TVL</span></div>' +
      '<div><b>' + pct(row.change_7d).replace(/<[^>]+>/g, '') + '</b><span>TVL change, 7 days</span></div>' +
      '<div><b>' + (row.age_days === null ? 'unknown' : row.age_days + ' days') + '</b><span>Since first listed</span></div>' +
      '</div>' +
      '<h3>Model breakdown — model ' + esc(DATA.model_version) + '</h3>' +
      '<div class="table-wrap"><table class="math"><tbody>' +
      '<tr><td>TVL</td><td>' + money(row.tvl_usd) + '</td></tr>' +
      '<tr><td>× Category multiple (' + esc(catLabel(row.category)) + ', median of ' + row.category_sample + ' trading protocols' + (row.category_sample < 3 ? ' — fallback to market median' : '') + ')</td><td>× ' + row.category_multiple.toFixed(3) + '</td></tr>' +
      '<tr><td>= Base value</td><td>= ' + money(base) + '</td></tr>' +
      '<tr><td>× Growth multiplier (7d ' + (row.change_7d === null ? 'unreported' : row.change_7d.toFixed(1) + '%') + ')</td><td>× ' + row.growth_multiplier.toFixed(3) + '</td></tr>' +
      '<tr><td>× Maturity multiplier (' + (row.age_days === null ? 'age unknown, scored at 365 days' : row.age_days + ' days listed') + ')</td><td>× ' + row.maturity_multiplier.toFixed(3) + '</td></tr>' +
      '<tr><td>× Chain multiplier (' + row.chains.length + ' chain' + (row.chains.length === 1 ? '' : 's') + ')</td><td>× ' + row.chain_multiplier.toFixed(3) + '</td></tr>' +
      '<tr><td><b>= Implied value</b> — this entry\u2019s claim, never make.fun\u2019s</td><td><b>' + money(row.implied_value_usd) + '</b></td></tr>' +
      '</tbody></table></div>' +
      '<p class="dim">This protocol records no token. That is what the snapshot says — not a promise that no token exists, and not a prediction that one will be issued.</p>' +
      '<h3>Farm plan</h3><ol class="steps">' + steps + '</ol>';
  }

  // ---- methodology multiples ---------------------------------------------
  (function () {
    var html = '<thead><tr><th>Category</th><th>Multiple (mcap / TVL)</th><th>Trading protocols</th><th>Basis</th></tr></thead><tbody>';
    DATA.multiples.forEach(function (m) {
      html += '<tr><td>' + esc(m.category) + '</td><td class="num">' + m.multiple.toFixed(3) + '×</td>' +
        '<td class="num">' + m.sample + '</td><td>' + (m.fallback ? 'Market median (thin sample)' : 'Category median') + '</td></tr>';
    });
    html += '</tbody>';
    $('multiples').innerHTML = html;
  })();

  // ---- live table ----------------------------------------------------------
  (function () {
    var html = '<thead><tr><th>Protocol</th><th>Category</th><th>Chains</th><th>TVL</th><th>Market cap</th><th>mcap / TVL</th></tr></thead><tbody>';
    DATA.live.forEach(function (p) {
      var ratio = p.mcap_usd && p.tvl_usd ? (p.mcap_usd / p.tvl_usd).toFixed(2) + '×' : '—';
      html += '<tr><td><b>' + esc(p.name) + '</b></td><td><span class="pill">' + esc(catLabel(p.category)) + '</span></td>' +
        '<td>' + esc(p.chains.slice(0, 2).join(', ')) + '</td>' +
        '<td class="num">' + compact(p.tvl_usd) + '</td>' +
        '<td class="num">' + compact(p.mcap_usd) + '</td>' +
        '<td class="num">' + ratio + '</td></tr>';
    });
    html += '</tbody>';
    $('live').innerHTML = html;
  })();

  // ---- scenes from the hash --------------------------------------------------
  (function () {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var p = new URLSearchParams(hash);
    if (p.get('shot') === 'detail' && p.get('slug')) state.sel = p.get('slug');
    if (p.get('shot') === 'filter') {
      if (p.get('watchlist') === '1') state.watchlist = true;
      if (p.get('category')) state.category = p.get('category');
    }
    if (p.get('q')) state.q = p.get('q');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('watchlist') === '1') state.watchlist = true;
    if (p.get('minTvl')) state.minTvl = Number(p.get('minTvl'));
    if (p.get('slug')) state.sel = p.get('slug');
    // Reflect the scene in the filter controls.
    var q = $('q'); if (q) q.value = state.q;
    var c = $('cat'); if (c) c.value = state.category || '';
    var ch = $('chain'); if (ch) ch.value = state.chain || '';
    var t = $('tvl'); if (t) t.value = String(state.minTvl);
    var w = $('wl'); if (w) w.checked = state.watchlist;
  })();

  renderBoard();
  renderDetail();
  window.__shotReady = true;
})();
