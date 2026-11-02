'use strict';
// npm run seed – backs up the current data, then loads fresh demo data. Stop the server first.
const fs = require('fs');
const path = require('path');
const { DB_FILE, DATA_DIR, saveDb } = require('./server');
const { buildSeed } = require('./seed');

fs.mkdirSync(DATA_DIR, { recursive: true });
if (fs.existsSync(DB_FILE)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backup = path.join(DATA_DIR, `db-${stamp}-backup.json`);
  fs.copyFileSync(DB_FILE, backup);
  console.log('Backed up current data to', path.relative(process.cwd(), backup));
}
const db = buildSeed();
saveDb(db);
console.log(`Demo data loaded: ${db.customers.length} customers, ${db.salesOrders.length} sales orders, ${db.workOrders.length} work orders, ${db.invoices.length} invoices, ${db.staff.length} staff.`);
