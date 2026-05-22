import dotenv from "dotenv";
import pool from "../src/db.js";
import { User } from "../src/models/User.js";
import { initializeDatabase } from "../src/schema.js";

dotenv.config();

const argv = process.argv.slice(2);
const argMap: Record<string, string> = {};
argv.forEach((a) => {
  const [k, v] = a.split("=");
  argMap[k.replace(/^--/, "")] = v ?? "";
});

const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) {
  console.error("ADMIN_SECRET is not set in environment; aborting.");
  process.exit(1);
}

const provided = argMap["secret"] || "";
if (provided !== ADMIN_SECRET) {
  console.error(
    "Invalid or missing --secret argument. Provide the ADMIN_SECRET to run this script.",
  );
  process.exit(1);
}

const username = argMap["username"] || process.env.ADMIN_USERNAME;
const email = argMap["email"] || process.env.ADMIN_EMAIL;
const password = argMap["password"] || process.env.ADMIN_PASSWORD;

if (!username || !email || !password) {
  console.error(
    "Missing admin credentials. Provide via --username/--email/--password or set ADMIN_USERNAME/ADMIN_EMAIL/ADMIN_PASSWORD in env.",
  );
  process.exit(1);
}

const run = async () => {
  try {
    // Ensure schema is up to date before touching is_admin
    await initializeDatabase();

    // Ensure DB is reachable
    await pool.query("SELECT 1");

    // Check if user exists
    const existing = await pool.query(
      "SELECT user_id FROM users WHERE email = $1",
      [email],
    );

    let userId: number;

    if (existing.rows.length > 0) {
      userId = existing.rows[0].user_id;
      console.log(
        `User with email ${email} already exists (id=${userId}), promoting to admin.`,
      );
    } else {
      const created = await User.create({ username, email, password });
      userId = created.user_id;
      console.log(`Created user ${username} (id=${userId}).`);
    }

    // Promote to admin
    await pool.query("UPDATE users SET is_admin = TRUE WHERE user_id = $1", [
      userId,
    ]);

    const res = await pool.query(
      "SELECT user_id, username, email, is_admin FROM users WHERE user_id = $1",
      [userId],
    );
    console.log("Admin user ready:", res.rows[0]);
    process.exit(0);
  } catch (err: any) {
    console.error("Failed to seed admin:", err.message || err);
    process.exit(1);
  }
};

void run();
