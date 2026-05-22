import express from "express";
import request from "supertest";
import { beforeEach, expect, jest, test } from "@jest/globals";

const userFindById: any = jest.fn();
const poolQuery: any = jest.fn();

jest.mock("../src/models/User", () => ({
  User: {
    findById: (...args: any[]) => userFindById(...args),
  },
}));

jest.mock("../src/db.js", () => ({
  __esModule: true,
  default: {
    query: (...args: any[]) => poolQuery(...args),
  },
}));

import adminRoutes from "../src/routes/admin";
import { authMiddleware, isAdmin } from "../src/middleware";

const buildApp = () => {
  const app = express();

  app.use(express.json());
  app.use((req, _res, next) => {
    const session: Record<string, unknown> & {
      destroy: (callback?: () => void) => void;
    } = {
      destroy: (callback?: () => void) => {
        if (callback) callback();
      },
    } as any;

    const userId = req.header("x-test-user-id");
    if (userId) {
      session.userId = Number(userId);
    }

    (req as any).session = session;
    next();
  });

  app.get("/api/protected", authMiddleware, isAdmin, (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/admin", adminRoutes);

  return app;
};

beforeEach(() => {
  userFindById.mockReset();
  poolQuery.mockReset();
});

test("isAdmin blocks unauthenticated requests", async () => {
  const app = buildApp();

  const response = await request(app).get("/api/protected");

  expect(response.status).toBe(401);
  expect(response.body).toEqual({ error: "Authentication required" });
});

test("isAdmin blocks non-admin users", async () => {
  const app = buildApp();
  userFindById.mockResolvedValueOnce({
    user_id: 7,
    username: "Ada",
    email: "ada@example.com",
    is_admin: false,
  });

  const response = await request(app)
    .get("/api/protected")
    .set("x-test-user-id", "7");

  expect(response.status).toBe(403);
  expect(response.body).toEqual({ error: "Admin access required" });
});

test("isAdmin allows admin users", async () => {
  const app = buildApp();
  userFindById.mockResolvedValueOnce({
    user_id: 1,
    username: "Admin",
    email: "admin@example.com",
    is_admin: true,
  });

  const response = await request(app)
    .get("/api/protected")
    .set("x-test-user-id", "1");

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ ok: true });
});

test("GET /api/admin/users returns users for admins", async () => {
  const app = buildApp();
  userFindById.mockResolvedValueOnce({
    user_id: 1,
    username: "Admin",
    email: "admin@example.com",
    is_admin: true,
  });
  poolQuery.mockResolvedValueOnce({
    rows: [
      {
        user_id: 1,
        username: "Admin",
        email: "admin@example.com",
        created_at: "2026-05-22T00:00:00.000Z",
        is_admin: true,
      },
    ],
  });

  const response = await request(app)
    .get("/api/admin/users")
    .set("x-test-user-id", "1");

  expect(response.status).toBe(200);
  expect(response.body).toEqual([
    {
      user_id: 1,
      username: "Admin",
      email: "admin@example.com",
      created_at: "2026-05-22T00:00:00.000Z",
      is_admin: true,
    },
  ]);
  expect(poolQuery).toHaveBeenCalledWith(
    "SELECT user_id, username, email, created_at, is_admin FROM users ORDER BY created_at DESC",
  );
});

test("DELETE /api/admin/users/:id deletes a user for admins", async () => {
  const app = buildApp();
  userFindById.mockResolvedValueOnce({
    user_id: 1,
    username: "Admin",
    email: "admin@example.com",
    is_admin: true,
  });
  poolQuery.mockResolvedValueOnce({ rows: [{ user_id: 9 }] });

  const response = await request(app)
    .delete("/api/admin/users/9")
    .set("x-test-user-id", "1");

  expect(response.status).toBe(204);
  expect(response.text).toBe("");
  expect(poolQuery).toHaveBeenCalledWith(
    "DELETE FROM users WHERE user_id = $1 RETURNING user_id",
    [9],
  );
});

test("DELETE /api/admin/users/:id returns 404 when the user does not exist", async () => {
  const app = buildApp();
  userFindById.mockResolvedValueOnce({
    user_id: 1,
    username: "Admin",
    email: "admin@example.com",
    is_admin: true,
  });
  poolQuery.mockResolvedValueOnce({ rows: [] });

  const response = await request(app)
    .delete("/api/admin/users/999")
    .set("x-test-user-id", "1");

  expect(response.status).toBe(404);
  expect(response.body).toEqual({ error: "User not found" });
});

test("GET /api/admin/stats returns platform totals", async () => {
  const app = buildApp();
  userFindById.mockResolvedValueOnce({
    user_id: 1,
    username: "Admin",
    email: "admin@example.com",
    is_admin: true,
  });
  poolQuery
    .mockResolvedValueOnce({ rows: [{ count: "5" }] })
    .mockResolvedValueOnce({ rows: [{ count: "12" }] });

  const response = await request(app)
    .get("/api/admin/stats")
    .set("x-test-user-id", "1");

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ totalUsers: 5, totalTransactions: 12 });
  expect(poolQuery).toHaveBeenNthCalledWith(1, "SELECT COUNT(*) FROM users");
  expect(poolQuery).toHaveBeenNthCalledWith(
    2,
    "SELECT COUNT(*) FROM transactions",
  );
});
