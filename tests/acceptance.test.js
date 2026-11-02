'use strict';
// Acceptance tests – one per key requirement (see docs/REQUIREMENTS.md).
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSeed } = require('../server/seed');
const { runAction, stateFor, today, addDays } = require('../server/workflow');

const fresh = () => { const db = buildSeed(); const u = id => db.users.find(x => x.id === id); return { db, SUPER: u('U1'), SG: u('U2'), MY: u('U3'), TH: u('U4') }; };
const run = (db, user, name, p) => runAction(db, user, name, p);
const cust = (db, name) => db.customers.find(c => c.name.startsWith(name));
const tech = (db, b) => db.staff.find(s => s.isTechnician && s.branchId === b && s.status === 'Active');
const line = (extra = {}) => ({ productCode: 'Repair', itemType: 'HB', brand: 'Chanel', description: 'Flap bag', condition: 'Corner wear', estDate: addDays(today(), 7), unitPrice: 200, ...extra });
function newSo(db, user, customerName, branchId) {
  return run(db, user, 'so.save', { branchId, customerId: cust(db, customerName).id, date: today() });
}
function completeWo(db, user, wo) {
  run(db, user, 'wo.stage', { id: wo.id, stage: 'Technician', technicianId: tech(db, wo.branchId).id });
  run(db, user, 'wo.stage', { id: wo.id, stage: 'Complete' });
}

test('AT-01 Each sales order item auto-creates its own work order with a system WO number', () => {
  const { db, SG } = fresh();
  const so = newSo(db, SG, 'Marcus Lee', 'SG');
  const a = run(db, SG, 'so.addLine', { soId: so.id, ...line() });
  const b = run(db, SG, 'so.addLine', { soId: so.id, ...line({ itemType: 'SLG' }) });
  assert.match(so.ref, /^SO-SG-\d{4}-\d{4}$/);
  assert.match(a.ref, /^WO\d{8}$/);
  assert.notEqual(a.ref, b.ref);
  assert.equal(a.stage, 'Logged in');
  assert.equal(a.orderType, 'B2C');
  assert.equal(db.workOrders.filter(w => w.soId === so.id).length, 2);
});

test('AT-02 B2B work orders carry the customer RO number; blank RO is numbered 001 onwards; duplicates refused', () => {
  const { db, SG } = fresh();
  const so = newSo(db, SG, 'Vintage Vault', 'SG');
  const a = run(db, SG, 'so.addLine', { soId: so.id, ...line({ roNumber: 'VVA-9001' }) });
  assert.equal(a.orderType, 'B2B');
  assert.equal(a.roNumber, 'VVA-9001');
  const b = run(db, SG, 'so.addLine', { soId: so.id, ...line() });
  assert.match(b.roNumber, /^\d{3}$/);
  assert.throws(() => run(db, SG, 'so.addLine', { soId: so.id, ...line({ roNumber: 'vva-9001' }) }), /already used/);
});

test('AT-03 Moving a work order to Technician requires a technician from the same branch', () => {
  const { db, SG } = fresh();
  const so = newSo(db, SG, 'Marcus Lee', 'SG');
  const wo = run(db, SG, 'so.addLine', { soId: so.id, ...line() });
  assert.throws(() => run(db, SG, 'wo.stage', { id: wo.id, stage: 'Technician' }), /technician/i);
  assert.throws(() => run(db, SG, 'wo.stage', { id: wo.id, stage: 'Technician', technicianId: tech(db, 'MY').id }), /branch/);
  run(db, SG, 'wo.stage', { id: wo.id, stage: 'Technician', technicianId: tech(db, 'SG').id });
  assert.equal(wo.technicianId, tech(db, 'SG').id);
  assert.ok(wo.history.some(h => h.action.includes('Logged in → Technician')));
});

test('AT-04 Pending collection queues a WhatsApp message to the demo sink (never sent)', () => {
  const { db, SG } = fresh();
  const so = newSo(db, SG, 'Marcus Lee', 'SG');
  const wo = run(db, SG, 'so.addLine', { soId: so.id, ...line() });
  const before = db.outbox.length;
  run(db, SG, 'wo.stage', { id: wo.id, stage: 'Pending collection' });
  assert.equal(db.outbox.length, before + 1);
  assert.match(db.outbox.at(-1).status, /demo sink – not sent/);
  assert.equal(db.outbox.at(-1).woId, wo.id);
});

