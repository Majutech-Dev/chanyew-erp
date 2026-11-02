'use strict';
// Domain rules for Chan Yew ERP. Every action is checked here for the acting user;
// the browser only hides what this file would refuse anyway.

const STAGES = ['Logged in', 'Checking', 'Order SP', 'Technician', 'QC', 'Pending collection',
  'Call customer', 'Call unreachable', 'Call success', 'Complete', 'Cancelled'];
const CLOSED_STAGES = ['Complete', 'Cancelled'];
const FOLLOW_UP_STAGES = ['Pending collection', 'Call customer', 'Call unreachable'];
const NEXT_STAGE = {
  'Logged in': 'Checking', 'Checking': 'Technician', 'Order SP': 'Technician', 'Technician': 'QC',
  'QC': 'Pending collection', 'Pending collection': 'Call customer', 'Call customer': 'Call success',
  'Call unreachable': 'Call customer', 'Call success': 'Complete',
};
const PRODUCT_CODES = ['Custom made', 'Repair', 'Cleaning / colouring'];
const ITEM_TYPES = ['HB', 'Jewellery', 'RTW', 'Shoes', 'SLG', 'Trolley', 'Watch strap'];
const PAYMENT_TERMS = { 'Upfront': 0, '30 days': 30, '45 days': 45 };
const CUSTOMER_TYPES = ['Individual', 'Business'];
const LEAVE_TYPES = ['Annual', 'Medical', 'Compassionate', 'Unpaid'];
const PAY_METHODS = ['Bank transfer', 'PayNow / DuitNow / PromptPay', 'Cash', 'Card', 'Cheque'];
const ROLES = { super: 'Super Admin', ops: 'Ops' };

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (msg, status = 400) => { throw new HttpError(status, msg); };

// ---------- helpers ----------
const pad = (n, w) => String(n).padStart(w, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
const today = () => isoDate(new Date());
const nowIso = () => new Date().toISOString();
const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(new Date(s));
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDate(d); };
const str = v => (v == null ? '' : String(v).trim());
const num = v => (v === '' || v == null ? NaN : Number(v));

function nextSeq(db, key) { db.counters[key] = (db.counters[key] || 0) + 1; return db.counters[key]; }
function newId(db, prefix) { return `${prefix}${pad(nextSeq(db, 'id'), 6)}`; }

const canSeeBranch = (user, branchId) => user.role === 'super' || user.branchId === branchId;
function needBranch(user, branchId) { if (!canSeeBranch(user, branchId)) fail('You can only work on records of your own branch.', 403); }
function needSuper(user, what) { if (user.role !== 'super') fail(`Only a Super Admin can ${what}.`, 403); }

function find(list, id, what) { const r = list.find(x => x.id === id); if (!r) fail(`${what} not found.`, 404); return r; }
function audit(db, user, action, ref, detail = '') {
  db.audit.push({ at: nowIso(), by: user.name, userId: user.id, action, ref, detail });
}
function hist(rec, user, action) { (rec.history ||= []).push({ at: nowIso(), by: user.name, action }); }
function changedFields(before, after, labels) {
  return Object.entries(labels).filter(([k]) => JSON.stringify(before[k] ?? '') !== JSON.stringify(after[k] ?? '')).map(([, l]) => l);
}

// ---------- calculations ----------
function branchOf(db, id) { return find(db.branches, id, 'Branch'); }
function woAmount(wo) { return wo.stage === 'Cancelled' ? 0 : round2(wo.unitPrice); }
function woTotals(wo, taxRate) {
  const sub = woAmount(wo), tax = round2(sub * taxRate / 100), total = round2(sub + tax);
  return { sub, tax, total, outstanding: round2(total - (Number(wo.deposit) || 0)) };
}
function soTotals(db, so) {
  const wos = db.workOrders.filter(w => w.soId === so.id);
  const sub = round2(wos.reduce((a, w) => a + woAmount(w), 0));
  const tax = round2(sub * so.taxRate / 100);
  const deposits = round2(wos.reduce((a, w) => a + (Number(w.deposit) || 0), 0));
  return { items: wos.length, sub, tax, total: round2(sub + tax), deposits };
}
function invoiceStatus(inv) {
  if (inv.status === 'Void') return 'Void';
  const paid = round2(inv.payments.reduce((a, p) => a + p.amount, 0));
  if (paid >= inv.amountDue - 0.001) return 'Paid';
  return paid > 0 ? 'Partially paid' : 'Issued';
}
function checkPayment(p, bal, currency) {
  const amount = round2(num(p.amount));
  if (!(amount > 0)) fail('Amount must be more than zero.');
  if (amount > bal + 0.001) fail(`Amount is more than the balance (${currency} ${bal.toFixed(2)}).`);
  if (!isDate(p.date)) fail('Payment date is required.');
  if (!PAY_METHODS.includes(str(p.method))) fail('Choose a payment method.');
  return { date: p.date, amount, method: str(p.method), reference: str(p.reference) };
}
function addPayment(db, user, inv, pay) {
  inv.payments.push({ id: newId(db, 'PAY'), ...pay, by: user.name, at: nowIso() });
  inv.status = invoiceStatus(inv);
  hist(inv, user, `Payment ${inv.currency} ${pay.amount.toFixed(2)} (${pay.method}${pay.givId ? ', group invoice' : ''}) – now ${inv.status}`);
}
const activeGiv = (db, inv) => inv.givId ? (db.groupInvoices || []).find(g => g.id === inv.givId && g.status !== 'Void') : null;
const givInvoices = (db, giv) => giv.invoiceIds.map(id => db.invoices.find(i => i.id === id)).filter(Boolean);
function givBalance(db, giv) { return round2(givInvoices(db, giv).reduce((a, i) => a + invoiceBalance(i), 0)); }
function givStatus(db, giv) {
  if (giv.status === 'Void') return 'Void';
  const st = givInvoices(db, giv).map(i => i.status);
  return st.every(s => s === 'Paid') ? 'Paid' : st.some(s => s !== 'Issued') ? 'Partially paid' : 'Issued';
}
function invoiceBalance(inv) { return round2(inv.amountDue - inv.payments.reduce((a, p) => a + p.amount, 0)); }
// Mon–Fri days between two dates inclusive (public holidays: see ASSUMPTIONS W-14)
function workingDays(from, to, halfDay) {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) { const wd = new Date(d + 'T00:00:00').getDay(); if (wd !== 0 && wd !== 6) n++; }
  return halfDay && n === 1 ? 0.5 : n;
}
function leaveTaken(db, staffId, year, exceptId) {
  return db.leaves.filter(l => l.staffId === staffId && l.type === 'Annual' && l.id !== exceptId
    && ['Pending', 'Approved'].includes(l.status) && l.from.startsWith(String(year))).reduce((a, l) => a + l.days, 0);
}
function refreshSoStatus(db, so) {
  if (so.status === 'Cancelled') return;
  const wos = db.workOrders.filter(w => w.soId === so.id);
  so.status = wos.length && wos.every(w => CLOSED_STAGES.includes(w.stage)) ? 'Completed' : 'Open';
}
function queueMessage(db, user, wo, kind) {
  const c = db.customers.find(x => x.id === wo.customerId);
  const b = db.branches.find(x => x.id === wo.branchId);
  const text = kind === 'ready'
    ? `Hi ${c?.contactPerson || c?.name}, your ${wo.brand} ${wo.itemType} (${wo.ref}${wo.roNumber ? ' / RO ' + wo.roNumber : ''}) is ready for collection at Chan Yew Leathers ${b?.name}.`
    : `Reminder: your ${wo.brand} ${wo.itemType} (${wo.ref}) is still waiting for collection at Chan Yew Leathers ${b?.name}.`;
  db.outbox.push({ id: newId(db, 'MSG'), at: nowIso(), channel: 'WhatsApp', to: c?.phone || '', customerId: wo.customerId,
    branchId: wo.branchId, woId: wo.id, ref: wo.ref, kind, text, by: user.name, status: 'Stored in demo sink – not sent' });
}

