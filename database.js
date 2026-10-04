const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const db = new Database("referral.db");
db.pragma("foreign_keys = ON");

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('company','referrer')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      location TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(company_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      referrer_id INTEGER NOT NULL,
      candidate_name TEXT NOT NULL,
      candidate_email TEXT NOT NULL,
      resume_url TEXT NOT NULL,
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE,
      FOREIGN KEY(referrer_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  seedDatabase();
}

function seedDatabase() {
  if (db.prepare("SELECT COUNT(*) AS count FROM users").get().count > 0) return;
  const insert = db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)");
  const company = insert.run("Acme Technologies", "company@example.com", bcrypt.hashSync("Password123!", 10), "company");
  insert.run("Demo Referrer", "referrer@example.com", bcrypt.hashSync("Password123!", 10), "referrer");
  db.prepare("INSERT INTO jobs (company_id,title,description,location) VALUES (?,?,?,?)")
    .run(company.lastInsertRowid, "Backend Engineer", "Build and maintain reliable backend APIs.", "Remote");
}

module.exports = { db, initializeDatabase };
