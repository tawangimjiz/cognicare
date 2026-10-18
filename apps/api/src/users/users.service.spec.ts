import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

const ID = '11111111-1111-1111-1111-111111111111';
const ID2 = '22222222-2222-2222-2222-222222222222';

describe('UsersService', () => {
  const prisma: any = {
    user: { findUnique: jest.fn() },
    patientProfile: { findUnique: jest.fn(), update: jest.fn() },
  };
  const access: any = { resolvePatientId: jest.fn((_u: any, p: string) => (p === 'me' ? ID : p)), canAccessPatient: jest.fn() };
  const svc = new UsersService(prisma, access);
  const row = (id: string, profile: any = null) => ({ id, role: 'patient' as const,fullName: 'n', email: 'e', languagePref: 'th', patientProfile: profile });

  beforeEach(() => jest.clearAllMocks());

  it('toDto: non-patient has null settings; patient merges defaults', () => {
    expect(svc.toDto(row(ID)).settings).toBeNull();
    expect(svc.toDto(row(ID, { accessibilitySettings: { largeText: true } })).settings)
      .toEqual({ notif: true, sound: true, largeText: true });
  });

  it('getById: 404 for bad uuid and missing row', async () => {
    await expect(svc.getById('nope')).rejects.toBeInstanceOf(NotFoundException);
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(svc.getById(ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getForUser: self allowed without access check; other needs access', async () => {
    prisma.user.findUnique.mockResolvedValue(row(ID));
    await svc.getForUser({ id: ID, role: 'patient', jti: 'j' }, 'me');
    expect(access.canAccessPatient).not.toHaveBeenCalled();
    prisma.user.findUnique.mockResolvedValue(row(ID2));
    access.canAccessPatient.mockResolvedValue(false);
    await expect(svc.getForUser({ id: ID, role: 'patient', jti: 'j' }, ID2)).rejects.toBeInstanceOf(ForbiddenException);
    access.canAccessPatient.mockResolvedValue(true);
    await expect(svc.getForUser({ id: ID, role: 'doctor', jti: 'j' }, ID2)).resolves.toMatchObject({ id: ID2 });
  });

  it('updateSettings merges the patch and returns the user', async () => {
    prisma.patientProfile.findUnique.mockResolvedValue({ accessibilitySettings: { sound: false } });
    prisma.user.findUnique.mockResolvedValue(row(ID, { accessibilitySettings: {} }));
    await svc.updateSettings(ID, { largeText: true });
    expect(prisma.patientProfile.update).toHaveBeenCalledWith({
      where: { patientId: ID },
      data: { accessibilitySettings: { notif: true, sound: false, largeText: true } },
    });
  });

  it('updateSettings: 404 without a patient profile', async () => {
    prisma.patientProfile.findUnique.mockResolvedValue(null);
    await expect(svc.updateSettings(ID, {})).rejects.toBeInstanceOf(NotFoundException);
  });
});
