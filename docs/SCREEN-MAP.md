# Screen map

All record screens use the ERP layout: a toolbar (New F4 / Edit F5 / Cancel F6, workflow actions and a record navigator), then **Search** as the first tab, Main Info, child tabs and History.

| Screen | Route | Who sees it | Purpose |
|---|---|---|---|
| Dashboard | `#/` | Everyone (Ops: own branch) | Pipeline by stage, revenue, outstanding/overdue, technician workload and hours YoY, follow-ups, ready to bill, pending leave |
| Customers | `#/customers` | Everyone (shared list) | B2B/B2C customers, payment terms; tabs: Sales Orders, Work Orders, Invoices, History |
| Sales Orders | `#/sales-orders` | Own branch / all | Quotation header; tabs: Items / Work Orders (add item → WO), Invoices, History; print SO |
| Work Orders | `#/work-orders` | Own branch / all | Search lists every stage grouped by stage (stage chips jump to the group; Stage filter shows one stage; Show 25 / 50 / 100 / All entries; tick work orders → bulk Set stage / Print). Stages, technician, item, charges, bilingual workshop instructions; tabs: Photos, Time Log, History; print WO |
| Invoices | `#/invoices` | Own branch / all | New (F4): customer → tick their completed WOs → IV; payments (unless grouped), void (Super Admin), CSV export, print; shows the group invoice an invoice belongs to |
| Group Invoices | `#/group-invoices` | Own branch / all | New (F4): customer → tick their unpaid invoices → GIV; record payment (applied to the invoices inside); tabs: Invoices, Payments, History; print GIV |
| Test guide | `#/guide` | Everyone | Interim test cases with steps and expected results; Pass / Fail / Blocked + comment saved in the tester's browser; export CSV, print |
| Staff | `#/staff` | Own branch / all | Staff records; tabs: Leave, Workload, History |
| Leave | `#/leave` | Own branch / all | Applications; approve / reject (Super Admin) |
| Set-up → Settings | `#/settings` | Everyone (edit: Super Admin) | FX rates, follow-up days, WhatsApp outbox (demo sink), audit trail |
| Set-up → Branches | `#/branches` | Everyone (edit: Super Admin) | Branch legal details, tax label/rate, bank details, invoice terms |
| Set-up → Repair glossary | `#/glossary` | Everyone (edit: Super Admin) | EN / 中文 repair services with default prices |
| Print | `#/print/so|wo|iv/<id>` | As the record | White A4 documents; Print / Save as PDF |
