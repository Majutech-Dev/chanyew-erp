'use strict';
// Record screens: Customers, Sales Orders, Work Orders, Invoices, Staff, Leave, Branches, Repair glossary.

const BRANDS = ['Louis Vuitton', 'Hermès', 'Chanel', 'Gucci', 'Prada', 'Dior', 'Goyard', 'Bottega Veneta', 'Celine', 'Fendi', 'Loewe', 'Balenciaga', 'Saint Laurent', 'Cartier', 'Rolex', 'Coach', 'Others'];
const textMatch = (v, ...vals) => vals.some(x => String(x ?? '').toLowerCase().includes(String(v).toLowerCase().trim()));
const branchFilter = () => [{ k: 'branchId', label: 'Branch', type: 'select', show: () => isSuper(), options: () => branchOpts(true), match: (r, v) => r.branchId === v }];
const dateFilters = (field, label = 'Date') => [
  { k: 'from', label: `${label} from`, type: 'date', match: (r, v) => (r[field] || '').slice(0, 10) >= v },
  { k: 'to', label: `${label} to`, type: 'date', match: (r, v) => (r[field] || '').slice(0, 10) <= v }];
const custLink = id => { const c = customer(id); return c ? esc(c.name) : ''; };
const goRec = (route, id, tab = 'main') => { (ui[route] ||= { selected: null, tab: 'main', edit: null, filter: {} }).tab = tab; location.hash = `#/${route}/${id}`; };
const refLink = (route, id, ref) => `<a href="#/${route}/${id}" class="mono">${esc(ref)}</a>`;
const woOf = soId => S.data.workOrders.filter(w => w.soId === soId);
const glossaryPriceIn = (ids, cur) => round2(ids.reduce((a, id) => a + (S.data.glossary.find(g => g.id === id)?.defaultPrice || 0), 0) / (S.data.settings.fxToSgd[cur] || 1));
const ro = (r, k) => r ? r[k] : '';

// ---------- shared item / work-order fields (SO "Add item" dialog and WO Main Info) ----------
function itemSections(w, editable, cur) {
  const v = k => (w ? w[k] : '');
  const svc = new Set(w?.services || []);
  const terms = S.data.glossary.filter(g => g.status === 'Active' || svc.has(g.id));
  return section('Item', fld('req', 'Product code', sel('productCode', [['', '—'], ...S.C.PRODUCT_CODES], v('productCode'), !editable))
      + fld('req', 'Item type', sel('itemType', [['', '—'], ...S.C.ITEM_TYPES], v('itemType'), !editable))
      + fld('req', 'Brand', inp('brand', v('brand'), 'text', !editable, 'list="brands"'))
      + fld('opt', 'Description', inp('description', v('description'), 'text', !editable), 'wide')
      + fld('opt', 'Product status / condition', inp('condition', v('condition'), 'text', !editable, 'placeholder="e.g. stain, scratch, corner wear"'), 'span2')
      + fld('req', 'Est. completion', inp('estDate', v('estDate'), 'date', !editable)))
    + section('Charges', sysF(`Glossary price (${cur})`, 'calc') + fld('req', `Price excl. tax (${cur})`, inp('unitPrice', v('unitPrice'), 'number', !editable, 'step="0.01" min="0"'))
      + sysF('Tax', 'tax') + sysF('Total', 'total') + fld('opt', `Amount paid (${cur})`, inp('deposit', v('deposit') || '', 'number', !editable, 'step="0.01" min="0"')) + sysF('Outstanding', 'outstanding'))
    + `<section class="form-section"><div class="head"><h3>Workshop instructions · 工作指示 <small>(internal – printed on the work order, never on customer documents)</small></h3></div><div class="body">
        <div class="svc-list">${terms.map(g => `<label class="svc"><input type="checkbox" name="svc" value="${g.id}" ${svc.has(g.id) ? 'checked' : ''} ${editable ? '' : 'disabled'}><span>${esc(g.en)}</span><span class="zh">${esc(g.zh)}</span></label>`).join('')}</div>
        <div class="grid3" style="margin-top:8px">${fld('opt', 'Instructions (English)', txt('instructionsEn', v('instructionsEn'), !editable), 'span2')}${fld('opt', '指示 (中文)', txt('instructionsZh', v('instructionsZh'), !editable), 'span2')}</div></div></section>`;
}
function itemCompute(form, w, branchId) {
  const fd = new FormData(form), b = branch(branchId);
  const val = k => (fd.has(k) ? fd.get(k) : w ? w[k] : '');
  const services = fd.has('svc') || $$('[name=svc]:not(:disabled)', form).length ? fd.getAll('svc') : (w?.services || []);
  const errors = [], warnings = [];
  const price = Number(val('unitPrice')), dep = Number(val('deposit') || 0);
  for (const [k, l] of [['productCode', 'Product code'], ['itemType', 'Item type'], ['brand', 'Brand'], ['estDate', 'Est. completion']]) if (!val(k)) errors.push(`${l} is required.`);
  if (val('unitPrice') === '' || !(price >= 0)) errors.push('Price is required.');
  const calc = glossaryPriceIn(services, b.currency);
  if (services.length && val('unitPrice') !== '' && Math.abs(calc - price) > 0.009) warnings.push(`Price differs from the glossary suggestion (${money(calc, b.currency)}).`);
  if (val('estDate') && val('estDate') < S.data.today && !(w && S.C.CLOSED_STAGES.includes(w.stage))) warnings.push('Est. completion date is in the past.');
  const isCancelled = w?.stage === 'Cancelled';
  const sub = isCancelled ? 0 : price || 0, tax = round2(sub * b.taxRate / 100), total = round2(sub + tax);
  if (dep > total + 0.009) warnings.push('Amount paid is more than the total.');
  return { errors, warnings, services, sys: { calc: services.length ? money(calc) : '—', tax: `${b.taxLabel} ${b.taxRate}% · ${money(tax)}`, total: money(total, b.currency) + (isCancelled ? ' (cancelled – zero)' : ''), outstanding: money(total - dep, b.currency) } };
}
// fills price from the glossary when the price is still empty
function itemAfter(form, branchId) {
  $$('[name=svc]', form).forEach(c => c.addEventListener('change', () => {
    const p = $('[name=unitPrice]', form); if (!p || p.disabled) return;
    if (p.value === '' || p.dataset.auto === '1') { p.value = glossaryPriceIn(new FormData(form).getAll('svc'), branch(branchId).currency) || ''; p.dataset.auto = '1'; form.dispatchEvent(new Event('input')); }
  }));
  $('[name=unitPrice]', form)?.addEventListener('input', e => { if (e.isTrusted) e.target.dataset.auto = '0'; });
}
function addItemDialog(so) {
  const c = customer(so.customerId);
  const added = [];
  dialog({ title: `Add item to ${so.ref}`, okLabel: 'Add item → creates work order', cancelLabel: 'Done', wide: true,
    body: `<div class="alert info">Each item becomes its own work order (WO no. is generated). ${c.type === 'Business' ? 'For B2B, enter the customer\'s RO / stock no. – leave blank to number it automatically.' : ''} The dialog stays open for the next item – press <b>Done</b> when finished.</div>
      <div class="dlg-scroll"><div id="dadded"></div><div id="dmsgs"></div>${section('Reference', fld('opt', 'RO no. / docket', inp('roNumber', '')) + sysF('Customer', 'cust', 'wide') + sysF('Order type', 'otype') + fld('opt', 'Location (trolley / area)', inp('location', '')))}${itemSections(null, true, so.currency)}</div>`,
    onReady: form => {
      const run = () => { const o = itemCompute(form, null, so.branchId); o.sys.cust = c.name; o.sys.otype = c.type === 'Business' ? 'B2B' : 'B2C';
        $$('[data-sys]', form).forEach(i => i.value = o.sys[i.dataset.sys] ?? '');
        $('#dmsgs', form).innerHTML = o.warnings.map(w => `<div class="alert warn">${esc(w)}</div>`).join(''); };
      form.addEventListener('input', run); form.addEventListener('change', run); itemAfter(form, so.branchId); run();
    },
    onOk: async (fd, form) => {
      const wo = await api('so.addLine', { ...fd, soId: so.id, services: new FormData(form).getAll('svc') }, { quiet: true });
      toast(`${wo.ref} created`); added.push(wo);
      $('#dadded', form).innerHTML = `<div class="alert ok">Added ${added.length} item${added.length > 1 ? 's' : ''}: ${added.map(w => `<b class="mono">${esc(w.ref)}</b> ${esc(w.brand)}`).join(' · ')}</div>`;
      // clear for the next item; keep the est. completion date and location, which are usually the same
      const keep = { estDate: fd.estDate, location: fd.location };
      form.reset(); Object.entries(keep).forEach(([k, v]) => { form.elements[k].value = v || ''; });
      delete $('[name=unitPrice]', form).dataset.auto;
      form.dispatchEvent(new Event('input'));
      $('.dlg-scroll', form).scrollTop = 0; $('[name=roNumber]', form).focus();
      return 'keep';
    },
  });
}

