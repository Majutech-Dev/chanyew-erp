'use strict';
// Connected demo data. All people, companies, phone numbers and amounts are invented.
const { runAction, today, addDays, CLOSED_STAGES } = require('./workflow');

function emptyDb() {
  return {
    version: 1, counters: {}, audit: [], outbox: [],
    settings: { fxToSgd: { SGD: 1, MYR: 0.29, THB: 0.038 }, followUpDays: 3 },
    branches: [
      { id: 'SG', name: 'Singapore HQ', country: 'Singapore', legalName: 'Chan Yew Leathers Pte. Ltd.', regNo: '(to be provided)', taxRegNo: '(to be provided)',
        address: 'Singapore – address to be provided', phone: '+65 6000 0000', currency: 'SGD', taxLabel: 'GST', taxRate: 9,
        bankInfo: 'Bank transfer / PayNow – details to be provided', invoiceTerms: 'Items not collected within 90 days of notification may be disposed of. Standard terms to be provided by Chan Yew.', history: [] },
      { id: 'MY', name: 'Kuala Lumpur', country: 'Malaysia', legalName: 'Chan Yew Leathers (Malaysia) – entity name to be confirmed', regNo: '(to be provided)', taxRegNo: '(to be provided)',
        address: 'Kuala Lumpur – address to be provided', phone: '+60 3-0000 0000', currency: 'MYR', taxLabel: 'SST', taxRate: 8,
        bankInfo: 'Bank transfer / DuitNow – details to be provided', invoiceTerms: 'Standard terms to be provided by Chan Yew.', history: [] },
      { id: 'TH', name: 'Bangkok', country: 'Thailand', legalName: 'Chan Yew Leathers (Thailand) – entity name to be confirmed', regNo: '(to be provided)', taxRegNo: '(to be provided)',
        address: 'Bangkok – address to be provided', phone: '+66 2-000-0000', currency: 'THB', taxLabel: 'VAT', taxRate: 7,
        bankInfo: 'Bank transfer / PromptPay – details to be provided', invoiceTerms: 'Standard terms to be provided by Chan Yew.', history: [] },
    ],
    users: [
      { id: 'U1', name: 'Grace Lim', role: 'super', branchId: '', title: 'Super Admin (all branches)' },
      { id: 'U2', name: 'Daniel Tan', role: 'ops', branchId: 'SG', title: 'Ops – Singapore' },
      { id: 'U3', name: 'Nurul Aina', role: 'ops', branchId: 'MY', title: 'Ops – Kuala Lumpur' },
      { id: 'U4', name: 'Pim Srisuk', role: 'ops', branchId: 'TH', title: 'Ops – Bangkok' },
    ],
    glossary: [], customers: [], staff: [], leaves: [], salesOrders: [], workOrders: [], invoices: [], groupInvoices: [],
  };
}

