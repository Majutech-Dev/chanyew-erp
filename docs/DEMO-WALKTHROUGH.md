# Demo walkthrough

Start with `npm run seed`, then `npm start`, and open http://localhost:3120.

| Role | Demo user | Can do |
|---|---|---|
| Super Admin | Grace Lim | Everything in all branches; approve leave; void invoices; reopen work orders; set-up (branches, glossary, rates) |
| Ops – Singapore | Daniel Tan | Customers; SO, WO, invoices, group invoices, payments, staff and leave applications for Singapore |
| Ops – Kuala Lumpur | Nurul Aina | Same, for Kuala Lumpur (MYR, SST) |
| Ops – Bangkok | Pim Srisuk | Same, for Bangkok (THB, VAT) |

Keys on record screens: **F4** New · **F5** Edit · **F6** Cancel / Deactivate / Void. Records open read-only. Blue fields are mandatory, green fields are calculated and plain fields are optional.

## Main flow
1. As **Grace Lim**, look at the **Dashboard**: group pipeline by branch, revenue in SGD, technician workload and hours year on year, follow-ups, ready to invoice.
2. Switch to **Daniel Tan**. Go to **Sales Orders**, press **F4**, choose *Vintage Vault Asia*, then **Save**. The *Add item* dialog opens. Enter RO no., Repair, HB, Hermès, condition and est. date, and tick *Edge paint refinish* + *Corner restoration*. The price is suggested from the glossary. Click **Add item** and a work order is created; the dialog stays open, so enter a second item the same way, then press **Done**.
3. Open the new work order (Items tab → double-click). Press **▶ Checking**, then **▶ Technician**: pick a technician. Use **⏱ Log time** to record 90 minutes. Add a condition photo on the **Photos** tab.
4. Click **🖨 Print WO** to see the bilingual EN / 中文 work order (no prices).
5. Move on to **QC → Pending collection**: a WhatsApp message is queued (see **Set-up → Settings → outbox**). Then **Call customer → Call success → Complete**.
6. Go to **Invoices** and press **F4**. Select the customer, then tick their completed work orders. Enter the shipping date and **Issue invoice**. The invoice (IV) opens: **Record payment**, then **🖨 Print / PDF**.
7. Go to **Group Invoices**, press **F4**, select *Marina Grand Hotel* and tick both outstanding invoices → **Issue group invoice**. **Record payment** on the GIV: the preview shows how it is applied; both invoices update (Invoices tab).
8. On **Invoices**, filter by *Overdue* and click **⇩ Export CSV**.
9. Switch to **Grace Lim**, go to **Leave**, open a *Pending* application and **Approve** it.

## Exceptions to try
- Cancel a work order (**F6**): it closes at zero value and is invoiced as "return as requested" (see *IV-SG-2026-0001*, grouped in *GIV-SG-2026-0001*).
- Try to issue an invoice with work orders of two customers: refused.
- As **Nurul Aina** (KL): only Kuala Lumpur records are visible; prices are in MYR with SST.
- As **Daniel Tan**, open an invoice: **Void** is disabled ("Only a Super Admin…"). As **Grace Lim**, void an unpaid invoice: its work orders can be invoiced again. An invoice inside a group invoice cannot be paid or voided on its own.
- Edit an invoiced work order: only location and notes are editable (🔒 note).
- Apply 20 days of annual leave: refused, not enough balance.
