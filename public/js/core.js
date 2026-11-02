'use strict';
// Shared helpers: state, API, formatting, field builders, dialogs, routing.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = s => { if (!s) return ''; const d = new Date(String(s).length === 10 ? s + 'T00:00:00' : s); return isNaN(d) ? '' : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const fmtDT = s => { if (!s) return ''; const d = new Date(s); return `${fmtDate(s)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const money = (n, cur) => (cur ? cur + ' ' : '') + (Number(n) || 0).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
const hm = mins => `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);

// CY monogram in the style of chan-yew.com – placeholder until Chan Yew supplies the logo file (DEFERRED D-15)
const MONOGRAM = `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <circle cx="32" cy="32" r="26.6" fill="none" stroke="currentColor" stroke-width=".7"/>
  <text x="27.5" y="44" text-anchor="middle" font-family="EB Garamond, Garamond, serif" font-size="34" fill="currentColor">C</text>
  <text x="35.5" y="40" text-anchor="middle" font-family="EB Garamond, Garamond, serif" font-size="27" fill="currentColor">Y</text></svg>`;

// ---------- state + API ----------
const S = { data: null, userId: localGet('cy.user') || 'U1', scope: localGet('cy.scope') || '' };
function localGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localSet(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }

async function loadState() {
  const r = await fetch('/api/state', { headers: { 'X-User-Id': S.userId } });
  if (!r.ok) { S.userId = 'U1'; return loadState(); }
  S.data = await r.json();
  S.C = S.data.constants;
  if (S.data.me.role !== 'super') S.scope = '';
}
async function api(name, payload, { quiet = false } = {}) {
  const r = await fetch('/api/action/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Id': S.userId }, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({ ok: false, error: 'Server error' }));
  if (!j.ok) { if (!quiet) toast(j.error, 'error'); throw new Error(j.error); }
  await loadState();
  return j.result;
}
async function upload(file) {
  if (file.size > 5 * 1024 * 1024) throw new Error('File is larger than 5 MB.');
  const dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
  const r = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Id': S.userId }, body: JSON.stringify({ dataUrl }) });
  const j = await r.json(); if (!j.ok) throw new Error(j.error); return j.url;
}

// ---------- lookups ----------
const me = () => S.data.me;
const isSuper = () => me().role === 'super';
const byId = (list, id) => (S.data[list] || []).find(x => x.id === id);
const branch = id => S.data.branches.find(b => b.id === id);
const customer = id => S.data.customers.find(c => c.id === id);
const staffName = id => (S.data.allStaffNames.find(s => s.id === id) || {}).name || '';
const inScope = r => !S.scope || r.branchId === S.scope;
const scoped = list => S.data[list].filter(inScope);
const branchOpts = (all = false) => [...(all ? [['', 'All branches']] : []), ...S.data.branches.filter(b => isSuper() || b.id === me().branchId).map(b => [b.id, `${b.id} – ${b.name}`])];
const custOpts = (blank = true) => [...(blank ? [['', '— select —']] : []), ...S.data.customers.filter(c => c.status === 'Active').sort((a, b) => a.name.localeCompare(b.name)).map(c => [c.id, `${c.name} (${c.code})`])];
const techOpts = branchId => [['', '— select technician —'], ...S.data.staff.filter(s => s.isTechnician && s.status === 'Active' && s.branchId === branchId).map(s => [s.id, s.name + (s.nameZh ? ' ' + s.nameZh : '')])];
const toSgd = (amt, cur) => (Number(amt) || 0) * (S.data.settings.fxToSgd[cur] || 1);
const invBalance = inv => round2(inv.amountDue - inv.payments.reduce((a, p) => a + p.amount, 0));
const invOverdue = inv => !['Paid', 'Void'].includes(inv.status) && inv.dueDate < S.data.today;
const invStatus = inv => (invOverdue(inv) ? 'Overdue' : inv.status);
// group invoices (GIV): amounts and status come from the invoices inside
const givInvoices = g => g.invoiceIds.map(id => S.data.invoices.find(i => i.id === id)).filter(Boolean);
const givDue = g => round2(givInvoices(g).reduce((a, i) => a + i.amountDue, 0));
const givBalance = g => round2(givInvoices(g).reduce((a, i) => a + invBalance(i), 0));
const givOverdue = g => !['Paid', 'Void'].includes(g.status) && (g.dueDate < S.data.today || givInvoices(g).some(invOverdue));
const givStatus = g => (givOverdue(g) ? 'Overdue' : g.status);
const activeGivOf = inv => inv.givId ? (S.data.groupInvoices || []).find(g => g.id === inv.givId && g.status !== 'Void') : null;
const woTotal = wo => { const b = branch(wo.branchId); const sub = wo.stage === 'Cancelled' ? 0 : wo.unitPrice; const tax = round2(sub * b.taxRate / 100); return { sub, tax, total: round2(sub + tax), outstanding: round2(sub + tax - (wo.deposit || 0)) }; };
const followUpDue = wo => S.C.FOLLOW_UP_STAGES.includes(wo.stage) && !wo.invoiceId && wo.lastContactAt && daysBetween(wo.lastContactAt.slice(0, 10), S.data.today) >= S.data.settings.followUpDays;

// ---------- badges ----------
const STAGE_TONE = { 'Logged in': 'gray', 'Checking': 'info', 'Order SP': 'warn', 'Technician': 'primary', 'QC': 'info', 'Pending collection': 'ok',
  'Call customer': 'warn', 'Call unreachable': 'danger', 'Call success': 'ok', 'Complete': 'ok', 'Cancelled': 'gray',
  'Open': 'info', 'Completed': 'ok', 'Issued': 'info', 'Partially paid': 'warn', 'Paid': 'ok', 'Void': 'gray', 'Overdue': 'danger',
  'Pending': 'warn', 'Approved': 'ok', 'Rejected': 'danger', 'Active': 'ok', 'Inactive': 'gray', 'Invoiced': 'primary' };
const badge = (s, tone) => `<span class="badge ${tone || STAGE_TONE[s] || 'gray'}">${esc(s)}</span>`;

// ---------- field builders (erp-screen-layout starter kit) ----------
// kind: 'req' blue mandatory | 'sys' green calculated/pulled | 'opt' plain; cls: '' | 'wide' | 'span2' | 'full'
const fld = (kind, label, ctl, cls = '') => `<label class="fld k-${kind} ${cls}"><span>${esc(label)}${kind === 'req' ? ' <i>*</i>' : ''}</span>${ctl}</label>`;
const inp = (name, val, type = 'text', disabled = false, extra = '') => `<input type="${type}" name="${name}" value="${esc(val)}" ${disabled ? 'disabled' : ''} ${extra}>`;
const sel = (name, options, val, disabled = false, extra = '') => `<select name="${name}" ${disabled ? 'disabled' : ''} ${extra}>${options.map(o => {
  const [v, l] = Array.isArray(o) ? o : [o, o];
  return `<option value="${esc(v)}" ${String(val ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
const txt = (name, val, disabled = false, rows = 2) => `<textarea name="${name}" rows="${rows}" ${disabled ? 'disabled' : ''}>${esc(val)}</textarea>`;
const copyWrap = input => `<span class="copy-wrap">${input}<button type="button" class="copy-btn" data-copy title="Copy">⧉</button></span>`;
const sysF = (label, key, cls = '', copy = false) => { const i = `<input readonly tabindex="-1" data-sys="${key}">`; return fld('sys', label, copy ? copyWrap(i) : i, cls); };
const section = (title, inner, extra = '') => `<section class="form-section"><div class="head"><h3>${title}</h3>${extra}</div><div class="body grid3">${inner}</div></section>`;
const kpis = items => `<div class="kpis">${items.map(([l, v, tone]) => `<div class="kpi ${tone || ''}"><span>${esc(l)}</span><b>${v}</b></div>`).join('')}</div>`;

document.addEventListener('click', e => {
  const b = e.target.closest('[data-copy]'); if (!b) return;
  const v = b.parentElement.querySelector('input')?.value || b.dataset.copy;
  navigator.clipboard?.writeText(v).then(() => toast('Copied ' + v), () => toast('Copy failed', 'error'));
});

// ---------- toast + modal ----------
function toast(msg, kind = 'ok') {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), kind === 'error' ? 6000 : 3000);
}
const modalOpen = () => !!$('#modal .dlg');
function closeModal() { $('#modal').innerHTML = ''; }
// body: html inside a <form>; onOk(formData, form) may throw to keep the dialog open,
// or return 'keep' to stay open after success (the screen behind is refreshed)
function dialog({ title, body, okLabel = 'OK', okClass = 'primary', cancelLabel = 'Cancel', onOk, wide = false, onReady }) {
  $('#modal').innerHTML = `<div class="backdrop"><form class="dlg ${wide ? 'wide' : ''}" autocomplete="off">
    <div class="dlg-head"><h3>${esc(title)}</h3><button type="button" class="x" data-close>×</button></div>
    <div class="dlg-body">${body}<div class="dlg-msg"></div></div>
    <div class="dlg-foot"><button type="button" class="btn" data-close>${esc(cancelLabel)}</button>${onOk ? `<button class="btn ${okClass}" type="submit">${esc(okLabel)}</button>` : ''}</div></form></div>`;
  const form = $('#modal form');
  $$('[data-close]', form).forEach(b => b.onclick = closeModal);
  form.onsubmit = async e => {
    e.preventDefault();
    const btn = $('button[type=submit]', form); btn.disabled = true;
    try {
      if (await onOk(Object.fromEntries(new FormData(form)), form) === 'keep') { $('.dlg-msg', form).innerHTML = ''; btn.disabled = false; route(); return; }
      closeModal(); route(); }
    catch (err) { $('.dlg-msg', form).innerHTML = `<div class="alert error">${esc(err.message)}</div>`; btn.disabled = false; }
  };
  onReady?.(form);
  setTimeout(() => $('input:not([type=hidden]):not([readonly]),select,textarea', form)?.focus(), 30);
  return form;
}
const reasonDialog = (title, okLabel, run, hint = '') => dialog({ title, okLabel, okClass: 'danger',
  body: `${hint ? `<div class="alert info">${hint}</div>` : ''}<div class="grid3">${fld('req', 'Reason', txt('reason', '', false, 3), 'full')}</div>`,
  onOk: fd => run(fd.reason) });

// ---------- CSV export ----------
function downloadCsv(name, header, rows) {
  const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '﻿' + [header, ...rows].map(r => r.map(q).join(',')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- routing ----------
const VIEWS = {};
const ui = {};   // per-screen state kept across re-renders
function route() {
  if (!S.data) return;
  const [, name = '', sub = '', extra = ''] = (location.hash || '#/').split('/');
  const navName = ['branches', 'glossary'].includes(name) ? 'settings' : name;
  $$('.nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === `#/${navName}`));
  const el = $('#main'); const v = VIEWS[name] || VIEWS[''];
  document.body.classList.toggle('printing', name === 'print');
  v(el, decodeURIComponent(sub), decodeURIComponent(extra));
}
window.addEventListener('hashchange', route);

// F4 / F5 / F6 anywhere on a record screen (not with modifiers, not while a dialog is open)
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modalOpen()) return closeModal();
  const cmd = !(e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) && { F4: 'new', F5: 'edit', F6: 'void' }[e.key];
  if (!cmd || modalOpen()) return;
  const btn = document.querySelector(`.erp-toolbar [data-cmd="${cmd}"]`);
  if (!btn) return;
  e.preventDefault();
  if (!btn.disabled) btn.click(); else toast(btn.title || 'Not available', 'warn');
});
