// Tiny JSON-file "database" (no native modules needed). Swap for SQLite/MongoDB later.
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'data.json');
const data = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { users: [], tasks: [] };
const save = () => fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
module.exports = { data, save };
