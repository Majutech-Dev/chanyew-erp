# Chan Yew ERP – working rules

Zero-dependency Node app (local demo mode). `npm start` → http://localhost:3120, `npm run seed` (stop the server first; backs up `data/db.json`), `npm test`.

- Every change request or reported issue gets a new row at the **top** of the README **Update log**: `| # | Date | Request / issue | Cause | Change | Version | Status |`. Bump the version in `package.json` for new features (minor) or fixes (patch).
- When a requirement changes, update `docs/REQUIREMENTS.md` and say so in the log row. Assumptions go in `docs/ASSUMPTIONS.md`; open questions in `docs/DEFERRED.md`.
- Run `npm test` and check the change in the browser before reporting it done.
- Run locally and let the user check before any commit. **Never commit or push without the user asking.** Push to `main` and `uat` together unless told otherwise, then give the server update command from `docs/DEPLOY-UAT.md`.
- Nothing from confidential documents is committed; re-run the secret scan before every push. The client's proposal, estimate, grant letter, meeting notes, requirements files and the specimen SO / WO / invoice PDFs (IN… / SO… / WO… files – real customer data) live in the parent `Chan Yew` folder and must never be copied in. Demo data stays invented (`@example.com`).
- All rules live in `server/workflow.js`; the browser only hides what the server would refuse. Records are never deleted – use statuses.
- Record screens follow the erp-screen-layout skill: build new ones with `erpScreen()` / `childGrid()` in `public/js/erp.js` (Search tab first, read-only until F5, blue/green/plain fields sized to content, History tab).
- Dates in docs as `30 Oct 2026`.