// ---------- validation ----------
function pick(p, keys) { const o = {}; for (const k of keys) if (k in p) o[k] = p[k]; return o; }

// stage change in two halves so a bulk move can check every work order before changing any
function checkStage(db, user, wo, to, p) {
  needBranch(user, wo.branchId);
  if (!STAGES.includes(to)) fail('Unknown stage.');
  if (wo.invoiceId) fail('This work order is invoiced and locked.');
  if (CLOSED_STAGES.includes(wo.stage)) fail(`Work order is ${wo.stage}. A Super Admin can reopen it.`);
  let note = str(p.note), tech = null, reason = '';
  if (to === 'Technician') {
    tech = db.staff.find(s => s.id === str(p.technicianId));
    if (!tech || !tech.isTechnician || tech.status !== 'Active') fail('Select a technician from the list.');
    if (tech.branchId !== wo.branchId) fail('The technician must belong to the work order\'s branch.');
    note = `Assigned to ${tech.name}${note ? ' – ' + note : ''}`;
  }
  if (to === 'Cancelled') {
    reason = str(p.reason); if (!reason) fail('A reason is required (e.g. "Return as requested").');
    note = reason;
  }
  return { note, tech, reason };
}
function applyStage(db, user, wo, to, p, { note, tech, reason }) {
  if (tech) wo.technicianId = tech.id;
  if (to === 'Cancelled') wo.cancelReason = reason;
  const from = wo.stage;
  wo.stage = to; wo.stageAt = nowIso();
  if (to === 'Complete') wo.completedAt = nowIso();
  if (['Call customer', 'Call unreachable', 'Call success', 'Pending collection'].includes(to)) wo.lastContactAt = nowIso();
  if (to === 'Pending collection') queueMessage(db, user, wo, 'ready');
  hist(wo, user, `Stage: ${from} → ${to}${note ? ' (' + note + ')' : ''}`);
  const so = db.salesOrders.find(s => s.id === wo.soId); if (so) refreshSoStatus(db, so);
  audit(db, user, 'Work order stage', wo.ref, `${from} → ${to}`);
  return wo;
}

function cleanCustomer(p) {
  const c = {
    type: str(p.type), name: str(p.name), contactPerson: str(p.contactPerson), phone: str(p.phone), email: str(p.email),
    address: str(p.address), homeBranchId: str(p.homeBranchId), paymentTerm: str(p.paymentTerm), status: str(p.status) || 'Active',
    notes: str(p.notes),
  };
  if (!CUSTOMER_TYPES.includes(c.type)) fail('Customer type must be Individual or Business.');
  if (!c.name) fail('Customer name is required.');
  if (!c.phone) fail('Phone is required (used for WhatsApp updates).');
  if (c.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) fail('Email address is not valid.');
  if (!(c.paymentTerm in PAYMENT_TERMS)) fail('Choose a payment term.');
  if (!['Active', 'Inactive'].includes(c.status)) fail('Status must be Active or Inactive.');
  return c;
}

