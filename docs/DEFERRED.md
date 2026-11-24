# Deferred decisions and open questions

| # | Item | Why deferred | Affects | Needed from |
|---|---|---|---|---|
| D-01 | Real sign-in (passwords or SSO), user management | Not needed for the demo; required before real data | Every screen | Client / Majutech |
| D-02 | WhatsApp sending (WhatsApp Business API provider, templates, opt-in) – messages are stored in a demo sink | Provider and account not chosen | WO stages, follow-up | Client |
| D-03 | Xero / OCBC payment links pushed from the invoice; B2B remittance formats (incl. Excel) | Integration scope and samples pending | Invoices | Client (sample formats) |
| D-04 | Sage 100 (SG) and overseas accounting: export or sync of invoices | Integration nature not discussed | Invoices | Client / Majutech |
| D-05 | Exact legacy WO / RO numbering to continue from the Access database | Format not confirmed. Sage CRM (Singapore) uses SO / WO / IN + 8 digits (seen 23 Nov 2026); continue from them? | Numbering | Client |
| D-06 | Data migration from the Singapore Access CRM and branch databases | KL loaded from Access (4 Nov 2026). Singapore is in Sage CRM: import ready (`tools/import-sage.js`), waiting for the exports; see `docs/SAGE-CRM-MIGRATION.md` | All records | Client |
| D-07 | Singapore SO / WO / IV formats received 4 Nov 2026 and in use. Still needed: Malaysia and Thailand legal entity names, registration and tax numbers, addresses, bank details and their terms; GST registration no. for Singapore; a group invoice format if Chan Yew has one | Partly received | Print / PDF | Client |
| D-08 | Technician self-service (own WOs, start/stop timer) | Client unsure; placeholder role only in v0.1 | Time log | Client |
| D-09 | Public holiday calendars per country for leave; leave types and carry-forward rules | HR policy not provided | Leave | Client |
| D-10 | Branch price lists (per currency) for the repair glossary | Not provided | Pricing | Client |
| D-11 | Multi-language UI (Chinese / Malay / Thai) beyond the bilingual work order | Not confirmed | UI | Client |
| D-12 | Hosting, backups, PDPA / data residency, UAT subdomain | Not discussed | Deployment | Client / Majutech |
| D-13 | Further locations beyond Singapore, Kuala Lumpur and Bangkok | Docx lists Malaysia and Thailand only | Branches | Client |
| D-15 | Official Chan Yew logo file (vector). Printouts now use the logo taken from Chan Yew's own PDF forms; the top bar still draws a CY monogram | High-resolution / vector artwork not supplied | Top bar, printouts | Client |
| D-14 | Full-year technician productivity report export (appraisal pack) | Dashboard shows YTD vs same period; export format not specified | Reports | Client |
| D-16 | *Urgent* flag and *Artisan code* on the work order (shown on Chan Yew's WO form) – meaning and who sets them | Seen on the specimen only; not in the requirements | Work order, WO print | Client |
| D-17 | How much Singapore history to load, and whether storage moves to a database before it. The full history since 2016 does not fit the current JSON storage: about 100 MB in `data/db.json`, a 78 MB download when a page opens, a whole-file rewrite on every save and about 640 MB of server memory (measured 24 Nov 2026 on invented data of that size, `docs/SAGE-CRM-MIGRATION.md` section 5). Either load a recent period plus everything still open (`--from`, already built) and keep the rest for later, or move to Node's built-in SQLite with search and paging on the server first – a larger change. Recommended for UAT: `--from`, because the client is testing the system, not browsing history | Needs the client's answer on how far back testers must look, and Majutech's call on the storage change before go-live | Storage, Sage import | Client / Majutech |
