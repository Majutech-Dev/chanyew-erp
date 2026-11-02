'use strict';
// App shell, dashboard, settings and printable documents.

// ---------- Dashboard ----------
VIEWS[''] = el => {
  const C = S.C, T = S.data.today, y = Number(T.slice(0, 4)), month = T.slice(0, 7);
  const wos = scoped('workOrders'), invs = scoped('invoices').filter(i => i.status !== 'Void');
  const open = wos.filter(w => !C.CLOSED_STAGES.includes(w.stage));
  const late = open.filter(w => w.estDate < T), follow = wos.filter(followUpDue), bill = wos.filter(w => C.CLOSED_STAGES.includes(w.stage) && !w.invoiceId);
  const sgd = (list, f) => list.reduce((a, i) => a + toSgd(f(i), i.currency), 0);
  const branches = S.data.branches.filter(b => (isSuper() || b.id === me().branchId) && (!S.scope || b.id === S.scope));
  const techs = S.data.staff.filter(s => s.isTechnician && s.status === 'Active' && inScope(s));
  const pendLeave = scoped('leaves').filter(l => l.status === 'Pending');
  const go = (route, filter) => { (ui[route] ||= { selected: null, tab: 'main', edit: null, filter: {} }).filter = filter; location.hash = '#/' + route; };
  window.__go = go;
  window.__newIv = (customerId, branchId) => { location.hash = '#/invoices'; setTimeout(() => newInvoiceDialog({ customerId, branchId }), 30); };
  const openStages = C.STAGES.filter(s => !C.CLOSED_STAGES.includes(s));

  el.innerHTML = `<div class="dash">
    <div class="dash-head"><h1>${isSuper() && !S.scope ? 'Group overview' : `${esc(branches[0]?.name || '')} overview`}</h1><span class="muted">${fmtDate(T)} · amounts in SGD at the set-up rates (MYR ${S.data.settings.fxToSgd.MYR}, THB ${S.data.settings.fxToSgd.THB})</span></div>
    <div class="kpis big">
      <a class="kpi" href="javascript:__go('work-orders',{flag:'open'})"><span>Open work orders</span><b>${open.length}</b></a>
      <a class="kpi ${late.length ? 'danger' : 'ok'}" href="javascript:__go('work-orders',{flag:'late'})"><span>Past est. date</span><b>${late.length}</b></a>
      <a class="kpi ${follow.length ? 'warn' : 'ok'}" href="javascript:__go('work-orders',{flag:'follow'})"><span>Follow-up due (${S.data.settings.followUpDays}+ days)</span><b>${follow.length}</b></a>
      <a class="kpi info" href="javascript:__newIv()"><span>Ready to invoice</span><b>${bill.length}</b></a>
      <div class="kpi"><span>Invoiced ${MONTHS[Number(month.slice(5)) - 1]} (SGD)</span><b>${money(sgd(invs.filter(i => i.date.startsWith(month)), i => i.total))}</b></div>
      <div class="kpi"><span>Invoiced ${y} YTD (SGD)</span><b>${money(sgd(invs.filter(i => i.date.startsWith(String(y))), i => i.total))}</b></div>
      <a class="kpi warn" href="javascript:__go('invoices',{})"><span>Outstanding (SGD)</span><b>${money(sgd(invs, invBalance))}</b></a>
      <a class="kpi ${invs.some(invOverdue) ? 'danger' : 'ok'}" href="javascript:__go('invoices',{status:'Overdue'})"><span>Overdue (SGD)</span><b>${money(sgd(invs.filter(invOverdue), invBalance))}</b></a>
    </div>
    <div class="dash-grid">
      <section class="panel wide"><h2>Workshop pipeline</h2><div class="grid-wrap"><table class="grid"><thead><tr><th>Branch</th>${openStages.map(s => `<th class="num">${esc(s)}</th>`).join('')}<th class="num">Open</th></tr></thead><tbody>
        ${branches.map(b => `<tr><td><b>${b.id}</b> ${esc(b.name)}</td>${openStages.map(s => { const n = open.filter(w => w.branchId === b.id && w.stage === s).length;
          return `<td class="num">${n ? `<a href="javascript:__go('work-orders',{stage:'${s}',branchId:'${isSuper() ? b.id : ''}'})">${n}</a>` : '<span class="muted">·</span>'}</td>`; }).join('')}<td class="num"><b>${open.filter(w => w.branchId === b.id).length}</b></td></tr>`).join('')}
      </tbody></table></div></section>
      <section class="panel"><h2>Revenue by branch</h2><div class="grid-wrap"><table class="grid"><thead><tr><th>Branch</th><th class="num">This month</th><th class="num">${y} YTD</th><th class="num">YTD (SGD)</th><th class="num">Outstanding</th></tr></thead><tbody>
        ${branches.map(b => { const bi = invs.filter(i => i.branchId === b.id); const ytd = bi.filter(i => i.date.startsWith(String(y))).reduce((a, i) => a + i.total, 0);
          return `<tr><td><b>${b.id}</b></td><td class="num">${money(bi.filter(i => i.date.startsWith(month)).reduce((a, i) => a + i.total, 0), b.currency)}</td><td class="num">${money(ytd, b.currency)}</td><td class="num">${money(toSgd(ytd, b.currency))}</td><td class="num">${money(bi.reduce((a, i) => a + invBalance(i), 0), b.currency)}</td></tr>`; }).join('')}
      </tbody></table></div></section>
      <section class="panel"><h2>Technician workload</h2><div class="grid-wrap"><table class="grid"><thead><tr><th>Technician</th><th>Br.</th><th class="num">Open</th><th class="num">Late</th><th class="num">${y} YTD</th><th class="num">${y - 1} same period</th><th class="num">Δ</th><th class="num">${y - 1} full year</th><th></th></tr></thead><tbody>
        ${techs.map(t => { const o = open.filter(w => w.technicianId === t.id); const a = minutesBy(t.id, y), b = minutesBy(t.id, y - 1, T.slice(5)), full = minutesBy(t.id, y - 1);
          return `<tr><td><a href="#/staff/${t.id}">${esc(t.name)}</a></td><td>${t.branchId}</td><td class="num">${o.length}</td><td class="num ${o.some(w => w.estDate < T) ? 'late' : ''}">${o.filter(w => w.estDate < T).length}</td>
            <td class="num">${hm(a)}</td><td class="num">${hm(b)}</td><td class="num">${b ? (a >= b ? '+' : '') + Math.round((a - b) / b * 100) + '%' : '—'}</td><td class="num">${hm(full)}</td><td>${onLeaveToday(t.id) ? badge('On leave', 'warn') : ''}</td></tr>`; }).join('')}
      </tbody></table></div><p class="hint">Hours come from the work-order time logs (replacing the paper logbook) and compare the same period year on year, for appraisals.</p></section>
      <section class="panel"><h2>Follow-up due</h2>${follow.length ? `<div class="grid-wrap"><table class="grid"><thead><tr><th>WO no.</th><th>Customer</th><th>Stage</th><th class="num">Days</th></tr></thead><tbody>
        ${follow.map(w => `<tr><td>${refLink('work-orders', w.id, w.ref)}</td><td>${custLink(w.customerId)}</td><td>${badge(w.stage)}</td><td class="num">${daysBetween(w.lastContactAt.slice(0, 10), T)}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="empty">Nothing waiting for a follow-up.</p>'}</section>
      <section class="panel"><h2>Ready to invoice</h2>${bill.length ? `<div class="grid-wrap"><table class="grid"><thead><tr><th>Customer</th><th>Br.</th><th class="num">Items</th><th class="num">Amount</th></tr></thead><tbody>
        ${Object.values(bill.reduce((g, w) => { const k = w.customerId + w.branchId; (g[k] ||= { w, n: 0, amt: 0 }); g[k].n++; g[k].amt += w.stage === 'Cancelled' ? 0 : w.unitPrice; return g; }, {}))
          .map(g => `<tr><td><a href="javascript:__newIv('${g.w.customerId}','${g.w.branchId}')" title="New invoice for this customer">${custLink(g.w.customerId)}</a></td><td>${g.w.branchId}</td><td class="num">${g.n}</td><td class="num">${money(g.amt, branch(g.w.branchId).currency)}</td></tr>`).join('')}</tbody></table></div><p class="hint">Click a customer to create the invoice.</p>`
        : '<p class="empty">No completed items waiting for an invoice.</p>'}</section>
      <section class="panel"><h2>Leave awaiting approval</h2>${pendLeave.length ? `<div class="grid-wrap"><table class="grid"><thead><tr><th>Ref</th><th>Staff</th><th>Dates</th><th class="num">Days</th></tr></thead><tbody>
        ${pendLeave.map(l => `<tr><td>${refLink('leave', l.id, l.ref)}</td><td>${esc(staffName(l.staffId))}</td><td>${fmtDate(l.from)} – ${fmtDate(l.to)}</td><td class="num">${l.days}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="empty">No pending applications.</p>'}</section>
    </div></div>`;
};

// ---------- Settings: rates, follow-up, WhatsApp demo sink, audit ----------
VIEWS.settings = el => {
  const s = S.data.settings, ed = isSuper();
  el.innerHTML = `<div class="erp"><div class="erp-head"><div class="erp-toolbar">${ed ? '<button class="btn primary" id="sv">💾 Save settings</button>' : '<span class="muted">Only a Super Admin can change settings.</span>'}</div>
      <div class="erp-tabs"><button class="on">Settings</button><button data-go="branches">Branches</button><button data-go="glossary">Repair glossary</button><span class="erp-tabs-meta"><b>Set-up</b></span></div></div><div class="erp-body">
    <form id="sf">${section('Currency (indicative group consolidation)', sysF('SGD', 'sgd') + fld('req', '1 MYR = SGD', inp('fx_MYR', s.fxToSgd.MYR, 'number', !ed, 'step="0.0001"')) + fld('req', '1 THB = SGD', inp('fx_THB', s.fxToSgd.THB, 'number', !ed, 'step="0.0001"')))}
      ${section('Collection follow-up', fld('req', 'Follow up after (days)', inp('followUpDays', s.followUpDays, 'number', !ed, 'min="1" max="60"')) + sysF('Applies to', 'ap', 'span2'))}</form>
    <section class="form-section"><div class="head"><h3>WhatsApp outbox – demo sink (nothing is sent)</h3></div><div class="body"><div class="grid-wrap tall"><table class="grid"><thead><tr><th>When</th><th>Br.</th><th>WO no.</th><th>To</th><th>Type</th><th>Message</th><th>Status</th></tr></thead><tbody>
      ${[...S.data.outbox].reverse().map(m => `<tr><td>${fmtDT(m.at)}</td><td>${m.branchId}</td><td>${refLink('work-orders', m.woId, m.ref)}</td><td>${esc(m.to)}</td><td>${esc(m.kind)}</td><td class="wrap">${esc(m.text)}</td><td><span class="badge gray">${esc(m.status)}</span></td></tr>`).join('') || '<tr><td colspan="7" class="empty">No messages yet.</td></tr>'}</tbody></table></div></div></section>
    ${ed ? `<section class="form-section"><div class="head"><h3>Audit trail (latest 300)</h3></div><div class="body"><div class="grid-wrap tall"><table class="grid"><thead><tr><th>When</th><th>By</th><th>Action</th><th>Ref</th><th>Detail</th></tr></thead><tbody>
      ${[...S.data.audit].reverse().map(a => `<tr><td>${fmtDT(a.at)}</td><td>${esc(a.by)}</td><td>${esc(a.action)}</td><td class="mono">${esc(a.ref)}</td><td class="wrap">${esc(a.detail)}</td></tr>`).join('')}</tbody></table></div></div></section>` : ''}
    </div></div>`;
  $$('[data-go]', el).forEach(b => b.onclick = () => { location.hash = '#/' + b.dataset.go; });
  $('[data-sys=sgd]', el).value = '1.0000 (base)'; $('[data-sys=ap]', el).value = 'Pending collection · Call customer · Call unreachable';
  if (ed) $('#sv', el).onclick = () => api('settings.save', Object.fromEntries(new FormData($('#sf', el)))).then(() => { toast('Settings saved'); route(); }).catch(() => {});
};

// ---------- Printable documents (white, A4) ----------
VIEWS.print = (el, type, ids) => {
  const back = () => history.length > 1 ? history.back() : (location.hash = '#/');
  const head = (b, title, zh = '') => `<div class="doc-head"><div class="doc-brand">${MONOGRAM}<div><div class="doc-co">Chan Yew</div><div class="doc-co-sub">Leather Artisans · Est. 1941</div><div>${esc(b.legalName)}</div><div>${esc(b.address)}</div><div>Tel ${esc(b.phone)} · Reg. ${esc(b.regNo)} · ${esc(b.taxLabel)} reg. ${esc(b.taxRegNo)}</div></div></div>
    <div class="doc-title">${title}${zh ? `<div class="zh">${zh}</div>` : ''}</div></div>`;
  const kv = pairs => `<table class="doc-kv">${pairs.filter(p => p[1] !== undefined).map(([k, v]) => `<tr><th>${k}</th><td>${v || ''}</td></tr>`).join('')}</table>`;
  let html = '';
  if (type === 'so') {
    const so = byId('salesOrders', ids); const b = branch(so.branchId), c = customer(so.customerId), w = woOf(so.id), t = soTotals(so);
    html = `<div class="doc page">${head(b, 'SALES ORDER / QUOTATION')}
      <div class="doc-two">${kv([['Customer', `<b>${esc(c.name)}</b>`], ['Attn', esc(c.contactPerson)], ['Address', esc(c.address)], ['Phone', esc(c.phone)]])}${kv([['SO no.', `<b>${esc(so.ref)}</b>`], ['Date', fmtDate(so.date)], ['Customer ref', esc(so.customerRef)], ['Payment term', esc(c.paymentTerm)], ['Currency', so.currency]])}</div>
      <table class="doc-lines"><thead><tr><th>#</th><th>WO no.</th><th>RO no.</th><th>Item</th><th>Condition</th><th>Work to be done</th><th>Est. ready</th><th class="num">Amount</th></tr></thead><tbody>
      ${w.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.ref)}</td><td>${esc(x.roNumber)}</td><td>${esc(`${x.brand} ${x.itemType}`)}<br><small>${esc(x.description)}</small></td><td>${esc(x.condition)}</td>
        <td>${x.services.map(id => esc(S.data.glossary.find(g => g.id === id)?.en)).join(', ')}</td><td>${fmtDate(x.estDate)}</td><td class="num">${x.stage === 'Cancelled' ? '0.00<br><small>' + esc(x.cancelReason) + '</small>' : money(x.unitPrice)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="7" class="num">Subtotal</td><td class="num">${money(t.sub)}</td></tr><tr><td colspan="7" class="num">${so.taxLabel} ${so.taxRate}%</td><td class="num">${money(t.tax)}</td></tr>
        <tr><td colspan="7" class="num"><b>Total ${so.currency}</b></td><td class="num"><b>${money(t.total)}</b></td></tr>${t.deposits ? `<tr><td colspan="7" class="num">Paid at intake</td><td class="num">${money(t.deposits)}</td></tr>` : ''}</tfoot></table>
      ${so.notes ? `<p>${esc(so.notes)}</p>` : ''}<div class="doc-terms"><b>Terms & conditions</b><br>${esc(b.invoiceTerms)}</div>
      <div class="doc-sign"><div>Customer acceptance</div><div>For Chan Yew Leathers</div></div><p class="doc-foot">Layout placeholder – replace with Chan Yew's SO template (D-07).</p></div>`;
  }
  if (type === 'wo') {
    html = ids.split(',').map(id => byId('workOrders', id)).filter(Boolean).map(x => { const b = branch(x.branchId), c = customer(x.customerId), so = byId('salesOrders', x.soId);
      return `<div class="doc page">${head(b, 'WORK ORDER', '工作单')}
        <div class="doc-two">${kv([['WO no. 工单号', `<b class="big">${esc(x.ref)}</b>`], ['RO no. 单据号', `<b>${esc(x.roNumber)}</b>`], ['SO no.', esc(so?.ref)], ['Type 类型', `${x.orderType} · ${esc(x.productCode)}`]])}
          ${kv([['Customer 客户', esc(c.name)], ['Logged 收件', fmtDate(x.createdAt)], ['Est. ready 预计完成', `<b>${fmtDate(x.estDate)}</b>`], ['Location 位置', esc(x.location)], ['Technician 师傅', esc(staffName(x.technicianId))]])}</div>
        ${kv([['Item 物品', `<b>${esc(x.brand)} · ${esc(x.itemType)}</b> ${esc(x.description)}`], ['Condition 状况', esc(x.condition)]])}
        <table class="doc-lines"><thead><tr><th>#</th><th>Repair service</th><th>维修项目</th><th>Done 完成</th></tr></thead><tbody>
          ${x.services.map((id, i) => { const g = S.data.glossary.find(t => t.id === id); return `<tr><td>${i + 1}</td><td>${esc(g?.en)}</td><td class="zh">${esc(g?.zh)}</td><td class="box">☐</td></tr>`; }).join('') || '<tr><td colspan="4">—</td></tr>'}</tbody></table>
        <div class="doc-two instr"><div><b>Instructions</b><p>${esc(x.instructionsEn) || '—'}</p></div><div><b>指示</b><p class="zh">${esc(x.instructionsZh) || '—'}</p></div></div>
        <table class="doc-lines"><thead><tr><th>Date 日期</th><th>Technician 师傅</th><th>Start 开始</th><th>End 结束</th><th>Minutes 分钟</th></tr></thead><tbody>${'<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>'.repeat(4)}</tbody></table>
        <div class="doc-sign"><div>QC 质检</div><div>Released 交付</div></div><p class="doc-foot">Internal workshop document – prices are not shown. Layout placeholder for Chan Yew's WO template (D-07).</p></div>`; }).join('');
  }
  if (type === 'iv') {
    const inv = byId('invoices', ids); const b = branch(inv.branchId), c = customer(inv.customerId); const paid = inv.amountDue - invBalance(inv);
    html = `<div class="doc page">${head(b, 'TAX INVOICE')}${inv.status === 'Void' ? '<div class="void">VOID</div>' : ''}
      <div class="doc-two">${kv([['Bill to', `<b>${esc(c.name)}</b>`], ['Attn', esc(c.contactPerson)], ['Address', esc(c.address)], ['Phone', esc(c.phone)]])}
        ${kv([['Invoice no.', `<b>${esc(inv.ref)}</b>`], ['Date', fmtDate(inv.date)], ['Shipped', fmtDate(inv.shipDate)], ['Your ref', esc(inv.customerPo)], ...(activeGivOf(inv) ? [['Group invoice', esc(activeGivOf(inv).ref)]] : []), ['Terms', esc(inv.paymentTerm)], ['Due date', `<b>${fmtDate(inv.dueDate)}</b>`]])}</div>
      <table class="doc-lines"><thead><tr><th>#</th><th>WO no.</th><th>RO no.</th><th>SO no.</th><th>Description</th><th class="num">Amount (${inv.currency})</th></tr></thead><tbody>
        ${inv.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.woRef)}</td><td>${esc(l.roNumber)}</td><td>${esc(l.soRef)}</td><td>${esc(l.description)}${l.zeroReason ? `<br><i>${esc(l.zeroReason)}</i>` : ''}</td><td class="num">${money(l.amount)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="5" class="num">Subtotal</td><td class="num">${money(inv.subtotal)}</td></tr><tr><td colspan="5" class="num">${inv.taxLabel} ${inv.taxRate}%</td><td class="num">${money(inv.tax)}</td></tr>
        <tr><td colspan="5" class="num"><b>Total</b></td><td class="num"><b>${money(inv.total)}</b></td></tr>${inv.deposits ? `<tr><td colspan="5" class="num">Less paid at intake</td><td class="num">(${money(inv.deposits)})</td></tr>` : ''}
        ${paid ? `<tr><td colspan="5" class="num">Less payments received</td><td class="num">(${money(paid)})</td></tr>` : ''}<tr><td colspan="5" class="num"><b>Balance due ${inv.currency}</b></td><td class="num"><b>${money(invBalance(inv))}</b></td></tr></tfoot></table>
      ${inv.notes ? `<p>${esc(inv.notes)}</p>` : ''}<div class="doc-terms"><b>Payment</b><br>${esc(b.bankInfo)}<br><br><b>Terms & conditions</b><br>${esc(b.invoiceTerms)}</div>
      <p class="doc-foot">Computer-generated invoice. Layout placeholder – replace with Chan Yew's IV template (D-07).</p></div>`;
  }
  if (type === 'giv') {
    const g = byId('groupInvoices', ids); const b = branch(g.branchId), c = customer(g.customerId), invs = givInvoices(g);
    html = `<div class="doc page">${head(b, 'GROUP INVOICE')}${g.status === 'Void' ? '<div class="void">VOID</div>' : ''}
      <div class="doc-two">${kv([['Bill to', `<b>${esc(c.name)}</b>`], ['Attn', esc(c.contactPerson)], ['Address', esc(c.address)], ['Phone', esc(c.phone)]])}
        ${kv([['Group invoice no.', `<b>${esc(g.ref)}</b>`], ['Date', fmtDate(g.date)], ['Your ref', esc(g.customerPo)], ['Terms', esc(g.paymentTerm)], ['Due date', `<b>${fmtDate(g.dueDate)}</b>`]])}</div>
      <table class="doc-lines"><thead><tr><th>#</th><th>Invoice no.</th><th>Date</th><th>Work orders</th><th>Due</th><th class="num">Amount due</th><th class="num">Paid</th><th class="num">Balance (${g.currency})</th></tr></thead><tbody>
        ${invs.map((i, k) => `<tr><td>${k + 1}</td><td>${esc(i.ref)}</td><td>${fmtDate(i.date)}</td><td>${esc(i.lines.map(l => l.woRef + (l.roNumber ? ' / RO ' + l.roNumber : '')).join(', '))}</td><td>${fmtDate(i.dueDate)}</td>
          <td class="num">${money(i.amountDue)}</td><td class="num">${money(i.amountDue - invBalance(i))}</td><td class="num">${money(invBalance(i))}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="5" class="num"><b>Total</b></td><td class="num"><b>${money(givDue(g))}</b></td><td class="num">${money(givDue(g) - givBalance(g))}</td><td class="num"><b>${money(givBalance(g))}</b></td></tr>
        <tr><td colspan="7" class="num"><b>Balance due ${g.currency}</b></td><td class="num"><b>${money(givBalance(g))}</b></td></tr></tfoot></table>
      ${g.notes ? `<p>${esc(g.notes)}</p>` : ''}<div class="doc-terms"><b>Payment</b><br>Please quote ${esc(g.ref)} with your payment. ${esc(b.bankInfo)}<br><br><b>Terms & conditions</b><br>${esc(b.invoiceTerms)}</div>
      <p class="doc-foot">Computer-generated group invoice covering the tax invoices listed. Layout placeholder – replace with Chan Yew's GIV template (D-07).</p></div>`;
  }
  el.innerHTML = `<div class="print-bar"><button class="btn" id="bk">← Back</button><button class="btn primary" id="pr">🖨 Print / Save as PDF</button><span class="muted">Choose "Save as PDF" in the print dialog for a PDF copy.</span></div>${html || '<p>Document not found.</p>'}`;
  $('#bk', el).onclick = back; $('#pr', el).onclick = () => window.print();
};

// ---------- Shell ----------
function renderTop() {
  const d = S.data;
  $('#top').innerHTML = `<a class="brand" href="#/" title="Chan Yew ERP">${MONOGRAM}<span class="brand-words"><span class="brand-name">Chan Yew</span><span class="brand-sub">Operations</span></span></a>
    <nav class="nav">${[['', 'Dashboard'], ['customers', 'Customers'], ['sales-orders', 'Sales Orders'], ['work-orders', 'Work Orders'], ['invoices', 'Invoices'], ['group-invoices', 'Group Invoices'], ['staff', 'Staff'], ['leave', 'Leave']]
      .map(([r, l]) => `<a href="#/${r}">${l}</a>`).join('')}<a href="#/settings" class="minor">Set-up</a><a href="#/guide" class="minor">Test guide</a></nav>
    <span class="grow"></span>
    ${me().role === 'super' ? `<select id="scope" title="Branch view">${branchOpts(true).map(([v, l]) => `<option value="${v}" ${S.scope === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : `<span class="pill">${esc(branch(me().branchId).name)}</span>`}
    <label class="who" title="Local demo mode – not authentication">As <select id="user">${d.users.map(u => `<option value="${u.id}" ${u.id === S.userId ? 'selected' : ''}>${esc(u.name)} · ${u.role === "super" ? "Super Admin" : "Ops " + u.branchId}</option>`).join('')}</select></label>
    <button class="btn icon" id="theme" title="Light / dark">◐</button>`;
  $('#user').onchange = async e => { S.userId = e.target.value; localSet('cy.user', S.userId); S.scope = ''; localSet('cy.scope', ''); for (const k in ui) delete ui[k]; await loadState(); renderTop(); if (location.hash.length > 2) location.hash = '#/'; else route(); };
  const sc = $('#scope'); if (sc) sc.onchange = e => { S.scope = e.target.value; localSet('cy.scope', S.scope); for (const k in ui) if (ui[k]?.filter) ui[k].filter.branchId = ''; route(); };
  $('#theme').onclick = () => { const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = t; localSet('cy.brandTheme', t); };
}

(async function init() {
  document.documentElement.dataset.theme = localGet('cy.brandTheme') || 'light';
  $('#lists').innerHTML = `<datalist id="brands">${BRANDS.map(b => `<option value="${esc(b)}">`).join('')}</datalist>
    <datalist id="positions">${['Senior Artisan', 'Artisan', 'Apprentice Artisan', 'Front desk', 'Logistics', 'Branch Manager', 'Managing Director'].map(p => `<option value="${p}">`).join('')}</datalist>`;
  await loadState();
  renderTop();
  route();
})();
