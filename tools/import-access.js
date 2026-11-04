'use strict';
// Loads a legacy Access export (tools/access-export.ps1) into the data folder for one branch.
//   node tools/import-access.js <access-export.json> [branchId=MY] [--keep-demo]
// Starts from the normal set-up (demo users, branches, glossary, settings) with no invented business records, then
// adds the imported ones. --keep-demo keeps the invented records of the other branches.
// Records are written directly (not through the actions) because legacy data breaks some of today's rules
// (e.g. repeated RO numbers); every imported record says so in its History. Stop the server first.
// The result holds real client data: it stays in data/ (not in git) and must not go to UAT without a site password.
const fs = require('fs');
const path = require('path');
const { buildSeed } = require('../server/seed');
const { newId, nextSeq, pad, round2, addDays, PAYMENT_TERMS } = require('../server/workflow');
const { DB_FILE, DATA_DIR, saveDb } = require('../server/server');

const args = process.argv.slice(2), keepDemo = args.includes('--keep-demo');
const [file, branchId = 'MY'] = args.filter(a => a !== '--keep-demo');
if (!file) { console.error('Usage: node tools/import-access.js <access-export.json> [branchId] [--keep-demo]'); process.exit(1); }
const src = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
const clean = s => (s == null ? '' : String(s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim());
const byId = list => new Map(list.map(r => [r.ID, r]));

const db = buildSeed();
const b = db.branches.find(x => x.id === branchId);
if (!b) throw new Error(`Unknown branch ${branchId}`);

// 1. drop invented demo records: all of them, or only this branch's with --keep-demo (customers only when unused)
const keep = r => keepDemo && r.branchId !== branchId;
db.salesOrders = db.salesOrders.filter(keep); db.workOrders = db.workOrders.filter(keep);
db.invoices = db.invoices.filter(keep); db.groupInvoices = db.groupInvoices.filter(keep);
db.leaves = db.leaves.filter(keep); db.outbox = (db.outbox || []).filter(keep);
const demoStaff = db.staff.filter(s => !keepDemo || (s.branchId === branchId && !db.users.some(u => u.name === s.name)));
db.staff = db.staff.filter(s => !demoStaff.includes(s));
db.customers = db.customers.filter(c => keepDemo && (c.homeBranchId !== branchId || db.salesOrders.some(s => s.customerId === c.id)));
if (!keepDemo) db.audit = [];

const IMPORT = 'Import (Access)';
const stamp = d => `${d}T02:00:00.000Z`;   // 10:00 Malaysia / Singapore time
const histOf = (date, action) => [{ at: stamp(date), by: IMPORT, action }];

// 2. lookups
const lk = {
  brand: byId(src.brands), item: byId(src.itemTypes), product: byId(src.productCodes),
  location: byId(src.locations), stage: byId(src.stages), tech: byId(src.technicians),
};
const ITEM = { HB: 'HB', RTW: 'RTW', Shoes: 'Shoes', SLG: 'SLG', Trolley: 'Trolley', WS: 'Watch strap', Jewellery: 'Jewellery' };
const PRODUCT = { 'Custom Made': 'Custom made', Repair: 'Repair', 'Touch Up/Cleaning': 'Cleaning / colouring' };
const STAGE = { Checking: 'Checking', 'Order SP': 'Order SP', Technician: 'Technician', QC: 'QC', 'Pending Collection': 'Pending collection',
  'Call Customer': 'Call customer', 'Call Unreachable': 'Call unreachable', 'Call Success': 'Call success', Completed: 'Complete', 'No Service': 'Cancelled' };

// 3. technicians → staff of the branch
const firstSeen = {};
for (const w of src.workOrders) if (w['Technician In Charge']) {
  const d = w['Due Date'] || w['Ready Date']; const k = w['Technician In Charge'];
  if (d && (!firstSeen[k] || d < firstSeen[k])) firstSeen[k] = d;
}
const techId = new Map();
for (const t of src.technicians) {
  const rec = { id: newId(db, 'STF'), code: `S-${pad(nextSeq(db, 'staff'), 3)}`, name: clean(t['Technician Name']), nameZh: '', branchId, position: 'Artisan',
    isTechnician: true, phone: '', email: '', joinDate: firstSeen[t.ID] || '2019-07-01', annualLeave: 14, status: 'Active',
    notes: 'Imported from the Access technician list – position, join date and leave entitlement to be confirmed.',
    createdAt: new Date().toISOString(), history: histOf(new Date().toISOString().slice(0, 10), 'Imported from Access technician list') };
  db.staff.push(rec); techId.set(t.ID, rec.id);
}

// 4. customers – Business when they use RO numbers or have a company-style name
const usesRo = new Set();
const soById = byId(src.salesOrders);
for (const w of src.workOrders) if (clean(w['RO Number'])) { const so = soById.get(w['Sales Order ID']); if (so) usesRo.add(so.Contact); }
const company = /\b(sdn|bhd|pte|ltd|limited|berhad|boutique|store|enterprise|trading|holdings|group|services|s\/b)\b/i;
const custId = new Map();
const phoneOf = p => { const d = clean(p).replace(/\D/g, ''); return !d ? '' : /^(60|65|66)\d{7,}$/.test(d) ? '+' + d : d; };
for (const c of src.customers) {
  const name = clean(c['Customer Name']);
  const business = usesRo.has(c.ID) || company.test(name);
  const rec = { id: newId(db, 'CUS'), code: `C-${pad(nextSeq(db, 'customer'), 4)}`, type: business ? 'Business' : 'Individual', name,
    contactPerson: '', phone: phoneOf(c.Phone), email: clean(c.Email), address: clean(c.Address), homeBranchId: branchId,
    paymentTerm: business ? '30 days' : 'Upfront', status: 'Active', notes: `Imported from Access (customer ${c.ID}).`, roSeq: 0,
    legacyId: c.ID, createdAt: new Date().toISOString(), history: histOf(new Date().toISOString().slice(0, 10), `Imported from Access (customer ${c.ID}); type and payment term set by the import`) };
  db.customers.push(rec); custId.set(c.ID, rec);
}
let unknownCust = null;
const customerFor = so => custId.get(so.Contact) || (unknownCust ||= (() => {
  const rec = { id: newId(db, 'CUS'), code: `C-${pad(nextSeq(db, 'customer'), 4)}`, type: 'Individual', name: 'Unknown customer (Access record without customer)',
    contactPerson: '', phone: '', email: '', address: '', homeBranchId: branchId, paymentTerm: 'Upfront', status: 'Active', notes: '', roSeq: 0,
    createdAt: new Date().toISOString(), history: histOf(new Date().toISOString().slice(0, 10), 'Placeholder for Access sales orders without a customer') };
  db.customers.push(rec); return rec; })());

// 5. sales orders
const soMap = new Map();
for (const s of src.salesOrders) {
  const c = customerFor(s), date = s['Date In'] || '2019-07-25', ref = clean(s['Sales Order ID']);
  const rec = { id: newId(db, 'SO'), ref, branchId, customerId: c.id, date, customerRef: '', notes: '', currency: b.currency, taxLabel: b.taxLabel,
    taxRate: 0, status: 'Open', legacy: true, createdAt: stamp(date), createdBy: IMPORT, history: histOf(date, `Imported from Access (${ref}); tax not recorded in Access`) };
  db.salesOrders.push(rec); soMap.set(s.ID, rec);
}

// 6. work orders
const woMap = new Map(); let skipped = 0;
for (const w of src.workOrders) {
  const so = soMap.get(w['Sales Order ID']); if (!so) { skipped++; continue; }
  const c = db.customers.find(x => x.id === so.customerId);
  const stageName = STAGE[clean(lk.stage.get(w.Stage)?.Stage)] || 'Logged in';
  const ref = clean(w['Work Order ID']), ready = w['Ready Date'], closed = ['Complete', 'Cancelled'].includes(stageName);
  const article = clean(w['Article Code']);
  const rec = { id: newId(db, 'WO'), ref, soId: so.id, branchId, customerId: so.customerId, orderType: c.type === 'Business' ? 'B2B' : 'B2C',
    productCode: PRODUCT[clean(lk.product.get(w['Product Code'])?.['Product Code'])] || 'Repair',
    itemType: ITEM[clean(lk.item.get(w['Item Type'])?.['Item Type'])] || 'HB',
    brand: clean(lk.brand.get(w.Brand)?.Brand) || 'Others',
    description: clean(w['Order Details']), condition: clean(w['Product Status']), location: clean(lk.location.get(w['Location Code'])?.Location),
    estDate: w['Due Date'] || ready || so.date, roNumber: clean(w['RO Number']), unitPrice: round2(w.Charges), deposit: round2(w['Amount Paid']),
    services: [], instructionsEn: '', instructionsZh: '',
    notes: [clean(w.Remarks), article ? `Article code: ${article}` : '', clean(w['B2B Ref Number']) ? `B2B ref: ${clean(w['B2B Ref Number'])}` : ''].filter(Boolean).join('\n'),
    urgent: !!w.Urgent, articleCode: article,
    stage: stageName, technicianId: techId.get(w['Technician In Charge']) || '', cancelReason: stageName === 'Cancelled' ? 'No service' : '',
    invoiceId: '', photos: [], timeLogs: [], createdAt: stamp(so.date), stageAt: stamp(closed && ready ? ready : so.date), completedAt: closed && ready ? stamp(ready) : '',
    lastContactAt: '', legacy: true,
    history: histOf(so.date, `Imported from Access (${ref}, stage ${clean(lk.stage.get(w.Stage)?.Stage) || '–'})${w['Called Customer'] ? '; customer was called' : ''}`) };
  db.workOrders.push(rec); woMap.set(w.ID, { rec, src: w });
}
for (const so of db.salesOrders.filter(s => s.legacy)) {
  const wos = db.workOrders.filter(w => w.soId === so.id);
  so.status = wos.length && wos.every(w => ['Complete', 'Cancelled'].includes(w.stage)) ? 'Completed' : 'Open';
}

// 7. invoices – Access has no payment records, so they are recorded as settled outside the system
let invSkipped = 0;
for (const i of src.invoices) {
  const items = [...woMap.values()].filter(x => x.src['Invoice ID'] === i.ID).map(x => x.rec);
  if (!items.length) { invSkipped++; continue; }
  const date = i['Invoice Date'] || items[0].completedAt.slice(0, 10) || items[0].createdAt.slice(0, 10), ref = clean(i['Invoice ID']);
  const c = db.customers.find(x => x.id === items[0].customerId), term = c.paymentTerm;
  const lines = items.map(w => { const so = db.salesOrders.find(s => s.id === w.soId);
    return { woId: w.id, woRef: w.ref, roNumber: w.roNumber, soRef: so?.ref || '', description: `${w.brand} ${w.itemType} – ${w.productCode}${w.description ? ': ' + w.description : ''}`,
      amount: w.stage === 'Cancelled' ? 0 : w.unitPrice, deposit: w.deposit, zeroReason: w.stage === 'Cancelled' ? 'No service' : '' }; });
  const subtotal = round2(lines.reduce((a, l) => a + l.amount, 0)), deposits = round2(lines.reduce((a, l) => a + l.deposit, 0));
  const amountDue = round2(Math.max(0, subtotal - deposits));
  const rec = { id: newId(db, 'INV'), ref, kind: 'IV', branchId, customerId: c.id, date, shipDate: date, paymentTerm: term, dueDate: addDays(date, PAYMENT_TERMS[term]),
    currency: b.currency, taxLabel: b.taxLabel, taxRate: 0, lines, subtotal, tax: 0, total: subtotal, deposits, amountDue, customerPo: '', notes: '',
    payments: amountDue > 0 ? [{ id: newId(db, 'PAY'), date, amount: amountDue, method: 'Imported', reference: 'Settled outside the system (Access has no payment records)', by: IMPORT, at: stamp(date) }] : [],
    status: 'Paid', givId: '', legacy: true, createdAt: stamp(date), createdBy: IMPORT,
    history: histOf(date, `Imported from Access (${ref}) with ${lines.length} work order(s); recorded as paid outside the system`) };
  db.invoices.push(rec);
  for (const w of items) { w.invoiceId = rec.id; w.history.push({ at: stamp(date), by: IMPORT, action: `Invoiced on ${ref}` }); }
}

db.audit.push({ at: new Date().toISOString(), by: IMPORT, action: 'Access data imported', ref: branchId,
  detail: `${src.customers.length} customers, ${soMap.size} sales orders, ${woMap.size} work orders, ${src.invoices.length - invSkipped} invoices from ${src.from}` });

// 8. back up and save
fs.mkdirSync(DATA_DIR, { recursive: true });
if (fs.existsSync(DB_FILE)) {
  const backup = path.join(DATA_DIR, `db-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-backup.json`);
  fs.copyFileSync(DB_FILE, backup); console.log(`Backed up current data to ${path.relative(process.cwd(), backup)}`);
}
saveDb(db);
const open = db.workOrders.filter(w => w.legacy && !['Complete', 'Cancelled'].includes(w.stage)).length;
console.log(`Imported into ${branchId}: ${techId.size} technicians, ${src.customers.length} customers, ${soMap.size} sales orders, ${woMap.size} work orders (${open} open), ${src.invoices.length - invSkipped} invoices.`
  + (skipped ? ` Skipped ${skipped} work orders without a sales order.` : '') + (invSkipped ? ` Skipped ${invSkipped} empty invoices.` : ''));
