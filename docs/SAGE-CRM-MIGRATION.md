# Sage CRM migration – Singapore

How Chan Yew Singapore's records in **Sage CRM** (browser-based, customised for Chan Yew) are mapped and loaded into Chan Yew ERP for UAT. Added 24 Nov 2026. Kuala Lumpur came from Access instead (`tools/import-access.js`).

> The export files hold real client data. Keep them outside this repository, never commit them, and copy them to the server with `scp` only (see DEPLOY-UAT section 11). The UAT site password must stay on while they are loaded.

## 1. What to export from Sage CRM

The standard Find screens only export the columns on screen, and Work Order and Invoice have no Export to File at all. So the full data comes from reports created for the migration (with the client's agreement, 23 Nov 2026), named **Majutech Export – …** under *Reports → Custom Report for Management*, exported as **XLS** one year at a time (Created Date filter) so the export does not fail on size.

| File | From | Must have |
|---|---|---|
| Customers | Majutech Export – Customers (or *Find → Customer → Export to File*, name / phone / e-mail only) | Customer Name |
| Work orders | Majutech Export – Work Orders | Work Order ID, Sales Order No., Customer Name, Stage |
| SO items | *Sale Order With WO (Audit)* report (exists already) | Sales Order No., Work Order |
| Invoice lines | Majutech Export – Invoices, or *Invoice with WO (Audit)* if its XLS works | Invoice No., Work Order No |
| Invoices | Invoice list or report | Invoice No. |

Put all files in one folder. The import recognises each file by its **column names**, not its file name, and merges rows for the same work order or invoice from several files (the first filled value wins).

## 2. Field mapping

Sage CRM column (as seen on screen) → Chan Yew ERP field.

### Customers

| Sage CRM | Chan Yew ERP | Note |
|---|---|---|
| Customer Name | Name | Matching key: the reports give the customer **name**, not a number (see Q-4) |
| Phone | Phone | |
| Business E-mail | E-mail | |
| Address | Address | Only in the new report |
| Type | Type | Business if Sage says so, the customer uses RO numbers, or the name looks like a company (Pte, Ltd, Sdn Bhd …); otherwise Individual |
| Terms / Payment Term | Payment term | Upfront / 30 days / 45 days; otherwise 30 days for Business, Upfront for Individual |
| Number | Legacy ID | Kept for reference |

### Sales orders and work orders

| Sage CRM | Chan Yew ERP | Note |
|---|---|---|
| Sales Order No. | Sales order no. | Legacy number kept as it is (SO + 8 digits) |
| Work Order / Work Order ID / Work Order No | Work order no. | Legacy number kept (WO + 8 digits) |
| Created Date | Created (SO date = earliest of its WOs) | Day/month/year, Singapore time |
| Customer Id / Customer Name | Customer | By name |
| Order Details | Description | |
| Amount | Price | Before tax |
| Amount Paid | Amount paid at intake | Only if the report has it per work order (Q-3) |
| Brand | Brand | Blank → Others |
| Product Category | Item type | HB, SLG, Trolley, Shoes, RTW, Jewellery, WS → Watch strap |
| Product Code | Product code | Repair; **Bespoke / Custom Made → Custom made**; Touch Up / Cleaning → Cleaning / colouring |
| RO No / RO Number | RO number | |
| Other B2B Number / B2B Ref no | Notes ("B2B ref"), and the SO's customer reference | |
| Location Code | Location | |
| Technician In Charge | Technician (staff of SG) | "System Administrator" / "Admin…" are users, not technicians → left blank |
| RO No / RO Number (numbering) | Customer's `roSeq` | Each customer's automatic RO numbering is set past the highest plain-number RO imported for them, so a new item is never given a number an imported work order already uses (R-4.1) |
| Stage | Stage | See 3 |
| Called Customer | Notes ("Called customer: Success") | |
| Urgent | Urgent | Yes / No |
| Due Date | Est. completion date | |
| Ready Date / Collected Date | Completed date (closed WOs) | |
| Remarks, Product Status, Item Code | Notes, Condition, Article code | If in the report |

### Invoices

| Sage CRM | Chan Yew ERP | Note |
|---|---|---|
| Invoice No. | Invoice no. | Legacy number kept (IN + 8 digits) |
| Created Date | Invoice date and shipping date | |
| Work Order No | Invoice lines | The work orders are locked as invoiced |
| Total Amount / Total Amount After GST | Check only, and tax rate | Tax is set only where Sage's after-GST total is higher (Q-1). The import reports invoices whose Sage total differs from the sum of their work orders |
| Status | Void when it says void / cancelled | Read from the invoice list, and from the invoice-with-work-orders report **unless that file also has a *Stage* column** – there "Status" is the work order's own and must not void the invoice (W-20) |
| Balance / Outstanding | Payment = amount due – balance | Read from the invoice list and from the lines report, which repeats it on every line. Without a balance column anywhere, invoices are recorded as **settled outside the system**, as for KL (Q-2) |
| Remarks | Notes | |

## 3. Stage mapping

| Sage CRM | Chan Yew ERP |
|---|---|
| Logged | Logged in |
| Checking, Order SP, Technician, QC | same |
| Pending Collection, Call Customer, Call Unreachable, Call Success | same |
| Completed, Collected | Complete |
| **Invoiced** | Complete (and linked to its invoice) |
| Cancelled, No Service | Cancelled (zero value, reason = the Sage stage) |
| anything else | Logged in, reported by the import |

## 4. Running it

```
node tools/import-sage.js <folder> --check                    # read and report only
node tools/import-sage.js <folder> --from 2025-10-01          # load into data/, replacing only Singapore
```

- Without `--fresh` the current data is kept and only Singapore is replaced, so the Kuala Lumpur import stays. `--fresh` starts from the set-up only.
- `--from` keeps work orders created on or after the date, every work order that is still open, and the other work orders on the same sales orders and invoices, so documents stay whole.
- `db.json` is backed up first. Stop the server before running it.
- The command lists each file it recognised, the columns it did not use, and everything it had to guess (unknown stages, admin users as technicians, duplicate names, totals that differ). Check these against Sage before loading to UAT.

## 5. Size limit (found 24 Nov 2026)

The app keeps all data in one JSON file and sends a branch's records to the browser when the page opens. Tested with invented data at the size of the full Singapore history since 2016: the data file is about **100 MB**, the page would download about **78 MB**, every save rewrites the whole file, and the server needs about 640 MB of memory. That is too slow for daily use and tight for the UAT server.

So the full history cannot simply be loaded as the app is today. The choice (Q-5, now tracked as **DEFERRED D-17**):

1. Load a recent period plus everything still open (`--from`) for UAT, and keep the full history for later.
2. Move storage to a database with search and paging on the server (Node's built-in SQLite, still no packages) before loading everything. This is a larger change.

**Recommended for UAT: option 1**, with `--from 2025-10-01` to match the Kuala Lumpur import. UAT is for the client's testers to try the workflow, not to browse ten years of records, and `--from` already keeps every still-open work order plus the whole sales orders and invoices around them, so nothing a tester opens is half there. Option 2 is the right answer before go-live, but it changes how every screen reads its data and should not be rushed in alongside the first real import. The client decides how far back testers must look; Majutech decides when storage moves.

## 6. Open questions

| # | Question | Default in the import |
|---|---|---|
| Q-1 | Sage shows the same total before and after GST. Is Chan Yew Singapore GST registered? | Tax 0% on imported invoices; new documents keep the branch rate |
| Q-2 | Are payments recorded in Sage CRM? | Imported invoices settled outside the system |
| Q-3 | Is "Amount Paid" kept per work order or only per sales order? | Per work order, if the report has it |
| Q-4 | Can the reports include a customer number? Matching by name merges different customers with the same name | Match by name, duplicates reported |
| Q-5 | Full history since 2016, or a recent period for UAT? | A recent period (`--from`) – see section 5 and DEFERRED D-17 |
| Q-6 | Should new numbers continue from Sage's (SO…, WO…, IN…)? (DEFERRED D-05) | Imported numbers are kept; new documents use the ERP format |
