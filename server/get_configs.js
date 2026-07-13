const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.all("SELECT * FROM configs", [], (err, rows) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log("=== CONFIGURAÇÕES NO BANCO ===");
    console.log(rows);
    process.exit(0);
});