// small deterministic random generator so every seed is the same
function rng(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

function buildSeed() {
  const db = emptyDb();
  const SUPER = db.users[0];
  const opsOf = b => db.users.find(u => u.branchId === b);
  const T = today(), d = n => addDays(T, -n);
  const act = (user, name, p) => runAction(db, user, name, p);
  const rand = rng(41);

  // repair-services glossary (EN / 中文)
  const terms = [
    ['Edge paint refinish', '封边油翻新', 'Leather', 120], ['Full re-dye', '全面补色', 'Leather', 380], ['Colour touch-up', '局部补色', 'Leather', 150],
    ['Corner restoration', '包角修复', 'Leather', 180], ['Handle replacement', '更换手柄', 'Leather', 260], ['Lining replacement', '更换内衬', 'Leather', 300],
    ['Hardware re-plating', '五金电镀', 'Hardware', 220], ['Zip replacement', '更换拉链', 'Hardware', 140], ['Stitching repair', '车线修补', 'Stitching', 110],
    ['Weaving repair', '编织修复', 'Stitching', 280], ['Interior cleaning', '内里清洁', 'Cleaning', 90], ['Deep cleaning & conditioning', '深层清洁保养', 'Cleaning', 160],
    ['Sole replacement', '更换鞋底', 'Shoes', 150], ['Heel tip replacement', '更换鞋跟', 'Shoes', 60], ['Strap replacement', '更换表带', 'Straps', 200],
    ['Custom strap making', '定制表带', 'Straps', 350],
  ];
  for (const [en, zh, category, defaultPrice] of terms) act(SUPER, 'glossary.save', { en, zh, category, defaultPrice });
  const G = en => db.glossary.find(g => g.en === en).id;

  // staff (technicians are picked from this list; they have no login in v0.1)
  const staff = [
    ['Grace Lim', '林慧玲', 'SG', 'Managing Director', false, 2012], ['Daniel Tan', '陈俊杰', 'SG', 'Front desk', false, 2021], ['Rachel Ng', '黄蕾', 'SG', 'Front desk', false, 2023],
    ['Ong Ah Seng', '王亚生', 'SG', 'Senior Artisan', true, 2005], ['Goh Mei Ling', '吴美玲', 'SG', 'Artisan', true, 2016], ['Kumar Raj', '', 'SG', 'Artisan', true, 2019], ['Jason Teo', '张家伟', 'SG', 'Apprentice Artisan', true, 2025],
    ['Nurul Aina', '', 'MY', 'Front desk', false, 2022], ['Lee Wei Hong', '李伟宏', 'MY', 'Senior Artisan', true, 2014], ['Farid Hassan', '', 'MY', 'Artisan', true, 2020], ['Tan Siew Mei', '陈秀美', 'MY', 'Artisan', true, 2021],
    ['Pim Srisuk', '', 'TH', 'Front desk', false, 2023], ['Somsak Chai', '', 'TH', 'Senior Artisan', true, 2017], ['Nattaya Boon', '', 'TH', 'Artisan', true, 2020], ['Arthit Kaew', '', 'TH', 'Artisan', true, 2024],
  ];
  staff.forEach(([name, nameZh, branchId, position, isTechnician, y], i) =>
    act(SUPER, 'staff.save', { name, nameZh, branchId, position, isTechnician, phone: `+00 0000 ${1000 + i}`, email: name.toLowerCase().replace(/\W+/g, '.') + '@example.com',
      joinDate: `${y}-0${1 + (i % 9)}-15`, annualLeave: position.startsWith('Senior') || position === 'Managing Director' ? 18 : 14, status: 'Active' }));
  const techs = b => db.staff.filter(s => s.isTechnician && s.branchId === b);

  // customers
  const custs = [
    ['Business', 'Luxe Again Consignment Pte Ltd', 'Serene Koh', 'SG', '30 days'], ['Business', 'Marina Grand Hotel – Guest Services', 'Wilson Yeo', 'SG', '45 days'],
    ['Business', 'Vintage Vault Asia Pte Ltd', 'Cheryl Lau', 'SG', '30 days'], ['Individual', 'Alicia Wong', '', 'SG', 'Upfront'], ['Individual', 'Marcus Lee', '', 'SG', 'Upfront'],
    ['Individual', 'Jonathan Chua', '', 'SG', 'Upfront'], ['Business', 'Preloved Atelier Sdn Bhd', 'Hafiz Ismail', 'MY', '30 days'], ['Individual', 'Siti Rahman', '', 'MY', 'Upfront'],
    ['Business', 'Siam Heritage Resale Co., Ltd.', 'Chanida Wong', 'TH', '45 days'], ['Individual', 'Kanya Thongchai', '', 'TH', 'Upfront'],
  ];
  const cc = { SG: '+65 8000 ', MY: '+60 12-000 ', TH: '+66 80-000-' };
  custs.forEach(([type, name, contactPerson, b, paymentTerm], i) =>
    act(SUPER, 'customer.save', { type, name, contactPerson, phone: cc[b] + (2100 + i), email: `contact${i + 1}@example.com`,
      address: type === 'Business' ? `${['12', '88', '7', '3', '25', '41', '9', '60', '15', '2'][i]} Demo Street, ${db.branches.find(x => x.id === b).name}` : '',
      homeBranchId: b, paymentTerm, status: 'Active' }));
  const C = name => db.customers.find(c => c.name.startsWith(name));

  // stage paths used to bring each work order to its demo stage
  const PATH = ['Checking', 'Technician', 'QC', 'Pending collection', 'Call customer', 'Call success', 'Complete'];
  function bring(wo, target, techIdx, user) {
    if (target === 'Logged in') return;
    if (target === 'Cancelled') { act(user, 'wo.stage', { id: wo.id, stage: 'Checking' }); act(user, 'wo.stage', { id: wo.id, stage: 'Cancelled', reason: 'Return as requested – customer declined quote' }); return; }
    if (target === 'Order SP') { act(user, 'wo.stage', { id: wo.id, stage: 'Checking' }); act(user, 'wo.stage', { id: wo.id, stage: 'Order SP', note: 'Waiting for hardware' }); return; }
    if (target === 'Call unreachable') { for (const s of PATH.slice(0, 5)) bring1(wo, s, techIdx, user); act(user, 'wo.stage', { id: wo.id, stage: 'Call unreachable' }); return; }
    for (const s of PATH) { bring1(wo, s, techIdx, user); if (s === target) break; }
  }
  function bring1(wo, s, techIdx, user) {
    act(user, 'wo.stage', { id: wo.id, stage: s, technicianId: s === 'Technician' ? techs(wo.branchId)[techIdx % techs(wo.branchId).length].id : '' });
  }

  const brands = ['Louis Vuitton', 'Hermès', 'Chanel', 'Gucci', 'Prada', 'Dior', 'Goyard', 'Bottega Veneta', 'Celine', 'Fendi'];
  const conditions = ['Corner wear, edge paint cracked', 'Stain on front panel', 'Scratches on hardware', 'Handle darkened', 'Lining torn', 'Colour fading', 'Loose stitching on strap', 'Water mark'];
  const priceFx = { SG: 1, MY: 3.4, TH: 26 };

  // [branch, customer, days ago, [[itemType, productCode, brand idx, services, stage, deposit?] …], customerRef]
  const orders = [
    // 2025 history (for year-on-year technician reports)
    ['SG', 'Luxe Again', 450, [['HB', 'Repair', 0, ['Edge paint refinish', 'Corner restoration'], 'Complete'], ['HB', 'Repair', 2, ['Hardware re-plating'], 'Complete'], ['SLG', 'Cleaning / colouring', 1, ['Colour touch-up'], 'Complete']], 'LA-PO-2025-118'],
    ['SG', 'Alicia Wong', 420, [['HB', 'Repair', 1, ['Handle replacement'], 'Complete', 'full']]],
    ['MY', 'Preloved Atelier', 440, [['HB', 'Repair', 3, ['Lining replacement'], 'Complete'], ['Shoes', 'Repair', 5, ['Sole replacement'], 'Complete']], 'PA-0451'],
    ['TH', 'Siam Heritage', 410, [['HB', 'Cleaning / colouring', 4, ['Deep cleaning & conditioning'], 'Complete'], ['Watch strap', 'Custom made', 2, ['Custom strap making'], 'Complete']], 'SH-2025-77'],
    // 2026
    ['SG', 'Luxe Again', 62, [['HB', 'Repair', 0, ['Edge paint refinish'], 'Complete'], ['SLG', 'Cleaning / colouring', 6, ['Colour touch-up'], 'Complete'], ['HB', 'Repair', 2, ['Stitching repair'], 'Cancelled']], 'LA-PO-2026-201'],
    ['SG', 'Marina Grand', 40, [['Trolley', 'Repair', 7, ['Zip replacement'], 'Complete'], ['Trolley', 'Repair', 7, ['Hardware re-plating'], 'Complete']], 'MGH-GS-0930'],
    ['SG', 'Luxe Again', 21, [['HB', 'Repair', 1, ['Corner restoration', 'Edge paint refinish'], 'Complete'], ['HB', 'Cleaning / colouring', 3, ['Full re-dye'], 'Call success'], ['SLG', 'Repair', 9, ['Stitching repair'], 'Pending collection'], ['Jewellery', 'Repair', 2, ['Hardware re-plating'], 'QC']], 'LA-PO-2026-233'],
    ['SG', 'Vintage Vault', 12, [['HB', 'Repair', 8, ['Weaving repair'], 'Technician'], ['HB', 'Repair', 7, ['Handle replacement'], 'Order SP'], ['RTW', 'Cleaning / colouring', 5, ['Deep cleaning & conditioning'], 'Checking']], 'VVA-1182'],
    ['SG', 'Alicia Wong', 9, [['HB', 'Repair', 2, ['Corner restoration'], 'Call unreachable', 'half']]],
    ['SG', 'Marcus Lee', 6, [['Shoes', 'Repair', 4, ['Sole replacement', 'Heel tip replacement'], 'Technician', 'full'], ['Watch strap', 'Custom made', 1, ['Custom strap making'], 'Checking', 'half']]],
    ['SG', 'Jonathan Chua', 1, [['HB', 'Cleaning / colouring', 0, ['Interior cleaning', 'Colour touch-up'], 'Logged in']]],
    ['SG', 'Marina Grand', 3, [['Trolley', 'Repair', 7, ['Zip replacement'], 'Logged in'], ['SLG', 'Repair', 6, ['Stitching repair'], 'Logged in']], 'MGH-GS-1027'],
    ['MY', 'Preloved Atelier', 45, [['HB', 'Repair', 0, ['Edge paint refinish'], 'Complete'], ['HB', 'Repair', 3, ['Corner restoration'], 'Complete'], ['SLG', 'Cleaning / colouring', 2, ['Colour touch-up'], 'Complete']], 'PA-0533'],
    ['MY', 'Preloved Atelier', 14, [['HB', 'Repair', 5, ['Handle replacement'], 'QC'], ['HB', 'Repair', 1, ['Hardware re-plating'], 'Technician'], ['Shoes', 'Repair', 3, ['Sole replacement'], 'Complete']], 'PA-0561'],
    ['MY', 'Siti Rahman', 5, [['HB', 'Cleaning / colouring', 4, ['Deep cleaning & conditioning'], 'Pending collection', 'full']]],
    ['TH', 'Siam Heritage', 75, [['HB', 'Repair', 2, ['Edge paint refinish'], 'Complete'], ['HB', 'Repair', 0, ['Lining replacement'], 'Complete']], 'SH-2026-12'],
    ['TH', 'Siam Heritage', 18, [['HB', 'Repair', 1, ['Full re-dye'], 'Technician'], ['Watch strap', 'Custom made', 2, ['Custom strap making'], 'Call customer']], 'SH-2026-31'],
    ['TH', 'Kanya Thongchai', 4, [['HB', 'Cleaning / colouring', 6, ['Interior cleaning'], 'Checking', 'half']]],
  ];

  const soOf = {}; let techTurn = 0;
  orders.forEach(([b, cust, ago, items, customerRef], oi) => {
    const user = opsOf(b);
    const so = act(user, 'so.save', { branchId: b, customerId: C(cust).id, date: d(ago), customerRef: customerRef || '', notes: '' });
    so.createdAt = new Date(d(ago) + 'T10:00:00').toISOString();
    soOf[oi] = so;
    items.forEach(([itemType, productCode, bi, svc, stage, dep], ii) => {
      const base = svc.reduce((a, s) => a + db.glossary.find(g => g.en === s).defaultPrice, 0);
      const unitPrice = Math.round(base * priceFx[b] * (0.9 + rand() * 0.3));
      const deposit = dep === 'full' ? Math.round(unitPrice * (1 + db.branches.find(x => x.id === b).taxRate / 100) * 100) / 100 : dep === 'half' ? Math.round(unitPrice / 2) : 0;
      const wo = act(user, 'so.addLine', { soId: so.id, itemType, productCode, brand: brands[bi], description: `${brands[bi]} ${itemType === 'HB' ? 'handbag' : itemType}`,
        condition: conditions[(oi + ii) % conditions.length], location: `Trolley ${String.fromCharCode(65 + (oi % 6))}-${ii + 1}`, estDate: addDays(d(ago), 14 + ii * 3),
        unitPrice, deposit, services: svc.map(G), instructionsEn: svc.join(' + ') + '. Match original colour.', instructionsZh: '' });
      wo.createdAt = so.createdAt;
      bring(wo, stage, techTurn++, user);
      const stamp = new Date(addDays(d(ago), Math.min(ago, 10 + ii)) + 'T15:00:00').toISOString();
      if (CLOSED_STAGES.includes(wo.stage)) { wo.completedAt = stamp; wo.stageAt = stamp; }
      if (stage === 'Call unreachable' || stage === 'Pending collection') wo.lastContactAt = new Date(d(5) + 'T11:00:00').toISOString();
      for (const h of wo.history) h.at = stamp;
    });
  });
  const wosOf = i => db.workOrders.filter(w => w.soId === soOf[i].id);

  // technician time logs (R8) across 2025 and 2026
  for (const wo of db.workOrders.filter(w => w.technicianId)) {
    const so = db.salesOrders.find(s => s.id === wo.soId);
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const date = addDays(so.date, 2 + k * 2); if (date > T) continue;
      act(opsOf(wo.branchId), 'wo.logTime', { id: wo.id, staffId: wo.technicianId, date, minutes: 30 + Math.floor(rand() * 18) * 10, note: k ? 'Continued' : 'Started' });
    }
  }
  // extra logbook history so the year-on-year comparison has volume (last year: Jan–Dec, this year: Jan–last month)
  const Y = Number(T.slice(0, 4)), curMonth = Number(T.slice(5, 7));
  for (const t of db.staff.filter(s => s.isTechnician && s.joinDate < `${Y - 1}-06-01`)) {
    for (const [yr, months] of [[Y - 1, 12], [Y, curMonth - 1]]) {
      const host = db.workOrders.find(w => w.branchId === t.branchId && w.createdAt.startsWith(String(yr))) || db.workOrders.find(w => w.branchId === t.branchId);
      for (let m = 1; m <= months; m++) {
        const date = `${yr}-${String(m).padStart(2, '0')}-1${m % 9}`;
        act(SUPER, 'wo.logTime', { id: host.id, staffId: t.id, date, minutes: 240 + Math.floor(rand() * 40) * 10, note: 'Imported from logbook (demo)' });
      }
    }
  }

  // invoices (always single IVs): historic paid, recent issued, partially paid, overdue; group invoices (GIV) bundle
  // unpaid IVs of one customer; some completed items are left uninvoiced for the New invoice demo
  const inv = (user, i, date, filter = () => true) => act(user, 'invoice.create', { woIds: wosOf(i).filter(filter).map(w => w.id), date, shipDate: date });
  const pay = (user, iv, date, amount, method = 'Bank transfer') => act(user, 'invoice.pay', { id: iv.id, date, amount: amount ?? iv.amountDue - iv.payments.reduce((a, p) => a + p.amount, 0), method, reference: 'DEMO-' + iv.ref.slice(-4) });
  const giv = (user, ivs, date) => act(user, 'giv.create', { invoiceIds: ivs.map(i => i.id), date });
  const SGu = opsOf('SG'), MYu = opsOf('MY'), THu = opsOf('TH');
  // Luxe Again 2025: two invoices grouped, paid in one transfer on the group invoice
  const g1 = giv(SGu, [inv(SGu, 0, d(420), w => w.itemType === 'HB'), inv(SGu, 0, d(419), w => w.itemType !== 'HB')], d(418));
  act(SGu, 'giv.pay', { id: g1.id, date: d(395), amount: g1.invoiceIds.reduce((a, id) => a + db.invoices.find(i => i.id === id).amountDue, 0), method: 'Bank transfer', reference: 'DEMO-LA-2025' });
  inv(SGu, 1, d(400));
  pay(MYu, inv(MYu, 2, d(415)), d(390));
  pay(THu, inv(THu, 3, d(385)), d(350));
  // Luxe Again 2026: one invoice with a zero-value "return as requested" line, one more invoice, grouped and unpaid
  giv(SGu, [inv(SGu, 4, d(35), w => w.itemType === 'HB'), inv(SGu, 4, d(33), w => w.itemType !== 'HB')], d(30));
  // Marina Grand: two outstanding invoices (one partially paid) – ready to be grouped in the demo
  const [m1, m2] = wosOf(5);
  pay(SGu, act(SGu, 'invoice.create', { woIds: [m1.id], date: d(20), shipDate: d(20) }), d(5), 100);
  act(SGu, 'invoice.create', { woIds: [m2.id], date: d(18), shipDate: d(18) });
  inv(MYu, 12, d(25), w => w.itemType !== 'SLG');     // one MY item left ready for invoicing
  inv(THu, 15, d(60));                                // overdue (45 days)

  // a follow-up message already sent for the item waiting at MY
  // leave
  const S = name => db.staff.find(s => s.name === name);
  const wd = s => { const k = new Date(s + 'T00:00:00').getDay(); return k === 6 ? addDays(s, 2) : k === 0 ? addDays(s, 1) : s; };
  const lv = (who, type, from, to, reason) => { from = wd(from); to = to < from ? from : wd(to) < from ? from : wd(to); return act(opsOf(S(who).branchId), 'leave.apply', { staffId: S(who).id, type, from, to, reason }); };
  const decide = (l, decision, note = '') => act(SUPER, 'leave.decide', { id: l.id, decision, note });
  decide(lv('Goh Mei Ling', 'Annual', d(40), d(36), 'Family trip'), 'Approved');
  decide(lv('Kumar Raj', 'Medical', d(10), d(10), 'Fever (MC submitted)'), 'Approved');
  lv('Ong Ah Seng', 'Annual', addDays(T, 20), addDays(T, 24), 'Year-end holiday');
  lv('Farid Hassan', 'Annual', addDays(T, 7), addDays(T, 8), 'Family event');
  decide(lv('Nattaya Boon', 'Annual', addDays(T, 3), addDays(T, 4), 'Personal'), 'Rejected', 'Two large Siam Heritage batches due that week');
  decide(lv('Jason Teo', 'Annual', T, addDays(T, 1), 'Moving house'), 'Approved');

  // seed history reads as the seed, not as many separate edits
  db.audit = [{ at: new Date().toISOString(), by: 'System', action: 'Demo data loaded', ref: 'seed', detail: '' }];
  return db;
}

module.exports = { buildSeed, emptyDb };
