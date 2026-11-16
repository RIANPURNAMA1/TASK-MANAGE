import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

/**
 * HTTP-level guarantees that hold without a database: every non-public route demands
 * a valid access token, and errors always use the `{ error: { code, message } }` envelope.
 */
const app = createApp();

const protectedRoutes: [method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string][] = [
  ['get', '/api/v1/me'],
  ['get', '/api/v1/me/tasks'],
  ['get', '/api/v1/users'],
  ['get', '/api/v1/divisions'],
  ['post', '/api/v1/divisions'],
  ['get', '/api/v1/projects'],
  ['get', '/api/v1/projects/p1/board'],
  ['post', '/api/v1/projects/p1/cards'],
  ['patch', '/api/v1/cards/c1'],
  ['post', '/api/v1/cards/c1/move'],
  ['put', '/api/v1/cards/c1/assignees'],
  ['post', '/api/v1/cards/c1/comments'],
  ['delete', '/api/v1/comments/x'],
  ['post', '/api/v1/projects/p1/attachments'],
  ['get', '/api/v1/attachments/a1/url'],
  ['get', '/api/v1/notifications'],
  ['get', '/api/v1/auth/sessions'],
  ['get', '/api/v1/chat/channels'],
  ['get', '/api/v1/chat/channels/c1/messages'],
  ['post', '/api/v1/chat/channels/c1/messages'],
  ['post', '/api/v1/chat/direct'],
  ['post', '/api/v1/chat/messages/m1/reactions'],
  ['get', '/api/v1/chat/presence'],
  ['get', '/api/v1/admin/users'],
  ['post', '/api/v1/admin/invitations'],
  ['get', '/api/v1/dashboard'],
  ['get', '/api/v1/announcements'],
  ['post', '/api/v1/announcements'],
  ['post', '/api/v1/announcements/a1/comments'],
  ['post', '/api/v1/me/avatar'],
];

describe('authentication guard', () => {
  it.each(protectedRoutes)('%s %s requires a token', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a garbage bearer token', async () => {
    const res = await request(app).get('/api/v1/me').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });
});

describe('public endpoints', () => {
  it('validates the login body before touching the database', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'nope', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects refresh without a cookie', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects malformed JSON', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(res.status).toBe(400);
  });

  it('sets security headers', async () => {
    const res = await request(app).get('/nope');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('desktop client (PRD §4)', () => {
  const desktop = { 'x-desktop-device': 'NexusTask Desktop di Windows' };

  it('allows the Tauri webview origins through CORS', async () => {
    for (const origin of ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']) {
      const res = await request(app)
        .options('/api/v1/auth/login')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,x-desktop-device');
      expect(res.headers['access-control-allow-origin']).toBe(origin);
    }
  });

  it('does not allow arbitrary origins', async () => {
    const res = await request(app).options('/api/v1/auth/login').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects refresh with a malformed body token', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').set(desktop).send({ refreshToken: 'garbage' });
    expect(res.status).toBe(401);
  });

  it('validates the desktop SSO exchange before touching the database', async () => {
    const res = await request(app).post('/api/v1/auth/google/desktop-exchange').set(desktop).send({ code: 'short', verifier: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
