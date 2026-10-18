import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Sessions / progress / patients (e2e, seeded DB)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const tokens: Record<string, string> = {};
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    const users: Record<string, string> = {
      patient: 'patient@cognicare.test', other: 'patient1@cognicare.test',
      doctor: 'doctor@cognicare.test', caregiver: 'caregiver@cognicare.test',
    };
    for (const [k, email] of Object.entries(users)) {
      const r = await http().post('/api/auth/login').send({ email, password: 'password123' }).expect(200);
      tokens[k] = r.body.accessToken;
    }
  });
  afterAll(() => app.close());

  it('patient start -> end -> results -> progress +1; leaderboard updated', async () => {
    const before = await http().get('/api/progress/me').set(auth('patient')).expect(200);

    const start = await http().post('/api/sessions').set(auth('patient')).send({ gameId: 'spot', tier: 1 }).expect(201);
    const sid = start.body.sessionId;

    const end = await http().put(`/api/sessions/${sid}`).set(auth('patient')).send({
      status: 'completed', totalDurationMs: 90000,
      scores: [{ domain: 'memory', rawScore: 80, errorRate: 0.1 }, { domain: 'focus', rawScore: 90 }],
      events: [{ type: 'click', at: new Date().toISOString(), reactionTimeMs: 350 }],
    }).expect(200);
    expect(end.body).toMatchObject({ id: sid, gameId: 'spot', status: 'completed', score: 85 });

    const results = await http().get('/api/results/me?limit=5').set(auth('patient')).expect(200);
    expect(results.body.items[0].id).toBe(sid);

    const after = await http().get('/api/progress/me').set(auth('patient')).expect(200);
    expect(after.body.totalSessions).toBe(before.body.totalSessions + 1);
    expect(after.body.domains).toHaveLength(6);

    const lb = await http().get('/api/leaderboard/spot').set(auth('patient')).expect(200);
    expect(lb.body.me).not.toBeNull();
    expect(JSON.stringify(lb.body)).not.toMatch(/patient/);

    await http().put(`/api/sessions/${sid}`).set(auth('patient')).send({
      status: 'completed', totalDurationMs: 1, scores: [{ domain: 'focus', rawScore: 1 }],
    }).expect(409);
  });

  it('400 on unknown game, bad tier, missing metric; 403 on other patient session', async () => {
    await http().post('/api/sessions').set(auth('patient')).send({ gameId: 'nope', tier: 1 }).expect(400);
    await http().post('/api/sessions').set(auth('patient')).send({ gameId: 'spot', tier: 9 }).expect(400);
    const s = await http().post('/api/sessions').set(auth('patient')).send({ gameId: 'spot', tier: 2 }).expect(201);
    await http().put(`/api/sessions/${s.body.sessionId}`).set(auth('patient')).send({
      status: 'completed', totalDurationMs: 1, scores: [{ domain: 'mood', rawScore: 1 }],
    }).expect(400);
    await http().put(`/api/sessions/${s.body.sessionId}`).set(auth('other')).send({
      status: 'abandoned', totalDurationMs: 1, scores: [{ domain: 'focus', rawScore: 1 }],
    }).expect(403);
    await http().put('/api/sessions/00000000-0000-4000-8000-000000000000').set(auth('patient')).send({
      status: 'abandoned', totalDurationMs: 1, scores: [{ domain: 'focus', rawScore: 1 }],
    }).expect(404);
  });

  it('doctor sees 8 seeded patients; patient 403; caregiver sees 1', async () => {
    const d = await http().get('/api/patients').set(auth('doctor')).expect(200);
    expect(d.body).toHaveLength(8);
    expect(d.body.filter((p: any) => p.status === 'watch')).toHaveLength(3);
    await http().get('/api/patients').set(auth('patient')).expect(403);
    const c = await http().get('/api/patients').set(auth('caregiver')).expect(200);
    expect(c.body).toHaveLength(1);
    await http().get('/api/patients').expect(401);
  });

  it('access rules on results/progress/report/alerts', async () => {
    const pid = (await http().get('/api/patients').set(auth('caregiver')).expect(200)).body[0].id;
    await http().get(`/api/progress/${pid}`).set(auth('caregiver')).expect(200);
    await http().get(`/api/results/${pid}`).set(auth('doctor')).expect(200);
    await http().get(`/api/progress/${pid}`).set(auth('other')).expect(403);
    const rep = await http().get(`/api/report/${pid}`).set(auth('doctor')).expect(200);
    expect(rep.body.patient.id).toBe(pid);
    await http().get(`/api/report/${pid}?from=garbage`).set(auth('doctor')).expect(400);
    await http().get(`/api/report/${pid}`).set(auth('patient')).expect(403);
    const al = await http().get('/api/alerts').set(auth('doctor')).expect(200);
    expect(Array.isArray(al.body.alerts)).toBe(true);
    await http().get('/api/alerts').set(auth('patient')).expect(403);
    await http().get('/api/leaderboard/nope').set(auth('patient')).expect(400);
  });
});
