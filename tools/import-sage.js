'use strict';
// Loads Chan Yew Singapore's Sage CRM exports into the data folder (branch SG).
//   node tools/import-sage.js <folder with the export files> [--from YYYY-MM-DD] [--check] [--fresh]
//   --from   only work orders created on or after this date, plus every work order that is still open, plus the
//            others on the same sales orders and invoices (so documents stay whole). Without it everything is loaded.
//   --check  read and report only, nothing is written
//   --fresh  start from the normal set-up (no invented records, no other imported branch) instead of the current data
// Without --fresh the current data/db.json is kept and only the Singapore records in it are replaced, so the
// Kuala Lumpur Access import stays. A backup of db.json is made first. Stop the server before running it.
//
// The folder may hold any of these Sage CRM exports, as .csv (Find → Export to File) or as the .xls / .htm a
// report produces (an HTML table). The kind of each file is recognised from its column names, not its file name:
//   customers      Customer Name (+ Phone, Business E-mail, Address, Type, Terms …)
//   work orders    Work Order ID / Work Order + Stage, Technician In Charge, Due Date …
//   SO items       Sales Order No. + Work Order (the "Sale Order With WO" report)
//   invoice lines  Invoice No. + Work Order No (the "Invoice with WO" report)
//   invoices       Invoice No. + Total Amount, without work orders (invoice list)
// Rows for the same work order or invoice coming from several files are merged; a value that is filled wins.
// The files hold real client data: keep them outside the repository, never commit them.
const fs = require('fs');
const path = require('path');
const { buildSeed } = require('../server/seed');
const { newId, nextSeq, pad, round2, addDays, PAYMENT_TERMS } = require('../server/workflow');

const BRANCH = 'SG';
const IMPORT = 'Import (Sage CRM)';

// ---------- reading files ----------
const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
const clean = s => (s == null ? '' : String(s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim());
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = s => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => e[0] === '#'
  ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e.toLowerCase()] ?? m));

