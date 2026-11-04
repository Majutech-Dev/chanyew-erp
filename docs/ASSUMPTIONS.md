# Assumptions

Choices made where the requirements were silent. Each one can be changed. Tell us if one is wrong.

| # | Assumption | Why | Requirement |
|---|---|---|---|
| W-01 | Local demo mode: role switcher, no passwords | Lets the client try every role before sign-in is designed | R-1.1 |
| W-02 | Records are never deleted; customers and staff are deactivated, SOs/WOs cancelled, invoices voided, leave cancelled. F6 is the record's cancel / deactivate / void action | Keeps the audit trail complete | R-7.1 |
| W-03 | Branches are Singapore, Kuala Lumpur and Bangkok. Other locations discussed with the client are not in this phase; confirmed with Majutech on 30 Oct 2026 to follow the docx | Docx is the latest source | R-1.2 |
| W-04 | Tax rates: SG GST 9%, MY SST 8%, TH VAT 7%; prices are entered excluding tax; rates are editable per branch and apply to new documents only | Current standard rates; issued documents must not change | R-3.3 |
| W-05 | WO number format `WO` + 2-digit year + 6-digit running number (e.g. `WO26000031`), group-wide | Notes say "WO + 8 or more digits"; legacy format still to be confirmed (D-05) | R-4.1 |
| W-06 | SO / invoice numbers `SO-SG-2026-0001`, `IV-SG-2026-0001`, `GIV-SG-2026-0001`, running per branch and year | One sequence per legal entity and year | R-3.1, R-5.2 |
| W-07 | IV = every invoice (one or more work orders). GIV = a group invoice over several unpaid IVs of one customer and branch; its due date comes from the customer's payment term from the GIV date, and it shows Overdue when its own due date or any invoice inside is past due. A GIV payment is applied to its invoices earliest due first; an invoice belongs to one active GIV at a time | Confirmed by Majutech 2 Nov 2026 (invoicing correction) | R-5.2, R-5.7 |
| W-08 | A cancelled WO is invoiced at zero with its reason ("Return as requested – …"); cancelling an SO cancels its open items | Meeting notes: zero-value close-out on the invoice | R-3.4, R-5.1 |
| W-09 | Customers are shared across branches; SOs, WOs and invoices belong to one branch | B2B customers may use more than one branch | R-2 |
| W-10 | "Amount paid" on a WO is the payment taken at intake; the invoice deducts it to show the amount due | Notes list amount paid / outstanding per WO; payment term "Upfront" | R-4.2 |
| W-11 | Ops may move a WO to any open stage (not only the next); Complete and Cancelled close it; only a Super Admin reopens | Call stages loop back and forth in practice | R-4.3 |
| W-12 | WhatsApp is triggered at **Pending collection** (item ready); follow-up flag after 3 days (Set-up → Settings) for Pending collection / Call customer / Call unreachable | Docx: "WhatsApp automation for completion; follow up after x days" | R-4.6 |
| W-13 | Technician time is entered by Ops / Super Admin on behalf of technicians; an entry can be changed by whoever recorded it, removed only by a Super Admin with a reason | Technicians have no login in v0.1 | R-4.7 |
| W-14 | Leave counts Mon–Fri; public holidays are not deducted yet; annual leave entitlement per staff (default 14 days, 18 for senior) | No HR policy provided | R-6.2 |
| W-15 | SGD consolidation uses fixed rates set by the Super Admin (MYR 0.29, THB 0.038) | Indicative group reporting only | R-1.3 |
| W-16 | Glossary default prices are in SGD; for MY/TH the suggested price is converted with the set-up rate; the final price is always entered | Price list per branch not yet provided | R-3.3 |
| W-17 | Printed SO / WO / IV follow Chan Yew's own forms (specimens of 4 Nov 2026); the group invoice uses the same style. Amounts show the branch currency sign ($, RM, ฿); tax lines are added when the branch charges tax, which the specimens do not show. PDF via the browser's "Save as PDF" | Specimens supplied by Chan Yew; GST shown because the system charges it | R-5.5 |
| W-18 | Photos: JPG / PNG / WebP up to 5 MB, stored in `data/uploads` | Typical phone photos | R-4.2 |
| W-19 | Look follows chan-yew.com: black on warm white, bronze accent #544300, EB Garamond wordmark, Open Sans Condensed headings (Google Fonts, system fallback offline); light by default, dark "espresso" variant on ◐. Blue = mandatory / green = calculated field colours are kept | Requested 30 Oct 2026: match the customer's website | – |
