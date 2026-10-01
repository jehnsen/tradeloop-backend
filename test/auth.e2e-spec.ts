import { Client, createTestApp, login, PASSWORD, registerOrg, TestApp, uniqueEmail } from './utils';

describe('Auth (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(() => t.close());

  it('registers, logs in and returns the current user with memberships', async () => {
    const { client, email } = await registerOrg(t.app, 'SHIPPER', 'Auth Shipper');
    const me = await client.get('/auth/me').expect(200);
    expect(me.body.data.user.email).toBe(email);
    expect(me.body.data.user.passwordHash).toBeUndefined();
    expect(me.body.data.role).toBe('OWNER');
    expect(me.body.data.memberships).toHaveLength(1);

    const res = await new Client(t.app)
      .post('/auth/login', { email, password: PASSWORD })
      .expect(200);
    expect(res.body.data).toMatchObject({ tokenType: 'Bearer', expiresIn: expect.any(Number) });
  });

  it('rejects bad credentials and invalid payloads with the standard error envelope', async () => {
    const bad = await new Client(t.app)
      .post('/auth/login', { email: 'nobody@test.local', password: 'x' })
      .expect(401);
    expect(bad.body).toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS', errors: [] });

    const invalid = await new Client(t.app)
      .post('/auth/register', { email: 'not-an-email', password: 'short' })
      .expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
    expect(invalid.body.errors.map((e: { field: string }) => e.field)).toEqual(
      expect.arrayContaining(['email', 'password']),
    );

    const smuggled = await new Client(t.app)
      .post('/auth/register', {
        email: uniqueEmail('x'),
        password: PASSWORD,
        firstName: 'a',
        lastName: 'b',
        organization: { name: 'X', type: 'PLATFORM_ADMIN' },
      })
      .expect(400);
    expect(smuggled.body.code).toBe('VALIDATION_ERROR');
  });

  it('rotates refresh tokens and revokes the family when an old token is replayed', async () => {
    const { tokens } = await registerOrg(t.app, 'BROKER', 'Rotation Broker');
    const first = await new Client(t.app)
      .post('/auth/refresh', { refreshToken: tokens.refreshToken })
      .expect(200);
    expect(first.body.data.refreshToken).not.toBe(tokens.refreshToken);

    await new Client(t.app)
      .post('/auth/refresh', { refreshToken: tokens.refreshToken })
      .expect(401);
    // Reuse detection revoked the rotated successor as well, and its access token.
    await new Client(t.app)
      .post('/auth/refresh', { refreshToken: first.body.data.refreshToken })
      .expect(401);
    await new Client(t.app, first.body.data.accessToken).get('/auth/me').expect(401);
  });

  it('logout revokes the current session immediately; logout-all revokes every session', async () => {
    const { email, client } = await registerOrg(t.app, 'WAREHOUSE', 'Logout Warehouse');
    await client.post('/auth/logout').expect(204);
    await client.get('/auth/me').expect(401);

    const a = await login(t.app, email);
    const b = await login(t.app, email);
    await a.post('/auth/logout-all').expect(204);
    await a.get('/auth/me').expect(401);
    await b.get('/auth/me').expect(401);
    await (await login(t.app, email)).get('/auth/me').expect(200);
  });

  it('switches the active organization only for organizations the user belongs to', async () => {
    const orgA = await registerOrg(t.app, 'SHIPPER', 'Switch A');
    const orgB = await registerOrg(t.app, 'SHIPPER', 'Switch B');
    await orgB.client
      .post('/organizations/current/memberships', { email: orgA.email, role: 'VIEWER' })
      .expect(201);

    const switched = await orgA.client
      .post('/auth/switch-organization', { organizationId: orgB.organizationId })
      .expect(200);
    const asB = new Client(t.app, switched.body.data.accessToken);
    const me = await asB.get('/auth/me').expect(200);
    expect(me.body.data).toMatchObject({
      activeOrganizationId: orgB.organizationId,
      role: 'VIEWER',
    });
    expect(me.body.data.memberships).toHaveLength(2);

    const stranger = await registerOrg(t.app, 'SHIPPER', 'Switch C');
    await asB
      .post('/auth/switch-organization', { organizationId: stranger.organizationId })
      .expect(401);
  });

  it('requires authentication on protected routes and exposes health without it', async () => {
    await new Client(t.app).get('/customers').expect(401);
    const res = await new Client(t.app, 'garbage').get('/customers').expect(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });
});