function cleanWoFields(db, p, so, existing) {
  const w = {
    productCode: str(p.productCode), itemType: str(p.itemType), brand: str(p.brand), description: str(p.description),
    condition: str(p.condition), location: str(p.location), estDate: str(p.estDate), roNumber: str(p.roNumber),
    unitPrice: num(p.unitPrice), deposit: p.deposit === '' || p.deposit == null ? 0 : num(p.deposit),
    services: Array.isArray(p.services) ? p.services.map(String) : (existing?.services || []),
    instructionsEn: str(p.instructionsEn), instructionsZh: str(p.instructionsZh), notes: str(p.notes),
  };
  if (!PRODUCT_CODES.includes(w.productCode)) fail('Choose a product code.');
  if (!ITEM_TYPES.includes(w.itemType)) fail('Choose an item type.');
  if (!w.brand) fail('Brand is required.');
  if (!isDate(w.estDate)) fail('Estimated completion date is required.');
  if (!(w.unitPrice >= 0)) fail('Price must be zero or more.');
  if (!(w.deposit >= 0)) fail('Amount paid must be zero or more.');
  const unknown = w.services.filter(id => !db.glossary.some(g => g.id === id));
  if (unknown.length) fail('Unknown repair service selected.');
  const cust = db.customers.find(c => c.id === so.customerId);
  if (w.roNumber && db.workOrders.some(x => x.customerId === so.customerId && x.roNumber.toLowerCase() === w.roNumber.toLowerCase() && x.id !== existing?.id))
    fail(`RO number ${w.roNumber} is already used for ${cust?.name}.`);
  return w;
}

// ---------- actions ----------
const WO_LABELS = { productCode: 'Product code', itemType: 'Item type', brand: 'Brand', description: 'Description', condition: 'Product status',
  location: 'Location', estDate: 'Est. date', roNumber: 'RO no.', unitPrice: 'Price', deposit: 'Amount paid', services: 'Repair services',
  instructionsEn: 'Instructions (EN)', instructionsZh: 'Instructions (中文)', notes: 'Notes' };