// ---------- Customers ----------
erpScreen({
  route: 'customers', title: 'Customers', noun: 'customer',
  list: () => S.data.customers, ref: r => r.code, status: r => r.status, statuses: ['Active', 'Inactive'],
  filters: [
    { k: 'q', label: 'Code / name / phone / email', cls: 'wide', match: (r, v) => textMatch(v, r.code, r.name, r.contactPerson, r.phone, r.email) },
    { k: 'type', label: 'Type', type: 'select', options: () => [['', 'All'], ...S.C.CUSTOMER_TYPES], match: (r, v) => r.type === v },
    { k: 'homeBranchId', label: 'Home branch', type: 'select', options: () => [['', 'All'], ...S.data.branches.map(b => [b.id, b.name])], match: (r, v) => r.homeBranchId === v },
    { k: 'paymentTerm', label: 'Payment term', type: 'select', options: () => [['', 'All'], ...Object.keys(S.C.PAYMENT_TERMS)], match: (r, v) => r.paymentTerm === v }],
  sorts: [['name', 'Name A–Z', (a, b) => a.name.localeCompare(b.name)], ['code', 'Code', (a, b) => a.code.localeCompare(b.code)]],
  columns: [['Code', r => `<span class="mono">${esc(r.code)}</span>`], ['Name', r => esc(r.name)], ['Type', r => r.type === 'Business' ? 'B2B' : 'B2C'],
    ['Contact', r => esc(r.contactPerson)], ['Phone', r => esc(r.phone)], ['Email', r => esc(r.email)], ['Home', r => esc(r.homeBranchId)],
    ['Terms', r => esc(r.paymentTerm)], ['Open WOs', r => S.data.workOrders.filter(w => w.customerId === r.id && !S.C.CLOSED_STAGES.includes(w.stage)).length, 'num'], ['Status', r => badge(r.status)]],
  tabs: [['main', 'Main Info'], ['so', 'Sales Orders', r => S.data.salesOrders.filter(s => s.customerId === r.id).length], ['wo', 'Work Orders', r => S.data.workOrders.filter(w => w.customerId === r.id).length],
    ['iv', 'Invoices', r => S.data.invoices.filter(i => i.customerId === r.id).length], ['history', 'History']],
  voidCmd: { label: '⊘ Deactivate', why: r => r.status === 'Inactive' ? 'Already inactive' : '',
    run: r => dialog({ title: `Deactivate ${r.name}?`, okLabel: 'Deactivate', okClass: 'danger', body: '<p>Inactive customers keep their history but cannot be chosen on new sales orders. Records are never deleted.</p>',
      onOk: () => api('customer.save', { ...r, status: 'Inactive' }, { quiet: true }) }) },
  main: {
    render: (r, ed) => section('Record', sysF('Customer code', 'code', '', true) + fld('opt', 'Status', sel('status', ['Active', 'Inactive'], r?.status || 'Active', !ed)) + sysF('Order type', 'otype') + sysF('Created', 'created'))
      + section('Customer', fld('req', 'Customer type', sel('type', [['', '—'], ...S.C.CUSTOMER_TYPES], ro(r, 'type'), !ed)) + fld('req', 'Name', inp('name', ro(r, 'name'), 'text', !ed), 'wide')
        + fld('opt', 'Contact person', inp('contactPerson', ro(r, 'contactPerson'), 'text', !ed)) + fld('req', 'Phone (WhatsApp)', inp('phone', ro(r, 'phone'), 'tel', !ed))
        + fld('opt', 'Email', inp('email', ro(r, 'email'), 'email', !ed), 'wide') + fld('opt', 'Address', inp('address', ro(r, 'address'), 'text', !ed), 'span2'))
      + section('Billing', fld('req', 'Payment term', sel('paymentTerm', [['', '—'], ...Object.keys(S.C.PAYMENT_TERMS)], ro(r, 'paymentTerm'), !ed))
        + fld('req', 'Home branch', sel('homeBranchId', S.data.branches.map(b => [b.id, b.name]), r?.homeBranchId || me().branchId || 'SG', !ed)))
      + section('Notes', fld('opt', 'Notes', txt('notes', ro(r, 'notes'), !ed), 'full')),
    compute: (form, r) => {
      const fd = Object.fromEntries(new FormData(form)); const errors = [];
      if (!fd.type) errors.push('Customer type is required.'); if (!fd.name?.trim()) errors.push('Name is required.');
      if (!fd.phone?.trim()) errors.push('Phone is required.'); if (!fd.paymentTerm) errors.push('Payment term is required.');
      return { errors, sys: { code: r?.code || '(new)', created: fmtDate(r?.createdAt), otype: fd.type === 'Business' ? 'B2B – uses customer RO no.' : fd.type ? 'B2C – system WO no.' : '' } };
    },
    save: (fd, r) => api('customer.save', { ...fd, id: r?.id }),
  },
  renderTab: {
    so: (body, r) => childGrid(body, { key: 'cus-so', rows: S.data.salesOrders.filter(s => s.customerId === r.id), onOpen: x => goRec('sales-orders', x.id),
      toolbar: [{ label: '+ New sales order', run: () => { ui.soPreset = r.id; location.hash = '#/sales-orders/new'; }, why: r.status !== 'Active' ? 'Customer is inactive' : '' }, { label: 'Open', needRow: true, run: x => goRec('sales-orders', x.id) }],
      cols: [['SO no.', x => refLink('sales-orders', x.id, x.ref)], ['Date', x => fmtDate(x.date)], ['Branch', x => x.branchId], ['Cust. ref', x => esc(x.customerRef)], ['Items', x => woOf(x.id).length, 'num'], ['Status', x => badge(x.status)]] }),
    wo: (body, r) => childGrid(body, { key: 'cus-wo', rows: S.data.workOrders.filter(w => w.customerId === r.id), onOpen: x => goRec('work-orders', x.id),
      toolbar: [{ label: 'Open', needRow: true, run: x => goRec('work-orders', x.id) }],
      cols: [['WO no.', x => refLink('work-orders', x.id, x.ref)], ['RO no.', x => esc(x.roNumber)], ['Item', x => esc(`${x.brand} ${x.itemType}`)], ['Stage', x => badge(x.stage)], ['Invoice', x => x.invoiceId ? esc(byId('invoices', x.invoiceId)?.ref) : '']] }),
    iv: (body, r) => childGrid(body, { key: 'cus-iv', rows: S.data.invoices.filter(i => i.customerId === r.id), onOpen: x => goRec('invoices', x.id),
      toolbar: [{ label: 'Open', needRow: true, run: x => goRec('invoices', x.id) }],
      cols: [['Invoice no.', x => refLink('invoices', x.id, x.ref)], ['Date', x => fmtDate(x.date)], ['Total', x => money(x.total, x.currency), 'num'], ['Balance', x => money(invBalance(x), x.currency), 'num'], ['Due', x => fmtDate(x.dueDate)], ['Group inv.', givLink], ['Status', x => badge(invStatus(x))]] }),
  },
});

// ---------- Sales Orders ----------
const soProgress = so => { const w = woOf(so.id); return `${w.filter(x => S.C.CLOSED_STAGES.includes(x.stage)).length}/${w.length}`; };
const soTotals = so => { const w = woOf(so.id); const sub = round2(w.reduce((a, x) => a + (x.stage === 'Cancelled' ? 0 : x.unitPrice), 0)); const tax = round2(sub * so.taxRate / 100);
  return { items: w.length, sub, tax, total: round2(sub + tax), deposits: round2(w.reduce((a, x) => a + (x.deposit || 0), 0)), open: w.filter(x => !S.C.CLOSED_STAGES.includes(x.stage)).length }; };
erpScreen({
  route: 'sales-orders', title: 'Sales Orders', noun: 'sales order',
  list: () => scoped('salesOrders'), ref: r => r.ref, status: r => r.status, statuses: ['Open', 'Completed', 'Cancelled'],
  filters: [
    { k: 'q', label: 'SO / WO / RO / cust. ref no.', match: (r, v) => textMatch(v, r.ref, r.customerRef) || woOf(r.id).some(w => textMatch(v, w.ref, w.roNumber)) },
    { k: 'cust', label: 'Customer (name / phone)', cls: 'wide', match: (r, v) => { const c = customer(r.customerId); return textMatch(v, c?.name, c?.phone, c?.code); } },
    ...branchFilter(), ...dateFilters('date')],
  sorts: [['new', 'Newest first', (a, b) => b.date.localeCompare(a.date) || b.ref.localeCompare(a.ref)], ['old', 'Oldest first', (a, b) => a.date.localeCompare(b.date)]],
  columns: [['SO no.', r => `<span class="mono">${esc(r.ref)}</span>`], ['Date', r => fmtDate(r.date)], ['Br.', r => r.branchId], ['Customer', r => custLink(r.customerId)], ['Cust. ref', r => esc(r.customerRef)],
    ['Items', r => woOf(r.id).length, 'num'], ['Done', r => soProgress(r), 'num'], ['Total', r => money(soTotals(r).total, r.currency), 'num'], ['Status', r => badge(r.status)]],
  tabs: [['main', 'Main Info'], ['items', 'Items / Work Orders', r => woOf(r.id).length], ['iv', 'Invoices', r => new Set(woOf(r.id).filter(w => w.invoiceId).map(w => w.invoiceId)).size], ['history', 'History']],
  voidCmd: { label: '⊘ Cancel SO', why: r => r.status === 'Cancelled' ? 'Already cancelled' : woOf(r.id).some(w => w.invoiceId) ? 'Items already invoiced' : woOf(r.id).some(w => w.stage === 'Complete') ? 'Items already complete – cancel open work orders individually' : '',
    run: r => reasonDialog(`Cancel ${r.ref}`, 'Cancel sales order', reason => api('so.cancel', { id: r.id, reason }, { quiet: true }), 'All open items become <b>Cancelled – return as requested</b> (zero value) so they can still be closed out on an invoice.') },
  actions: r => [
    { label: '+ Add item', why: r.status === 'Cancelled' ? 'Sales order is cancelled' : '', run: () => addItemDialog(r) },
    { label: '🖨 Print SO', run: () => { location.hash = `#/print/so/${r.id}`; } }],
  main: {
    canEdit: r => r.status === 'Cancelled' ? 'Cancelled sales orders cannot be edited' : '',
    lockNote: r => r.status === 'Cancelled' ? `Cancelled: ${r.cancelReason || ''}` : woOf(r.id).length ? 'Customer is locked once items are added. Prices are kept on each item (Items tab).' : '',
    render: (r, ed, isNew) => {
      const hasItems = r && woOf(r.id).length;
      const preset = isNew ? ui.soPreset || '' : r.customerId;
      return section('Record', sysF('SO no.', 'ref', '', true) + (isNew && isSuper() ? fld('req', 'Branch', sel('branchId', branchOpts(), S.scope || 'SG')) : sysF('Branch', 'branch'))
          + fld('req', 'Order date', inp('date', r?.date || S.data.today, 'date', !ed)) + sysF('Status', 'status') + sysF('Created by', 'createdBy'))
        + section('Customer', fld('req', 'Customer', sel('customerId', custOpts(), preset, !ed || hasItems), 'span2') + sysF('Order type', 'otype') + sysF('Phone', 'phone') + sysF('Payment term', 'term')
          + fld('opt', 'Customer ref (PO / docket)', inp('customerRef', ro(r, 'customerRef'), 'text', !ed)))
        + section('Totals', sysF('Currency', 'cur') + sysF('Items', 'items') + sysF('Subtotal', 'sub') + sysF('Tax', 'tax') + sysF('Total', 'total') + sysF('Paid at intake', 'dep'))
        + section('Notes', fld('opt', 'Notes (printed on the SO)', txt('notes', ro(r, 'notes'), !ed), 'full'));
    },
    compute: (form, r, isNew) => {
      const fd = Object.fromEntries(new FormData(form)); const cid = fd.customerId || r?.customerId; const c = customer(cid);
      const b = branch(isNew ? (fd.branchId || me().branchId || 'SG') : r.branchId); const t = r ? soTotals(r) : { items: 0, sub: 0, tax: 0, total: 0, deposits: 0 };
      const errors = []; if (!cid) errors.push('Customer is required.'); if (!(fd.date || r?.date)) errors.push('Order date is required.');
      return { errors, sys: { ref: r?.ref || '(on save)', branch: `${b.id} – ${b.name}`, status: r?.status || 'Open', createdBy: r?.createdBy || me().name, otype: c ? (c.type === 'Business' ? 'B2B' : 'B2C') : '',
        phone: c?.phone, term: c?.paymentTerm, cur: b.currency, items: t.items, sub: money(t.sub), tax: `${b.taxLabel} ${r ? r.taxRate : b.taxRate}% · ${money(t.tax)}`, total: money(t.total, b.currency), dep: money(t.deposits) } };
    },
    save: async (fd, r) => { const so = await api('so.save', { ...fd, id: r?.id, customerId: fd.customerId || r?.customerId }); delete ui.soPreset; if (!r) setTimeout(() => addItemDialog(byId('salesOrders', so.id)), 50); return so; },
  },
  renderTab: {
    items: (body, r) => { const t = soTotals(r);
      childGrid(body, { key: 'so-items', rows: woOf(r.id), checkbox: true, onOpen: x => goRec('work-orders', x.id),
        kpis: kpis([['Items', t.items], ['Open', t.open, t.open ? 'warn' : 'ok'], ['Subtotal', money(t.sub, r.currency)], [`${r.taxLabel} ${r.taxRate}%`, money(t.tax)], ['Total', money(t.total, r.currency)], ['Paid at intake', money(t.deposits)]]),
        toolbar: [{ label: '+ Add item', why: r.status === 'Cancelled' ? 'Sales order is cancelled' : '', run: () => addItemDialog(r) },
          { label: '✎ Open work order', needRow: true, run: x => goRec('work-orders', x.id) },
          { label: '🖨 Print checked WOs', needChecked: true, run: (_, ch) => { location.hash = `#/print/wo/${ch.map(x => x.id).join(',')}`; } }],
        cols: [['WO no.', x => refLink('work-orders', x.id, x.ref)], ['RO no.', x => esc(x.roNumber)], ['Type', x => x.itemType], ['Product', x => esc(x.productCode)], ['Brand', x => esc(x.brand)],
          ['Condition', x => esc(x.condition)], ['Est.', x => fmtDate(x.estDate)], ['Technician', x => esc(staffName(x.technicianId))], ['Stage', x => badge(x.stage)], ['Price', x => money(x.stage === 'Cancelled' ? 0 : x.unitPrice), 'num']] }); },
    iv: (body, r) => { const ids = new Set(woOf(r.id).filter(w => w.invoiceId).map(w => w.invoiceId));
      childGrid(body, { key: 'so-iv', rows: S.data.invoices.filter(i => ids.has(i.id)), onOpen: x => goRec('invoices', x.id), empty: 'No items of this sales order are invoiced yet. Invoice completed items from Invoices → New (F4).',
        toolbar: [{ label: 'Open', needRow: true, run: x => goRec('invoices', x.id) }],
        cols: [['Invoice no.', x => refLink('invoices', x.id, x.ref)], ['Date', x => fmtDate(x.date)], ['Lines', x => x.lines.length, 'num'], ['Total', x => money(x.total, x.currency), 'num'], ['Status', x => badge(invStatus(x))]] }); },
  },
});