test('AT-05 One invoice (always a single IV) bills completed work orders from different sales orders; zero-value cancelled items close out as "return as requested"', () => {
  const { db, SG } = fresh();
  const so1 = newSo(db, SG, 'Vintage Vault', 'SG'), so2 = newSo(db, SG, 'Vintage Vault', 'SG');
  const a = run(db, SG, 'so.addLine', { soId: so1.id, ...line({ unitPrice: 300 }) });
  const b = run(db, SG, 'so.addLine', { soId: so2.id, ...line({ unitPrice: 100 }) });
  const c = run(db, SG, 'so.addLine', { soId: so2.id, ...line({ unitPrice: 500 }) });
  completeWo(db, SG, a); completeWo(db, SG, b);
  run(db, SG, 'wo.stage', { id: c.id, stage: 'Cancelled', reason: 'Return as requested' });
  const inv = run(db, SG, 'invoice.create', { woIds: [a.id, b.id, c.id], shipDate: today() });
  assert.equal(inv.kind, 'IV');
  assert.match(inv.ref, /^IV-SG-/);
  assert.equal(inv.subtotal, 400);
  assert.equal(inv.tax, 36);                 // SG GST 9%
  assert.equal(inv.total, 436);
  assert.equal(inv.lines.find(l => l.woId === c.id).amount, 0);
  assert.match(inv.lines.find(l => l.woId === c.id).zeroReason, /Return as requested/);
  for (const w of [a, b, c]) assert.equal(w.invoiceId, inv.id);
});

test('AT-06 Only completed / cancelled work orders of one customer and branch can be invoiced, once, at shipping', () => {
  const { db, SG } = fresh();
  const so = newSo(db, SG, 'Vintage Vault', 'SG');
  const a = run(db, SG, 'so.addLine', { soId: so.id, ...line() });
  assert.throws(() => run(db, SG, 'invoice.create', { woIds: [a.id], shipDate: today() }), /not complete/);
  completeWo(db, SG, a);
  assert.throws(() => run(db, SG, 'invoice.create', { woIds: [a.id] }), /Shipping/);
  const other = db.workOrders.find(w => w.customerId !== a.customerId && w.branchId === 'SG' && w.stage === 'Complete' && !w.invoiceId);
  assert.throws(() => run(db, SG, 'invoice.create', { woIds: [a.id, other.id], shipDate: today() }), /same customer/);
  run(db, SG, 'invoice.create', { woIds: [a.id], shipDate: today() });
  assert.throws(() => run(db, SG, 'invoice.create', { woIds: [a.id], shipDate: today() }), /already invoiced/);
});

test('AT-07 Invoiced work orders are locked; only location and notes change; stage cannot move', () => {
  const { db, SG } = fresh();
  const wo = db.workOrders.find(w => w.invoiceId && w.branchId === 'SG');
  const price = wo.unitPrice;
  run(db, SG, 'wo.save', { id: wo.id, unitPrice: 1, location: 'Shelf Z', notes: 'checked' });
  assert.equal(wo.unitPrice, price);
  assert.equal(wo.location, 'Shelf Z');
  assert.throws(() => run(db, SG, 'wo.stage', { id: wo.id, stage: 'QC' }), /locked/);
});

test('AT-08 Branch tax and currency: MY invoices in MYR with SST 8%, TH in THB with VAT 7%; payment term sets the due date', () => {
  const { db, MY, TH } = fresh();
  const soM = newSo(db, MY, 'Siti Rahman', 'MY');
  const m = run(db, MY, 'so.addLine', { soId: soM.id, ...line({ unitPrice: 1000 }) }); completeWo(db, MY, m);
  const ivM = run(db, MY, 'invoice.create', { woIds: [m.id], shipDate: today(), date: today() });
  assert.deepEqual([ivM.currency, ivM.taxLabel, ivM.tax, ivM.dueDate], ['MYR', 'SST', 80, today()]);   // Upfront
  const soT = newSo(db, TH, 'Siam Heritage', 'TH');
  const t = run(db, TH, 'so.addLine', { soId: soT.id, ...line({ unitPrice: 1000 }) }); completeWo(db, TH, t);
  const ivT = run(db, TH, 'invoice.create', { woIds: [t.id], shipDate: today(), date: today() });
  assert.deepEqual([ivT.currency, ivT.taxLabel, ivT.tax, ivT.dueDate], ['THB', 'VAT', 70, addDays(today(), 45)]);
});

