# Requirements – Chan Yew ERP

Sources: `Requirements.docx` (30 Oct 2026, primary). Other client documents (meeting notes, proposal) were used only as background; they are client-confidential and stay outside this repository. Where the sources differ, the docx wins (see ASSUMPTIONS W-03). Version 0.1.0.

## 1. Requirements

### R-1 Users and branches
- R-1.1 Roles: **Super Admin** (all branches, dashboard, approvals, set-up), **Ops** (own branch only), **Technician** (placeholder: picked from a staff list, no login). – AT-10, AT-15
- R-1.2 Branches: Singapore (SGD, GST 9%), Kuala Lumpur (MYR, SST 8%), Bangkok (THB, VAT 7%). Each branch sees only its own sales orders, work orders, invoices, staff and leave. – AT-08, AT-10
- R-1.3 Management sees a consolidated view of jobs, workload and revenue in SGD.

### R-2 Customers
- R-2.1 Customer type Individual (B2C) or Business (B2B); payment term Upfront, 30 days or 45 days. – AT-14
- R-2.2 Customers are never deleted; they are deactivated.

### R-3 Sales orders
- R-3.1 A sales order (SO) is a quotation for items received; it can hold many line items. – AT-01
- R-3.2 Each SO item automatically creates its own work order (WO). – AT-01
- R-3.3 Prices use the branch's currency and tax. – AT-08
- R-3.4 Cancelling an SO closes its open items as zero-value "return as requested" work orders. – AT-13

### R-4 Work orders
- R-4.1 WO number is system generated (`WO` + 8 digits). B2B WOs carry the customer's RO/docket number, numbered `001` onwards when the customer has none; RO numbers are unique per customer. – AT-01, AT-02
- R-4.2 Fields: type B2B/B2C, product code (Custom made / Repair / Cleaning-colouring), item type (HB, Jewellery, RTW, Shoes, SLG, Trolley, Watch strap), brand, condition, location, estimated date, price, amount paid, outstanding, technician, photos.
- R-4.3 Stages: Logged in, Checking, Order SP, Technician, QC, Pending collection, Call customer, Call unreachable, Call success, Complete, plus Cancelled (zero value). Several work orders can be moved to one stage together (ticked in Search; added 2 Nov 2026). – AT-03, AT-16
- R-4.4 Moving to Technician requires choosing a technician of that branch. – AT-03
- R-4.5 Workshop instructions are internal: bilingual EN/中文 repair-service glossary and instructions, printed on the work order, never on customer documents.
- R-4.6 Pending collection queues a WhatsApp "ready for collection" message; items waiting longer than *X* days are flagged for follow-up. – AT-04
- R-4.7 Technician time is recorded in minutes per WO and compared year on year. – AT-11
- R-4.8 Once invoiced, a WO is locked (only location and notes change). – AT-07

### R-5 Invoicing
- R-5.1 Completed (and cancelled) WOs that are not invoiced can be invoiced; invoicing does not need to follow the sales order. **New invoice** asks for the customer first, then lists that customer's completed WOs to tick. – AT-05
- R-5.2 Every invoice is a single invoice (IV), however many WOs it holds; it can combine WOs from different SOs for one customer at one branch. – AT-05, AT-06
- R-5.7 A group invoice (GIV) is created by selecting unpaid invoices of one customer at one branch (customer first, then their outstanding invoices). A payment recorded on the GIV is applied to its invoices (earliest due first) and updates their status; grouped invoices are not paid or voided on their own. A Super Admin can void a GIV without payments, which releases its invoices. *Changed 2 Nov 2026 – replaces "GIV = invoice with two or more WOs"; the separate Billing screen was removed.* – AT-17
- R-5.3 Invoices are generated when items ship; the shipping/collection date is required. – AT-06
- R-5.4 Payment-term due dates, payments, balances, overdue tracking. – AT-08, AT-09
- R-5.5 Invoice list filters, CSV export (invoices and lines), printable A4 / PDF. 
- R-5.6 Only a Super Admin voids an unpaid invoice (not while it is in a group invoice); its WOs can be invoiced again. – AT-09

### R-6 Basic HR
- R-6.1 Staff records (branch, position, technician flag, leave entitlement).
- R-6.2 Leave applications by front desk, approval by Super Admin, balance and overlap checks. – AT-12
- R-6.3 Artisan workload: open WOs, late WOs, hours, on leave today.

### R-7 Audit
- R-7.1 Every change writes the record's History and the audit trail; records are never deleted. – AT-13, AT-14

## 2. Workflow at a glance

```
Customer ─► Sales Order (Ops) ─► + item ─► Work Order (auto, "Logged in")
Work Order: Logged in → Checking → [Order SP] → Technician (pick technician) → QC
            → Pending collection (WhatsApp queued) → Call customer → [Call unreachable ↺] → Call success → Complete
            any open stage → Cancelled (reason; zero value)          Complete/Cancelled → Reopen (Super Admin, not invoiced)
Invoice: New (F4) ─► customer ─► tick their Complete / Cancelled WOs (one branch) ─► IV (shipping date) ─► Payments → Paid
Group invoice: New (F4) ─► customer ─► tick their unpaid IVs ─► GIV ─► payment on the GIV pays the IVs inside → Paid
Void (Super Admin, no payments): an IV releases its work orders; a GIV releases its invoices.
Leave: Applied (Ops) → Approved / Rejected (Super Admin) · Cancelled
```

## 3. How this file is maintained
- When a requirement changes, update section 1 and add a row to the README Update log that names the requirement.
- Defaults go in ASSUMPTIONS.md; open questions go in DEFERRED.md until they are decided.
