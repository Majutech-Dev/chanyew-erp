'use strict';
// Test guide for interim user testing: test cases with steps and expected results. Each tester's results
// (Pass / Fail / Blocked + comment) stay in their own browser and can be exported to CSV to send back.

const GUIDE = [
  { title: 'Getting started', cases: [
    { id: 'G-01', title: 'Switch between test users', who: 'Any',
      steps: ['Open the user list at the top right ("As …").', 'Switch to Daniel Tan (Ops Singapore), then Nurul Aina (Ops Kuala Lumpur), then Grace Lim (Super Admin).'],
      expect: 'The screen reloads as that user. Ops users see only their own branch; Grace Lim sees all branches and can pick a branch view at the top.' },
    { id: 'G-02', title: 'Branch view for management', who: 'Grace Lim',
      steps: ['On the Dashboard, change "All branches" to Singapore, then Bangkok.'],
      expect: 'The figures and lists change to that branch only. Amounts are shown in the branch currency, with SGD totals on the dashboard.' },
  ] },
  { title: 'Customers', cases: [
    { id: 'C-01', title: 'Create an individual customer', who: 'Daniel Tan',
      steps: ['Go to Customers and press New (F4).', 'Choose type Individual, enter a name and phone, payment term Upfront.', 'Press Save.'],
      expect: 'A customer code is given automatically. The record opens read-only and its History tab shows it was created.' },
    { id: 'C-02', title: 'Create a business customer and edit it', who: 'Daniel Tan',
      steps: ['Create a Business customer with a contact person and payment term 30 days.', 'Press Edit (F5), change the payment term to 45 days, Save.'],
      expect: 'The change is saved and listed in the History tab with who made it.' },
    { id: 'C-03', title: 'Deactivate a customer', who: 'Daniel Tan',
      steps: ['Open the customer from C-01 and press Deactivate (F6).'],
      expect: 'The customer shows as Inactive and can no longer be chosen on a new sales order. It is not deleted.' },
  ] },
  { title: 'Sales orders', cases: [
    { id: 'S-01', title: 'Create a sales order with several items', who: 'Daniel Tan',
      steps: ['Go to Sales Orders and press New (F4). Choose a customer and Save.', 'The Add item window opens. Fill in product code, item type, brand, condition and estimated completion date.',
        'Tick one or two repair services; check the suggested price, then press Add item.', 'Without closing the window, add a second and a third item. Press Done.'],
      expect: 'Each item gets its own work order number. The window stays open after each item and lists the work orders added. The Items / Work Orders tab shows all items with the totals and tax.' },
    { id: 'S-02', title: 'Business customer RO numbers', who: 'Daniel Tan',
      steps: ['Create a sales order for a Business customer.', 'Add one item with RO no. left blank, and one with an RO number you type.', 'Try to add a third item with the same RO number as the second.'],
      expect: 'The blank one is numbered automatically (001 onwards). The duplicate RO number is refused with a message.' },
    { id: 'S-03', title: 'Print a sales order', who: 'Daniel Tan',
      steps: ['Open a sales order and press Print SO.'],
      expect: 'An A4 quotation shows the customer, every item with its price, the tax and the total. Back returns to the sales order.' },
    { id: 'S-04', title: 'Cancel a sales order', who: 'Daniel Tan',
      steps: ['Create a sales order with one item, then press Cancel SO (F6) and give a reason.'],
      expect: 'The sales order shows Cancelled. Its open item becomes a Cancelled work order at zero value, which can still be put on an invoice as "return as requested".' },
  ] },
  { title: 'Work orders', cases: [
    { id: 'W-01', title: 'Find work orders by stage', who: 'Daniel Tan',
      steps: ['Go to Work Orders. Look at the stage buttons above the filters.', 'Click "Complete", then "QC".', 'Choose a stage in the Stage filter, then set it back to All stages.', 'Change "Show … entries" to 25.'],
      expect: 'The list shows all stages grouped by stage, with counts that match the buttons. Clicking a stage jumps to that group. The Stage filter shows only that stage. With 25 entries, a page control appears.' },
    { id: 'W-02', title: 'Move a work order through the workshop', who: 'Daniel Tan',
      steps: ['Open a work order at Logged in. Press ▶ Checking.', 'Press ▶ Technician and choose a technician.', 'Continue: QC, Pending collection, Call customer, Call success, Complete.'],
      expect: 'Each move is shown in the History tab. Technician cannot be chosen without picking a technician of the same branch. Once Complete, the stage buttons are disabled.' },
    { id: 'W-03', title: 'Set stage for several work orders at once', who: 'Daniel Tan',
      steps: ['In the Work Orders list, tick two or three work orders at the same stage (or tick the box on a stage heading).', 'Press Set stage… in the bar above the list, choose the next stage and press Update.'],
      expect: 'All ticked work orders move together and each History tab shows the change. If you tick one that is Complete, the window asks you to untick it and does not allow the update.' },
    { id: 'W-04', title: 'Follow-up flag', who: 'Daniel Tan',
      steps: ['On the Dashboard, look at "Follow-up due".', 'Open one of the listed work orders.'],
      expect: 'Items waiting at Pending collection or the call stages for longer than the set number of days are flagged "Follow-up due".' },
    { id: 'W-05', title: 'Photos', who: 'Daniel Tan',
      steps: ['Open a work order, go to the Photos tab and add a photo from your computer or phone (JPG / PNG, under 5 MB).'],
      expect: 'The photo shows in the tab and can be opened full size.' },
    { id: 'W-06', title: 'Technician time log', who: 'Daniel Tan',
      steps: ['Open a work order, go to the Time Log tab and press + Add.', 'Choose the technician, today\'s date and 90 minutes. Save.', 'Try a date in the future.'],
      expect: 'The entry shows as 1h 30m and the total updates. A future date is refused.' },
    { id: 'W-07', title: 'Bilingual work order printout', who: 'Daniel Tan',
      steps: ['Open a work order with repair services ticked and press Print WO.'],
      expect: 'The work order prints with English and Chinese repair services and instructions, and shows no prices.' },
    { id: 'W-08', title: 'Cancel a work order', who: 'Daniel Tan',
      steps: ['Open an open work order and press Cancel WO (F6). Keep the reason "Return as requested".'],
      expect: 'The work order shows Cancelled with zero value, and is listed under items ready to invoice.' },
    { id: 'W-09', title: 'Reopen a closed work order', who: 'Grace Lim',
      steps: ['As Daniel Tan, open a Complete work order that is not invoiced: there is no Reopen button.', 'Switch to Grace Lim, open the same work order and press Reopen with a reason.'],
      expect: 'Only the Super Admin can reopen it. It goes back to QC and the History tab shows the reason.' },
  ] },
  { title: 'Invoices', cases: [
    { id: 'I-01', title: 'Create an invoice', who: 'Daniel Tan',
      steps: ['Go to Invoices and press New (F4).', 'Select a customer. Their completed work orders are listed and ticked; untick any you do not want.',
        'Check the shipped / collected date and payment term, then press Issue invoice.'],
      expect: 'Only customers with completed work orders are offered. One invoice (IV-…) is created however many work orders are ticked, with the right tax and due date, and opens read-only.' },
    { id: 'I-02', title: 'Zero-value line', who: 'Daniel Tan',
      steps: ['Create an invoice that includes the Cancelled work order from W-08.'],
      expect: 'The cancelled item shows on the invoice at 0.00 with "Return as requested".' },
    { id: 'I-03', title: 'Invoiced work orders are locked', who: 'Daniel Tan',
      steps: ['Open a work order that is on an invoice and press Edit (F5).'],
      expect: 'Only location and notes can be changed; a lock note explains why.' },
    { id: 'I-04', title: 'Record payments', who: 'Daniel Tan',
      steps: ['Open an unpaid invoice that is not in a group invoice. Press Record payment and enter part of the balance.', 'Record a second payment for the rest.', 'Try paying more than the balance.'],
      expect: 'The status changes to Partially paid, then Paid. Over-payment is refused.' },
    { id: 'I-05', title: 'Overdue invoices and export', who: 'Grace Lim',
      steps: ['On Invoices, click the Overdue status button.', 'Press Export CSV and Export lines CSV.'],
      expect: 'Only overdue invoices are listed. Both files download and open in Excel with the invoice details.' },
    { id: 'I-06', title: 'Print an invoice', who: 'Daniel Tan',
      steps: ['Open an invoice and press Print / PDF. In the print window, choose Save as PDF.'],
      expect: 'An A4 tax invoice with the lines, tax, payments and balance due. A PDF can be saved.' },
    { id: 'I-07', title: 'Void an invoice', who: 'Grace Lim',
      steps: ['As Daniel Tan, open an unpaid invoice: Void is disabled.', 'As Grace Lim, void an unpaid invoice that is not in a group invoice, with a reason.'],
      expect: 'Only the Super Admin can void, and only without payments. Its work orders can then be invoiced again.' },
  ] },
  { title: 'Group invoices', cases: [
    { id: 'GI-01', title: 'Create a group invoice', who: 'Daniel Tan',
      steps: ['Go to Group Invoices and press New (F4).', 'Select a customer with more than one unpaid invoice (e.g. Marina Grand Hotel). Tick the invoices to group.', 'Press Issue group invoice.'],
      expect: 'Only that customer\'s unpaid invoices are listed. A group invoice (GIV-…) is created showing the total outstanding. Each invoice shows the group invoice number.' },
    { id: 'GI-02', title: 'Pay a group invoice', who: 'Daniel Tan',
      steps: ['Open the group invoice and press Record payment. Enter less than the balance and look at the preview.', 'Save, then open the Invoices tab of the group invoice.', 'Record a second payment for the rest.'],
      expect: 'The payment is applied to the earliest-due invoice first, and each invoice\'s status updates. When everything is paid, the group invoice and all its invoices show Paid.' },
    { id: 'GI-03', title: 'Grouped invoices are paid through the group', who: 'Daniel Tan',
      steps: ['Open one of the invoices inside an unpaid group invoice.'],
      expect: 'Record payment is disabled with a note to pay on the group invoice, and there is a link to the group invoice.' },
    { id: 'GI-04', title: 'Print and void a group invoice', who: 'Grace Lim',
      steps: ['Print a group invoice.', 'Create another group invoice without payments and void it as Grace Lim.'],
      expect: 'The printout lists each invoice, its work orders, paid and balance. After voiding, its invoices are released and can be paid on their own or grouped again.' },
  ] },
  { title: 'Dashboard', cases: [
    { id: 'D-01', title: 'Management overview', who: 'Grace Lim',
      steps: ['Open the Dashboard.', 'Click a number in the Workshop pipeline.', 'Click a customer under "Ready to invoice".'],
      expect: 'Headline figures, pipeline, revenue by branch, technician workload and leave awaiting approval are shown. The pipeline number opens that list of work orders; the customer opens a new invoice for them.' },
    { id: 'D-02', title: 'Technician hours year on year', who: 'Grace Lim',
      steps: ['Look at Technician workload.'],
      expect: 'Each technician shows hours this year, the same period last year, the change in %, and last year\'s total. Technicians on leave today are marked.' },
  ] },
  { title: 'Staff and leave', cases: [
    { id: 'H-01', title: 'Add a staff member', who: 'Daniel Tan',
      steps: ['Go to Staff and press New (F4). Enter the details, tick Technician, set annual leave to 14 days. Save.'],
      expect: 'The staff member is saved and appears in the technician list on work orders for that branch.' },
    { id: 'H-02', title: 'Apply for leave', who: 'Daniel Tan',
      steps: ['Go to Leave and press New (F4). Choose a staff member, Annual, and dates over a weekend.', 'Try leave that overlaps an existing application, and leave longer than the balance.'],
      expect: 'Working days are counted Monday to Friday and the remaining balance is shown. Overlapping leave and leave beyond the balance are refused.' },
    { id: 'H-03', title: 'Approve or reject leave', who: 'Grace Lim',
      steps: ['As Daniel Tan, open a pending application: there is no Approve button.', 'As Grace Lim, approve one application and reject another with a note.'],
      expect: 'Only the Super Admin can decide. The status and the staff member\'s balance update.' },
  ] },
  { title: 'Set-up and access', cases: [
    { id: 'A-01', title: 'Branch access', who: 'Nurul Aina',
      steps: ['As Nurul Aina, open Sales Orders, Work Orders and Invoices.'],
      expect: 'Only Kuala Lumpur records are shown, in MYR with SST 8%.' },
    { id: 'A-02', title: 'Settings are for Super Admin only', who: 'Daniel Tan',
      steps: ['As Daniel Tan, open Set-up.', 'Switch to Grace Lim, change the follow-up days and Save.'],
      expect: 'Daniel Tan can view but not change settings. Grace Lim can save, and the dashboard follow-up list uses the new number of days.' },
    { id: 'A-03', title: 'Repair-service glossary', who: 'Grace Lim',
      steps: ['Go to Set-up → Repair glossary and add a service with English and Chinese names and a default price.'],
      expect: 'The new service can be ticked on a new sales order item and prints in both languages on the work order.' },
  ] },
];

