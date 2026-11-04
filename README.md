# Chan Yew ERP

Operations system for Chan Yew Leathers, a leather goods repair atelier with branches in Singapore, Kuala Lumpur and Bangkok. It covers the full repair job: **Customer → Sales Order (quotation, one line per item) → Work Order per item (workshop stages, technician, photos, time log) → Billing of completed items → Invoice / group invoice (GIV) → Payments**. Each branch has its own currency and tax. Management gets a consolidated dashboard, and basic HR covers staff, leave and artisan workload. Record screens follow the house desktop-ERP layout.

> **Local demo mode.** Users are picked with a role switcher; this is **not authentication**. Every action is checked on the server for the chosen user. WhatsApp messages go to a **demo sink** and are never sent. Demo data is invented. This is not production-ready.

## Setup and run

1. Install **Node.js 22 or newer**. No other packages are needed.
2. Optional: copy `.env.example` to `.env` to change the port or the data folder.
3. Run these commands from this folder:

| Command | What it does |
|---|---|
| `npm start` | Starts the app at http://localhost:3120 |
| `npm run seed` | Backs up `data/db.json`, then loads the demo data (stop the server first) |
| `npm test` | Runs the acceptance tests |

On first start without data, demo data is created. **Backup:** copy `data/`. To restore, stop the server and put the copy back.

## Demo users (role switcher)

Super Admin: Grace Lim (all branches) · Ops Singapore: Daniel Tan · Ops Kuala Lumpur: Nurul Aina · Ops Bangkok: Pim Srisuk. Technicians are staff records picked from a list; they do not sign in in v0.1. No passwords: demo mode only.

## Update log

Newest first. Every change request or reported issue gets a row. Status ✔ means fixed and verified.