test('AT-09 Payments track the balance; over-payment refused; void only by Super Admin and only when unpaid', () => {
  const { db, SUPER, SG } = fresh();
  const inv = db.invoices.find(i => i.branchId === 'SG' && i.status === 'Issued' && !i.givId);
  assert.throws(() => run(db, SG, 'invoice.pay', { id: inv.id, amount: inv.amountDue + 1, date: today(), method: 'Cash' }), /more than the balance/);
  run(db, SG, 'invoice.pay', { id: inv.id, amount: 10, date: today(), method: 'Cash' });
  assert.equal(inv.status, 'Partially paid');
  assert.throws(() => run(db, SUPER, 'invoice.void', { id: inv.id, reason: 'x' }), /payments/);
  const other = db.invoices.find(i => i.branchId === 'SG' && i.status === 'Issued' && !i.givId && i.id !== inv.id)
    || run(db, SG, 'invoice.create', { woIds: [db.workOrders.find(w => w.branchId === 'SG' && w.stage === 'Complete' && !w.invoiceId).id], shipDate: today() });
  assert.throws(() => run(db, SG, 'invoice.void', { id: other.id, reason: 'x' }), /Super Admin/);
  run(db, SUPER, 'invoice.void', { id: other.id, reason: 'Wrong customer' });
  assert.equal(other.status, 'Void');
  for (const l of other.lines) assert.equal(db.workOrders.find(w => w.id === l.woId).invoiceId, '');
});

test('AT-10 Multi-branch: Ops see and change only their own branch; Super Admin sees all', () => {
  const { db, SUPER, MY } = fresh();
  const st = stateFor(db, MY);
  assert.ok(st.workOrders.length > 0 && st.workOrders.every(w => w.branchId === 'MY'));
  assert.ok(st.invoices.every(i => i.branchId === 'MY'));
  assert.equal(st.audit.length, 0);
  const sgWo = db.workOrders.find(w => w.branchId === 'SG' && !w.invoiceId);
  assert.throws(() => run(db, MY, 'wo.save', { id: sgWo.id, notes: 'x' }), e => e.status === 403);
  const so = run(db, MY, 'so.save', { branchId: 'SG', customerId: cust(db, 'Siti').id, date: today() });
  assert.equal(so.branchId, 'MY');               // ops cannot pick another branch
  assert.equal(new Set(stateFor(db, SUPER).workOrders.map(w => w.branchId)).size, 3);
});

test('AT-11 Technician time is logged in minutes per work order and feeds year-on-year totals', () => {
  const { db, SG } = fresh();
  const wo = db.workOrders.find(w => w.branchId === 'SG' && w.technicianId);
  const n = wo.timeLogs.length;
  run(db, SG, 'wo.logTime', { id: wo.id, staffId: wo.technicianId, date: today(), minutes: 95, note: 'Edge paint' });
  assert.equal(wo.timeLogs.length, n + 1);
  assert.throws(() => run(db, SG, 'wo.logTime', { id: wo.id, staffId: wo.technicianId, date: addDays(today(), 1), minutes: 30 }), /today or earlier/);
  assert.throws(() => run(db, SG, 'wo.logTime', { id: wo.id, staffId: wo.technicianId, date: today(), minutes: 0 }), /Minutes/);
  const y = Number(today().slice(0, 4));
  const total = yr => db.workOrders.flatMap(w => w.timeLogs).filter(l => l.date.startsWith(String(yr))).reduce((a, l) => a + l.minutes, 0);
  assert.ok(total(y) > 0 && total(y - 1) > 0, 'seed has time in this year and last year');
});

