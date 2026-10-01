import { TenantContext } from '../common/auth/auth-context';
import { OrganizationType, Role } from '../common/enums';
import { AvailableLoadPosting } from './entities/load-posting.entity';
import { MarketplaceOffer } from './entities/marketplace-offer.entity';
import { OfferStatus, PostingStatus } from './entities/marketplace.enums';
import { AvailableVehiclePosting } from './entities/vehicle-posting.entity';
import { BookingsService } from './bookings.service';

const ctx = (organizationId: string): TenantContext => ({
  userId: 'user',
  sessionId: 'session',
  organizationId,
  organizationType: OrganizationType.SHIPPER,
  role: Role.OWNER,
  isPlatformAdmin: false,
});

const future = () => new Date(Date.now() + 3_600_000);

function setup(rows: {
  offer?: Partial<MarketplaceOffer>;
  load?: Partial<AvailableLoadPosting>;
  vehicle?: Partial<AvailableVehiclePosting>;
}) {
  const repos = new Map<unknown, { findOne: jest.Mock; save: jest.Mock }>([
    [
      MarketplaceOffer,
      { findOne: jest.fn().mockResolvedValue(rows.offer ?? null), save: jest.fn() },
    ],
    [
      AvailableLoadPosting,
      { findOne: jest.fn().mockResolvedValue(rows.load ?? null), save: jest.fn() },
    ],
    [
      AvailableVehiclePosting,
      { findOne: jest.fn().mockResolvedValue(rows.vehicle ?? null), save: jest.fn() },
    ],
  ]);
  const manager = { getRepository: (entity: unknown) => repos.get(entity) };
  const dataSource = { transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)) };
  const trips = { createInTx: jest.fn() };
  const service = new BookingsService(
    {} as never,
    dataSource as never,
    trips as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, repos, trips };
}

const pendingOffer: Partial<MarketplaceOffer> = {
  id: 'offer',
  createdByOrganizationId: 'carrier',
  targetOrganizationId: 'shipper',
  loadPostingId: 'lp',
  vehiclePostingId: 'vp',
  status: OfferStatus.PENDING,
  expiresAt: future(),
  amount: 10_000,
};

describe('BookingsService.acceptOffer guards', () => {
  it('hides offers from uninvolved organizations', async () => {
    const { service } = setup({ offer: pendingOffer });
    await expect(service.acceptOffer(ctx('stranger'), 'offer')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('only lets the receiving organization accept', async () => {
    const { service } = setup({ offer: pendingOffer });
    await expect(service.acceptOffer(ctx('carrier'), 'offer')).rejects.toMatchObject({
      code: 'OFFER_NOT_ACCEPTABLE',
    });
  });

  it('re-validates under row locks, locking the load posting before the offer', async () => {
    const { service, repos } = setup({
      load: {
        id: 'lp',
        organizationId: 'shipper',
        status: PostingStatus.OPEN,
        weightKg: 1_000,
        expiresAt: future(),
      },
    });
    const offerRepo = repos.get(MarketplaceOffer)!;
    offerRepo.findOne
      .mockResolvedValueOnce(pendingOffer) // unlocked pre-check
      .mockResolvedValueOnce({ ...pendingOffer, status: OfferStatus.REJECTED }); // closed by a concurrent winner
    await expect(service.acceptOffer(ctx('shipper'), 'offer')).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });

    const loadLock = repos.get(AvailableLoadPosting)!.findOne;
    expect(loadLock).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(offerRepo.findOne).toHaveBeenLastCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(loadLock.mock.invocationCallOrder[0]).toBeLessThan(
      offerRepo.findOne.mock.invocationCallOrder[1],
    );
  });

  it('rejects offers that are no longer pending', async () => {
    const { service } = setup({ offer: { ...pendingOffer, status: OfferStatus.ACCEPTED } });
    await expect(service.acceptOffer(ctx('shipper'), 'offer')).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
  });

  it('rejects expired offers', async () => {
    const { service } = setup({ offer: { ...pendingOffer, expiresAt: new Date(Date.now() - 1) } });
    await expect(service.acceptOffer(ctx('shipper'), 'offer')).rejects.toMatchObject({
      code: 'OFFER_EXPIRED',
    });
  });

  it('rejects when the load posting is already booked (lost race)', async () => {
    const { service, trips } = setup({
      offer: pendingOffer,
      load: { id: 'lp', organizationId: 'shipper', status: PostingStatus.BOOKED, weightKg: 1_000 },
    });
    await expect(service.acceptOffer(ctx('shipper'), 'offer')).rejects.toMatchObject({
      code: 'POSTING_UNAVAILABLE',
    });
    expect(trips.createInTx).not.toHaveBeenCalled();
  });

  it('rejects when the vehicle posting no longer has capacity', async () => {
    const { service } = setup({
      offer: pendingOffer,
      load: {
        id: 'lp',
        organizationId: 'shipper',
        status: PostingStatus.OPEN,
        weightKg: 5_000,
        expiresAt: future(),
      },
      vehicle: {
        id: 'vp',
        organizationId: 'carrier',
        status: PostingStatus.OPEN,
        availableWeightKg: 4_000,
        expiresAt: future(),
      },
    });
    await expect(service.acceptOffer(ctx('shipper'), 'offer')).rejects.toMatchObject({
      code: 'CAPACITY_EXCEEDED',
    });
  });
});