const actions = {
  // ----- customers (shared by all branches) -----
  'customer.save'(db, user, p) {
    const c = cleanCustomer(p);
    if (c.homeBranchId) branchOf(db, c.homeBranchId); else c.homeBranchId = user.branchId || 'SG';
    if (!p.id) {
      const rec = { id: newId(db, 'CUS'), code: `C-${pad(nextSeq(db, 'customer'), 4)}`, ...c, roSeq: 0, createdAt: nowIso(), history: [] };
      hist(rec, user, 'Created'); db.customers.push(rec); audit(db, user, 'Customer created', rec.code);
      return rec;
    }
    const rec = find(db.customers, p.id, 'Customer');
    const before = { ...rec }; Object.assign(rec, c);
    const ch = changedFields(before, rec, { type: 'Type', name: 'Name', contactPerson: 'Contact', phone: 'Phone', email: 'Email', address: 'Address', homeBranchId: 'Home branch', paymentTerm: 'Payment term', status: 'Status', notes: 'Notes' });
    if (ch.length) { hist(rec, user, 'Edited: ' + ch.join(', ')); audit(db, user, 'Customer edited', rec.code, ch.join(', ')); }
    return rec;
  },

  // ----- sales orders -----
  'so.save'(db, user, p) {
    const fields = { customerId: str(p.customerId), date: str(p.date), customerRef: str(p.customerRef), notes: str(p.notes) };
    const cust = find(db.customers, fields.customerId, 'Customer');
    if (cust.status !== 'Active') fail('This customer is inactive.');
    if (!isDate(fields.date)) fail('Order date is required.');
    if (!p.id) {
      const branchId = user.role === 'super' ? str(p.branchId) || 'SG' : user.branchId;
      needBranch(user, branchId);
      const b = branchOf(db, branchId);
      const year = fields.date.slice(0, 4);
      const so = { id: newId(db, 'SO'), ref: `SO-${b.id}-${year}-${pad(nextSeq(db, `so-${b.id}-${year}`), 4)}`, branchId: b.id,
        ...fields, currency: b.currency, taxLabel: b.taxLabel, taxRate: b.taxRate, status: 'Open', createdAt: nowIso(), createdBy: user.name, history: [] };
      hist(so, user, 'Created'); db.salesOrders.push(so); audit(db, user, 'Sales order created', so.ref);
      return so;
    }
    const so = find(db.salesOrders, p.id, 'Sales order'); needBranch(user, so.branchId);
    if (so.status === 'Cancelled') fail('This sales order is cancelled.');
    const wos = db.workOrders.filter(w => w.soId === so.id);
    if (fields.customerId !== so.customerId && wos.length) fail('The customer cannot be changed once items have been added.');
    const before = { ...so }; Object.assign(so, fields);
    const ch = changedFields(before, so, { customerId: 'Customer', date: 'Date', customerRef: 'Customer ref', notes: 'Notes' });
    if (ch.length) hist(so, user, 'Edited: ' + ch.join(', '));
    return so;
  },

  // Each sales order item becomes its own work order (docx: "sales order item creation will auto create work order")
  'so.addLine'(db, user, p) {
    const so = find(db.salesOrders, p.soId, 'Sales order'); needBranch(user, so.branchId);
    if (so.status === 'Cancelled') fail('Items cannot be added to a cancelled sales order.');
    const cust = find(db.customers, so.customerId, 'Customer');
    const w = cleanWoFields(db, p, so, null);
    if (cust.type === 'Business' && !w.roNumber) { cust.roSeq = (cust.roSeq || 0) + 1; w.roNumber = pad(cust.roSeq, 3); }
    const yy = so.date.slice(2, 4);
    const wo = { id: newId(db, 'WO'), ref: `WO${yy}${pad(nextSeq(db, `wo-${yy}`), 6)}`, soId: so.id, branchId: so.branchId,
      customerId: so.customerId, orderType: cust.type === 'Business' ? 'B2B' : 'B2C', ...w, stage: 'Logged in',
      technicianId: '', cancelReason: '', invoiceId: '', photos: [], timeLogs: [], createdAt: nowIso(), stageAt: nowIso(),
      lastContactAt: '', history: [] };
    hist(wo, user, `Created from ${so.ref}`); db.workOrders.push(wo);
    hist(so, user, `Item added: ${wo.ref} (${wo.brand} ${wo.itemType})`);
    refreshSoStatus(db, so); audit(db, user, 'Work order created', wo.ref, so.ref);
    return wo;
  },

  'so.cancel'(db, user, p) {
    const so = find(db.salesOrders, p.id, 'Sales order'); needBranch(user, so.branchId);
    const reason = str(p.reason); if (!reason) fail('A reason is required to cancel a sales order.');
    if (so.status === 'Cancelled') fail('Already cancelled.');
    const wos = db.workOrders.filter(w => w.soId === so.id);
    if (wos.some(w => w.invoiceId)) fail('Some items are already invoiced – the sales order cannot be cancelled.');
    if (wos.some(w => w.stage === 'Complete')) fail('Some items are already complete – cancel the remaining work orders individually.');
    for (const w of wos.filter(w => w.stage !== 'Cancelled')) {
      w.stage = 'Cancelled'; w.cancelReason = 'Return as requested – ' + reason; w.stageAt = nowIso(); hist(w, user, `Cancelled with ${so.ref}: ${reason}`);
    }
    so.status = 'Cancelled'; so.cancelReason = reason; hist(so, user, 'Cancelled: ' + reason); audit(db, user, 'Sales order cancelled', so.ref, reason);
    return so;
  },

  // ----- work orders -----
  'wo.save'(db, user, p) {
    const wo = find(db.workOrders, p.id, 'Work order'); needBranch(user, wo.branchId);
    const before = structuredClone(wo);
    if (wo.invoiceId) {
      // Invoiced: only the storage location and notes may change
      Object.assign(wo, { location: str(p.location ?? wo.location), notes: str(p.notes ?? wo.notes) });
    } else {
      const so = find(db.salesOrders, wo.soId, 'Sales order');
      Object.assign(wo, cleanWoFields(db, { ...wo, ...p }, so, wo));
    }
    const ch = changedFields(before, wo, WO_LABELS);
    if (ch.length) { hist(wo, user, 'Edited: ' + ch.join(', ')); audit(db, user, 'Work order edited', wo.ref, ch.join(', ')); }
    return wo;
  },

  'wo.stage'(db, user, p) {
    const wo = find(db.workOrders, p.id, 'Work order');
    const to = str(p.stage);
    needBranch(user, wo.branchId);
    if (to === wo.stage && STAGES.includes(to)) fail(`Already at ${to}.`);
    return applyStage(db, user, wo, to, p, checkStage(db, user, wo, to, p));
  },

  // several work orders to one stage: all are checked first, nothing changes if one is refused;
  // work orders already at the stage are skipped
  'wo.stageBulk'(db, user, p) {
    const ids = Array.isArray(p.ids) ? [...new Set(p.ids.map(String))] : [];
    if (!ids.length) fail('Tick one or more work orders first.');
    if (ids.length > 200) fail('Up to 200 work orders at a time.');
    const to = str(p.stage);
    const wos = ids.map(id => find(db.workOrders, id, 'Work order'));
    const todo = wos.filter(w => w.stage !== to);
    if (!todo.length) fail(`All ticked work orders are already at ${to}.`);
    const checked = todo.map(w => { try { return checkStage(db, user, w, to, p); } catch (e) { if (e instanceof HttpError) fail(`${w.ref}: ${e.message}`); throw e; } });
    todo.forEach((w, i) => applyStage(db, user, w, to, p, checked[i]));
    return { moved: todo.map(w => w.ref), skipped: wos.length - todo.length };
  },

  'wo.followUp'(db, user, p) {
    const wo = find(db.workOrders, p.id, 'Work order'); needBranch(user, wo.branchId);
    if (!FOLLOW_UP_STAGES.includes(wo.stage)) fail('Follow-up applies only to items waiting for collection.');
    queueMessage(db, user, wo, 'follow-up'); wo.lastContactAt = nowIso();
    hist(wo, user, 'Follow-up WhatsApp queued'); return wo;
  },

  'wo.reopen'(db, user, p) {
    needSuper(user, 'reopen a closed work order');
    const wo = find(db.workOrders, p.id, 'Work order');
    if (!CLOSED_STAGES.includes(wo.stage)) fail('Only Complete or Cancelled work orders can be reopened.');
    if (wo.invoiceId) fail('Invoiced work orders cannot be reopened – void the invoice first.');
    const reason = str(p.reason); if (!reason) fail('A reason is required to reopen.');
    const from = wo.stage; wo.stage = 'QC'; wo.stageAt = nowIso(); wo.cancelReason = '';
    hist(wo, user, `Reopened (${from} → QC): ${reason}`);
    const so = db.salesOrders.find(s => s.id === wo.soId);
    if (so) { if (so.status === 'Cancelled') so.status = 'Open'; refreshSoStatus(db, so); }
    audit(db, user, 'Work order reopened', wo.ref, reason); return wo;
  },

  'wo.addPhoto'(db, user, p) {
    const wo = find(db.workOrders, p.id, 'Work order'); needBranch(user, wo.branchId);
    const url = str(p.url); if (!/^\/uploads\/[\w.-]+$/.test(url)) fail('Upload the photo first.');
    wo.photos.push({ id: newId(db, 'PH'), url, caption: str(p.caption) || 'Condition photo', at: nowIso(), by: user.name });
    hist(wo, user, 'Photo added: ' + (str(p.caption) || 'Condition photo')); return wo;
  },

  // Technician time (R8): ops/super record minutes on behalf of technicians, replacing the paper logbook
  'wo.logTime'(db, user, p) {
    const wo = find(db.workOrders, p.id, 'Work order'); needBranch(user, wo.branchId);
    const t = db.staff.find(s => s.id === str(p.staffId));
    if (!t || !t.isTechnician) fail('Select a technician.');
    if (t.branchId !== wo.branchId) fail('The technician must belong to the work order\'s branch.');
    const minutes = num(p.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720) fail('Minutes must be a whole number from 1 to 720.');
    if (!isDate(p.date) || p.date > today()) fail('Date must be today or earlier.');
    if (p.logId) {
      const log = find(wo.timeLogs, p.logId, 'Time entry');
      if (user.role !== 'super' && log.by !== user.name) fail('Only the person who recorded this entry or a Super Admin can change it.', 403);
      Object.assign(log, { staffId: t.id, date: p.date, minutes, note: str(p.note) });
      hist(wo, user, `Time entry changed: ${t.name} ${minutes} min on ${p.date}`); return wo;
    }
    wo.timeLogs.push({ id: newId(db, 'TL'), staffId: t.id, date: p.date, minutes, note: str(p.note), by: user.name, at: nowIso() });
    hist(wo, user, `Time logged: ${t.name} ${minutes} min on ${p.date}`); return wo;
  },

  'wo.deleteTime'(db, user, p) {
    needSuper(user, 'remove a time entry');
    const wo = find(db.workOrders, p.id, 'Work order');
    const log = find(wo.timeLogs, p.logId, 'Time entry');
    const reason = str(p.reason); if (!reason) fail('A reason is required.');
    wo.timeLogs = wo.timeLogs.filter(l => l !== log);
    hist(wo, user, `Time entry removed (${log.minutes} min on ${log.date}): ${reason}`); return wo;
  },

  // ----- invoices -----
  // An invoice (IV) bills completed (or cancelled = zero value) WOs of one customer at one branch when they ship.
  // It is always a single invoice, however many WOs it holds; several invoices are grouped with giv.create.
  'invoice.create'(db, user, p) {
    const ids = Array.isArray(p.woIds) ? [...new Set(p.woIds.map(String))] : [];
    if (!ids.length) fail('Select at least one work order to bill.');
    const wos = ids.map(id => find(db.workOrders, id, 'Work order'));
    const branchId = str(p.branchId) || wos[0].branchId, customerId = str(p.customerId) || wos[0].customerId;
    needBranch(user, branchId);
    if (wos.some(w => w.branchId !== branchId)) fail('All work orders on one invoice must be from the same branch.');
    if (wos.some(w => w.customerId !== customerId)) fail('All work orders on one invoice must be for the same customer.');
    const bad = wos.find(w => !CLOSED_STAGES.includes(w.stage)); if (bad) fail(`${bad.ref} is not complete yet.`);
    const done = wos.find(w => w.invoiceId); if (done) fail(`${done.ref} is already invoiced.`);
    const date = str(p.date) || today(), shipDate = str(p.shipDate);
    if (!isDate(date)) fail('Invoice date is not valid.');
    if (!isDate(shipDate)) fail('Shipping / collection date is required – invoices are generated when items ship.');
    const cust = find(db.customers, customerId, 'Customer');
    const term = str(p.paymentTerm) || cust.paymentTerm; if (!(term in PAYMENT_TERMS)) fail('Choose a payment term.');
    const b = branchOf(db, branchId);
    const kind = 'IV';
    const year = date.slice(0, 4);
    const lines = wos.map(w => {
      const so = db.salesOrders.find(s => s.id === w.soId);
      return { woId: w.id, woRef: w.ref, roNumber: w.roNumber, soRef: so?.ref || '', description: `${w.brand} ${w.itemType} – ${w.productCode}${w.description ? ': ' + w.description : ''}`,
        amount: woAmount(w), deposit: round2(w.deposit), zeroReason: w.stage === 'Cancelled' ? (w.cancelReason || 'Return as requested') : '' };
    });
    const subtotal = round2(lines.reduce((a, l) => a + l.amount, 0)), tax = round2(subtotal * b.taxRate / 100), total = round2(subtotal + tax);
    const deposits = round2(lines.reduce((a, l) => a + l.deposit, 0));
    const inv = { id: newId(db, 'INV'), ref: `${kind}-${b.id}-${year}-${pad(nextSeq(db, `iv-${b.id}-${year}`), 4)}`, kind, branchId, customerId,
      date, shipDate, paymentTerm: term, dueDate: addDays(date, PAYMENT_TERMS[term]), currency: b.currency, taxLabel: b.taxLabel, taxRate: b.taxRate,
      lines, subtotal, tax, total, deposits, amountDue: round2(total - deposits), customerPo: str(p.customerPo), notes: str(p.notes),
      payments: [], status: 'Issued', givId: '', createdAt: nowIso(), createdBy: user.name, history: [] };
    if (inv.amountDue <= 0) inv.status = 'Paid';
    for (const w of wos) { w.invoiceId = inv.id; hist(w, user, `Invoiced on ${inv.ref}`); }
    hist(inv, user, `Issued with ${wos.length} work order(s)`); db.invoices.push(inv);
    audit(db, user, 'Invoice issued', inv.ref, `${wos.length} WO, ${inv.currency} ${total}`);
    return inv;
  },

  'invoice.save'(db, user, p) {
    const inv = find(db.invoices, p.id, 'Invoice'); needBranch(user, inv.branchId);
    const before = { ...inv }; inv.customerPo = str(p.customerPo); inv.notes = str(p.notes);
    const ch = changedFields(before, inv, { customerPo: 'Customer PO', notes: 'Notes' });
    if (ch.length) hist(inv, user, 'Edited: ' + ch.join(', ')); return inv;
  },

  'invoice.pay'(db, user, p) {
    const inv = find(db.invoices, p.id, 'Invoice'); needBranch(user, inv.branchId);
    if (inv.status === 'Void') fail('This invoice is void.');
    const g = activeGiv(db, inv); if (g) fail(`This invoice is part of group invoice ${g.ref} – record the payment on the group invoice.`);
    const pay = checkPayment(p, invoiceBalance(inv), inv.currency);
    addPayment(db, user, inv, pay);
    audit(db, user, 'Payment recorded', inv.ref, `${inv.currency} ${pay.amount}`); return inv;
  },

  'invoice.void'(db, user, p) {
    needSuper(user, 'void an invoice');
    const inv = find(db.invoices, p.id, 'Invoice');
    if (inv.status === 'Void') fail('Already void.');
    const g = activeGiv(db, inv); if (g) fail(`This invoice is part of group invoice ${g.ref} – void the group invoice first.`);
    if (inv.payments.length) fail('This invoice has payments recorded and cannot be voided.');
    const reason = str(p.reason); if (!reason) fail('A reason is required.');
    inv.status = 'Void'; inv.voidReason = reason;
    for (const l of inv.lines) { const w = db.workOrders.find(x => x.id === l.woId); if (w) { w.invoiceId = ''; hist(w, user, `Released from void invoice ${inv.ref}`); } }
    hist(inv, user, 'Voided: ' + reason); audit(db, user, 'Invoice voided', inv.ref, reason); return inv;
  },

  // ----- group invoices (GIV) -----
  // A GIV groups unpaid invoices of one customer at one branch into one bill. A payment on the GIV is applied to its
  // invoices (earliest due first), so their statuses follow the group's.
  'giv.create'(db, user, p) {
    const ids = Array.isArray(p.invoiceIds) ? [...new Set(p.invoiceIds.map(String))] : [];
    if (!ids.length) fail('Select the outstanding invoices to group.');
    const invs = ids.map(id => find(db.invoices, id, 'Invoice'));
    const branchId = str(p.branchId) || invs[0].branchId, customerId = str(p.customerId) || invs[0].customerId;
    needBranch(user, branchId);
    if (invs.some(i => i.branchId !== branchId)) fail('All invoices in a group invoice must be from the same branch.');
    if (invs.some(i => i.customerId !== customerId)) fail('All invoices in a group invoice must be for the same customer.');
    for (const i of invs) {
      if (i.status === 'Void') fail(`${i.ref} is void.`);
      if (invoiceBalance(i) <= 0) fail(`${i.ref} is already paid.`);
      const g = activeGiv(db, i); if (g) fail(`${i.ref} is already in group invoice ${g.ref}.`);
    }
    const date = str(p.date) || today(); if (!isDate(date)) fail('Group invoice date is not valid.');
    const cust = find(db.customers, customerId, 'Customer');
    const term = str(p.paymentTerm) || cust.paymentTerm; if (!(term in PAYMENT_TERMS)) fail('Choose a payment term.');
    const b = branchOf(db, branchId), year = date.slice(0, 4);
    invs.sort((x, y) => x.dueDate.localeCompare(y.dueDate) || x.ref.localeCompare(y.ref));
    const giv = { id: newId(db, 'GIV'), ref: `GIV-${b.id}-${year}-${pad(nextSeq(db, `giv-${b.id}-${year}`), 4)}`, branchId, customerId, currency: b.currency,
      date, paymentTerm: term, dueDate: addDays(date, PAYMENT_TERMS[term]), invoiceIds: invs.map(i => i.id), customerPo: str(p.customerPo), notes: str(p.notes),
      payments: [], status: 'Issued', createdAt: nowIso(), createdBy: user.name, history: [] };
    for (const i of invs) { i.givId = giv.id; hist(i, user, `Grouped into ${giv.ref}`); }
    (db.groupInvoices ||= []).push(giv);
    giv.status = givStatus(db, giv);
    hist(giv, user, `Issued with ${invs.length} invoice(s): ${invs.map(i => i.ref).join(', ')}`);
    audit(db, user, 'Group invoice issued', giv.ref, `${invs.length} invoices, ${giv.currency} ${givBalance(db, giv).toFixed(2)} outstanding`);
    return giv;
  },

  'giv.save'(db, user, p) {
    const giv = find(db.groupInvoices || [], p.id, 'Group invoice'); needBranch(user, giv.branchId);
    const before = { ...giv }; giv.customerPo = str(p.customerPo); giv.notes = str(p.notes);
    const ch = changedFields(before, giv, { customerPo: 'Customer PO', notes: 'Notes' });
    if (ch.length) hist(giv, user, 'Edited: ' + ch.join(', ')); return giv;
  },

  'giv.pay'(db, user, p) {
    const giv = find(db.groupInvoices || [], p.id, 'Group invoice'); needBranch(user, giv.branchId);
    if (giv.status === 'Void') fail('This group invoice is void.');
    const pay = checkPayment(p, givBalance(db, giv), giv.currency);
    let left = pay.amount; const alloc = [];
    for (const inv of givInvoices(db, giv)) {
      const a = round2(Math.min(left, invoiceBalance(inv))); if (a <= 0) continue;
      addPayment(db, user, inv, { ...pay, amount: a, reference: [pay.reference, `via ${giv.ref}`].filter(Boolean).join(' · '), givId: giv.id });
      alloc.push({ invoiceId: inv.id, ref: inv.ref, amount: a }); left = round2(left - a);
      if (left <= 0) break;
    }
    giv.payments.push({ id: newId(db, 'PAY'), ...pay, allocations: alloc, by: user.name, at: nowIso() });
    giv.status = givStatus(db, giv);
    hist(giv, user, `Payment ${giv.currency} ${pay.amount.toFixed(2)} (${pay.method}) applied to ${alloc.map(a => `${a.ref} ${a.amount.toFixed(2)}`).join(', ')} – now ${giv.status}`);
    audit(db, user, 'Group payment recorded', giv.ref, `${giv.currency} ${pay.amount}`); return giv;
  },

  'giv.void'(db, user, p) {
    needSuper(user, 'void a group invoice');
    const giv = find(db.groupInvoices || [], p.id, 'Group invoice');
    if (giv.status === 'Void') fail('Already void.');
    if (giv.payments.length) fail('Payments were recorded on this group invoice – it cannot be voided.');
    const reason = str(p.reason); if (!reason) fail('A reason is required.');
    giv.status = 'Void'; giv.voidReason = reason;
    for (const inv of givInvoices(db, giv)) { inv.givId = ''; hist(inv, user, `Released from void group invoice ${giv.ref}`); }
    hist(giv, user, 'Voided: ' + reason); audit(db, user, 'Group invoice voided', giv.ref, reason); return giv;
  },

  // ----- HR -----
  'staff.save'(db, user, p) {
    const s = { name: str(p.name), nameZh: str(p.nameZh), branchId: str(p.branchId), position: str(p.position),
      isTechnician: p.isTechnician === true || p.isTechnician === 'on' || p.isTechnician === 'true',
      phone: str(p.phone), email: str(p.email), joinDate: str(p.joinDate), annualLeave: num(p.annualLeave), status: str(p.status) || 'Active', notes: str(p.notes) };
    if (!s.name) fail('Name is required.');
    if (!s.position) fail('Position is required.');
    branchOf(db, s.branchId); needBranch(user, s.branchId);
    if (!isDate(s.joinDate)) fail('Join date is required.');
    if (!(s.annualLeave >= 0 && s.annualLeave <= 60)) fail('Annual leave entitlement must be 0–60 days.');
    if (!['Active', 'Inactive'].includes(s.status)) fail('Status must be Active or Inactive.');
    if (!p.id) {
      const rec = { id: newId(db, 'STF'), code: `S-${pad(nextSeq(db, 'staff'), 3)}`, ...s, createdAt: nowIso(), history: [] };
      hist(rec, user, 'Created'); db.staff.push(rec); audit(db, user, 'Staff created', rec.code); return rec;
    }
    const rec = find(db.staff, p.id, 'Staff'); needBranch(user, rec.branchId);
    if (rec.branchId !== s.branchId && user.role !== 'super') fail('Only a Super Admin can transfer staff between branches.', 403);
    if (s.status === 'Inactive' && db.workOrders.some(w => w.technicianId === rec.id && !CLOSED_STAGES.includes(w.stage)))
      fail('This technician still has open work orders – reassign them first.');
    const before = { ...rec }; Object.assign(rec, s);
    const ch = changedFields(before, rec, { name: 'Name', nameZh: 'Chinese name', branchId: 'Branch', position: 'Position', isTechnician: 'Technician', phone: 'Phone', email: 'Email', joinDate: 'Join date', annualLeave: 'Leave entitlement', status: 'Status', notes: 'Notes' });
    if (ch.length) { hist(rec, user, 'Edited: ' + ch.join(', ')); audit(db, user, 'Staff edited', rec.code, ch.join(', ')); }
    return rec;
  },

  'leave.apply'(db, user, p) {
    const staff = find(db.staff, str(p.staffId), 'Staff'); needBranch(user, staff.branchId);
    const l = { staffId: staff.id, type: str(p.type), from: str(p.from), to: str(p.to), halfDay: !!p.halfDay && p.halfDay !== 'false', reason: str(p.reason) };
    if (!LEAVE_TYPES.includes(l.type)) fail('Choose a leave type.');
    if (!isDate(l.from) || !isDate(l.to)) fail('From and to dates are required.');
    if (l.to < l.from) fail('The end date is before the start date.');
    l.days = workingDays(l.from, l.to, l.halfDay);
    if (!l.days) fail('The period has no working days.');
    if (l.from.slice(0, 4) !== l.to.slice(0, 4)) fail('Split leave that crosses into a new year into two applications.');
    const overlap = db.leaves.find(x => x.staffId === staff.id && x.id !== p.id && ['Pending', 'Approved'].includes(x.status) && x.from <= l.to && x.to >= l.from);
    if (overlap) fail(`Overlaps with ${overlap.ref} (${overlap.from} – ${overlap.to}).`);
    if (l.type === 'Annual') {
      const bal = staff.annualLeave - leaveTaken(db, staff.id, l.from.slice(0, 4), p.id);
      if (l.days > bal) fail(`Not enough annual leave: ${bal} day(s) left, ${l.days} requested.`);
    }
    if (p.id) {
      const rec = find(db.leaves, p.id, 'Leave'); needBranch(user, rec.branchId);
      if (rec.status !== 'Pending') fail('Only pending applications can be changed.');
      Object.assign(rec, l); hist(rec, user, `Changed: ${l.type} ${l.from} – ${l.to} (${l.days} d)`); return rec;
    }
    const rec = { id: newId(db, 'LV'), ref: `LV-${l.from.slice(0, 4)}-${pad(nextSeq(db, 'leave-' + l.from.slice(0, 4)), 4)}`, ...l, branchId: staff.branchId,
      status: 'Pending', appliedBy: user.name, appliedAt: nowIso(), history: [] };
    hist(rec, user, `Applied: ${l.type} ${l.from} – ${l.to} (${l.days} d)`); db.leaves.push(rec); audit(db, user, 'Leave applied', rec.ref, staff.name);
    return rec;
  },

  'leave.decide'(db, user, p) {
    needSuper(user, 'approve or reject leave');
    const rec = find(db.leaves, p.id, 'Leave');
    if (rec.status !== 'Pending') fail('Only pending applications can be decided.');
    const decision = str(p.decision), note = str(p.note);
    if (!['Approved', 'Rejected'].includes(decision)) fail('Decision must be Approved or Rejected.');
    if (decision === 'Rejected' && !note) fail('Give a reason for rejecting.');
    rec.status = decision; rec.decidedBy = user.name; rec.decidedAt = nowIso(); rec.decisionNote = note;
    hist(rec, user, decision + (note ? ': ' + note : '')); audit(db, user, 'Leave ' + decision.toLowerCase(), rec.ref); return rec;
  },

  'leave.cancel'(db, user, p) {
    const rec = find(db.leaves, p.id, 'Leave'); needBranch(user, rec.branchId);
    if (!['Pending', 'Approved'].includes(rec.status)) fail('Only pending or approved leave can be cancelled.');
    if (rec.status === 'Approved') needSuper(user, 'cancel approved leave');
    const reason = str(p.reason); if (!reason) fail('A reason is required.');
    rec.status = 'Cancelled'; hist(rec, user, 'Cancelled: ' + reason); audit(db, user, 'Leave cancelled', rec.ref); return rec;
  },

  // ----- set-up (Super Admin) -----
  'branch.save'(db, user, p) {
    needSuper(user, 'change branch settings');
    const b = find(db.branches, p.id, 'Branch');
    const f = { name: str(p.name), legalName: str(p.legalName), regNo: str(p.regNo), taxRegNo: str(p.taxRegNo), address: str(p.address),
      phone: str(p.phone), taxLabel: str(p.taxLabel), taxRate: num(p.taxRate), bankInfo: str(p.bankInfo), invoiceTerms: str(p.invoiceTerms) };
    if (!f.name) fail('Branch name is required.');
    if (!f.taxLabel) fail('Tax label is required (e.g. GST, SST, VAT).');
    if (!(f.taxRate >= 0 && f.taxRate <= 30)) fail('Tax rate must be 0–30%.');
    const before = { ...b }; Object.assign(b, f);
    const ch = changedFields(before, b, { name: 'Name', legalName: 'Legal name', regNo: 'Reg. no.', taxRegNo: 'Tax reg. no.', address: 'Address', phone: 'Phone', taxLabel: 'Tax label', taxRate: 'Tax rate', bankInfo: 'Bank details', invoiceTerms: 'Invoice terms' });
    if (ch.length) { hist(b, user, 'Edited: ' + ch.join(', ')); audit(db, user, 'Branch edited', b.id, ch.join(', ')); }
    return b;
  },

  'glossary.save'(db, user, p) {
    needSuper(user, 'change the repair glossary');
    const g = { en: str(p.en), zh: str(p.zh), category: str(p.category), defaultPrice: p.defaultPrice === '' || p.defaultPrice == null ? null : num(p.defaultPrice), status: str(p.status) || 'Active' };
    if (!g.en || !g.zh) fail('Both the English and Chinese terms are required.');
    if (g.defaultPrice != null && !(g.defaultPrice >= 0)) fail('Default price must be zero or more.');
    if (db.glossary.some(x => x.en.toLowerCase() === g.en.toLowerCase() && x.id !== p.id)) fail('This English term already exists.');
    if (!p.id) { const rec = { id: newId(db, 'GL'), code: `RS-${pad(nextSeq(db, 'glossary'), 3)}`, ...g, history: [] }; hist(rec, user, 'Created'); db.glossary.push(rec); return rec; }
    const rec = find(db.glossary, p.id, 'Term'); const before = { ...rec }; Object.assign(rec, g);
    const ch = changedFields(before, rec, { en: 'English', zh: '中文', category: 'Category', defaultPrice: 'Default price', status: 'Status' });
    if (ch.length) hist(rec, user, 'Edited: ' + ch.join(', ')); return rec;
  },

  'settings.save'(db, user, p) {
    needSuper(user, 'change settings');
    const fx = {}; for (const cur of ['MYR', 'THB']) { const v = num(p['fx_' + cur]); if (!(v > 0)) fail(`Enter the ${cur} → SGD rate.`); fx[cur] = v; }
    const days = num(p.followUpDays); if (!Number.isInteger(days) || days < 1 || days > 60) fail('Follow-up days must be 1–60.');
    db.settings.fxToSgd = { SGD: 1, ...fx }; db.settings.followUpDays = days;
    audit(db, user, 'Settings changed', 'settings', `MYR ${fx.MYR}, THB ${fx.THB}, follow-up ${days} d`); return db.settings;
  },
};

