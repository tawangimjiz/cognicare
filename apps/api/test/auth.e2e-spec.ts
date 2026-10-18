import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const email = `e2e-${Date.now()}@cognicare.test`;
  const password = 'password123';
  let token: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(() => app.close());

  it('register -> login -> me -> logout -> me 401', async () => {
    const reg = await http().post('/api/auth/register').send({ email, password, fullName: 'E2E', role: 'patient' }).expect(201);
    expect(reg.body.user.email).toBe(email);

    await http().post('/api/auth/register').send({ email, password, fullName: 'E2E', role: 'patient' }).expect(409);

    const login = await http().post('/api/auth/login').send({ email, password }).expect(200);
    token = login.body.accessToken;

    const me = await http().get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.id).toBe(reg.body.user.id);
    expect(me.body.settings).toEqual({ notif: true, sound: true, largeText: false });

    await http().patch('/api/users/me/settings').set('Authorization', `Bearer ${token}`).send({ largeText: true }).expect(200)
      .expect((r) => expect(r.body.settings.largeText).toBe(true));
    await http().get('/api/users/me').set('Authorization', `Bearer ${token}`).expect(200);
    await http().get('/api/games').set('Authorization', `Bearer ${token}`).expect(200);

    await http().post('/api/auth/logout').set('Authorization', `Bearer ${token}`).expect(204);
    await http().get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('rejects doctor self-registration and short passwords with 400', async () => {
    await http().post('/api/auth/register').send({ email: `d-${email}`, password, fullName: 'D', role: 'doctor' }).expect(400);
    await http().post('/api/auth/register').send({ email: `s-${email}`, password: 'short', fullName: 'S', role: 'patient' }).expect(400);
  });

  it('401 without token', async () => {
    await http().get('/api/auth/me').expect(401);
  });

  it('throttles login with 429 after 5 attempts', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) {
      codes.push((await http().post('/api/auth/login').send({ email, password: 'wrong-password' })).status);
    }
    expect(codes).toContain(401);
    expect(codes).toContain(429);
  });
});