const GUIDE_KEY = 'cy.testGuide';
const guideResults = () => { try { return JSON.parse(localGet(GUIDE_KEY) || '{}'); } catch { return {}; } };

VIEWS.guide = el => {
  const res = guideResults(), all = GUIDE.flatMap(s => s.cases);
  el.innerHTML = `<div class="erp guide"><div class="erp-head"><div class="erp-toolbar">
      <button class="btn" id="gx">⇩ Export results (CSV)</button><button class="btn" id="gp">🖨 Print</button><button class="btn" id="gc">Clear my results</button>
      <div class="grow"></div><span class="muted" id="gsum"></span></div>
      <div class="erp-tabs"><button class="on">Test guide</button><span class="erp-tabs-meta"><b>Interim testing</b></span></div></div>
    <div class="erp-body">
      <div class="alert info"><b>How to test.</b> Work through the cases below. Switch test user with "As …" at the top right; the user to test as is shown on each case.
        Follow the steps, compare with the expected result and mark Pass, Fail or Blocked. For anything that fails, write what happened in the comment (screen, record number, what you expected).
        Your results are kept in this browser; press <b>Export results (CSV)</b> when done and send the file to Majutech. The data is test data and can be changed freely.</div>
      ${GUIDE.map((s, si) => section(`${si + 1}. ${s.title}`, s.cases.map(c => { const r = res[c.id] || {};
        return `<div class="tcase ${r.r ? 'r-' + r.r.toLowerCase() : ''}" data-case="${c.id}">
          <div class="tc-head"><b class="mono">${c.id}</b><b>${esc(c.title)}</b><span class="badge gray">Test as ${esc(c.who)}</span></div>
          <ol class="tc-steps">${c.steps.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
          <div class="tc-expect"><b>Expected:</b> ${esc(c.expect)}</div>
          <div class="tc-result"><select data-r>${['', 'Pass', 'Fail', 'Blocked'].map(o => `<option value="${o}" ${r.r === o ? 'selected' : ''}>${o || '— result —'}</option>`).join('')}</select>
            <input data-n placeholder="Comment (what happened, record no.)" value="${esc(r.n || '')}"></div></div>`; }).join(''))).join('')}
    </div></div>`;
  const sum = () => { const r = guideResults(), n = k => all.filter(c => r[c.id]?.r === k).length;
    $('#gsum', el).textContent = `${all.filter(c => r[c.id]?.r).length} of ${all.length} tested · ${n('Pass')} pass · ${n('Fail')} fail · ${n('Blocked')} blocked`; };
  const save = (id, patch) => { const r = guideResults(); r[id] = { ...(r[id] || {}), ...patch, by: me().name, at: new Date().toISOString() }; localSet(GUIDE_KEY, JSON.stringify(r)); sum(); };
  $$('.tcase', el).forEach(box => {
    const id = box.dataset.case;
    $('[data-r]', box).onchange = e => { save(id, { r: e.target.value }); box.className = `tcase ${e.target.value ? 'r-' + e.target.value.toLowerCase() : ''}`; };
    $('[data-n]', box).onchange = e => save(id, { n: e.target.value });
  });
  $('#gx', el).onclick = () => { const r = guideResults();
    downloadCsv(`chanyew-test-results-${S.data.today}.csv`, ['Case', 'Area', 'Title', 'Test as', 'Result', 'Comment', 'Recorded as', 'When'],
      GUIDE.flatMap(s => s.cases.map(c => [c.id, s.title, c.title, c.who, r[c.id]?.r || '', r[c.id]?.n || '', r[c.id]?.by || '', r[c.id]?.at ? fmtDT(r[c.id].at) : '']))); };
  $('#gp', el).onclick = () => window.print();
  $('#gc', el).onclick = () => dialog({ title: 'Clear my results', okLabel: 'Clear results', okClass: 'danger',
    body: '<p>This clears the results and comments saved in this browser. Export them first if you still need them.</p>', onOk: async () => { localSet(GUIDE_KEY, '{}'); } });
  sum();
};