function runAction(db, user, name, payload) {
  if (!user) fail('Choose a demo user first.', 401);
  const fn = actions[name]; if (!fn) fail('Unknown action: ' + name, 404);
  return fn(db, user, payload || {});
}

// What the chosen user may see: Super Admin sees every branch; Ops only their own.
function stateFor(db, user) {
  const scoped = list => list.filter(r => canSeeBranch(user, r.branchId));
  return {
    me: user, users: db.users, branches: db.branches, settings: db.settings, glossary: db.glossary, customers: db.customers,
    staff: scoped(db.staff), leaves: scoped(db.leaves), salesOrders: scoped(db.salesOrders), workOrders: scoped(db.workOrders),
    invoices: scoped(db.invoices), groupInvoices: scoped(db.groupInvoices || []), outbox: scoped(db.outbox).slice(-200),
    audit: user.role === 'super' ? db.audit.slice(-300) : [],
    allStaffNames: db.staff.map(s => ({ id: s.id, name: s.name, branchId: s.branchId, isTechnician: s.isTechnician })),
    constants: { STAGES, CLOSED_STAGES, FOLLOW_UP_STAGES, NEXT_STAGE, PRODUCT_CODES, ITEM_TYPES, PAYMENT_TERMS, CUSTOMER_TYPES, LEAVE_TYPES, PAY_METHODS, ROLES },
    today: today(),
  };
}

module.exports = {
  STAGES, CLOSED_STAGES, FOLLOW_UP_STAGES, PRODUCT_CODES, ITEM_TYPES, PAYMENT_TERMS, LEAVE_TYPES, PAY_METHODS,
  HttpError, runAction, stateFor, workingDays, invoiceBalance, soTotals, woTotals, today, addDays, isoDate, pad, round2, nextSeq, newId,
};