// ---------- Work Orders ----------
function stageDialog(wo, preset) {
  const C = S.C; const opts = C.STAGES.filter(s => s !== wo.stage && s !== 'Cancelled');
  dialog({ title: `Move ${wo.ref} to…`, okLabel: 'Update stage',
    body: `<div class="grid3">${sysF('Current stage', 'cur')}${fld('req', 'New stage', sel('stage', opts, preset || C.NEXT_STAGE[wo.stage]))}
      <span id="techF" class="fld-slot">${fld('req', 'Technician', sel('technicianId', techOpts(wo.branchId), wo.technicianId))}</span>${fld('opt', 'Note', inp('note', ''), 'wide')}</div>
      <div class="alert info" id="stageHint"></div>`,
    onReady: form => { $('[data-sys=cur]', form).value = wo.stage;
      const upd = () => { const s = $('[name=stage]', form).value; $('#techF', form).style.display = s === 'Technician' ? '' : 'none';
        $('#stageHint', form).textContent = s === 'Pending collection' ? 'A WhatsApp "ready for collection" message is queued to the customer (demo sink – not sent).'
          : s === 'Complete' ? 'Complete items appear under Billing, ready to invoice when shipped.' : s === 'Technician' ? 'Choose the technician from this branch.' : 'The change is recorded in History.'; };
      $('[name=stage]', form).onchange = upd; upd(); },
    onOk: fd => api('wo.stage', { id: wo.id, ...fd }, { quiet: true }) });
}
// Set stage for the work orders ticked in Search; the server checks them all and changes none if one is refused
function bulkStageDialog(rows) {
  const C = S.C, branches = [...new Set(rows.map(w => w.branchId))];
  const blocked = rows.filter(w => w.invoiceId || C.CLOSED_STAGES.includes(w.stage));
  const now = C.STAGES.map(s => [s, rows.filter(w => w.stage === s).length]).filter(([, n]) => n);
  dialog({ title: `Set stage – ${rows.length} work order${rows.length > 1 ? 's' : ''}`, okLabel: `Update ${rows.length}`, wide: true,
    body: `<div class="alert info">Now: ${now.map(([s, n]) => `${badge(s)} ${n}`).join(' · ')}<br><span class="mono">${rows.map(w => esc(w.ref)).join(', ')}</span></div>
      ${blocked.length ? `<div class="alert error">Untick these first – they are invoiced or closed (a Super Admin can reopen them one by one): ${blocked.map(w => `<b class="mono">${esc(w.ref)}</b> ${esc(w.invoiceId ? 'Invoiced' : w.stage)}`).join(', ')}</div>` : ''}
      <div class="grid3">${fld('req', 'New stage', sel('stage', C.STAGES, C.NEXT_STAGE[now[0][0]] || 'Checking'))}
      <span id="techF" class="fld-slot">${branches.length === 1 ? fld('req', 'Technician', sel('technicianId', techOpts(branches[0]), '')) : ''}</span>
      <span id="reasonF" class="fld-slot">${fld('req', 'Reason', inp('reason', 'Return as requested'), 'wide')}</span>${fld('opt', 'Note', inp('note', ''), 'wide')}</div>
      <div class="alert" id="stageHint"></div>`,
    onReady: form => {
      const ok = $('button[type=submit]', form);
      const upd = () => { const s = $('[name=stage]', form).value, multi = s === 'Technician' && branches.length > 1, same = rows.filter(w => w.stage === s).length;
        $('#techF', form).style.display = s === 'Technician' ? '' : 'none'; $('#reasonF', form).style.display = s === 'Cancelled' ? '' : 'none';
        $$('#techF select, #reasonF input', form).forEach(i => { i.disabled = i.closest('.fld-slot').style.display === 'none'; });
        const hint = $('#stageHint', form);
        hint.className = `alert ${multi ? 'error' : s === 'Cancelled' ? 'warn' : 'info'}`;
        hint.innerHTML = multi ? 'One technician belongs to one branch – tick work orders of a single branch to assign a technician.'
          : (s === 'Cancelled' ? 'Each item is closed as a <b>zero-value</b> work order ("return as requested" on the invoice). ' : s === 'Pending collection' ? 'A WhatsApp "ready for collection" message is queued for each customer (demo sink – not sent). ' : s === 'Technician' ? 'All ticked work orders are assigned to this technician. ' : '')
            + (same ? `${same} already at ${esc(s)} – skipped. ` : '') + 'Each change is recorded in its History.';
        ok.disabled = !!blocked.length || multi || same === rows.length; };
      $('[name=stage]', form).onchange = upd; upd(); },
    onOk: async fd => {
      const r = await api('wo.stageBulk', { ids: rows.map(w => w.id), ...fd }, { quiet: true });
      ui['work-orders'].ticked?.clear();
      toast(`${r.moved.length} moved to ${fd.stage}${r.skipped ? ` · ${r.skipped} already there` : ''}`);
    } });
}
function timeDialog(wo, log) {
  dialog({ title: `${log ? 'Edit' : 'Log'} technician time – ${wo.ref}`, okLabel: 'Save time',
    body: `<div class="grid3">${fld('req', 'Technician', sel('staffId', techOpts(wo.branchId), log?.staffId || wo.technicianId))}${fld('req', 'Date', inp('date', log?.date || S.data.today, 'date', false, `max="${S.data.today}"`))}
      ${fld('req', 'Minutes', inp('minutes', log?.minutes || '', 'number', false, 'min="1" max="720" step="1"'))}${fld('opt', 'Note', inp('note', log?.note || ''), 'wide')}</div>
      <p class="hint">Replaces the paper logbook: record each work session in minutes (e.g. 90 = 1h 30m).</p>`,
    onOk: fd => api('wo.logTime', { id: wo.id, logId: log?.id, ...fd }, { quiet: true }) });
}
const woBadge = r => badge(r.stage) + (r.invoiceId ? ' ' + badge('Invoiced') : '') + (followUpDue(r) ? ' ' + badge('Follow-up due', 'danger') : '');
erpScreen({
  route: 'work-orders', title: 'Work Orders', noun: 'work order',
  list: () => scoped('workOrders'), ref: r => r.ref, status: r => r.stage, badge: woBadge,
  get statuses() { return S.C.STAGES; }, groupByStatus: true,
  bulk: [{ label: 'Set stage…', cls: 'primary', run: bulkStageDialog },
    { label: '🖨 Print WOs', run: rows => { location.hash = `#/print/wo/${rows.map(w => w.id).join(',')}`; } }],
  filters: [
    { k: 'q', label: 'WO / RO / SO no.', match: (r, v) => textMatch(v, r.ref, r.roNumber, byId('salesOrders', r.soId)?.ref) },
    { k: 'cust', label: 'Customer (name / phone)', cls: 'wide', match: (r, v) => { const c = customer(r.customerId); return textMatch(v, c?.name, c?.phone, c?.code); } },
    ...branchFilter(),
    { k: 'itemType', label: 'Item type', type: 'select', options: () => [['', 'All'], ...S.C.ITEM_TYPES], match: (r, v) => r.itemType === v },
    { k: 'stage', label: 'Stage', type: 'select', options: () => [['', 'All stages'], ...S.C.STAGES], match: (r, v) => r.stage === v },
    { k: 'tech', label: 'Technician', type: 'select', options: () => [['', 'All'], ...S.data.staff.filter(s => s.isTechnician && inScope(s)).map(s => [s.id, s.name])], match: (r, v) => r.technicianId === v },
    { k: 'flag', label: 'Show', type: 'select', options: () => [['', 'All'], ['open', 'Open only'], ['follow', 'Follow-up due'], ['late', 'Past est. date'], ['bill', 'Ready to bill']],
      match: (r, v) => v === 'open' ? !S.C.CLOSED_STAGES.includes(r.stage) : v === 'follow' ? followUpDue(r) : v === 'late' ? !S.C.CLOSED_STAGES.includes(r.stage) && r.estDate < S.data.today : v === 'bill' ? S.C.CLOSED_STAGES.includes(r.stage) && !r.invoiceId : true },
    ...dateFilters('createdAt', 'Logged')],
  sorts: [['new', 'Newest first', (a, b) => b.ref.localeCompare(a.ref)], ['est', 'Est. date', (a, b) => a.estDate.localeCompare(b.estDate)], ['old', 'Oldest first', (a, b) => a.ref.localeCompare(b.ref)]],
  columns: [['WO no.', r => `<span class="mono">${esc(r.ref)}</span>`], ['RO no.', r => esc(r.roNumber)], ['SO no.', r => esc(byId('salesOrders', r.soId)?.ref)], ['Br.', r => r.branchId],
    ['Customer', r => custLink(r.customerId)], ['B2', r => r.orderType], ['Item', r => esc(r.itemType)], ['Brand', r => esc(r.brand)], ['Technician', r => esc(staffName(r.technicianId))],
    ['Est.', r => `<span class="${!S.C.CLOSED_STAGES.includes(r.stage) && r.estDate < S.data.today ? 'late' : ''}">${fmtDate(r.estDate)}</span>`], ['Stage', woBadge]],
  tabs: [['main', 'Main Info'], ['photos', 'Photos', r => r.photos.length], ['time', 'Time Log', r => r.timeLogs.length], ['history', 'History']],
  newWhy: () => 'Work orders are created from Sales Order items (Sales Orders → Add item)',
  voidCmd: { label: '⊘ Cancel WO', why: r => r.invoiceId ? 'Invoiced – locked' : S.C.CLOSED_STAGES.includes(r.stage) ? `Already ${r.stage}` : '',
    run: r => dialog({ title: `Cancel ${r.ref}`, okLabel: 'Cancel work order', okClass: 'danger',
      body: `<div class="alert info">The item is closed as a <b>zero-value</b> work order and still goes on an invoice as "return as requested".</div><div class="grid3">${fld('req', 'Reason', inp('reason', 'Return as requested'), 'full')}</div>`,
      onOk: fd => api('wo.stage', { id: r.id, stage: 'Cancelled', reason: fd.reason }, { quiet: true }) }) },
  actions: r => {
    const closed = S.C.CLOSED_STAGES.includes(r.stage), next = S.C.NEXT_STAGE[r.stage];
    const lockWhy = r.invoiceId ? 'Invoiced – locked' : closed ? `Work order is ${r.stage}` : '';
    const a = [{ label: next ? `▶ ${next}` : '▶ Next', cls: 'primary', why: lockWhy, run: () => next === 'Technician' || next === 'Complete' ? stageDialog(r, next) : api('wo.stage', { id: r.id, stage: next }).then(() => { toast(`${r.ref} → ${next}`); route(); }).catch(() => {}) },
      { label: 'Set stage…', why: lockWhy, run: () => stageDialog(r) },
      { label: '⏱ Log time', why: r.technicianId || S.data.staff.some(s => s.isTechnician && s.branchId === r.branchId) ? '' : 'No technicians in this branch', run: () => timeDialog(r) }];
    if (S.C.FOLLOW_UP_STAGES.includes(r.stage) && !r.invoiceId) a.push({ label: '📣 Follow-up', run: () => api('wo.followUp', { id: r.id }).then(() => { toast('Follow-up WhatsApp queued (demo sink)'); route(); }).catch(() => {}) });
    if (closed && isSuper()) a.push({ label: '↺ Reopen', why: r.invoiceId ? 'Void the invoice first' : '', run: () => reasonDialog(`Reopen ${r.ref}`, 'Reopen', reason => api('wo.reopen', { id: r.id, reason }, { quiet: true }), 'The work order goes back to QC.') });
    a.push({ label: '🖨 Print WO', run: () => { location.hash = `#/print/wo/${r.id}`; } }, { label: '↗ SO', run: () => goRec('sales-orders', r.soId) });
    return a;
  },
  main: {
    lockNote: r => r.invoiceId ? `Invoiced on ${byId('invoices', r.invoiceId)?.ref} – only location and notes can be changed. Void the invoice (Super Admin) to change the item or price.`
      : r.stage === 'Cancelled' ? `Cancelled – ${r.cancelReason}. Billed at zero.` : '',
    render: (r, ed) => { const full = ed && !r.invoiceId; const so = byId('salesOrders', r.soId);
      return section('Record', sysF('WO no.', 'ref', '', true) + fld('opt', 'RO no. / docket', copyWrap(inp('roNumber', r.roNumber, 'text', !full))) + sysF('SO no.', 'so', '', true) + sysF('Order type', 'otype')
          + sysF('Branch', 'branch') + sysF('Logged', 'created') + sysF('Stage', 'stage') + sysF('Technician', 'tech') + sysF('Invoice no.', 'inv', '', true))
        + section('Customer', sysF('Customer', 'cust', 'wide') + sysF('Phone', 'phone') + sysF('Payment term', 'term') + sysF('Customer ref', 'cref') + fld('opt', 'Location (trolley / area)', inp('location', r.location, 'text', !ed)))
        + itemSections(r, full, so?.currency || branch(r.branchId).currency)
        + section('Notes', fld('opt', 'Notes', txt('notes', r.notes, !ed), 'full')); },
    compute: (form, r) => { const o = itemCompute(form, r, r.branchId); const c = customer(r.customerId); const so = byId('salesOrders', r.soId);
      Object.assign(o.sys, { ref: r.ref, so: so?.ref, otype: r.orderType, branch: branch(r.branchId).name, created: fmtDT(r.createdAt), stage: r.stage + (r.stage === 'Cancelled' ? ` – ${r.cancelReason}` : ''),
        tech: staffName(r.technicianId) || '—', inv: byId('invoices', r.invoiceId)?.ref || '', cust: c?.name, phone: c?.phone, term: c?.paymentTerm, cref: so?.customerRef });
      if (r.invoiceId) o.errors = []; return o; },
    after: (form, r, ed) => { if (ed) itemAfter(form, r.branchId); },
    save: (fd, r, _n, form) => { const p = { ...fd, id: r.id }; if (!r.invoiceId) p.services = new FormData(form).getAll('svc'); return api('wo.save', p); },
  },
  renderTab: {
    photos: (body, r) => {
      body.innerHTML = `<div class="grid-box"><div class="grid-toolbar"><b class="gt-title">Item condition photos</b><span class="sep"></span>
          <input type="file" id="ph" accept="image/jpeg,image/png,image/webp" hidden><input id="phCap" placeholder="Caption (e.g. front panel stain)" class="cap">
          <button class="btn sm primary" id="phAdd">📷 Add photo</button><span class="grow"></span><span class="gt-pos">${r.photos.length} photo(s) · JPG/PNG/WebP up to 5 MB</span></div>
        <div class="photos">${r.photos.map(p => `<figure><a href="${esc(p.url)}" target="_blank"><img src="${esc(p.url)}" alt=""></a><figcaption>${esc(p.caption)}<br><small>${fmtDT(p.at)} · ${esc(p.by)}</small></figcaption></figure>`).join('') || '<p class="empty">No photos yet. Take photos at intake to record the item\'s condition.</p>'}</div></div>`;
      $('#phAdd', body).onclick = () => $('#ph', body).click();
      $('#ph', body).onchange = async e => { const f = e.target.files[0]; if (!f) return;
        try { const url = await upload(f); await api('wo.addPhoto', { id: r.id, url, caption: $('#phCap', body).value }); toast('Photo added'); route(); } catch (err) { toast(err.message, 'error'); } };
    },
    time: (body, r) => { const total = r.timeLogs.reduce((a, l) => a + l.minutes, 0); const byT = {};
      r.timeLogs.forEach(l => byT[l.staffId] = (byT[l.staffId] || 0) + l.minutes);
      childGrid(body, { key: 'wo-time', rows: [...r.timeLogs].sort((a, b) => a.date.localeCompare(b.date)),
        kpis: kpis([['Total time', hm(total)], ['Entries', r.timeLogs.length], ...Object.entries(byT).map(([id, m]) => [staffName(id), hm(m)])]),
        toolbar: [{ label: '+ Add', run: () => timeDialog(r) }, { label: '✎ Edit', needRow: true, run: x => timeDialog(r, x), why: x => !x ? 'Select a row first' : !isSuper() && x.by !== me().name ? 'Only the person who recorded it or a Super Admin' : '' },
          { label: '🗑 Remove', cls: 'danger', why: x => !x ? 'Select a row first' : !isSuper() ? 'Only a Super Admin can remove time entries' : '', run: x => reasonDialog('Remove time entry', 'Remove', reason => api('wo.deleteTime', { id: r.id, logId: x.id, reason }, { quiet: true })) }],
        cols: [['Date', x => fmtDate(x.date)], ['Technician', x => esc(staffName(x.staffId))], ['Minutes', x => x.minutes, 'num'], ['Time', x => hm(x.minutes), 'num'], ['Note', x => esc(x.note)], ['Recorded by', x => esc(x.by)]],
        onOpen: x => timeDialog(r, x), empty: 'No time logged yet.' }); },
  },
});

