import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AccessService } from './access.service';

describe('AccessService', () => {
  const prisma: any = { patientProfile: { findFirst: jest.fn() }, caregiverLink: { findUnique: jest.fn() } };
  const svc = new AccessService(prisma);
  const u = (role: any, id = 'me1') => ({ id, role, jti: 'j' });

  beforeEach(() => jest.clearAllMocks());

  it('patient: self only', async () => {
    expect(await svc.canAccessPatient(u('patient', 'p1'), 'p1')).toBe(true);
    expect(await svc.canAccessPatient(u('patient', 'p1'), 'p2')).toBe(false);
  });

  it('doctor: allowed iff assigned', async () => {
    prisma.patientProfile.findFirst.mockResolvedValueOnce({ patientId: 'p1' }).mockResolvedValueOnce(null);
    expect(await svc.canAccessPatient(u('doctor'), 'p1')).toBe(true);
    expect(await svc.canAccessPatient(u('doctor'), 'p2')).toBe(false);
    expect(prisma.patientProfile.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { patientId: 'p1', assignedDoctorId: 'me1' } }));
  });

  it('caregiver: allowed iff linked', async () => {
    prisma.caregiverLink.findUnique.mockResolvedValueOnce({ patientId: 'p1' }).mockResolvedValueOnce(null);
    expect(await svc.canAccessPatient(u('caregiver'), 'p1')).toBe(true);
    expect(await svc.canAccessPatient(u('caregiver'), 'p2')).toBe(false);
  });

  it('unknown role is denied', async () => {
    expect(await svc.canAccessPatient(u('admin'), 'p1')).toBe(false);
  });

  it('resolvePatientId maps me for patients, 400 otherwise', () => {
    expect(svc.resolvePatientId(u('patient', 'p1'), 'me')).toBe('p1');
    expect(svc.resolvePatientId(u('doctor'), 'abc')).toBe('abc');
    expect(() => svc.resolvePatientId(u('doctor'), 'me')).toThrow(BadRequestException);
  });

  it('assertCanAccessPatient throws 403 on deny', async () => {
    await expect(svc.assertCanAccessPatient(u('patient', 'p1'), 'p2')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.assertCanAccessPatient(u('patient', 'p1'), 'p1')).resolves.toBeUndefined();
  });
});