function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}
function parseHtmlTables(text) {
  const rows = [];
  for (const tr of text.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [])
      .map(td => decode(td.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')));
    if (cells.length) rows.push(cells);
  }
  return rows;
}
function readTable(file) {
  const buf = fs.readFileSync(file);
  if (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0)
    throw new Error(`${path.basename(file)} is a binary Excel file. Open it in Excel and save it as "CSV UTF-8", then run again.`);
  if (buf[0] === 0x50 && buf[1] === 0x4b)
    throw new Error(`${path.basename(file)} is an .xlsx workbook. Open it in Excel and save it as "CSV UTF-8", then run again.`);
  const text = buf.toString('utf8').replace(/^﻿/, '');
  return /<table/i.test(text.slice(0, 200000)) ? parseHtmlTables(text) : parseCsv(text);
}

// column name (normalised) → field. The first header row that names enough known columns is used.
const COLS = {
  woRef: ['workorderid', 'workorder', 'workorderno'],
  soRef: ['salesorderno', 'saleorderno'],
  soItemId: ['saleorderitemid', 'salesorderitemid'],
  invRef: ['invoiceno', 'invoiceid', 'invoicenumber'],
  customer: ['customername', 'customerid', 'customernamefirsttime', 'customer', 'company', 'companyname'],
  customerCode: ['customernumber', 'number', 'customercode', 'companyid'],
  created: ['createddate', 'datein', 'salesorderdate', 'date', 'invoicedate'],
  details: ['orderdetails', 'description'],
  amount: ['amount', 'charges', 'price'],
  paid: ['amountpaid'],
  balance: ['outstanding', 'balance', 'balanceamount'],
  total: ['totalamount'],
  totalTax: ['totalamountaftergst'],
  brand: ['brand'],
  itemType: ['productcategory', 'itemtype'],
  productCode: ['productcode'],
  ro: ['rono', 'ronumber'],
  b2b: ['otherb2bnumber', 'b2brefno', 'b2brefnumber'],
  location: ['locationcode', 'location'],
  technician: ['technicianincharge', 'technician'],
  called: ['calledcustomer'],
  urgent: ['urgent'],
  due: ['duedate'],
  ready: ['readydate'],
  collected: ['collecteddate', 'collectiondate'],
  stage: ['stage'],
  status: ['status', 'stagestatus'],
  remarks: ['remarks'],
  condition: ['productstatus', 'condition'],
  article: ['articlecode', 'itemcode'],
  phone: ['phone', 'phonenumber', 'mobile'],
  email: ['businessemail', 'email', 'emailaddress'],
  address: ['address', 'businessaddress'],
  type: ['type', 'customertype'],
  terms: ['paymentterm', 'terms', 'paymentterms', 'paymenttype'],
};
const ALIAS = new Map(); for (const [k, list] of Object.entries(COLS)) for (const a of list) if (!ALIAS.has(a)) ALIAS.set(a, k);

function toRecords(rows) {
  const at = rows.findIndex(r => r.filter(c => ALIAS.has(norm(c))).length >= 3);
  if (at < 0) return { fields: [], records: [], unknown: [] };
  const head = rows[at].map(c => ALIAS.get(norm(c)) || null);
  const unknown = rows[at].filter(c => clean(c) && !ALIAS.has(norm(c))).map(clean);
  const headKey = rows[at].map(norm).join('|'), records = [];
  for (const r of rows.slice(at + 1)) {
    if (r.map(norm).join('|') === headKey) continue;   // header repeated on every report page
    const o = {}; let any = false;
    head.forEach((k, i) => { if (k && o[k] === undefined) { o[k] = clean(r[i]); if (o[k]) any = true; } });
    if (any) records.push(o);
  }
  return { fields: head.filter(Boolean), records, unknown };
}
function kindOf(fields) {
  const has = k => fields.includes(k);
  if (has('invRef') && has('woRef')) return 'invoiceLines';
  if (has('invRef')) return 'invoices';
  if (has('woRef') && (has('stage') || has('technician'))) return 'workOrders';
  if (has('woRef')) return 'soItems';
  if (has('customer') && !has('soRef')) return 'customers';
  return null;
}

// ---------- values ----------
const DMY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/;
function dateOf(s) {
  s = clean(s); let m;
  if ((m = DMY.exec(s))) return `${m[3]}-${pad(+m[2], 2)}-${pad(+m[1], 2)}`;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
}
function stampOf(s, fallbackDate) {
  const m = DMY.exec(clean(s)), d = dateOf(s) || fallbackDate;
  if (!d) return '';
  const hh = m && m[4] ? +m[4] : 10, mm = m && m[5] ? +m[5] : 0;
  return new Date(`${d}T${pad(hh, 2)}:${pad(mm, 2)}:00+08:00`).toISOString();   // Singapore time
}
const money = s => { const n = Number(clean(s).replace(/[^0-9.-]/g, '')); return isFinite(n) ? round2(n) : 0; };
const yes = s => /^(y|yes|true|1|urgent)$/i.test(clean(s));
const nameKey = s => clean(s).toLowerCase();
const blankName = s => !clean(s).replace(/[-.\s]/g, '');

const ITEM = { hb: 'HB', slg: 'SLG', trolley: 'Trolley', shoes: 'Shoes', rtw: 'RTW', jewellery: 'Jewellery', jewelry: 'Jewellery', ws: 'Watch strap', watchstrap: 'Watch strap' };
const PRODUCT = { repair: 'Repair', bespoke: 'Custom made', custommade: 'Custom made', touchupcleaning: 'Cleaning / colouring', cleaning: 'Cleaning / colouring', cleaningcolouring: 'Cleaning / colouring' };
const STAGE = { logged: 'Logged in', loggedin: 'Logged in', checking: 'Checking', ordersp: 'Order SP', technician: 'Technician', qc: 'QC',
  pendingcollection: 'Pending collection', callcustomer: 'Call customer', callunreachable: 'Call unreachable', callsuccess: 'Call success',
  completed: 'Complete', complete: 'Complete', invoiced: 'Complete', collected: 'Complete',
  cancelled: 'Cancelled', canceled: 'Cancelled', noservice: 'Cancelled' };
const TERMS = { upfront: 'Upfront', cod: 'Upfront', cash: 'Upfront', '30days': '30 days', '30': '30 days', net30: '30 days', '45days': '45 days', '45': '45 days', net45: '45 days' };
const NOT_TECH = /^(system administrator|admin\d*|administrator)$/i;
const COMPANY = /\b(sdn|bhd|pte|ltd|limited|berhad|boutique|store|enterprise|trading|holdings|group|services|llp|inc|corp|s\/b)\b/i;

// ---------- the import ----------
function readFolder(dir) {
  const files = fs.readdirSync(dir).filter(f => /\.(csv|xls|htm|html|txt)$/i.test(f)).sort();
  const data = { customers: [], workOrders: [], soItems: [], invoiceLines: [], invoices: [] }, report = [];
  for (const f of files) {
    const { fields, records, unknown } = toRecords(readTable(path.join(dir, f)));
    const kind = kindOf(fields);
    report.push({ file: f, kind: kind || 'not recognised (skipped)', rows: records.length, unknown });
    if (kind) data[kind].push(...records);
  }
  return { data, report };
}

function mergeBy(list, key) {
  const m = new Map();
  for (const r of list) {
    const k = clean(r[key]).toUpperCase(); if (!k) continue;
    const cur = m.get(k) || {};
    for (const [f, v] of Object.entries(r)) if (v && !cur[f]) cur[f] = v;
    m.set(k, cur);
  }
  return m;
}

function importSage(db, data, { warn = () => {}, from = '' } = {}) {
  const b = db.branches.find(x => x.id === BRANCH);
  const counts = {};
  const tally = (k, n = 1) => { counts[k] = (counts[k] || 0) + n; };
  const now = new Date().toISOString(), todayStr = now.slice(0, 10);
  const histOf = (at, action) => [{ at, by: IMPORT, action }];

  // 1. replace earlier Singapore records; other branches stay as they are
  const other = r => r.branchId !== BRANCH;
  db.salesOrders = db.salesOrders.filter(other); db.workOrders = db.workOrders.filter(other);
  db.invoices = db.invoices.filter(other); db.groupInvoices = (db.groupInvoices || []).filter(other);
  db.leaves = db.leaves.filter(other); db.outbox = (db.outbox || []).filter(other);
  db.staff = db.staff.filter(s => s.branchId !== BRANCH || db.users.some(u => u.name === s.name));
  const usedCust = new Set(db.salesOrders.map(s => s.customerId));
  db.customers = db.customers.filter(c => c.homeBranchId !== BRANCH || usedCust.has(c.id));

  // 2. work orders: one record per WO number, merged from the work order list and the SO / invoice reports
  const wos = mergeBy([...data.soItems, ...data.workOrders], 'woRef');
  for (const l of data.invoiceLines) {   // invoice lines say which invoice a WO is on
    const k = clean(l.woRef).toUpperCase(); if (!k) continue;
    if (!wos.has(k)) tally('work orders found only on invoice lines (no stage or sales order in the files)');
    const w = wos.get(k) || {}; if (!w.invRef) w.invRef = l.invRef;
    for (const f of ['customer', 'ro', 'b2b', 'details']) if (!w[f] && l[f]) w[f] = l[f];
    if (!w.amount && l.amount) w.amount = l.amount;
    wos.set(k, w);
  }

  // 2b. optional cut-off: recent or still-open work orders, then whole sales orders and invoices around them
  if (from) {
    const isOpen = w => !['Complete', 'Cancelled'].includes(STAGE[norm(w.stage)] || (w.invRef ? 'Complete' : 'Logged in'));
    const keep = new Set([...wos].filter(([, w]) => (dateOf(w.created) || '9999') >= from || isOpen(w)).map(([k]) => k));
    for (let grew = true; grew;) {
      grew = false;
      const sos = new Set(), invs = new Set();
      for (const k of keep) { const w = wos.get(k); if (clean(w.soRef)) sos.add(clean(w.soRef).toUpperCase()); if (clean(w.invRef)) invs.add(clean(w.invRef).toUpperCase()); }
      for (const [k, w] of wos) if (!keep.has(k) && (sos.has(clean(w.soRef).toUpperCase()) || invs.has(clean(w.invRef).toUpperCase()))) { keep.add(k); grew = true; }
    }
    tally(`work orders left out by --from ${from}`, wos.size - keep.size);
    for (const k of [...wos.keys()]) if (!keep.has(k)) wos.delete(k);
    const keptInv = new Set([...wos.values()].map(w => clean(w.invRef).toUpperCase()).filter(Boolean));
    data = { ...data, invoiceLines: data.invoiceLines.filter(l => keptInv.has(clean(l.invRef).toUpperCase())),
      invoices: data.invoices.filter(i => keptInv.has(clean(i.invRef).toUpperCase())) };
    const keptCust = new Set([...wos.values()].map(w => nameKey(w.customer)));
    data.customers = data.customers.filter(c => keptCust.has(nameKey(c.customer)));
  }

  // 3. customers: by name, because the reports give the name, not a customer number
  const custByName = new Map(), custById = new Map(), roUsers = new Set();
  for (const w of wos.values()) if (clean(w.ro)) roUsers.add(nameKey(w.customer));
  const addCustomer = (src, from) => {
    const name = clean(src.customer), key = nameKey(name);
    if (custByName.has(key)) { if (from === 'list') tally('duplicate customer names in the list'); return custByName.get(key); }
    const termKey = norm(src.terms), business = /business|b2b|company/i.test(src.type || '') || roUsers.has(key) || COMPANY.test(name);
    const rec = { id: newId(db, 'CUS'), code: `C-${pad(nextSeq(db, 'customer'), 4)}`, type: business ? 'Business' : 'Individual', name,
      contactPerson: '', phone: clean(src.phone), email: clean(src.email), address: clean(src.address), homeBranchId: BRANCH,
      paymentTerm: TERMS[termKey] || (business ? '30 days' : 'Upfront'), status: 'Active', roSeq: 0,
      notes: from === 'list' ? 'Imported from Sage CRM.' : 'Imported from Sage CRM orders (not in the customer list export).',
      legacyId: clean(src.customerCode), legacy: true, createdAt: now,
      history: histOf(now, `Imported from Sage CRM${TERMS[termKey] ? '' : '; type and payment term set by the import'}`) };
    if (src.terms && !TERMS[termKey]) tally(`unknown payment terms (${clean(src.terms)})`);
    db.customers.push(rec); custByName.set(key, rec); custById.set(rec.id, rec); return rec;
  };
  for (const c of data.customers) { if (blankName(c.customer)) { tally('customers without a name (skipped)'); continue; } addCustomer(c, 'list'); }
  let unknownCust = null;
  const customerFor = src => blankName(src.customer)
    ? (unknownCust ||= addCustomer({ customer: 'Unknown customer (Sage CRM record without customer)' }, 'orders'))
    : addCustomer(src, 'orders');

  // 4. technicians → staff of the branch
  const techByName = new Map();
  const techFor = name => {
    name = clean(name); if (!name) return '';
    if (NOT_TECH.test(name)) { tally('work orders with an admin user as technician (left blank)'); return ''; }
    const k = name.toLowerCase(); if (techByName.has(k)) return techByName.get(k).id;
    const rec = { id: newId(db, 'STF'), code: `S-${pad(nextSeq(db, 'staff'), 3)}`, name, nameZh: '', branchId: BRANCH, position: 'Artisan', isTechnician: true,
      phone: '', email: '', joinDate: '2016-01-01', annualLeave: 14, status: 'Active',
      notes: 'Imported from the Sage CRM technician field – position, join date and leave entitlement to be confirmed.', createdAt: now,
      history: histOf(now, 'Imported from Sage CRM technician field') };
    db.staff.push(rec); techByName.set(k, rec); return rec.id;
  };

  // 5. sales orders (grouped from their work orders) and work orders
  const soByRef = new Map(), soById = new Map(), woByRef = new Map(), woBySo = new Map();
  for (const [k, w] of wos) {
    const created = dateOf(w.created) || dateOf(w.due) || todayStr;
    const soRef = clean(w.soRef).toUpperCase() || `SAGE-NO-SO-${k}`;
    let so = soByRef.get(soRef);
    if (!so) {
      const c = customerFor(w);
      so = { id: newId(db, 'SO'), ref: soRef, branchId: BRANCH, customerId: c.id, date: created, customerRef: '', notes: '', currency: b.currency,
        taxLabel: b.taxLabel, taxRate: 0, status: 'Open', legacy: true, createdAt: stampOf(w.created, created), createdBy: IMPORT,
        history: histOf(stampOf(w.created, created), `Imported from Sage CRM (${soRef})`) };
      if (!clean(w.soRef)) { so.notes = 'Sage CRM work order without a sales order number.'; tally('work orders without a sales order no.'); }
      db.salesOrders.push(so); soByRef.set(soRef, so); soById.set(so.id, so);
    } else if (created < so.date) so.date = created;
    const c = custById.get(so.customerId);
    const rawStage = clean(w.stage), stage = STAGE[norm(rawStage)] || (w.invRef ? 'Complete' : 'Logged in');
    if (rawStage && !STAGE[norm(rawStage)]) tally(`unknown stage "${rawStage}" (set to ${stage})`);
    if (!rawStage) tally('work orders without a stage in the files');
    const itemType = ITEM[norm(w.itemType)] || 'HB', productCode = PRODUCT[norm(w.productCode)] || 'Repair';
    if (w.itemType && !ITEM[norm(w.itemType)]) tally(`unknown product category "${clean(w.itemType)}" (set to HB)`);
    if (w.productCode && !PRODUCT[norm(w.productCode)]) tally(`unknown product code "${clean(w.productCode)}" (set to Repair)`);
    const closed = ['Complete', 'Cancelled'].includes(stage), doneDate = dateOf(w.collected) || dateOf(w.ready);
    const unitPrice = money(w.amount), deposit = Math.min(money(w.paid), unitPrice || money(w.paid));
    const article = clean(w.article), b2b = clean(w.b2b), called = clean(w.called);
    const rec = { id: newId(db, 'WO'), ref: k, soId: so.id, branchId: BRANCH, customerId: so.customerId, orderType: c.type === 'Business' ? 'B2B' : 'B2C',
      productCode, itemType, brand: clean(w.brand) || 'Others', description: clean(w.details), condition: clean(w.condition), location: clean(w.location),
      estDate: dateOf(w.due) || dateOf(w.ready) || created, roNumber: clean(w.ro), unitPrice, deposit,
      services: [], instructionsEn: '', instructionsZh: '',
      notes: [clean(w.remarks), article ? `Item code: ${article}` : '', b2b ? `B2B ref: ${b2b}` : '', called ? `Called customer: ${called}` : ''].filter(Boolean).join('\n'),
      urgent: yes(w.urgent), articleCode: article,
      stage, technicianId: techFor(w.technician), cancelReason: stage === 'Cancelled' ? (rawStage || 'Cancelled in Sage CRM') : '',
      invoiceId: '', photos: [], timeLogs: [], createdAt: stampOf(w.created, created), stageAt: stampOf(closed && doneDate ? doneDate : w.created, created),
      completedAt: closed && doneDate ? stampOf(doneDate) : '', lastContactAt: '', legacy: true,
      history: histOf(stampOf(w.created, created), `Imported from Sage CRM (${k}, stage ${rawStage || '–'})`) };
    if (b2b && !so.customerRef) so.customerRef = b2b;
    db.workOrders.push(rec); woByRef.set(k, rec);
    (woBySo.get(so.id) || woBySo.set(so.id, []).get(so.id)).push(rec);
  }
  for (const so of soByRef.values()) {
    const list = woBySo.get(so.id) || [];
    so.status = list.length && list.every(w => ['Complete', 'Cancelled'].includes(w.stage)) ? 'Completed' : 'Open';
  }

  // 5b. continue each customer's RO numbering past the imported numbers. A Business customer's blank RO is numbered
  // 001 onwards from roSeq, so without this a new item would be given an RO number an imported work order already uses.
  for (const w of woByRef.values()) {
    const c = custById.get(w.customerId);
    const n = /^\d{1,6}$/.test(w.roNumber) ? +w.roNumber : 0;
    if (c && n > (c.roSeq || 0)) c.roSeq = n;
  }

  // 6. invoices: header from the invoice list, lines from the work orders that name the invoice
  // An invoice report carries its status and balance on every line, so take them from the lines too – otherwise a voided
  // or part-paid invoice that is only in the lines report would be imported as paid in full. "Status" is only read from a
  // file without a Stage column, where it cannot be the work order's own status.
  const heads = mergeBy([...data.invoiceLines.map(l => ({ invRef: l.invRef, created: l.created, customer: l.customer, total: l.total, totalTax: l.totalTax,
    balance: l.balance, ...(l.stage === undefined ? { status: l.status } : {}) })), ...data.invoices], 'invRef');
  const linesByInv = new Map();
  for (const [woKey, w] of wos) if (clean(w.invRef)) {
    const k = clean(w.invRef).toUpperCase(), rec = woByRef.get(woKey);
    if (!rec) continue;
    if (!linesByInv.has(k)) linesByInv.set(k, []);
    linesByInv.get(k).push(rec);
    if (!heads.has(k)) heads.set(k, { invRef: k });
  }
  let totalMismatch = 0;
  for (const [k, h] of heads) {
    const items = linesByInv.get(k) || [];
    if (!items.length) { tally('invoices without work orders in the files (skipped)'); continue; }
    const date = dateOf(h.created) || items[0].completedAt.slice(0, 10) || items[0].createdAt.slice(0, 10);
    const c = custById.get(items[0].customerId), term = c.paymentTerm;
    const lines = items.map(w => { const so = soById.get(w.soId);
      return { woId: w.id, woRef: w.ref, roNumber: w.roNumber, soRef: so?.ref || '', description: `${w.brand} ${w.itemType} – ${w.productCode}${w.description ? ': ' + w.description : ''}`,
        amount: w.stage === 'Cancelled' ? 0 : w.unitPrice, deposit: w.deposit, zeroReason: w.stage === 'Cancelled' ? (w.cancelReason || 'Cancelled') : '' }; });
    const subtotal = round2(lines.reduce((a, l) => a + l.amount, 0)), deposits = round2(lines.reduce((a, l) => a + l.deposit, 0));
    const sageTotal = money(h.total), sageTaxed = money(h.totalTax);
    if (h.total && Math.abs(sageTotal - subtotal) > 0.01) totalMismatch++;
    const taxRate = sageTotal > 0 && sageTaxed > sageTotal + 0.01 ? Math.round((sageTaxed / sageTotal - 1) * 100) : 0;
    const tax = round2(subtotal * taxRate / 100), total = round2(subtotal + tax), amountDue = round2(Math.max(0, total - deposits));
    const voided = /void|cancel/i.test(h.status || '');
    const hasBalance = h.balance !== undefined && h.balance !== '';
    const paidAmt = voided ? 0 : hasBalance ? round2(Math.max(0, amountDue - money(h.balance))) : amountDue;
    const at = stampOf(h.created, date);
    const rec = { id: newId(db, 'INV'), ref: k, kind: 'IV', branchId: BRANCH, customerId: c.id, date, shipDate: date, paymentTerm: term,
      dueDate: addDays(date, PAYMENT_TERMS[term]), currency: b.currency, taxLabel: b.taxLabel, taxRate, lines, subtotal, tax, total, deposits, amountDue,
      customerPo: '', notes: clean(h.remarks),
      payments: paidAmt > 0 ? [{ id: newId(db, 'PAY'), date, amount: paidAmt, method: 'Imported',
        reference: hasBalance ? 'Paid according to the Sage CRM balance' : 'Settled outside the system (no payment records in the Sage CRM export)', by: IMPORT, at }] : [],
      status: voided ? 'Void' : paidAmt >= amountDue - 0.001 ? 'Paid' : paidAmt > 0 ? 'Partially paid' : 'Issued',
      voidReason: voided ? `Status in Sage CRM: ${clean(h.status)}` : undefined,
      givId: '', legacy: true, createdAt: at, createdBy: IMPORT,
      history: histOf(at, `Imported from Sage CRM (${k}) with ${lines.length} work order(s)${hasBalance ? '' : '; recorded as paid outside the system'}`) };
    if (!voided) for (const w of items) { w.invoiceId = rec.id; w.history.push({ at, by: IMPORT, action: `Invoiced on ${k}` }); }
    db.invoices.push(rec);
  }
  if (totalMismatch) tally('invoices whose Sage total differs from the sum of their work orders', totalMismatch);

  const summary = { customers: db.customers.filter(c => c.homeBranchId === BRANCH && c.legacy).length, technicians: techByName.size,
    salesOrders: soByRef.size, workOrders: woByRef.size, openWorkOrders: [...woByRef.values()].filter(w => !['Complete', 'Cancelled'].includes(w.stage)).length,
    invoices: db.invoices.filter(i => i.branchId === BRANCH && i.legacy).length };
  db.audit.push({ at: now, by: IMPORT, action: 'Sage CRM data imported', ref: BRANCH,
    detail: `${summary.customers} customers, ${summary.salesOrders} sales orders, ${summary.workOrders} work orders, ${summary.invoices} invoices` });
  for (const [k, n] of Object.entries(counts)) warn(`${n} ${k}`);
  return { summary, counts };
}

module.exports = { importSage, readFolder, parseCsv, parseHtmlTables, toRecords, kindOf, dateOf };

if (require.main === module) {
  const args = process.argv.slice(2), check = args.includes('--check'), fresh = args.includes('--fresh');
  const fi = args.indexOf('--from'), from = fi >= 0 ? args[fi + 1] : '';
  if (fi >= 0 && !/^\d{4}-\d{2}-\d{2}$/.test(from || '')) { console.error('--from needs a date like 2025-10-01'); process.exit(1); }
  const dir = args.find((a, i) => !a.startsWith('--') && (fi < 0 || i !== fi + 1));
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error('Usage: node tools/import-sage.js <folder with the Sage CRM export files> [--from YYYY-MM-DD] [--check] [--fresh]'); process.exit(1);
  }
  const { DB_FILE, DATA_DIR, saveDb } = require('../server/server');
  let data, report;
  try { ({ data, report } = readFolder(dir)); } catch (e) { console.error(e.message); process.exit(1); }
  console.log('Files:');
  for (const r of report) console.log(`  ${r.file}: ${r.kind}, ${r.rows} rows${r.unknown.length ? ` (columns not used: ${r.unknown.join(', ')})` : ''}`);
  let db;
  if (fresh || !fs.existsSync(DB_FILE)) {
    db = buildSeed();
    for (const k of ['salesOrders', 'workOrders', 'invoices', 'groupInvoices', 'leaves', 'outbox', 'customers', 'audit']) db[k] = [];
    db.staff = db.staff.filter(s => db.users.some(u => u.name === s.name));
  } else db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  const { summary } = importSage(db, data, { from, warn: m => console.log(`  ! ${m}`) });
  console.log(`Singapore (SG): ${summary.customers} customers, ${summary.technicians} technicians, ${summary.salesOrders} sales orders, `
    + `${summary.workOrders} work orders (${summary.openWorkOrders} open), ${summary.invoices} invoices.`);
  if (check) { console.log('Check only (--check): nothing was written.'); process.exit(0); }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    const backup = path.join(DATA_DIR, `db-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-backup.json`);
    fs.copyFileSync(DB_FILE, backup); console.log(`Backed up current data to ${path.relative(process.cwd(), backup)}`);
  }
  saveDb(db);
  console.log(`Saved to ${path.relative(process.cwd(), DB_FILE)}. Start the server and check the Singapore branch.`);
}
