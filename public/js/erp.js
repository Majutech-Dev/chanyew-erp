'use strict';
// Generic ERP master–detail screen (erp-screen-layout): toolbar with New F4 / Edit F5 / Cancel-record F6 and a
// record navigator, Search as the first tab, records read-only until Edit, child grids with their own toolbar.

// def.groupByStatus: the search list is grouped by status in def.statuses order and the status segment jumps to a
// group instead of filtering (filter by status with a normal filter instead).
const PAGE_SIZES = [['25', '25'], ['50', '50'], ['100', '100'], ['all', 'All']];

function erpScreen(def) {
  const R = def.route;
  const st = () => (ui[R] ||= { selected: null, tab: 'main', edit: null, page: 0, filter: { ...(def.defaultFilter || {}) } });

  function filtered() {
    const f = st().filter;
    let list = def.list().filter(r => (def.filters || []).every(x => !f[x.k] || x.match(r, f[x.k], f)));
    if (f.status && !def.groupByStatus) list = list.filter(r => def.status(r) === f.status);
    const sort = (def.sorts || []).find(s => s[0] === f.sort) || (def.sorts || [])[0];
    list = sort ? [...list].sort(sort[2]) : list;
    if (def.groupByStatus) { const order = def.statuses; list.sort((a, b) => order.indexOf(def.status(a)) - order.indexOf(def.status(b))); }
    return list;
  }

  VIEWS[R] = (el, sub) => {
    const s = st();
    const isNew = sub === 'new', isSearch = !sub;
    if (sub && !isNew) s.selected = sub;
    if (isNew) s.edit = 'new'; else if (isSearch || s.edit !== sub) s.edit = null;
    const rec = isNew ? null : def.list().find(r => r.id === s.selected) || null;
    if (sub && !isNew && !rec) { el.innerHTML = `<div class="erp"><div class="erp-body"><div class="alert warn">Record not found or not in your branch. <a href="#/${R}">Back to search</a></div></div></div>`; return; }
    const editing = isNew || (rec && s.edit === rec.id);
    const tabs = def.tabs;
    let tab = isSearch ? 'search' : isNew ? 'main' : s.tab;
    if (tab !== 'search' && !tabs.some(t => t[0] === tab)) tab = 'main';

    el.innerHTML = `<div class="erp"><div class="erp-head">
        <div class="erp-toolbar" id="tb"></div>
        <div class="erp-tabs">
          <button data-tab="search" class="${tab === 'search' ? 'on' : ''}" ${editing ? 'disabled title="Save or cancel first"' : ''}>🔍 Search</button>
          ${tabs.map(([k, l, cnt]) => {
            const c = rec && cnt ? cnt(rec) : '';
            const dis = isNew ? k !== 'main' : !rec || (editing && k !== tab);
            return `<button data-tab="${k}" class="${tab === k ? 'on' : ''}" ${dis ? 'disabled' : ''}>${l}${c ? ` <span class="cnt">${c}</span>` : ''}</button>`; }).join('')}
          <span class="erp-tabs-meta">${rec && !isSearch ? `<b class="mono">${esc(def.ref(rec))}</b><button type="button" class="copy-btn inline" data-copy="${esc(def.ref(rec))}" title="Copy">⧉</button> ${def.badge ? def.badge(rec) : badge(def.status(rec))}`
            : isNew ? `<b>New ${esc(def.noun)}</b>` : `<b>${esc(def.title)}</b>`}</span>
        </div></div><div class="erp-body" id="body"></div></div>`;

    $$('.erp-tabs [data-tab]', el).forEach(b => b.onclick = () => {
      if (b.dataset.tab === 'search') { location.hash = `#/${R}`; return; }
      s.tab = b.dataset.tab; if (rec) { if (location.hash === `#/${R}/${rec.id}`) route(); else location.hash = `#/${R}/${rec.id}`; }
    });

    const T = (cmd, label, key, why = '', cls = '') =>
      `<button class="btn ${cls}" data-cmd="${cmd}" ${why ? `disabled title="${esc(why)}"` : ''}>${label}${key ? ` <kbd>${key}</kbd>` : ''}</button>`;
    const drawToolbar = () => {
      const r = isNew ? null : def.list().find(x => x.id === s.selected);
      const newWhy = editing ? 'Save or cancel first' : def.newWhy ? def.newWhy() : '';
      const editWhy = !r ? 'Select a record first' : editing ? 'Already editing' : def.main.canEdit ? def.main.canEdit(r) : '';
      const vc = def.voidCmd;
      let html = T('new', '+ New', 'F4', newWhy) + T('edit', '✎ Edit', 'F5', editWhy)
        + (vc ? T('void', vc.label, 'F6', !r ? 'Select a record first' : editing ? 'Save or cancel first' : vc.why(r)) : '');
      if (editing) html += `<span class="sep"></span>${T('save', '💾 Save', '', '', 'primary')}${T('cancel', '✕ Cancel', '')}`;
      const acts = r && !editing && def.actions ? def.actions(r) : [];
      if (acts.length) html += `<span class="sep"></span>` + acts.map((a, i) => `<button class="btn ${a.cls || ''}" data-act="${i}" ${a.why ? `disabled title="${esc(a.why)}"` : ''}>${a.label}</button>`).join('');
      const list = filtered(), i = r ? list.findIndex(x => x.id === r.id) : -1;
      const nav = (k, l, ok) => `<button class="btn icon" data-nav="${k}" ${ok ? '' : 'disabled'}>${l}</button>`;
      html += `<div class="grow"></div><div class="erp-nav">${nav('first', '⏮', i > 0)}${nav('prev', '◀', i > 0)}
        <span>${r ? `${esc(def.ref(r))} · ${i >= 0 ? i + 1 : '–'} of ${list.length}` : `${list.length} record(s)`}</span>${nav('next', '▶', i >= 0 && i < list.length - 1)}${nav('last', '⏭', i >= 0 && i < list.length - 1)}</div>`;
      const tb = $('#tb', el); tb.innerHTML = html;
      $$('[data-cmd]', tb).forEach(b => b.onclick = () => {
        const c = b.dataset.cmd;
        if (c === 'new') { if (def.onNew) def.onNew(); else location.hash = `#/${R}/new`; }
        if (c === 'edit') { s.edit = r.id; s.tab = 'main'; if (location.hash !== `#/${R}/${r.id}`) location.hash = `#/${R}/${r.id}`; else route(); }
        if (c === 'save') $('#page', el)?.requestSubmit();
        if (c === 'cancel') { s.edit = null; if (isNew) location.hash = `#/${R}`; else route(); }
        if (c === 'void') vc.run(r);
      });
      $$('[data-act]', tb).forEach(b => b.onclick = () => acts[b.dataset.act].run(r));
      $$('[data-nav]', tb).forEach(b => b.onclick = () => {
        const j = { first: 0, prev: i - 1, next: i + 1, last: list.length - 1 }[b.dataset.nav];
        const t = list[j]; if (!t) return;
        s.selected = t.id; location.hash = isSearch ? `#/${R}/${t.id}` : `#/${R}/${t.id}`;
      });
    };
    s.drawToolbar = drawToolbar; drawToolbar();

    const body = $('#body', el);
    if (tab === 'search') return renderSearch(body);
    if (tab === 'main') return renderMain(body, rec, editing, isNew);
    if (tab === 'history') return renderHistory(body, rec);
    def.renderTab[tab](body, rec);
  };

  function renderSearch(body) {
    const s = st(), f = s.filter, G = def.groupByStatus, B = def.bulk, ncol = def.columns.length + (B ? 2 : 1);
    const ticked = s.ticked ||= new Set();
    const drawSeg = list => {
      // grouped: counts follow the filters, so they always match the list below
      const src = G ? list : def.list();
      const counts = {}; src.forEach(r => { const k = def.status(r); counts[k] = (counts[k] || 0) + 1; });
      const statuses = (def.statuses || []).filter(x => G || counts[x] || (def.alwaysShow || []).includes(x));
      const cur = G ? f.stage || '' : f.status || '';
      $('#seg', body).innerHTML = statuses.length ? [['', 'All', src.length], ...statuses.map(x => [x, x, counts[x] || 0])]
        .map(([v, l, n]) => `<button type="button" data-st="${esc(v)}" class="${cur === v ? 'on' : ''}" ${G && v && !n ? 'disabled' : ''} ${G && v ? `title="Jump to ${esc(l)}"` : ''}>${esc(l)} <span>${n}</span></button>`).join('') : '';
      $$('[data-st]', body).forEach(b => b.onclick = () => {
        const v = b.dataset.st;
        if (!G) { f.status = v; s.page = 0; return route(); }
        if (!v) { if (f.stage) { f.stage = ''; s.page = 0; return route(); } $('.grid-wrap', body).scrollTop = 0; return; }
        jump(v);
      });
    };
    const jump = v => {
      const list = filtered(), size = pageSize(), k = list.findIndex(r => def.status(r) === v);
      if (k < 0) return;
      if (size && Math.floor(k / size) !== s.page) { s.page = Math.floor(k / size); draw(); }
      const tr = $(`tr.grp[data-grp="${CSS.escape(v)}"]`, body); if (!tr) return;
      const wrap = tr.closest('.grid-wrap');
      wrap.scrollTop = tr.offsetTop - $('thead', wrap).offsetHeight;
      // the grid scrolls on its own; move the page only if the grid is out of sight, so the stage chips stay usable
      const r = wrap.getBoundingClientRect();
      if (r.top > innerHeight - 120 || r.bottom < $('.erp-head').getBoundingClientRect().bottom + 60) wrap.scrollIntoView({ block: 'start' });
      tr.classList.remove('flash'); void tr.offsetWidth; tr.classList.add('flash');
    };
    const pageSize = () => { const v = f.pageSize || def.pageSize || '50'; return v === 'all' ? 0 : Number(v); };
    body.innerHTML = `${def.statuses ? '<div class="seg" id="seg"></div>' : ''}
      <form class="filters" id="filters" autocomplete="off"><div class="grid3">
        ${(def.filters || []).filter(x => !x.show || x.show()).map(x => fld('opt', x.label, x.type === 'select' ? sel(x.k, x.options(), f[x.k]) : inp(x.k, f[x.k] || '', x.type || 'text', false, x.ph ? `placeholder="${esc(x.ph)}"` : ''), x.cls || '')).join('')}
        ${def.sorts ? fld('opt', 'Sort', sel('sort', def.sorts.map(([k, l]) => [k, l]), f.sort)) : ''}
      </div><div class="filter-foot"><span id="count"></span>
        <label class="page-size">Show ${sel('pageSize', PAGE_SIZES, f.pageSize || def.pageSize || '50')} entries</label><span id="pager"></span>
        <span class="grow"></span>${(def.searchButtons || []).map((b, i) => `<button type="button" class="btn" data-sb="${i}">${b.label}</button>`).join('')}
        <button type="button" class="btn" id="clear">Clear filters</button></div></form>
      ${B ? '<div class="bulk-bar" id="bulk" hidden></div>' : ''}
      <div class="grid-wrap"><table class="grid"><thead><tr><th class="sel"></th>${B ? '<th class="chk"><input type="checkbox" data-all title="Tick all on this page"></th>' : ''}${def.columns.map(([l, , c]) => `<th class="${c || ''}">${esc(l)}</th>`).join('')}</tr></thead><tbody id="rows"></tbody></table></div>
      <p class="hint">Click a row to select it · double-click (or Enter) to open · F4 new · F5 edit${G ? ' · click a stage above to jump to it' : ''}</p>`;
    const draw = () => {
      const list = filtered(), size = pageSize(), pages = size ? Math.max(1, Math.ceil(list.length / size)) : 1;
      s.page = Math.min(s.page || 0, pages - 1);
      const from = size ? s.page * size : 0, shown = size ? list.slice(from, from + size) : list;
      if (def.statuses) drawSeg(list);
      $('#count', body).textContent = list.length > shown.length ? `Showing ${from + 1}–${from + shown.length} of ${list.length} record(s)` : `${list.length} record(s) found`;
      $('#pager', body).innerHTML = pages > 1 ? `<button type="button" class="btn sm icon" data-pg="-1" ${s.page ? '' : 'disabled'}>◀</button> Page ${s.page + 1} of ${pages} <button type="button" class="btn sm icon" data-pg="1" ${s.page < pages - 1 ? '' : 'disabled'}>▶</button>` : '';
      $$('[data-pg]', body).forEach(b => b.onclick = () => { s.page += Number(b.dataset.pg); draw(); $('.grid-wrap', body).scrollTop = 0; });
      const groupRow = (r, i) => {
        const v = def.status(r);
        if (!G || (i && def.status(shown[i - 1]) === v)) return '';
        const n = list.filter(x => def.status(x) === v).length;
        const all = B && list.filter(x => def.status(x) === v).every(x => ticked.has(x.id));
        return `<tr class="grp" data-grp="${esc(v)}"><td colspan="${ncol}">${B ? `<input type="checkbox" data-gchk="${esc(v)}" ${all ? 'checked' : ''} title="Tick all ${esc(v)}"> ` : ''}${badge(v)} <b>${n}</b> ${n === 1 ? 'entry' : 'entries'}${i === 0 && from && def.status(list[from - 1]) === v ? ' <span class="muted">(continued)</span>' : ''}</td></tr>`;
      };
      $('#rows', body).innerHTML = shown.length ? shown.map((r, i) => groupRow(r, i) + `<tr data-row="${r.id}" tabindex="0" class="${r.id === s.selected ? 'selected' : ''}"><td class="sel">${r.id === s.selected ? '▶' : ''}</td>${B ? `<td class="chk"><input type="checkbox" data-chk="${r.id}" ${ticked.has(r.id) ? 'checked' : ''}></td>` : ''}${def.columns.map(([, fn, c]) => `<td class="${c || ''}">${fn(r)}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${ncol}" class="empty">No records match these filters.</td></tr>`;
      if (B) {
        // ticks only count for rows that still match the filters
        for (const id of [...ticked]) if (!list.some(r => r.id === id)) ticked.delete(id);
        const rows = list.filter(r => ticked.has(r.id)), bar = $('#bulk', body);
        bar.hidden = !rows.length;
        bar.innerHTML = rows.length ? `<b>${rows.length}</b> ticked${rows.length > shown.filter(r => ticked.has(r.id)).length ? ' <span class="muted">(incl. other pages)</span>' : ''}<span class="sep"></span>
          ${B.map((a, k) => { const why = a.why?.(rows) || ''; return `<button type="button" class="btn sm ${a.cls || ''}" data-bulk="${k}" ${why ? `disabled title="${esc(why)}"` : ''}>${a.label}</button>`; }).join('')}
          <button type="button" class="btn sm" data-untick>✕ Clear ticks</button>` : '';
        $$('[data-bulk]', bar).forEach(b => b.onclick = () => B[b.dataset.bulk].run(rows));
        $('[data-untick]', bar)?.addEventListener('click', () => { ticked.clear(); draw(); });
        const hdr = $('[data-all]', body); hdr.checked = shown.length > 0 && shown.every(r => ticked.has(r.id));
        hdr.onchange = () => { shown.forEach(r => hdr.checked ? ticked.add(r.id) : ticked.delete(r.id)); draw(); };
        $$('[data-chk]', body).forEach(c => c.onchange = () => { c.checked ? ticked.add(c.dataset.chk) : ticked.delete(c.dataset.chk); draw(); });
        $$('[data-gchk]', body).forEach(c => c.onchange = () => { list.filter(r => def.status(r) === c.dataset.gchk).forEach(r => c.checked ? ticked.add(r.id) : ticked.delete(r.id)); draw(); });
      }
      $$('tr[data-row]', body).forEach(tr => {
        tr.onclick = e => { if (e.target.matches('input')) return; s.selected = tr.dataset.row; $$('tr[data-row]', body).forEach(x => { x.classList.toggle('selected', x === tr); x.firstElementChild.textContent = x === tr ? '▶' : ''; }); s.drawToolbar(); };
        tr.ondblclick = e => { if (e?.target.matches('input')) return; s.tab = 'main'; location.hash = `#/${R}/${tr.dataset.row}`; };
        tr.onkeydown = e => { if (e.key === 'Enter') tr.ondblclick(); };
      });
      s.drawToolbar();
    };
    const form = $('#filters', body);
    form.oninput = form.onchange = () => { Object.assign(f, Object.fromEntries(new FormData(form))); s.page = 0; draw(); };
    $('#clear', body).onclick = () => { s.filter = { ...(def.defaultFilter || {}) }; s.page = 0; route(); };
    $$('[data-sb]', body).forEach(b => b.onclick = () => def.searchButtons[b.dataset.sb].run(filtered()));
    draw();
  }

  function renderMain(body, r, editing, isNew) {
    const m = def.main;
    const lock = r && m.lockNote ? m.lockNote(r) : '';
    body.innerHTML = `${editing ? (isNew ? `<div class="alert info">New ${esc(def.noun)} – fill the blue fields, then <b>Save</b>.</div>` : '') : '<div class="alert info">Read-only view — press <b>Edit (F5)</b> to change this record.</div>'}
      ${lock ? `<div class="alert ${editing ? 'warn' : 'info'}">🔒 ${lock}</div>` : ''}<div id="msgs"></div>
      <form id="page" autocomplete="off">${m.render(r, editing, isNew)}</form>`;
    const form = $('#page', body);
    const compute = () => {
      const out = m.compute ? m.compute(form, r, isNew) : { errors: [], warnings: [], sys: {} };
      $$('[data-sys]', form).forEach(i => { const v = out.sys?.[i.dataset.sys]; i.value = v ?? ''; });
      $('#msgs', body).innerHTML = editing ? [...(out.errors || []).map(e => `<div class="alert error">${esc(e)}</div>`), ...(out.warnings || []).map(w => `<div class="alert warn">${esc(w)}</div>`)].join('') : '';
      const sv = $('.erp-toolbar [data-cmd="save"]'); if (sv) { sv.disabled = !!(out.errors || []).length; sv.title = sv.disabled ? out.errors[0] : ''; }
      return out;
    };
    form.oninput = form.onchange = compute; compute();
    m.after?.(form, r, editing);
    form.onsubmit = async e => {
      e.preventDefault();
      if (!editing) return;
      const { errors = [] } = compute();
      if (errors.length) return toast(errors[0], 'error');
      try {
        const saved = await m.save(Object.fromEntries(new FormData(form)), r, isNew, form);
        st().edit = null; st().selected = saved.id; toast('Saved');
        if (location.hash === `#/${R}/${saved.id}`) route(); else location.hash = `#/${R}/${saved.id}`;
      } catch { /* toast already shown */ }
    };
  }

  function renderHistory(body, r) {
    const h = [...(r.history || [])].reverse();
    body.innerHTML = `<div class="grid-wrap"><table class="grid"><thead><tr><th>When</th><th>By</th><th>What</th></tr></thead><tbody>
      ${h.map(x => `<tr><td>${fmtDT(x.at)}</td><td>${esc(x.by)}</td><td class="wrap">${esc(x.action)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">No history yet.</td></tr>'}</tbody></table></div>`;
  }

  return def;
}

// Child grid with its own toolbar, ▶ selector column, checkbox column and highlighted current row.
function childGrid(host, o) {
  const g = (ui.grids ||= {})[o.key] ||= { cur: null, checked: new Set() };
  const rows = o.rows;
  if (!rows.some(r => r.id === g.cur)) g.cur = rows[0]?.id || null;
  for (const id of [...g.checked]) if (!rows.some(r => r.id === id)) g.checked.delete(id);
  const draw = () => {
    const cur = rows.find(r => r.id === g.cur), i = rows.indexOf(cur);
    const checked = rows.filter(r => g.checked.has(r.id));
    host.innerHTML = `${o.kpis || ''}<div class="grid-box"><div class="grid-toolbar">
        ${o.title ? `<b class="gt-title">${esc(o.title)}</b><span class="sep"></span>` : ''}
        ${(o.toolbar || []).map((b, k) => { const why = typeof b.why === 'function' ? b.why(cur, checked) : b.why || (b.needRow && !cur ? 'Select a row first' : '') || (b.needChecked && !checked.length ? 'Tick one or more rows first' : '');
          return `<button type="button" class="btn sm ${b.cls || ''}" data-gb="${k}" ${why ? `disabled title="${esc(why)}"` : ''}>${b.label}</button>`; }).join('')}
        <span class="grow"></span>
        <button type="button" class="btn sm icon" data-gn="-1" ${i > 0 ? '' : 'disabled'}>◀</button><span class="gt-pos">${rows.length ? `${i + 1} of ${rows.length}` : '0 rows'}</span>
        <button type="button" class="btn sm icon" data-gn="1" ${i >= 0 && i < rows.length - 1 ? '' : 'disabled'}>▶</button>
        <button type="button" class="btn sm icon" data-refresh title="Refresh">⟳</button></div>
      <div class="grid-wrap"><table class="grid"><thead><tr><th class="sel"></th>${o.checkbox ? `<th class="chk"><input type="checkbox" data-all ${rows.length && checked.length === rows.length ? 'checked' : ''}></th>` : ''}
        ${o.cols.map(([l, , c]) => `<th class="${c || ''}">${esc(l)}</th>`).join('')}</tr></thead><tbody>
        ${rows.map(r => `<tr data-row="${r.id}" class="${r.id === g.cur ? 'selected' : ''} ${o.rowClass ? o.rowClass(r) : ''}"><td class="sel">${r.id === g.cur ? '▶' : ''}</td>
          ${o.checkbox ? `<td class="chk"><input type="checkbox" data-chk="${r.id}" ${g.checked.has(r.id) ? 'checked' : ''}></td>` : ''}
          ${o.cols.map(([, fn, c]) => `<td class="${c || ''}">${fn(r)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${o.cols.length + 2}" class="empty">${o.empty || 'No rows.'}</td></tr>`}
        </tbody>${o.foot ? `<tfoot>${o.foot}</tfoot>` : ''}</table></div></div>`;
    $$('[data-gb]', host).forEach(b => b.onclick = () => o.toolbar[b.dataset.gb].run(cur, checked));
    $$('[data-gn]', host).forEach(b => b.onclick = () => { g.cur = rows[i + Number(b.dataset.gn)].id; draw(); });
    $('[data-refresh]', host).onclick = () => loadState().then(route);
    $$('tr[data-row]', host).forEach(tr => {
      tr.onclick = e => { if (e.target.matches('input,a,button')) return; g.cur = tr.dataset.row; draw(); };
      tr.ondblclick = e => { if (e.target.matches('input')) return; o.onOpen?.(rows.find(r => r.id === tr.dataset.row)); };
    });
    $$('[data-chk]', host).forEach(c => c.onchange = () => { c.checked ? g.checked.add(c.dataset.chk) : g.checked.delete(c.dataset.chk); draw(); });
    const all = $('[data-all]', host); if (all) all.onchange = () => { rows.forEach(r => all.checked ? g.checked.add(r.id) : g.checked.delete(r.id)); draw(); };
  };
  draw();
}
