import express from 'express';
import request from 'supertest';

const makeMock = () => {
  const calls: any[] = [];
  let nextResolved: any = undefined;
  let nextRejected: any = undefined;

  const fn: any = (...args: any[]) => {
    calls.push(args);
    if (nextRejected !== undefined) {
      const e = nextRejected;
      nextRejected = undefined;
      return Promise.reject(e);
    }
    if (nextResolved !== undefined) {
      const v = nextResolved;
      nextResolved = undefined;
      return Promise.resolve(v);
    }
    return Promise.resolve(undefined);
  };

  fn.mockResolvedValueOnce = (v: any) => {
    nextResolved = v;
  };
  fn.mockRejectedValueOnce = (e: any) => {
    nextRejected = e;
  };
  fn.mockClear = () => {
    calls.length = 0;
    nextResolved = undefined;
    nextRejected = undefined;
  };
  fn.mock = { calls } as any;

  return fn;
};

const userMocks = {
  create: makeMock(),
  login: makeMock(),
  findById: makeMock(),
};

class DuplicateEmailError extends Error {}
class InvalidCredentialsError extends Error {}

jest.mock('../src/models/User', () => ({
  User: {
    create: (...args: any[]) => userMocks.create(...args),
    login: (...args: any[]) => userMocks.login(...args),
    findById: (...args: any[]) => userMocks.findById(...args),
  },
  DuplicateEmailError,
  InvalidCredentialsError,
}));

import authRoutes from '../src/routes/auth';

const buildApp = () => {
  const app = express();
  const state: { session?: Record<string, unknown> } = {};

  app.use(express.json());
  app.use((req, _res, next) => {
    const session: Record<string, unknown> & { destroy: (callback?: () => void) => void } = {
      destroy: (callback?: () => void) => {
        if (callback) callback();
      },
    } as any;

    const userId = req.header('x-test-user-id');
    if (userId) {
      session.userId = Number(userId);
    }

    (req as any).session = session;
    state.session = session;
    next();
  });
  app.use('/api/auth', authRoutes);

  return { app, state };
};

beforeEach(() => {
  userMocks.create.mockClear();
  userMocks.login.mockClear();
  userMocks.findById.mockClear();
});

test('rejects registration with missing fields', async () => {
  const { app } = buildApp();

  const response = await request(app).post('/api/auth/register').send({
    email: 'ada@example.com',
    password: 'secret123',
  });

  expect(response.status).toBe(400);
  expect(response.body).toEqual({ error: 'Missing required fields' });
});

test('rejects duplicate registration emails', async () => {
  const { app } = buildApp();
  userMocks.create.mockRejectedValueOnce(new DuplicateEmailError('Email already exists'));

  const response = await request(app).post('/api/auth/register').send({
    username: 'Ada',
    email: 'ada@example.com',
    password: 'secret123',
  });

  expect(response.status).toBe(400);
  expect(response.body).toEqual({ error: 'Email already exists' });
});

test('creates a session on successful registration', async () => {
  const { app, state } = buildApp();
  userMocks.create.mockResolvedValueOnce({ user_id: 1, username: 'Ada', email: 'ada@example.com' });

  const response = await request(app).post('/api/auth/register').send({
    username: 'Ada',
    email: 'ada@example.com',
    password: 'secret123',
    rememberMe: true,
  });

  expect(userMocks.create.mock.calls.length).toBeGreaterThan(0);
  expect(userMocks.create.mock.calls[0][0]).toEqual({ username: 'Ada', email: 'ada@example.com', password: 'secret123' });
  expect(response.status).toBe(201);
  expect(response.body.user).toEqual({ user_id: 1, username: 'Ada', email: 'ada@example.com' });
  expect(state.session?.userId).toBe(1);
  const registerCookies = response.headers['set-cookie'] as unknown as string[];
  expect(registerCookies.some((cookie) => cookie.startsWith('rememberEmail='))).toBe(true);
});

test('rejects invalid login credentials', async () => {
  const { app } = buildApp();
  userMocks.login.mockRejectedValueOnce(new InvalidCredentialsError('Invalid credentials'));

  const response = await request(app).post('/api/auth/login').send({ email: 'ada@example.com', password: 'wrong-password' });

  expect(response.status).toBe(401);
  expect(response.body).toEqual({ error: 'Invalid credentials' });
});

test('logs in and updates the session', async () => {
  const { app, state } = buildApp();
  userMocks.login.mockResolvedValueOnce({ user_id: 7, username: 'Ada', email: 'ada@example.com' });

  const response = await request(app).post('/api/auth/login').send({ email: 'ada@example.com', password: 'secret123', rememberMe: false });

  expect(response.status).toBe(200);
  expect(response.body.user).toEqual({ user_id: 7, username: 'Ada', email: 'ada@example.com' });
  expect(state.session?.userId).toBe(7);
  const loginCookies = response.headers['set-cookie'] as unknown as string[];
  expect(loginCookies.some((cookie) => cookie.startsWith('rememberEmail='))).toBe(true);
});

test('returns the current user when authenticated', async () => {
  const { app } = buildApp();
  userMocks.findById.mockResolvedValueOnce({ user_id: 7, username: 'Ada', email: 'ada@example.com' });

  const response = await request(app).get('/api/auth/me').set('x-test-user-id', '7');

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ user_id: 7, username: 'Ada', email: 'ada@example.com' });
});

test('rejects unauthenticated requests', async () => {
  const { app } = buildApp();

  const response = await request(app).get('/api/auth/me');

  expect(response.status).toBe(401);
  expect(response.body).toEqual({ error: 'Authentication required' });
});

test('logs out and clears the session cookie', async () => {
  const { app } = buildApp();

  const response = await request(app).post('/api/auth/logout').set('x-test-user-id', '7');

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ message: 'Logged out successfully' });
  const logoutCookies = response.headers['set-cookie'] as unknown as string[];
  expect(logoutCookies.some((cookie) => cookie.startsWith('connect.sid='))).toBe(true);
});