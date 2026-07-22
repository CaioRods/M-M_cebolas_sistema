const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.run("UPDATE nfe SET status = 'cancelada' WHERE id = 24", (err) => {
    if (err) {
        console.error("Erro ao cancelar:", err);
        process.exit(1);
    }
    console.log("NF-e 24 marcada como CANCELADA com sucesso na VPS!");
    process.exit(0);
});