test('AT-12 Leave: ops apply for staff, only Super Admin approves; balance and overlaps are checked', () => {
  const { db, SUPER, SG } = fresh();
  const s = db.staff.find(x => x.name === 'Rachel Ng');
  const mon = (() => { let d = addDays(today(), 30); while ([0, 6].includes(new Date(d + 'T00:00:00').getDay())) d = addDays(d, 1); return d; })();
  if (mon.slice(0, 4) !== today().slice(0, 4)) return;   // skip near year end
  const l = run(db, SG, 'leave.apply', { staffId: s.id, type: 'Annual', from: mon, to: mon, reason: 'Errand' });
  assert.equal(l.status, 'Pending');
  assert.throws(() => run(db, SG, 'leave.decide', { id: l.id, decision: 'Approved' }), /Super Admin/);
  assert.throws(() => run(db, SG, 'leave.apply', { staffId: s.id, type: 'Medical', from: mon, to: mon }), /Overlaps/);
  assert.throws(() => run(db, SUPER, 'leave.decide', { id: l.id, decision: 'Rejected' }), /reason/);
  run(db, SUPER, 'leave.decide', { id: l.id, decision: 'Approved' });
  assert.equal(l.status, 'Approved');
  assert.throws(() => run(db, SG, 'leave.apply', { staffId: s.id, type: 'Annual', from: `${today().slice(0, 4)}-01-01`, to: `${today().slice(0, 4)}-12-31` }), /Not enough annual leave|Overlaps/);
});

test('AT-13 Records are never deleted; cancelling an SO closes its open items as zero-value; reopen is Super Admin only', () => {
  const { db, SUPER, SG } = fresh();
  const so = newSo(db, SG, 'Marcus Lee', 'SG');
  const wo = run(db, SG, 'so.addLine', { soId: so.id, ...line() });
  run(db, SG, 'so.cancel', { id: so.id, reason: 'Customer took item back' });
  assert.equal(so.status, 'Cancelled');
  assert.equal(wo.stage, 'Cancelled');
  assert.ok(db.workOrders.includes(wo) && db.salesOrders.includes(so));
  assert.throws(() => run(db, SG, 'wo.reopen', { id: wo.id, reason: 'oops' }), /Super Admin/);
  run(db, SUPER, 'wo.reopen', { id: wo.id, reason: 'Customer changed mind' });
  assert.equal(wo.stage, 'QC');
  assert.equal(so.status, 'Open');
});

test('AT-14 Every change writes history and the audit trail', () => {
  const { db, SG } = fresh();
  const c = run(db, SG, 'customer.save', { type: 'Individual', name: 'Test Person', phone: '+65 8000 9999', paymentTerm: 'Upfront' });
  run(db, SG, 'customer.save', { ...c, paymentTerm: '30 days' });
  assert.ok(c.history.some(h => h.action.includes('Payment term')));
  assert.ok(db.audit.some(a => a.action === 'Customer edited' && a.ref === c.code));
});

test('AT-15 HTTP: actions require a demo user; state is scoped by X-User-Id', async () => {
  const { createServer } = require('../server/server');
  const { db } = fresh();
  const srv = createServer(db, () => {}).listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const anon = await fetch(base + '/api/action/customer.save', { method: 'POST', body: '{}' });
    assert.equal(anon.status, 401);
    const st = await (await fetch(base + '/api/state', { headers: { 'X-User-Id': 'U4' } })).json();
    assert.ok(st.workOrders.every(w => w.branchId === 'TH'));
    const page = await fetch(base + '/');
    assert.equal(page.status, 200);
    assert.notEqual((await fetch(base + '/%2e%2e/server/server.js')).status, 200);
  } finally { srv.close(); }
});

test('AT-16 Bulk set stage: ticked work orders move together; one refusal changes none; other branches refused', () => {
  const { db, SG, MY } = fresh();
  const so = newSo(db, SG, 'Marcus Lee', 'SG');
  const [a, b, c] = [1, 2, 3].map(() => run(db, SG, 'so.addLine', { soId: so.id, ...line() }));
  const r = run(db, SG, 'wo.stageBulk', { ids: [a.id, b.id], stage: 'Technician', technicianId: tech(db, 'SG').id });
  assert.deepEqual(r.moved, [a.ref, b.ref]);
  assert.ok([a, b].every(w => w.stage === 'Technician' && w.technicianId === tech(db, 'SG').id && w.history.some(h => h.action.includes('Logged in → Technician'))));
  // already at the stage: skipped, the rest still move
  assert.equal(run(db, SG, 'wo.stageBulk', { ids: [a.id, c.id], stage: 'Checking' }).skipped, 0);
  assert.equal(run(db, SG, 'wo.stageBulk', { ids: [a.id, b.id], stage: 'Checking' }).skipped, 1);
  // a closed work order in the batch blocks the whole batch
  completeWo(db, SG, c);
  assert.throws(() => run(db, SG, 'wo.stageBulk', { ids: [a.id, c.id], stage: 'QC' }), new RegExp(c.ref));
  assert.equal(a.stage, 'Checking');
  // Cancelled needs a reason; Ops of another branch are refused
  assert.throws(() => run(db, SG, 'wo.stageBulk', { ids: [a.id, b.id], stage: 'Cancelled' }), /reason/);
  assert.throws(() => run(db, MY, 'wo.stageBulk', { ids: [a.id], stage: 'QC' }), /own branch/);
  assert.equal(b.stage, 'Checking');
});