| # | Date | Request / issue | Cause | Change | Version | Status |
|---|---|---|---|---|---|---|
| 12 | 4 Nov 2026 | Printed IV, WO and SO should follow Chan Yew's own formats (specimen PDFs supplied 4 Nov 2026) | Printouts used generic placeholder layouts | SO, WO and IV rebuilt on Chan Yew's formats: logo from the specimens, customer-particulars grid, numbered order details (item type – #RO – item – services), totals with currency sign, item status box, SO terms and conditions, company footer, and the invoice's tear-off collection receipt. WO keeps the bilingual repair services and instructions in its order-details area. Group invoice printout moved to the same family. Singapore branch details (reg. no., address, website, SO terms) set from the specimens; new Website field in Set-up → Branches. Demo data reseeded locally | 0.7.0 | ✔ |
| 11 | 2 Nov 2026 | Remove the password prompt on the UAT site | nginx basic-auth was added in front of the UAT site because the app has no sign-in | Basic-auth removed from nginx on the UAT server; DEPLOY-UAT.md records how to remove and re-add it, and that only demo data may be loaded | 0.6.0 | ✔ |
| 10 | 2 Nov 2026 | Set up the UAT server on AWS | No deployment guide yet | `docs/DEPLOY-UAT.md`: EC2 (Singapore, 3.1.198.0), deploy key, systemd service, nginx with a site password, Let's Encrypt HTTPS, update and reset commands for chanyew.majutech.com.sg | 0.6.0 | ✔ |
| 9 | 2 Nov 2026 | Pushed to GitHub (`main`, `uat`) | First push after the secret scan and review | Repository https://github.com/Majutech-Dev/chanyew-erp; `main` kept for the future live server, `uat` for the UAT server (chanyew.majutech.com.sg) | 0.6.0 | ✔ |
| 8 | 2 Nov 2026 | Remove client meeting-note details from the docs before the first push | Pre-push review found a record count, location names and a document title from the confidential meeting notes | ASSUMPTIONS W-03, DEFERRED D-06 / D-13 and the REQUIREMENTS source line generalised; system names kept for the planned integrations | 0.6.0 | ✔ |
| 7 | 2 Nov 2026 | Testing guide page for interim user testing (without development changes or TBC items), then push to GitHub | No guide for the client's testers | New **Test guide** page (top bar → Test guide, `#/guide`): 37 test cases in 9 areas, each with the user to test as, steps and expected result; testers mark Pass / Fail / Blocked with a comment (kept in their browser), export results to CSV, or print | 0.6.0 | ✔ |
| 6 | 2 Nov 2026 | Invoicing correction: every generated invoice is a single invoice whatever the number of WOs; a group invoice is created by selecting unpaid invoices and its status updates the invoices inside; remove the Billing tab; New invoice asks for the customer, then their completed WOs; New group invoice asks for the customer, then their outstanding invoices | v0.4 issued "GIV" for any invoice with two or more WOs and billed from a separate Billing screen | Invoices are always `IV-…`. New **Group Invoices** screen (`GIV-…`): customer → tick unpaid invoices; payment on the GIV is applied to its invoices (earliest due first) and updates their status; grouped invoices can't be paid or voided alone; Super Admin voids a GIV without payments to release its invoices; GIV printout. **Invoices → New (F4)**: customer → their completed WOs. Billing screen removed; dashboard "Ready to invoice" opens New invoice. REQUIREMENTS R-5.1/5.2/5.6 updated, R-5.7 added; W-07 updated; AT-05/09 updated, AT-17 added. Demo data reseeded | 0.5.0 | ✔ |
| 5 | 2 Nov 2026 | Multi-select work orders to set stage in one go | Set stage… worked on one work order at a time | Work Orders search has tick boxes (per row, per page, per stage group); a bar above the grid shows how many are ticked with **Set stage…**, **Print WOs** and **Clear ticks**. New server action `wo.stageBulk`: same rules as one-by-one (technician of the same branch, reason for Cancelled, own branch only), every ticked WO is checked first and nothing changes if one is refused; WOs already at the stage are skipped. AT-16 added | 0.4.0 | ✔ |
| 4 | 2 Nov 2026 | Work Orders search: show x entries; All should list every stage; clicking a stage at the top should jump to that section; add a Stage filter that shows only the selected stage | The list opened on "Open only" (14 of 24), the stage chips filtered instead of jumping, and their counts ignored the other filters | WO search now opens on all stages, grouped by stage with a header row and entry count per stage; the stage chips jump to their group (and to the right page) and their counts follow the filters; new **Stage** filter; **Show 25 / 50 / 100 / All entries** with a pager on every search screen (default 50). Dashboard pipeline links use the Stage filter | 0.3.0 | ✔ |
| 3 | 2 Nov 2026 | Add item dialog should stay open so several items can be added in a row (Sales Order toolbar and Items / Work Orders tab) | The dialog closed after every item, so each new item needed another click on + Add item | After each item the dialog stays open, lists the work orders added so far, clears the item fields (keeps est. completion date and location) and puts the cursor back on RO no.; **Done** closes it. The SO grid behind refreshes live | 0.2.0 | ✔ |
| 2 | 30 Oct 2026 | Adjust the look to the customer's website theme (chan-yew.com) | v0.1.0 used Majutech's dark navy + amber house theme | Light warm-white theme with Chan Yew bronze accent (#544300) and black rules, CY monogram + EB Garamond wordmark in the top bar and on printed SO / WO / IV, Open Sans Condensed headings, nav and tabs; dark "espresso" variant kept on ◐; blue/green field coding unchanged | 0.1.1 | ✔ |
| 1 | 30 Oct 2026 | Initial build from Requirements.docx and the 30 Oct 2026 requirements meeting notes | New project | Customers, sales orders with auto work orders, the 11-stage workshop flow with technician assignment, photos, time log and WhatsApp demo sink, billing to IV/GIV with zero-value "return as requested" lines, payments, SG/MY/TH currency and tax, dashboard, staff and leave, bilingual work-order print, CSV export, 15 acceptance tests | 0.1.0 | ✔ |

## Documents

| File | Contents |
|---|---|
| `docs/REQUIREMENTS.md` | Requirements summary and workflow |
| `docs/ASSUMPTIONS.md` | Choices made where the requirements were silent |
| `docs/DEFERRED.md` | Open questions and features left for later |
| `docs/TEST-RESULTS.md` | Test results, browser checks and known limits |
| `docs/DEMO-WALKTHROUGH.md` | Demo script |
| `docs/SCREEN-MAP.md` | Screens, navigation and who sees what |
| `docs/DEPLOY-UAT.md` | UAT server set-up and update commands |

## Branches

`main` is kept for the future live environment. `uat` deploys to the UAT server at https://chanyew.majutech.com.sg (see `docs/DEPLOY-UAT.md`).

## Files

```
server/server.js     web server, JSON storage, uploads
server/workflow.js   domain rules and permissions (server-enforced)
server/seed.js       demo users and connected demo data; seed-cli.js = npm run seed
public/js/core.js    state, API, field builders, dialogs, routing, F4/F5/F6
public/js/erp.js     generic ERP master–detail screen and child grid
public/js/screens.js record screens (customers, SO, WO, invoices, staff, leave, set-up)
public/js/app.js     dashboard, settings, print page
public/js/print-templates.js  SO / WO / IV / GIV printouts in Chan Yew's own formats
public/js/guide.js   test guide page for interim user testing (#/guide)
data/                db.json, backups and uploads (created at run time, not in git)
tests/               acceptance tests
```