// ---------- Invoices ----------
function payDialog(inv) {
  dialog({ title: `Record payment – ${inv.ref}`, okLabel: 'Record payment',
    body: `<div class="grid3">${sysF('Balance', 'bal')}${fld('req', 'Date', inp('date', S.data.today, 'date'))}${fld('req', `Amount (${inv.currency})`, inp('amount', invBalance(inv), 'number', false, 'step="0.01" min="0.01"'))}
      ${fld('req', 'Method', sel('method', S.C.PAY_METHODS, 'Bank transfer'))}${fld('opt', 'Reference / remittance no.', inp('reference', ''), 'wide')}</div>`,
    onReady: f => { $('[data-sys=bal]', f).value = money(invBalance(inv), inv.currency); },
    onOk: fd => api('invoice.pay', { id: inv.id, ...fd }, { quiet: true }) });
}
const dueFrom = (date, term) => { const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + (S.C.PAYMENT_TERMS[term] ?? 0)); return isNaN(d) ? '' : fmtDate(d); };
// customer → branch → lines picker shared by New invoice and New group invoice.
// pool(): the records that can go on the document (billable WOs / outstanding invoices), each with customerId + branchId.
function pickerDialog({ title, okLabel, noun, pool, cols, amount, summary, extraFields, onOk, preset = {} }) {
  const all = pool();
  const counts = {}; all.forEach(r => counts[r.customerId] = (counts[r.customerId] || 0) + 1);
  const custs = S.data.customers.filter(c => counts[c.id]).sort((a, b) => a.name.localeCompare(b.name));
  if (!custs.length) return toast(`Nothing to put on a ${noun} – ${noun === 'invoice' ? 'no completed work orders are waiting for an invoice' : 'no unpaid invoices are outside a group invoice'}.`, 'warn');
  dialog({ title, okLabel, wide: true,
    body: `<div class="alert info">1 · Select the customer &nbsp;→&nbsp; 2 · tick the lines. Only customers with something to bill are listed.</div>
      <div class="dlg-scroll"><div class="grid3">${fld('req', 'Customer', sel('customerId', [['', '— select customer —'], ...custs.map(c => [c.id, `${c.name} (${counts[c.id]})`])], preset.customerId || ''), 'span2')}
        <span id="brF" class="fld-slot"></span>${sysF('Payment term', 'term0')}</div>
      <div id="pick"></div></div>`,
    onReady: form => {
      const draw = () => {
        const cid = $('[name=customerId]', form).value, c = customer(cid), host = $('#pick', form);
        $('[data-sys=term0]', form).value = c?.paymentTerm || '';
        const mine = all.filter(r => r.customerId === cid), brs = [...new Set(mine.map(r => r.branchId))];
        const cur = $('[name=branchId]', form)?.value;
        const bid = brs.includes(cur) ? cur : brs.includes(preset.branchId) ? preset.branchId : brs[0];
        $('#brF', form).innerHTML = brs.length > 1 ? fld('req', 'Branch', sel('branchId', brs.map(b => [b, `${b} – ${branch(b).name}`]), bid)) : bid ? `${sysF('Branch', 'br')}<input type="hidden" name="branchId" value="${bid}">` : '';
        if ($('[data-sys=br]', form)) $('[data-sys=br]', form).value = `${bid} – ${branch(bid).name}`;
        $('[name=branchId]', form)?.addEventListener('change', draw);
        if (!c) { host.innerHTML = '<p class="hint">Select the customer first.</p>'; $('button[type=submit]', form).disabled = true; return; }
        const rows = mine.filter(r => r.branchId === bid), b = branch(bid);
        host.innerHTML = `${section(`Lines – ${rows.length} available`, `<div class="grid-wrap" style="width:100%"><table class="grid"><thead><tr><th class="chk"><input type="checkbox" data-all checked></th>${cols.map(([l, , k]) => `<th class="${k || ''}">${l}</th>`).join('')}</tr></thead>
            <tbody>${rows.map(r => `<tr><td class="chk"><input type="checkbox" name="line" value="${r.id}" checked></td>${cols.map(([, fn, k]) => `<td class="${k || ''}">${fn(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)}
          <div id="sum"></div>${extraFields(c, b)}`;
        const upd = () => {
          const ticked = rows.filter(r => $(`[name=line][value="${r.id}"]`, form).checked);
          $('[data-all]', host).checked = ticked.length === rows.length;
          $('#sum', host).innerHTML = summary(ticked, b);
          const fd = Object.fromEntries(new FormData(form));
          if ($('[data-sys=due]', form)) $('[data-sys=due]', form).value = dueFrom(fd.date, fd.paymentTerm);
          $('button[type=submit]', form).disabled = !ticked.length;
        };
        $('[data-all]', host).onchange = e => { $$('[name=line]', host).forEach(x => { x.checked = e.target.checked; }); upd(); };
        host.oninput = host.onchange = upd; upd();
      };
      $('[name=customerId]', form).addEventListener('change', draw); draw();
    },
    onOk: (fd, form) => onOk({ ...fd, ids: $$('[name=line]:checked', form).map(x => x.value) }) });
}
const billableWos = () => scoped('workOrders').filter(w => S.C.CLOSED_STAGES.includes(w.stage) && !w.invoiceId);
function newInvoiceDialog(preset) {
  pickerDialog({ title: 'New invoice (IV)', okLabel: 'Issue invoice', noun: 'invoice', preset, pool: billableWos,
    cols: [['WO no.', w => `<span class="mono">${esc(w.ref)}</span>`], ['RO no.', w => esc(w.roNumber)], ['SO no.', w => esc(byId('salesOrders', w.soId)?.ref)], ['Item', w => esc(`${w.brand} ${w.itemType} – ${w.productCode}`)],
      ['Stage', w => badge(w.stage)], ['Completed', w => fmtDate(w.completedAt)], ['Paid at intake', w => money(w.deposit), 'num'], ['Amount', w => w.stage === 'Cancelled' ? '0.00 <small>return as requested</small>' : money(w.unitPrice), 'num']],
    summary: (t, b) => { const sub = round2(t.reduce((a, w) => a + (w.stage === 'Cancelled' ? 0 : w.unitPrice), 0)), tax = round2(sub * b.taxRate / 100), dep = round2(t.reduce((a, w) => a + (w.deposit || 0), 0));
      return kpis([['Work orders', t.length], ['Subtotal', money(sub, b.currency)], [`${b.taxLabel} ${b.taxRate}%`, money(tax)], ['Total', money(sub + tax, b.currency)], ['Paid at intake', money(dep)], ['Amount due', money(sub + tax - dep, b.currency)]]); },
    extraFields: c => section('Invoice', fld('req', 'Invoice date', inp('date', S.data.today, 'date')) + fld('req', 'Shipped / collected on', inp('shipDate', S.data.today, 'date'))
      + fld('req', 'Payment term', sel('paymentTerm', Object.keys(S.C.PAYMENT_TERMS), c.paymentTerm)) + sysF('Due date', 'due') + fld('opt', 'Customer PO / ref', inp('customerPo', ''))
      + fld('opt', 'Notes (printed)', txt('notes', ''), 'full')) + '<p class="hint">One invoice (IV) however many work orders are ticked. Work orders on an issued invoice are locked; zero-value lines print as "return as requested".</p>',
    onOk: async fd => { const inv = await api('invoice.create', { ...fd, woIds: fd.ids }, { quiet: true }); toast(`${inv.ref} issued`); setTimeout(() => goRec('invoices', inv.id), 0); } });
}
const invCsv = list => downloadCsv(`invoices-${S.data.today}.csv`, ['Invoice no.', 'Group invoice', 'Branch', 'Date', 'Ship date', 'Customer', 'Customer PO', 'Payment term', 'Due date', 'Currency', 'Subtotal', 'Tax', 'Total', 'Paid at intake', 'Payments', 'Balance', 'Status', 'Work orders'],
  list.map(i => [i.ref, activeGivOf(i)?.ref || '', i.branchId, i.date, i.shipDate, customer(i.customerId)?.name, i.customerPo, i.paymentTerm, i.dueDate, i.currency, i.subtotal, i.tax, i.total, i.deposits,
    round2(i.payments.reduce((a, p) => a + p.amount, 0)), invBalance(i), invStatus(i), i.lines.map(l => l.woRef).join(' ')]));
const invLinesCsv = list => downloadCsv(`invoice-lines-${S.data.today}.csv`, ['Invoice no.', 'Date', 'Customer', 'WO no.', 'RO no.', 'SO no.', 'Description', 'Amount', 'Zero reason', 'Currency'],
  list.flatMap(i => i.lines.map(l => [i.ref, i.date, customer(i.customerId)?.name, l.woRef, l.roNumber, l.soRef, l.description, l.amount, l.zeroReason, i.currency])));
const givLink = inv => { const g = activeGivOf(inv); return g ? refLink('group-invoices', g.id, g.ref) : ''; };
erpScreen({
  route: 'invoices', title: 'Invoices', noun: 'invoice',
  list: () => scoped('invoices'), ref: r => r.ref, status: invStatus, statuses: ['Issued', 'Partially paid', 'Overdue', 'Paid', 'Void'],
  filters: [
    { k: 'q', label: 'Invoice / WO / RO / SO / PO no.', cls: 'wide', match: (r, v) => textMatch(v, r.ref, r.customerPo, activeGivOf(r)?.ref) || r.lines.some(l => textMatch(v, l.woRef, l.roNumber, l.soRef)) },
    { k: 'cust', label: 'Customer', match: (r, v) => { const c = customer(r.customerId); return textMatch(v, c?.name, c?.code, c?.phone); } },
    ...branchFilter(),
    { k: 'grp', label: 'Group invoice', type: 'select', options: () => [['', 'All'], ['in', 'In a group invoice'], ['out', 'Not grouped']], match: (r, v) => (v === 'in') === !!activeGivOf(r) },
    ...dateFilters('date', 'Invoice date')],
  sorts: [['new', 'Newest first', (a, b) => b.date.localeCompare(a.date) || b.ref.localeCompare(a.ref)], ['due', 'Due date', (a, b) => a.dueDate.localeCompare(b.dueDate)], ['bal', 'Largest balance', (a, b) => toSgd(invBalance(b), b.currency) - toSgd(invBalance(a), a.currency)]],
  searchButtons: [{ label: '⇩ Export CSV', run: invCsv }, { label: '⇩ Export lines CSV', run: invLinesCsv }],
  columns: [['Invoice no.', r => `<span class="mono">${esc(r.ref)}</span>`], ['Date', r => fmtDate(r.date)], ['Shipped', r => fmtDate(r.shipDate)], ['Br.', r => r.branchId], ['Customer', r => custLink(r.customerId)],
    ['WOs', r => r.lines.length, 'num'], ['Total', r => money(r.total, r.currency), 'num'], ['Balance', r => money(invBalance(r), r.currency), 'num'], ['Due', r => `<span class="${invOverdue(r) ? 'late' : ''}">${fmtDate(r.dueDate)}</span>`],
    ['Group inv.', givLink], ['Status', r => badge(invStatus(r))]],
  tabs: [['main', 'Main Info'], ['lines', 'Lines', r => r.lines.length], ['payments', 'Payments', r => r.payments.length], ['history', 'History']],
  newWhy: () => billableWos().length ? '' : 'No completed work orders are waiting for an invoice',
  onNew: () => newInvoiceDialog(),
  voidCmd: { label: '⊘ Void', why: r => r.status === 'Void' ? 'Already void' : !isSuper() ? 'Only a Super Admin can void an invoice' : r.payments.length ? 'Payments recorded – cannot void' : activeGivOf(r) ? `Part of ${activeGivOf(r).ref} – void the group invoice first` : '',
    run: r => reasonDialog(`Void ${r.ref}`, 'Void invoice', reason => api('invoice.void', { id: r.id, reason }, { quiet: true }), 'Its work orders are released and can be put on a new invoice.') },
  actions: r => { const g = activeGivOf(r); return [
    { label: '💳 Record payment', cls: 'primary', why: r.status === 'Void' ? 'Void' : invBalance(r) <= 0 ? 'Fully paid' : g ? `Part of ${g.ref} – record the payment on the group invoice` : '', run: () => payDialog(r) },
    ...(g ? [{ label: `↗ ${g.ref}`, run: () => goRec('group-invoices', g.id) }] : []),
    { label: '🖨 Print / PDF', run: () => { location.hash = `#/print/iv/${r.id}`; } },
    { label: '🔗 Payment link', why: 'Xero / OCBC payment links – deferred (D-03)', run: () => {} }]; },
  main: {
    canEdit: r => r.status === 'Void' ? 'Void invoices cannot be edited' : '',
    lockNote: r => r.status === 'Void' ? `Void – ${r.voidReason}` : activeGivOf(r) ? `Part of group invoice ${activeGivOf(r).ref} – payments are recorded there and update this invoice. Lines and amounts are locked.`
      : 'Issued – lines and amounts are locked. Only the customer PO and notes can change. A Super Admin can void an unpaid invoice to correct it.',
    render: (r, ed) => section('Record', sysF('Invoice no.', 'ref', '', true) + sysF('Status', 'status') + sysF('Group invoice', 'giv') + sysF('Branch', 'branch') + sysF('Invoice date', 'date') + sysF('Shipped / collected', 'ship')
          + sysF('Payment term', 'term') + sysF('Due date', 'due'))
        + section('Customer', sysF('Customer', 'cust', 'wide') + sysF('Phone', 'phone') + sysF('Address', 'addr', 'span2') + fld('opt', 'Customer PO / ref', inp('customerPo', r.customerPo, 'text', !ed)))
        + section('Amounts', sysF('Currency', 'cur') + sysF('Subtotal', 'sub') + sysF('Tax', 'tax') + sysF('Total', 'total') + sysF('Less paid at intake', 'dep') + sysF('Amount due', 'due2') + sysF('Payments', 'paid') + sysF('Balance', 'bal'))
        + section('Notes', fld('opt', 'Notes (printed on the invoice)', txt('notes', r.notes, !ed), 'full')),
    compute: (form, r) => { const c = customer(r.customerId); const paid = r.payments.reduce((a, p) => a + p.amount, 0);
      return { errors: [], sys: { ref: r.ref, giv: activeGivOf(r)?.ref || '—', status: invStatus(r), branch: branch(r.branchId).name, date: fmtDate(r.date), ship: fmtDate(r.shipDate), term: r.paymentTerm, due: fmtDate(r.dueDate),
        cust: c?.name, phone: c?.phone, addr: c?.address, cur: r.currency, sub: money(r.subtotal), tax: `${r.taxLabel} ${r.taxRate}% · ${money(r.tax)}`, total: money(r.total, r.currency), dep: money(r.deposits), due2: money(r.amountDue, r.currency), paid: money(paid), bal: money(invBalance(r), r.currency) } }; },
    save: (fd, r) => api('invoice.save', { ...fd, id: r.id }),
  },
  renderTab: {
    lines: (body, r) => childGrid(body, { key: 'iv-lines', rows: r.lines.map(l => ({ ...l, id: l.woId })), onOpen: x => goRec('work-orders', x.woId),
      toolbar: [{ label: 'Open work order', needRow: true, run: x => goRec('work-orders', x.woId) }],
      cols: [['WO no.', x => refLink('work-orders', x.woId, x.woRef)], ['RO no.', x => esc(x.roNumber)], ['SO no.', x => esc(x.soRef)], ['Description', x => esc(x.description) + (x.zeroReason ? ` <span class="badge gray">${esc(x.zeroReason)}</span>` : ''), 'wrap'],
        ['Paid at intake', x => money(x.deposit), 'num'], ['Amount', x => money(x.amount), 'num']],
      foot: `<tr><td colspan="6" class="num">Subtotal</td><td class="num">${money(r.subtotal)}</td></tr><tr><td colspan="6" class="num">${r.taxLabel} ${r.taxRate}%</td><td class="num">${money(r.tax)}</td></tr><tr><td colspan="6" class="num"><b>Total ${r.currency}</b></td><td class="num"><b>${money(r.total)}</b></td></tr>` }),
    payments: (body, r) => { const g = activeGivOf(r); childGrid(body, { key: 'iv-pay', rows: r.payments,
      kpis: kpis([['Amount due', money(r.amountDue, r.currency)], ['Paid', money(r.amountDue - invBalance(r))], ['Balance', money(invBalance(r), r.currency), invBalance(r) > 0 ? (invOverdue(r) ? 'danger' : 'warn') : 'ok'], ['Due', fmtDate(r.dueDate)]]),
      toolbar: [{ label: '+ Record payment', why: r.status === 'Void' ? 'Void' : invBalance(r) <= 0 ? 'Fully paid' : g ? `Part of ${g.ref} – record the payment on the group invoice` : '', run: () => payDialog(r) }],
      cols: [['Date', x => fmtDate(x.date)], ['Amount', x => money(x.amount, r.currency), 'num'], ['Method', x => esc(x.method)], ['Reference', x => esc(x.reference)], ['Recorded by', x => esc(x.by)]], empty: 'No payments yet.' }); },
  },
});

// ---------- Group invoices (GIV): several unpaid invoices of one customer billed together ----------
const givPool = () => scoped('invoices').filter(i => i.status !== 'Void' && invBalance(i) > 0 && !activeGivOf(i));
function newGivDialog(preset) {
  pickerDialog({ title: 'New group invoice (GIV)', okLabel: 'Issue group invoice', noun: 'group invoice', preset, pool: givPool,
    cols: [['Invoice no.', i => `<span class="mono">${esc(i.ref)}</span>`], ['Date', i => fmtDate(i.date)], ['WOs', i => esc(i.lines.map(l => l.woRef).join(', '))], ['Due', i => `<span class="${invOverdue(i) ? 'late' : ''}">${fmtDate(i.dueDate)}</span>`],
      ['Status', i => badge(invStatus(i))], ['Amount due', i => money(i.amountDue), 'num'], ['Paid', i => money(i.amountDue - invBalance(i)), 'num'], ['Outstanding', i => money(invBalance(i)), 'num']],
    summary: (t, b) => kpis([['Invoices', t.length], ['Amount due', money(t.reduce((a, i) => a + i.amountDue, 0), b.currency)], ['Already paid', money(t.reduce((a, i) => a + i.amountDue - invBalance(i), 0))],
      ['Outstanding', money(t.reduce((a, i) => a + invBalance(i), 0), b.currency), 'warn']]),
    extraFields: c => section('Group invoice', fld('req', 'Date', inp('date', S.data.today, 'date')) + fld('req', 'Payment term', sel('paymentTerm', Object.keys(S.C.PAYMENT_TERMS), c.paymentTerm)) + sysF('Due date', 'due')
      + fld('opt', 'Customer PO / ref', inp('customerPo', '')) + fld('opt', 'Notes (printed)', txt('notes', ''), 'full'))
      + '<p class="hint">The invoices stay as they are; a payment recorded on the group invoice is applied to them (earliest due first) and updates their status.</p>',
    onOk: async fd => { const g = await api('giv.create', { ...fd, invoiceIds: fd.ids }, { quiet: true }); toast(`${g.ref} issued`); setTimeout(() => goRec('group-invoices', g.id), 0); } });
}
function givPayDialog(g) {
  const invs = givInvoices(g).filter(i => invBalance(i) > 0);
  dialog({ title: `Record payment – ${g.ref}`, okLabel: 'Record payment', wide: true,
    body: `<div class="grid3">${sysF('Balance', 'bal')}${fld('req', 'Date', inp('date', S.data.today, 'date'))}${fld('req', `Amount (${g.currency})`, inp('amount', givBalance(g), 'number', false, 'step="0.01" min="0.01"'))}
      ${fld('req', 'Method', sel('method', S.C.PAY_METHODS, 'Bank transfer'))}${fld('opt', 'Reference / remittance no.', inp('reference', ''), 'wide')}</div>
      <div class="grid-wrap"><table class="grid"><thead><tr><th>Invoice no.</th><th>Due</th><th class="num">Outstanding</th><th class="num">Applied</th><th>Becomes</th></tr></thead><tbody id="alloc"></tbody></table></div>
      <p class="hint">Applied to the invoices earliest due first; each invoice records its share and its status updates.</p>`,
    onReady: f => { $('[data-sys=bal]', f).value = money(givBalance(g), g.currency);
      const upd = () => { let left = round2(Number($('[name=amount]', f).value) || 0);
        $('#alloc', f).innerHTML = invs.map(i => { const a = Math.max(0, Math.min(left, invBalance(i))); left = round2(left - a);
          return `<tr><td class="mono">${esc(i.ref)}</td><td>${fmtDate(i.dueDate)}</td><td class="num">${money(invBalance(i))}</td><td class="num">${money(a)}</td><td>${a <= 0 ? badge(invStatus(i)) : badge(a >= invBalance(i) - 0.001 ? 'Paid' : 'Partially paid')}</td></tr>`; }).join(''); };
      f.addEventListener('input', upd); upd(); },
    onOk: fd => api('giv.pay', { id: g.id, ...fd }, { quiet: true }) });
}
erpScreen({
  route: 'group-invoices', title: 'Group Invoices', noun: 'group invoice',
  list: () => scoped('groupInvoices'), ref: r => r.ref, status: givStatus, statuses: ['Issued', 'Partially paid', 'Overdue', 'Paid', 'Void'],
  filters: [
    { k: 'q', label: 'GIV / invoice / PO no.', cls: 'wide', match: (r, v) => textMatch(v, r.ref, r.customerPo) || givInvoices(r).some(i => textMatch(v, i.ref)) },
    { k: 'cust', label: 'Customer', match: (r, v) => { const c = customer(r.customerId); return textMatch(v, c?.name, c?.code, c?.phone); } },
    ...branchFilter(), ...dateFilters('date', 'Date')],
  sorts: [['new', 'Newest first', (a, b) => b.date.localeCompare(a.date) || b.ref.localeCompare(a.ref)], ['due', 'Due date', (a, b) => a.dueDate.localeCompare(b.dueDate)]],
  columns: [['GIV no.', r => `<span class="mono">${esc(r.ref)}</span>`], ['Date', r => fmtDate(r.date)], ['Br.', r => r.branchId], ['Customer', r => custLink(r.customerId)],
    ['Invoices', r => r.invoiceIds.length, 'num'], ['Amount due', r => money(givDue(r), r.currency), 'num'], ['Balance', r => money(givBalance(r), r.currency), 'num'], ['Terms', r => esc(r.paymentTerm)],
    ['Due', r => `<span class="${givOverdue(r) ? 'late' : ''}">${fmtDate(r.dueDate)}</span>`], ['Status', r => badge(givStatus(r))]],
  tabs: [['main', 'Main Info'], ['invoices', 'Invoices', r => r.invoiceIds.length], ['payments', 'Payments', r => r.payments.length], ['history', 'History']],
  newWhy: () => givPool().length ? '' : 'No unpaid invoices outside a group invoice',
  onNew: () => newGivDialog(),
  voidCmd: { label: '⊘ Void', why: r => r.status === 'Void' ? 'Already void' : !isSuper() ? 'Only a Super Admin can void a group invoice' : r.payments.length ? 'Payments recorded – cannot void' : '',
    run: r => reasonDialog(`Void ${r.ref}`, 'Void group invoice', reason => api('giv.void', { id: r.id, reason }, { quiet: true }), 'Its invoices are released (not voided) and can be paid on their own or grouped again.') },
  actions: r => [
    { label: '💳 Record payment', cls: 'primary', why: r.status === 'Void' ? 'Void' : givBalance(r) <= 0 ? 'Fully paid' : '', run: () => givPayDialog(r) },
    { label: '🖨 Print / PDF', run: () => { location.hash = `#/print/giv/${r.id}`; } }],
  main: {
    canEdit: r => r.status === 'Void' ? 'Void group invoices cannot be edited' : '',
    lockNote: r => r.status === 'Void' ? `Void – ${r.voidReason}` : 'The invoices in this group are fixed. Payments recorded here are applied to them. A Super Admin can void a group invoice without payments to regroup.',
    render: (r, ed) => section('Record', sysF('GIV no.', 'ref', '', true) + sysF('Status', 'status') + sysF('Branch', 'branch') + sysF('Date', 'date') + sysF('Payment term', 'term') + sysF('Due date', 'due') + sysF('Created by', 'by'))
        + section('Customer', sysF('Customer', 'cust', 'wide') + sysF('Phone', 'phone') + sysF('Address', 'addr', 'span2') + fld('opt', 'Customer PO / ref', inp('customerPo', r.customerPo, 'text', !ed)))
        + section('Amounts', sysF('Currency', 'cur') + sysF('Invoices', 'n') + sysF('Amount due', 'amt') + sysF('Paid', 'paid') + sysF('Balance', 'bal'))
        + section('Notes', fld('opt', 'Notes (printed on the group invoice)', txt('notes', r.notes, !ed), 'full')),
    compute: (form, r) => { const c = customer(r.customerId);
      return { errors: [], sys: { ref: r.ref, status: givStatus(r), branch: branch(r.branchId).name, date: fmtDate(r.date), term: r.paymentTerm, due: fmtDate(r.dueDate), by: r.createdBy,
        cust: c?.name, phone: c?.phone, addr: c?.address, cur: r.currency, n: r.invoiceIds.length, amt: money(givDue(r), r.currency), paid: money(givDue(r) - givBalance(r)), bal: money(givBalance(r), r.currency) } }; },
    save: (fd, r) => api('giv.save', { ...fd, id: r.id }),
  },
  renderTab: {
    invoices: (body, r) => { const rows = givInvoices(r);
      childGrid(body, { key: 'giv-iv', rows, onOpen: x => goRec('invoices', x.id),
        kpis: kpis([['Invoices', rows.length], ['Amount due', money(givDue(r), r.currency)], ['Paid', money(givDue(r) - givBalance(r))], ['Balance', money(givBalance(r), r.currency), givBalance(r) > 0 ? (givOverdue(r) ? 'danger' : 'warn') : 'ok']]),
        toolbar: [{ label: 'Open invoice', needRow: true, run: x => goRec('invoices', x.id) }],
        cols: [['Invoice no.', x => refLink('invoices', x.id, x.ref)], ['Date', x => fmtDate(x.date)], ['WOs', x => esc(x.lines.map(l => l.woRef).join(', ')), 'wrap'], ['Due', x => `<span class="${invOverdue(x) ? 'late' : ''}">${fmtDate(x.dueDate)}</span>`],
          ['Amount due', x => money(x.amountDue), 'num'], ['Paid', x => money(x.amountDue - invBalance(x)), 'num'], ['Balance', x => money(invBalance(x)), 'num'], ['Status', x => badge(invStatus(x))]] }); },
    payments: (body, r) => childGrid(body, { key: 'giv-pay', rows: r.payments,
      toolbar: [{ label: '+ Record payment', why: r.status === 'Void' ? 'Void' : givBalance(r) <= 0 ? 'Fully paid' : '', run: () => givPayDialog(r) }],
      cols: [['Date', x => fmtDate(x.date)], ['Amount', x => money(x.amount, r.currency), 'num'], ['Method', x => esc(x.method)], ['Reference', x => esc(x.reference)],
        ['Applied to', x => esc(x.allocations.map(a => `${a.ref} ${money(a.amount)}`).join(' · ')), 'wrap'], ['Recorded by', x => esc(x.by)]], empty: 'No payments yet.' }),
  },
});

// ---------- Staff (HR) ----------
const leaveStats = (s, year = S.data.today.slice(0, 4)) => { const ls = S.data.leaves.filter(l => l.staffId === s.id && l.type === 'Annual' && l.from.startsWith(year));
  const taken = ls.filter(l => l.status === 'Approved').reduce((a, l) => a + l.days, 0), pending = ls.filter(l => l.status === 'Pending').reduce((a, l) => a + l.days, 0);
  return { taken, pending, balance: s.annualLeave - taken - pending }; };
// minutes logged by a technician in a year, optionally only up to month-day `upTo` (same-period comparison)
const minutesBy = (staffId, year, upTo = '12-31') => S.data.workOrders.reduce((a, w) => a + w.timeLogs.filter(l => l.staffId === staffId && l.date.startsWith(String(year)) && l.date.slice(5) <= upTo).reduce((x, l) => x + l.minutes, 0), 0);
const onLeaveToday = id => S.data.leaves.some(l => l.staffId === id && l.status === 'Approved' && l.from <= S.data.today && l.to >= S.data.today);
function leaveDialog(staffId) {
  const staff = S.data.staff.filter(s => s.status === 'Active');
  dialog({ title: 'Apply leave', okLabel: 'Submit application',
    body: `<div class="grid3">${fld('req', 'Staff', sel('staffId', [['', '— select —'], ...staff.map(s => [s.id, `${s.name} (${s.branchId})`])], staffId), 'wide')}${fld('req', 'Leave type', sel('type', S.C.LEAVE_TYPES, 'Annual'))}
      ${fld('req', 'From', inp('from', S.data.today, 'date'))}${fld('req', 'To', inp('to', S.data.today, 'date'))}<label class="fld check"><input type="checkbox" name="halfDay"><span>Half day</span></label>
      ${sysF('Working days', 'days')}${sysF('Annual leave left', 'bal')}${fld('opt', 'Reason', inp('reason', ''), 'span2')}</div><p class="hint">Applied by front desk on behalf of staff; a Super Admin approves.</p>`,
    onReady: f => { const run = () => { const fd = Object.fromEntries(new FormData(f)); const s = byId('staff', fd.staffId);
        let n = 0; if (fd.from && fd.to && fd.to >= fd.from) for (let d = new Date(fd.from + 'T00:00:00'); d <= new Date(fd.to + 'T00:00:00'); d.setDate(d.getDate() + 1)) if (d.getDay() % 6) n++;
        $('[data-sys=days]', f).value = fd.halfDay && n === 1 ? 0.5 : n; $('[data-sys=bal]', f).value = s ? leaveStats(s).balance : ''; };
      f.addEventListener('input', run); f.addEventListener('change', run); run(); },
    onOk: fd => api('leave.apply', { ...fd, halfDay: !!fd.halfDay }, { quiet: true }) });
}
const decideDialog = (l, decision) => dialog({ title: `${decision === 'Approved' ? 'Approve' : 'Reject'} ${l.ref}`, okLabel: decision === 'Approved' ? 'Approve' : 'Reject', okClass: decision === 'Approved' ? 'primary' : 'danger',
  body: `<p><b>${esc(staffName(l.staffId))}</b> · ${esc(l.type)} · ${fmtDate(l.from)} – ${fmtDate(l.to)} (${l.days} day(s))<br>${esc(l.reason)}</p>
    <p class="hint">Open work orders assigned: ${S.data.workOrders.filter(w => w.technicianId === l.staffId && !S.C.CLOSED_STAGES.includes(w.stage)).length}</p>
    <div class="grid3">${fld(decision === 'Rejected' ? 'req' : 'opt', 'Note', inp('note', ''), 'full')}</div>`,
  onOk: fd => api('leave.decide', { id: l.id, decision, note: fd.note }, { quiet: true }) });
const leaveCols = [['Ref', x => refLink('leave', x.id, x.ref)], ['Type', x => esc(x.type)], ['From', x => fmtDate(x.from)], ['To', x => fmtDate(x.to)], ['Days', x => x.days, 'num'], ['Reason', x => esc(x.reason)], ['Status', x => badge(x.status)], ['Decided by', x => esc(x.decidedBy || '')]];
erpScreen({
  route: 'staff', title: 'Staff', noun: 'staff record',
  list: () => scoped('staff'), ref: r => r.code, status: r => r.status, statuses: ['Active', 'Inactive'],
  filters: [{ k: 'q', label: 'Code / name', match: (r, v) => textMatch(v, r.code, r.name, r.nameZh) }, ...branchFilter(),
    { k: 'tech', label: 'Technicians', type: 'select', options: () => [['', 'All staff'], ['y', 'Technicians only'], ['n', 'Non-technicians']], match: (r, v) => (v === 'y') === !!r.isTechnician }],
  sorts: [['br', 'Branch, name', (a, b) => a.branchId.localeCompare(b.branchId) || a.name.localeCompare(b.name)], ['name', 'Name', (a, b) => a.name.localeCompare(b.name)]],
  columns: [['Code', r => `<span class="mono">${esc(r.code)}</span>`], ['Name', r => esc(r.name)], ['中文', r => esc(r.nameZh)], ['Br.', r => r.branchId], ['Position', r => esc(r.position)],
    ['Tech', r => r.isTechnician ? '✔' : ''], ['Open WOs', r => r.isTechnician ? S.data.workOrders.filter(w => w.technicianId === r.id && !S.C.CLOSED_STAGES.includes(w.stage)).length : '', 'num'],
    ['AL left', r => leaveStats(r).balance, 'num'], ['Today', r => onLeaveToday(r.id) ? badge('On leave', 'warn') : ''], ['Status', r => badge(r.status)]],
  tabs: [['main', 'Main Info'], ['leave', 'Leave', r => S.data.leaves.filter(l => l.staffId === r.id && l.status === 'Pending').length || ''], ['workload', 'Workload'], ['history', 'History']],
  voidCmd: { label: '⊘ Deactivate', why: r => r.status === 'Inactive' ? 'Already inactive' : '', run: r => dialog({ title: `Deactivate ${r.name}?`, okLabel: 'Deactivate', okClass: 'danger',
    body: '<p>Inactive staff keep their history and time logs but cannot be assigned new work. Records are never deleted.</p>', onOk: () => api('staff.save', { ...r, status: 'Inactive' }, { quiet: true }) }) },
  actions: r => [{ label: '+ Apply leave', run: () => leaveDialog(r.id) }],
  main: {
    render: (r, ed) => section('Record', sysF('Staff code', 'code', '', true) + fld('opt', 'Status', sel('status', ['Active', 'Inactive'], r?.status || 'Active', !ed)))
      + section('Person', fld('req', 'Name', inp('name', ro(r, 'name'), 'text', !ed), 'wide') + fld('opt', '中文名', inp('nameZh', ro(r, 'nameZh'), 'text', !ed))
        + fld('req', 'Branch', sel('branchId', branchOpts(), r?.branchId || me().branchId || 'SG', !ed || !isSuper())) + fld('req', 'Position', inp('position', ro(r, 'position'), 'text', !ed, 'list="positions"'))
        + `<label class="fld check"><input type="checkbox" name="isTechnician" ${r?.isTechnician ? 'checked' : ''} ${ed ? '' : 'disabled'}><span>Technician / artisan (appears in technician lists)</span></label>`
        + fld('opt', 'Phone', inp('phone', ro(r, 'phone'), 'tel', !ed)) + fld('opt', 'Email', inp('email', ro(r, 'email'), 'email', !ed), 'wide') + fld('req', 'Join date', inp('joinDate', ro(r, 'joinDate'), 'date', !ed)))
      + section('Leave ' + S.data.today.slice(0, 4), fld('req', 'Annual leave (days / year)', inp('annualLeave', r?.annualLeave ?? 14, 'number', !ed, 'min="0" max="60"')) + sysF('Taken', 'taken') + sysF('Pending', 'pending') + sysF('Balance', 'bal'))
      + section('Notes', fld('opt', 'Notes', txt('notes', ro(r, 'notes'), !ed), 'full')),
    compute: (form, r) => { const fd = Object.fromEntries(new FormData(form)); const ls = r ? leaveStats(r) : { taken: 0, pending: 0 };
      const ent = Number(fd.annualLeave ?? r?.annualLeave); const errors = [];
      if (!(fd.name ?? r?.name)?.trim()) errors.push('Name is required.'); if (!(fd.position ?? r?.position)?.trim()) errors.push('Position is required.'); if (!(fd.joinDate ?? r?.joinDate)) errors.push('Join date is required.');
      return { errors, sys: { code: r?.code || '(new)', taken: ls.taken, pending: ls.pending, bal: ent - ls.taken - ls.pending } }; },
    save: (fd, r) => api('staff.save', { ...fd, id: r?.id, branchId: fd.branchId || r?.branchId, isTechnician: !!fd.isTechnician }),
  },
  renderTab: {
    leave: (body, r) => { const ls = leaveStats(r);
      childGrid(body, { key: 'stf-leave', rows: S.data.leaves.filter(l => l.staffId === r.id).sort((a, b) => b.from.localeCompare(a.from)), onOpen: x => goRec('leave', x.id),
        kpis: kpis([['Entitlement', r.annualLeave], ['Taken', ls.taken], ['Pending', ls.pending, ls.pending ? 'warn' : ''], ['Balance', ls.balance, ls.balance < 0 ? 'danger' : 'ok']]),
        toolbar: [{ label: '+ Apply leave', run: () => leaveDialog(r.id) },
          { label: '✔ Approve', why: x => !isSuper() ? 'Only a Super Admin approves leave' : !x ? 'Select a row first' : x.status !== 'Pending' ? 'Not pending' : '', run: x => decideDialog(x, 'Approved') },
          { label: '✕ Reject', why: x => !isSuper() ? 'Only a Super Admin rejects leave' : !x ? 'Select a row first' : x.status !== 'Pending' ? 'Not pending' : '', run: x => decideDialog(x, 'Rejected') }],
        cols: leaveCols, empty: 'No leave applications.' }); },
    workload: (body, r) => { const y = Number(S.data.today.slice(0, 4)); const open = S.data.workOrders.filter(w => w.technicianId === r.id && !S.C.CLOSED_STAGES.includes(w.stage));
      childGrid(body, { key: 'stf-work', rows: open, onOpen: x => goRec('work-orders', x.id),
        kpis: kpis([['Open WOs', open.length, open.length > 4 ? 'warn' : ''], ['Past est. date', open.filter(w => w.estDate < S.data.today).length, open.some(w => w.estDate < S.data.today) ? 'danger' : ''], [`Hours ${y}`, hm(minutesBy(r.id, y))], [`Hours ${y - 1}`, hm(minutesBy(r.id, y - 1))], ['On leave today', onLeaveToday(r.id) ? 'Yes' : 'No']]),
        toolbar: [{ label: 'Open work order', needRow: true, run: x => goRec('work-orders', x.id) }],
        cols: [['WO no.', x => refLink('work-orders', x.id, x.ref)], ['Customer', x => custLink(x.customerId)], ['Item', x => esc(`${x.brand} ${x.itemType}`)], ['Est.', x => `<span class="${x.estDate < S.data.today ? 'late' : ''}">${fmtDate(x.estDate)}</span>`], ['Stage', x => badge(x.stage)], ['Logged', x => hm(x.timeLogs.filter(l => l.staffId === r.id).reduce((a, l) => a + l.minutes, 0)), 'num']],
        empty: r.isTechnician ? 'No open work orders assigned.' : 'Not a technician.' }); },
  },
});

// ---------- Leave ----------
erpScreen({
  route: 'leave', title: 'Leave', noun: 'leave application',
  list: () => scoped('leaves'), ref: r => r.ref, status: r => r.status, statuses: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
  filters: [{ k: 'q', label: 'Ref / staff', match: (r, v) => textMatch(v, r.ref, staffName(r.staffId)) }, ...branchFilter(),
    { k: 'type', label: 'Type', type: 'select', options: () => [['', 'All'], ...S.C.LEAVE_TYPES], match: (r, v) => r.type === v }, ...dateFilters('from', 'Starting')],
  sorts: [['new', 'Latest start first', (a, b) => b.from.localeCompare(a.from)], ['old', 'Earliest start first', (a, b) => a.from.localeCompare(b.from)]],
  columns: [['Ref', r => `<span class="mono">${esc(r.ref)}</span>`], ['Staff', r => esc(staffName(r.staffId))], ['Br.', r => r.branchId], ['Type', r => esc(r.type)], ['From', r => fmtDate(r.from)], ['To', r => fmtDate(r.to)],
    ['Days', r => r.days, 'num'], ['Applied by', r => esc(r.appliedBy)], ['Status', r => badge(r.status)], ['Decided by', r => esc(r.decidedBy || '')]],
  tabs: [['main', 'Main Info'], ['history', 'History']],
  voidCmd: { label: '⊘ Cancel leave', why: r => !['Pending', 'Approved'].includes(r.status) ? `Already ${r.status}` : r.status === 'Approved' && !isSuper() ? 'Only a Super Admin can cancel approved leave' : '',
    run: r => reasonDialog(`Cancel ${r.ref}`, 'Cancel leave', reason => api('leave.cancel', { id: r.id, reason }, { quiet: true })) },
  actions: r => r.status === 'Pending' ? [{ label: '✔ Approve', cls: 'primary', why: isSuper() ? '' : 'Only a Super Admin approves leave', run: () => decideDialog(r, 'Approved') },
    { label: '✕ Reject', why: isSuper() ? '' : 'Only a Super Admin rejects leave', run: () => decideDialog(r, 'Rejected') }] : [],
  main: {
    canEdit: r => r.status !== 'Pending' ? 'Only pending applications can be changed' : '',
    lockNote: r => r.status !== 'Pending' ? `${r.status}${r.decisionNote ? ' – ' + r.decisionNote : ''}. Cancel and re-apply to change dates.` : '',
    render: (r, ed) => section('Application', sysF('Ref', 'ref', '', true) + sysF('Status', 'status') + fld('req', 'Staff', sel('staffId', [['', '— select —'], ...S.data.staff.filter(s => s.status === 'Active' || s.id === r?.staffId).map(s => [s.id, `${s.name} (${s.branchId})`])], ro(r, 'staffId'), !ed), 'wide')
        + fld('req', 'Leave type', sel('type', S.C.LEAVE_TYPES, r?.type || 'Annual', !ed)) + fld('req', 'From', inp('from', r?.from || S.data.today, 'date', !ed)) + fld('req', 'To', inp('to', r?.to || S.data.today, 'date', !ed))
        + `<label class="fld check"><input type="checkbox" name="halfDay" ${r?.halfDay ? 'checked' : ''} ${ed ? '' : 'disabled'}><span>Half day</span></label>` + sysF('Working days', 'days') + sysF('Annual leave left', 'bal') + fld('opt', 'Reason', inp('reason', ro(r, 'reason'), 'text', !ed), 'span2'))
      + section('Decision', sysF('Applied by', 'by') + sysF('Applied', 'at') + sysF('Decided by', 'dby') + sysF('Decided', 'dat') + sysF('Note', 'note', 'span2')),
    compute: (form, r) => { const fd = Object.fromEntries(new FormData(form)); const v = k => fd[k] ?? r?.[k]; const s = byId('staff', v('staffId'));
      let n = 0; if (v('from') && v('to') && v('to') >= v('from')) for (let d = new Date(v('from') + 'T00:00:00'); d <= new Date(v('to') + 'T00:00:00'); d.setDate(d.getDate() + 1)) if (d.getDay() % 6) n++;
      const days = (fd.halfDay ?? (r?.halfDay ? 'on' : '')) && n === 1 ? 0.5 : n; const errors = [];
      if (!v('staffId')) errors.push('Staff is required.'); if (v('to') < v('from')) errors.push('The end date is before the start date.'); else if (!days) errors.push('The period has no working days.');
      const bal = s ? leaveStats(s).balance + (r && r.status === 'Pending' && r.type === 'Annual' ? r.days : 0) : '';
      const warnings = s && v('type') === 'Annual' && days > bal ? [`Only ${bal} day(s) of annual leave left.`] : [];
      return { errors, warnings, sys: { ref: r?.ref || '(on save)', status: r?.status || 'Pending', days, bal, by: r?.appliedBy || me().name, at: fmtDT(r?.appliedAt), dby: r?.decidedBy, dat: fmtDT(r?.decidedAt), note: r?.decisionNote } }; },
    save: (fd, r) => api('leave.apply', { ...fd, id: r?.id, halfDay: !!fd.halfDay }),
  },
  renderTab: {},
});

// ---------- Set-up: Branches and Repair glossary ----------
erpScreen({
  route: 'branches', title: 'Branches', noun: 'branch',
  list: () => S.data.branches, ref: r => r.id, status: () => 'Active',
  columns: [['Code', r => `<b>${r.id}</b>`], ['Branch', r => esc(r.name)], ['Country', r => esc(r.country)], ['Currency', r => r.currency], ['Tax', r => `${esc(r.taxLabel)} ${r.taxRate}%`], ['FX → SGD', r => S.data.settings.fxToSgd[r.currency], 'num'], ['Legal name', r => esc(r.legalName)]],
  tabs: [['main', 'Main Info'], ['history', 'History']],
  newWhy: () => 'New branches are added by Majutech (currency and numbering set-up)',
  main: {
    canEdit: () => isSuper() ? '' : 'Only a Super Admin can change branch settings',
    lockNote: () => 'Tax and address changes apply to new sales orders and invoices only; issued documents keep their original values.',
    render: (r, ed) => section('Branch', sysF('Code', 'id') + sysF('Country', 'country') + sysF('Currency', 'cur') + fld('req', 'Branch name', inp('name', r.name, 'text', !ed)) + fld('opt', 'Phone', inp('phone', r.phone, 'text', !ed)) + fld('opt', 'Website (printed)', inp('website', r.website || '', 'text', !ed)))
      + section('Legal & tax', fld('opt', 'Legal entity name', inp('legalName', r.legalName, 'text', !ed), 'span2') + fld('opt', 'Company reg. no.', inp('regNo', r.regNo, 'text', !ed)) + fld('opt', 'Tax reg. no.', inp('taxRegNo', r.taxRegNo, 'text', !ed))
        + fld('req', 'Tax label', inp('taxLabel', r.taxLabel, 'text', !ed)) + fld('req', 'Tax rate %', inp('taxRate', r.taxRate, 'number', !ed, 'step="0.01" min="0" max="30"')) + fld('opt', 'Address', inp('address', r.address, 'text', !ed), 'span2'))
      + section('Invoice', fld('opt', 'Bank / payment details', txt('bankInfo', r.bankInfo, !ed), 'full') + fld('opt', 'Terms & conditions (printed on the sales order)', txt('invoiceTerms', r.invoiceTerms, !ed, 6), 'full')),
    compute: (form, r) => ({ errors: [], sys: { id: r.id, country: r.country, cur: r.currency } }),
    save: (fd, r) => api('branch.save', { ...fd, id: r.id }),
  },
  renderTab: {},
});
erpScreen({
  route: 'glossary', title: 'Repair glossary', noun: 'repair service',
  list: () => S.data.glossary, ref: r => r.code, status: r => r.status, statuses: ['Active', 'Inactive'],
  filters: [{ k: 'q', label: 'English / 中文', cls: 'wide', match: (r, v) => textMatch(v, r.en, r.zh, r.code) }, { k: 'category', label: 'Category', type: 'select', options: () => [['', 'All'], ...new Set(S.data.glossary.map(g => g.category))], match: (r, v) => r.category === v }],
  sorts: [['cat', 'Category', (a, b) => a.category.localeCompare(b.category) || a.en.localeCompare(b.en)], ['en', 'English A–Z', (a, b) => a.en.localeCompare(b.en)]],
  columns: [['Code', r => `<span class="mono">${esc(r.code)}</span>`], ['English', r => esc(r.en)], ['中文', r => `<span class="zh">${esc(r.zh)}</span>`], ['Category', r => esc(r.category)], ['Default (SGD)', r => r.defaultPrice == null ? '' : money(r.defaultPrice), 'num'], ['Status', r => badge(r.status)]],
  tabs: [['main', 'Main Info'], ['history', 'History']],
  newWhy: () => isSuper() ? '' : 'Only a Super Admin can add repair services',
  main: {
    canEdit: () => isSuper() ? '' : 'Only a Super Admin can change the glossary',
    render: (r, ed) => section('Repair service', sysF('Code', 'code') + fld('req', 'English term', inp('en', ro(r, 'en'), 'text', !ed), 'wide') + fld('req', '中文', inp('zh', ro(r, 'zh'), 'text', !ed), 'wide')
      + fld('opt', 'Category', inp('category', ro(r, 'category'), 'text', !ed, 'list="cats"')) + fld('opt', 'Default price (SGD, excl. tax)', inp('defaultPrice', r?.defaultPrice ?? '', 'number', !ed, 'step="0.01" min="0"')) + fld('opt', 'Status', sel('status', ['Active', 'Inactive'], r?.status || 'Active', !ed)))
      + `<datalist id="cats">${[...new Set(S.data.glossary.map(g => g.category))].map(c => `<option value="${esc(c)}">`).join('')}</datalist>`,
    compute: (form, r) => { const fd = Object.fromEntries(new FormData(form)); const errors = [];
      if (!(fd.en ?? r?.en)) errors.push('English term is required.'); if (!(fd.zh ?? r?.zh)) errors.push('Chinese term is required.');
      return { errors, sys: { code: r?.code || '(new)' } }; },
    save: (fd, r) => api('glossary.save', { ...fd, id: r?.id }),
  },
  renderTab: {},
});