test('AT-17 Group invoice: groups unpaid invoices of one customer; its payment pays the invoices inside; void releases them', () => {
  const { db, SUPER, SG } = fresh();
  const so = newSo(db, SG, 'Vintage Vault', 'SG');
  const [a, b, c] = [100, 200, 300].map(unitPrice => run(db, SG, 'so.addLine', { soId: so.id, ...line({ unitPrice }) }));
  [a, b, c].forEach(w => completeWo(db, SG, w));
  const [i1, i2, i3] = [a, b, c].map(w => run(db, SG, 'invoice.create', { woIds: [w.id], shipDate: today() }));
  assert.ok([i1, i2, i3].every(i => i.kind === 'IV'));
  run(db, SG, 'invoice.pay', { id: i3.id, amount: i3.amountDue, date: today(), method: 'Cash' });
  assert.throws(() => run(db, SG, 'giv.create', { invoiceIds: [i1.id, i3.id] }), /already paid/);
  const otherCust = db.invoices.find(i => i.branchId === 'SG' && i.customerId !== i1.customerId && i.status !== 'Paid' && i.status !== 'Void');
  assert.throws(() => run(db, SG, 'giv.create', { invoiceIds: [i1.id, otherCust.id] }), /same customer/);
  const g = run(db, SG, 'giv.create', { invoiceIds: [i1.id, i2.id] });
  assert.match(g.ref, /^GIV-SG-\d{4}-\d{4}$/);
  assert.equal(i1.givId, g.id);
  assert.throws(() => run(db, SG, 'giv.create', { invoiceIds: [i1.id] }), /already in group invoice/);
  assert.throws(() => run(db, SG, 'invoice.pay', { id: i1.id, amount: 1, date: today(), method: 'Cash' }), /group invoice/);
  assert.throws(() => run(db, SG, 'giv.pay', { id: g.id, amount: 1000, date: today(), method: 'Cash' }), /more than the balance/);
  // part payment goes to the earliest invoice first, then the full balance settles both
  run(db, SG, 'giv.pay', { id: g.id, amount: 109, date: today(), method: 'Bank transfer', reference: 'TT-1' });
  assert.deepEqual([i1.status, i2.status, g.status], ['Paid', 'Issued', 'Partially paid']);
  run(db, SG, 'giv.pay', { id: g.id, amount: i2.amountDue, date: today(), method: 'Bank transfer' });
  assert.deepEqual([i1.status, i2.status, g.status], ['Paid', 'Paid', 'Paid']);
  assert.match(i2.payments[0].reference, new RegExp(g.ref));
  // void: Super Admin only, only without payments; releases the invoices
  const [d1, d2] = [run(db, SG, 'so.addLine', { soId: so.id, ...line() }), run(db, SG, 'so.addLine', { soId: so.id, ...line() })];
  [d1, d2].forEach(w => completeWo(db, SG, w));
  const j = [d1, d2].map(w => run(db, SG, 'invoice.create', { woIds: [w.id], shipDate: today() }));
  const g2 = run(db, SG, 'giv.create', { invoiceIds: j.map(i => i.id) });
  assert.throws(() => run(db, SG, 'giv.void', { id: g2.id, reason: 'x' }), /Super Admin/);
  assert.throws(() => run(db, SUPER, 'giv.void', { id: g.id, reason: 'x' }), /Payments/);
  run(db, SUPER, 'giv.void', { id: g2.id, reason: 'Wrong grouping' });
  assert.ok(j.every(i => i.givId === '' && i.status === 'Issued'));
  run(db, SG, 'invoice.pay', { id: j[0].id, amount: 1, date: today(), method: 'Cash' });
});
