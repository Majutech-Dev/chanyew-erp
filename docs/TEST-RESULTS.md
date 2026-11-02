# Test results and known limits

## Automated acceptance tests – `npm test` (30 Oct 2026, Node 24.20.0)
| Test | Checks | Result |
|---|---|---|
| AT-01 | Each SO item auto-creates a WO with a system WO number | ✔ |
| AT-02 | B2B RO numbers; auto `001`; duplicates per customer refused | ✔ |
| AT-03 | Technician stage needs a technician of the same branch | ✔ |
| AT-04 | Pending collection queues a WhatsApp message to the demo sink | ✔ |
| AT-05 | One IV across SOs; zero-value cancelled line "return as requested"; GST 9% | ✔ |
| AT-06 | Only closed WOs of one customer/branch, once, with shipping date | ✔ |
| AT-07 | Invoiced WOs locked except location/notes | ✔ |
| AT-08 | MYR/SST 8% and THB/VAT 7%; payment term due dates | ✔ |
| AT-09 | Payments, over-payment refused, void by Super Admin only when unpaid | ✔ |
| AT-10 | Ops scoped to own branch (read and write); Super Admin sees all | ✔ |
| AT-11 | Time logs in minutes; future dates refused; YoY totals | ✔ |
| AT-12 | Leave apply / approve by Super Admin only / overlap / balance | ✔ |
| AT-13 | Nothing deleted; SO cancel → zero-value WOs; reopen Super Admin only | ✔ |
| AT-14 | History and audit trail written on change | ✔ |
| AT-15 | HTTP: 401 without user, scoped state, no path traversal | ✔ |
| AT-17 | Group invoice over unpaid IVs of one customer; payment applied earliest due first and updates the IVs; grouped IVs not paid alone; void (Super Admin, no payments) releases them | ✔ |
| AT-16 | Bulk set stage: ticked WOs move together; skip those already there; one closed WO blocks the batch; reason for Cancelled; other branch refused | ✔ |

17 / 17 passed (2 Nov 2026).

## Browser checks (30 Oct 2026, 1280 × 800, built-in browser)
- **Grace Lim (Super Admin):** dashboard; WO search with status segment and filters; opened WO26000028; Edit (F5) → changed location → Save → History entry; ▶ QC stage move; staff → leave tab with approve/reject; invoice GIV print with zero-value line; bilingual WO print; light theme.
- **Daniel Tan (Ops SG):** only SG records visible; F4 new SO → Add item dialog with glossary price suggestion and live GST → WO created; Items tab grid with KPIs; Billing → tick → IV issued (due date 30 days) → invoice opened read-only with 🔒 note; Void disabled.
- **Nurul Aina (Ops MY):** scripted sweep opened every screen and every record tab: no script errors.
- Found and fixed during the check: Search tab replaced by Main Info; branch filter built before data loaded; the due-date preview in the invoice dialog was one day early (UTC); nav overflowed at 1280 px (set-up links merged into **Set-up**).

## Browser checks – v0.1.1 brand theme (30 Oct 2026, 1280 × 800)
- Dashboard, Work Order Main Info, Sales Order (dark variant) and the GIV printout checked. The monogram and wordmark render, the nav fits at 1280 px, and blue/green field coding is readable in both themes.

## Browser checks – v0.2.0 continuous Add item (2 Nov 2026)
- SO-SG-2025-0001: two items added in a row from the toolbar **+ Add item**, one more from the Items / Work Orders tab. The dialog stayed open each time, listed the new WO numbers, cleared the item fields, kept est. completion and location, refocused RO no.; the Items grid behind went from 5 to 6 rows live; **Done** closed it. Demo data reseeded afterwards.

## Browser checks – v0.3.0 Work Orders search (2 Nov 2026, 1280 × 800)
- Grace Lim: All shows all 40 WOs grouped in stage order with counts matching the chips; **Complete** chip jumps inside the grid and the chips stay visible; Show 25 → page 1 of 2, **Cancelled** chip moves to page 2 ("Complete (continued)"); Stage = Technician → only 4 rows, other chips disabled; **All** clears the stage; dashboard pipeline link opens WO search with the Stage filter set; Sales Orders status chips still filter. No script errors.

## Browser checks – v0.4.0 bulk Set stage (2 Nov 2026, 1280 × 800)
- Grace Lim: ticked the *Logged in* group (4 SG WOs) → Set stage… → Technician + Ong Ah Seng → "4 moved to Technician", History shows the assignment, ticks cleared. Ticked 2 QC (MY + SG) + 1 Complete → dialog lists the Complete WO to untick and refuses a technician across branches; Update disabled. Same-stage choice shows "already there – skipped". No script errors. Demo data restored afterwards.

## Browser checks – v0.5.0 invoicing correction (2 Nov 2026, 1280 × 800)
- Grace Lim: nav has Invoices + Group Invoices, no Billing (`#/billing` falls back to the dashboard). Invoices → F4 → customer list shows only customers with completed work (Luxe Again 1, Preloved 2) → Luxe → its WO listed with live totals and due date → **IV-SG-2026-0005** issued as a single IV. Group Invoices → New → Marina Grand → 2 outstanding invoices (one partially paid) → **GIV-SG-2026-0002** → payment SGD 100 with allocation preview → first IV Paid, second Partially paid, both payments referenced "via GIV-SG-2026-0002"; GIV Partially paid; GIV printout lists the invoices and balance. A grouped invoice shows its GIV and its Record payment is disabled with the reason.
- Daniel Tan: dashboard "Ready to invoice" opens the New invoice dialog; only SG group invoices visible. Nurul Aina: New invoice → Preloved Atelier, branch MY, MYR / SST totals update when a line is unticked. Invoices grid fits at 1280 px (Terms column moved to the record). No script errors. Demo data reseeded afterwards.

## Browser checks – v0.6.0 test guide (2 Nov 2026, 1280 × 800)
- Test guide opens from the top bar; 37 cases render; marking W-03 as Fail with a comment colours the case and updates the summary, survives leaving and reopening the page; Clear my results resets it. Nav fits at 1280 px. No script errors.

## Known limits
- Demo mode only: no sign-in, no real WhatsApp / Xero / Sage connections (DEFERRED D-01…D-04).
- Print layouts are placeholders until the client's templates arrive (D-07).
- Data is a single JSON file. That is fine for the demo, but a database is needed before migrating about 22k historic records (D-06).
- Leave does not deduct public holidays (W-14).
