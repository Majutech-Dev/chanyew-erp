'use strict';
// Printouts in Chan Yew's own SO, WO and invoice formats (specimens supplied 4 Nov 2026); the group invoice uses the
// same family. All values are live; branch name, registration no. and address come from Set-up → Branches.
function referenceDocument(type, ids) {
  const logo = '<div class="ref-logo"><img src="/img/cy-logo.png" alt="Chan Yew – Leather Artisans – Est. 1941"></div>';
  const field = (label, value) => `<td>${label}: <span>${esc(value ?? '')}</span></td>`;
  const footer = b => `<footer class="ref-footer"><div><b>${esc(b.legalName.toUpperCase())}</b><span><em>Co. Reg No: ${esc(b.regNo)}</em>${esc(b.address)}</span></div><strong>${esc(b.website || 'chanyewleathers.com')}</strong></footer>`;
  const header = (title, r, c, address = true) => `<header class="ref-header">${logo}<div><h2>${title}</h2><table><tr><td><b>CUSTOMER PARTICULARS:</b></td>${field('Name', c.name)}${field('Nos', r.ref)}</tr><tr>${field('Contact', c.phone)}${field('Email', c.email)}${field('Date', fmtDate(r.date))}</tr>${address ? `<tr><td colspan="3">Address: <span>${esc(c.address)}</span></td></tr>` : ''}</table></div></header>`;
  // amounts as printed on the specimens: currency sign + amount ($50.00); set per document from its branch
  let sign = '$';
  const amt = v => `${sign}${money(v)}`;
  const setSign = b => { sign = { SGD: '$', MYR: 'RM', THB: '฿' }[b.currency] || b.currency + ' '; };
  const page = '<div class="ref-page">Page 1 of 1</div>';
  const total = (label, value) => `<div class="ref-total"><span>${label}</span><span>${amt(value)}</span></div>`;
  const status = rows => `<section class="ref-status"><h3>ITEM STATUS</h3>${rows.map((w, i) => `<p>${i + 1}.　 ${esc(w.condition)}</p>`).join('')}</section>`;
  const services = w => (w.services || []).map(id => S.data.glossary.find(g => g.id === id)).filter(Boolean);
  // "HB - #001 Louis Vuitton handbag – Zip replacement": item type, RO no., item, repair services (as on the specimens)
  const detail = w => `${esc(w.itemType)} - ${w.roNumber ? '#' + esc(w.roNumber) + ' ' : ''}${esc(w.description || w.brand)}${services(w).length ? ' – ' + services(w).map(g => esc(g.en)).join(', ') : ''}`;
  const b2bRef = w => byId('salesOrders', w.soId)?.customerRef || '';

  if (type === 'so') {
    const r = byId('salesOrders', ids); if (!r) return null;
    const b = branch(r.branchId), c = customer(r.customerId), rows = woOf(r.id), t = soTotals(r); setSign(b);
    return `<article class="doc page reference ref-so">${header('SALES ORDER', r, c)}<h3>ORDER DETAILS</h3>
      <table class="ref-lines">${rows.map((w, i) => `<tr><td>${i + 1}.</td><td>${detail(w)}${w.stage === 'Cancelled' ? ` <i>(${esc(w.cancelReason || 'Return as requested')})</i>` : ''}</td><td>${amt(w.stage === 'Cancelled' ? 0 : w.unitPrice)}</td></tr>`).join('')}</table>
      ${t.tax ? total(`${esc(r.taxLabel)} ${r.taxRate}%`, t.tax) : ''}${total('Total Amount', t.total)}${total('Paid Amount', t.deposits)}${total('Balance Amount', t.total - t.deposits)}
      ${status(rows)}${r.notes ? `<p class="ref-note">${esc(r.notes)}</p>` : ''}
      <section class="ref-terms"><b>Term and Conditions of Chan Yew Products & Repair Services</b><p>${esc(b.invoiceTerms)}</p></section>${footer(b)}${page}</article>`;
  }

  if (type === 'wo') return ids.split(',').map(id => byId('workOrders', id)).filter(Boolean).map(w => {
    const b = branch(w.branchId), c = customer(w.customerId), so = byId('salesOrders', w.soId), sv = services(w);
    return `<article class="doc page reference ref-wo"><header class="ref-header">${logo}<div><h2>WORK ORDER</h2>
        <table><tr>${field('Urgent', '')}${field('Due Date', fmtDate(w.estDate))}${field('RO NO', w.roNumber)}${field('Nos', w.ref)}</tr>
          <tr>${field('Technician', staffName(w.technicianId))}${field('Artisan Code', '')}${field('B2B REF NO', b2bRef(w))}${field('Date', fmtDate(w.createdAt))}</tr></table>
        <table class="ref-wo-customer"><tr><td>Customer Name :</td>${field('Sales Order No.', so?.ref)}</tr><tr><td>${esc(c.name)}</td>${field('Location', w.location)}</tr></table></div></header>
      <section class="ref-work"><h3>ORDER DETAILS</h3><p>${detail(w)}</p>
        ${sv.length ? `<table class="ref-svc">${sv.map(g => `<tr><td>☐</td><td>${esc(g.en)}</td><td class="zh">${esc(g.zh)}</td></tr>`).join('')}</table>` : ''}
        ${w.instructionsEn ? `<p><b>Instructions:</b> ${esc(w.instructionsEn)}</p>` : ''}${w.instructionsZh ? `<p class="zh"><b>指示：</b>${esc(w.instructionsZh)}</p>` : ''}</section>
      ${status([w])}${footer(b)}</article>`;
  }).join('');

  if (type === 'iv') {
    const r = byId('invoices', ids); if (!r) return null;
    const b = branch(r.branchId), c = customer(r.customerId), paid = round2(r.amountDue - invBalance(r)); setSign(b);
    const line = (l, i) => { const w = byId('workOrders', l.woId);
      return `<tr><td>${i + 1}.</td><td><b>${esc(w?.itemType || '')} - ${esc(w?.productCode || '')} - Work Order No : ${esc(l.woRef)}</b><br>
        ${w ? `${l.roNumber ? '#' + esc(l.roNumber) + ' ' : ''}${esc(w.description || w.brand)}${services(w).length ? ' – ' + services(w).map(g => esc(g.en)).join(', ') : ''}` : esc(l.description)}${l.zeroReason ? `<br><i>${esc(l.zeroReason)}</i>` : ''}
        <br>Location :　${esc(w?.location || '')}<br>RO NO: ${esc(l.roNumber)}　B2B Ref No: ${esc(w ? b2bRef(w) : '')}</td><td>${amt(l.amount)}</td></tr>`; };
    return `<article class="doc page reference ref-iv">${r.status === 'Void' ? '<div class="void">VOID</div>' : ''}${header('INVOICE', r, c)}${page}<h3>ORDER DETAILS</h3>
      <table class="ref-lines">${r.lines.map(line).join('')}<tr class="ref-fill"><td></td><td></td><td></td></tr></table>
      ${r.tax ? total('Subtotal', r.subtotal) + total(`${esc(r.taxLabel)} ${r.taxRate}%`, r.tax) : ''}${total('Total Amount', r.total)}
      ${r.deposits ? total('Less paid at intake', r.deposits) : ''}${paid > 0.001 ? total('Less payments received', paid) : ''}${r.deposits || paid > 0.001 ? total('Balance Amount', invBalance(r)) : ''}
      ${r.notes ? `<p class="ref-note">${esc(r.notes)}</p>` : ''}${footer(b)}
      <section class="ref-receipt"><div class="ref-tear">Tear along the line</div>${header('INVOICE', r, c, false)}<h4>COLLECTION RECEIPT</h4>
        <div class="ref-sign"><span>Name : <i></i></span><span>Date collected : <i></i></span><span>Signature : <i></i></span><span>No of items: <i>${r.lines.length}</i></span></div>${footer(b)}</section></article>`;
  }

  if (type === 'giv') {
    const g = byId('groupInvoices', ids); if (!g) return null;
    const b = branch(g.branchId), c = customer(g.customerId), invs = givInvoices(g), paid = round2(givDue(g) - givBalance(g)); setSign(b);
    return `<article class="doc page reference ref-iv">${g.status === 'Void' ? '<div class="void">VOID</div>' : ''}${header('GROUP INVOICE', g, c)}<h3>ORDER DETAILS</h3>
      <table class="ref-lines">${invs.map((i, k) => `<tr><td>${k + 1}.</td><td><b>Invoice No : ${esc(i.ref)}</b>　dated ${fmtDate(i.date)}, due ${fmtDate(i.dueDate)}<br>
        Work Order No : ${i.lines.map(l => esc(l.woRef) + (l.roNumber ? ` (RO ${esc(l.roNumber)})` : '')).join(', ')}${i.amountDue - invBalance(i) > 0.001 ? `<br>Paid ${amt(i.amountDue - invBalance(i))} of ${amt(i.amountDue)}` : ''}</td><td>${amt(invBalance(i))}</td></tr>`).join('')}<tr class="ref-fill"><td></td><td></td><td></td></tr></table>
      ${paid > 0.001 ? total('Amount due', givDue(g)) + total('Less payments received', paid) : ''}${total('Balance Amount', givBalance(g))}
      <p class="ref-note">Terms: ${esc(g.paymentTerm)} · Due date: ${fmtDate(g.dueDate)}${g.customerPo ? ` · Your ref: ${esc(g.customerPo)}` : ''}. Please quote ${esc(g.ref)} with your payment.${b.bankInfo ? ' ' + esc(b.bankInfo) : ''}</p>
      ${g.notes ? `<p class="ref-note">${esc(g.notes)}</p>` : ''}${footer(b)}</article>`;
  }
  return null;
}
