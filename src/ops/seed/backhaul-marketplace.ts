import type { BackhaulBookingRequest, BackhaulListing, Place } from '../domain/types';
import { placeByName } from '../domain/data/areas';
import type { LogisticsSeed } from './logistics-seed';
import { DEFAULT_LISTING_TERMS } from '../domain/lib/backhaul-marketplace';

/** Backhaul Marketplace listings and requests, tied to the generated trips and jobs. */
export function generateBackhaulSeed(seed: LogisticsSeed) {
  // Demo marketplace listings and shipper requests. Businesses, people and rates are fictional
  // and illustrative — not real companies or published tariffs.

  const place = (name: string): Place => {
    const p = placeByName(name)!;
    return { name: p.name, areaId: p.areaId, address: p.address };
  };
  const BALINTAWAK = place('Balintawak Market (Cloverleaf) Bagsakan');
  const VZ_DEPOT = place('Valenzuela Produce Depot — Bodega 7');

  const BACKHAUL_LISTINGS: BackhaulListing[] = [
    {
      id: 'BHL-260924-001',
      tripId: 'TRIP-260925-01',
      ...DEFAULT_LISTING_TERMS,
      status: 'Published',
      publishedAt: '2026-09-24T18:10',
      publishedBy: 'Noel Pascual',
    },
    // Shorter Laguna return — priced a little lower.
    {
      id: 'BHL-260924-002',
      tripId: 'TRIP-260925-02',
      ...DEFAULT_LISTING_TERMS,
      ratePerKg: 4.5,
      status: 'Published',
      publishedAt: '2026-09-24T19:00',
      publishedBy: 'Noel Pascual',
    },
    {
      id: 'BHL-260925-001',
      tripId: 'TRIP-260926-01',
      ...DEFAULT_LISTING_TERMS,
      status: 'Published',
      publishedAt: '2026-09-25T07:30',
      publishedBy: 'Noel Pascual',
    },
  ];

  /** A request dispatch already confirmed: route, cargo and timing come from the job it became. */
  function confirmedAs(
    jobId: string,
    req: Pick<
      BackhaulBookingRequest,
      | 'id'
      | 'listingId'
      | 'shipper'
      | 'quantity'
      | 'unit'
      | 'quotedFreight'
      | 'createdAt'
      | 'respondedAt'
      | 'respondedBy'
      | 'notes'
    >,
  ): BackhaulBookingRequest {
    const job = seed.jobs.find((j) => j.id === jobId)!;
    return {
      ...req,
      customerId: job.customerId,
      consignee: job.consignee,
      pickup: job.pickup,
      dropoff: job.dropoff,
      cargoDescription: job.cargoDescription,
      cargoCategory: job.cargoCategory,
      weightKg: job.weightKg,
      readyAt: job.pickupAt,
      status: 'Confirmed',
      jobId,
    };
  }

  const BACKHAUL_REQUESTS: BackhaulBookingRequest[] = [
    confirmedAs('JOB-260925-022', {
      id: 'BKR-260925-001',
      listingId: 'BHL-260924-002',
      shipper: {
        businessName: 'Masin Agrivet Supply',
        contactName: 'Jessa Umali',
        phone: '0916 482 3307',
      },
      quantity: 40,
      unit: 'sack',
      quotedFreight: 4500,
      notes: '40 sacks of feeds already paid at the depot. Depot forklift loads.',
      createdAt: '2026-09-25T06:52',
      respondedAt: '2026-09-25T07:04',
      respondedBy: 'Noel Pascual',
    }),
    {
      id: 'BKR-260925-002',
      listingId: 'BHL-260924-001',
      shipper: {
        businessName: 'Sariaya Bigasan at Grocery',
        contactName: 'Rowena Macalintal',
        phone: '0917 663 2108',
      },
      pickup: {
        name: 'Malanday rice wholesaler',
        areaId: 'valenzuela',
        address: 'M.H. del Pilar St., Brgy. Malanday, Valenzuela City',
      },
      dropoff: {
        name: 'Sariaya Bigasan at Grocery',
        areaId: 'sariaya',
        address: 'Rizal St., Brgy. Poblacion 3, Sariaya',
      },
      cargoDescription: 'Rice (sacks)',
      cargoCategory: 'Dry Goods',
      quantity: 30,
      unit: 'sack',
      weightKg: 1500,
      readyAt: '2026-09-25T11:00',
      quotedFreight: 7500,
      notes: "30 sacks × 50 kg. Wholesaler's boys can load from 11:00 AM.",
      status: 'Requested',
      createdAt: '2026-09-25T07:12',
    },
    {
      id: 'BKR-260925-003',
      listingId: 'BHL-260924-001',
      customerId: 'CUS-049',
      shipper: {
        businessName: 'Candelaria Produce Traders',
        contactName: 'Lucia Barrameda',
        phone: '0935 772 1049',
      },
      pickup: BALINTAWAK,
      dropoff: {
        name: 'Candelaria Produce Traders',
        areaId: 'candelaria',
        address: 'Rizal Ave., Brgy. Poblacion, Candelaria',
      },
      cargoDescription: 'Carrots + Cabbage',
      cargoCategory: 'Produce',
      quantity: 40,
      unit: 'crate',
      weightKg: 900,
      readyAt: '2026-09-25T13:00',
      quotedFreight: 4500,
      status: 'Requested',
      createdAt: '2026-09-25T07:31',
    },
    {
      id: 'BKR-260925-004',
      listingId: 'BHL-260924-002',
      shipper: {
        businessName: 'Tayabas Builders Depot',
        contactName: 'Ramon Ilagan',
        phone: '0927 551 0846',
      },
      pickup: {
        name: 'Calamba cement dealer',
        areaId: 'calamba',
        address: 'National Hwy., Brgy. Parian, Calamba',
      },
      dropoff: {
        name: 'Tayabas Builders Depot',
        areaId: 'tayabas',
        address: 'Brgy. Ilasan, Tayabas City',
      },
      cargoDescription: 'Cement, bagged',
      cargoCategory: 'General Cargo',
      quantity: 80,
      unit: 'bag',
      weightKg: 3200,
      readyAt: '2026-09-25T17:00',
      quotedFreight: 14400,
      status: 'Declined',
      declineReason: "Cement isn't carried — the van also carries iced seafood.",
      createdAt: '2026-09-25T06:30',
      respondedAt: '2026-09-25T06:58',
      respondedBy: 'Noel Pascual',
    },
    {
      id: 'BKR-260925-005',
      listingId: 'BHL-260925-001',
      shipper: {
        businessName: 'Tayabas Pasalubong Center',
        contactName: 'Marivic Lagdameo',
        phone: '0918 337 9024',
      },
      pickup: VZ_DEPOT,
      dropoff: {
        name: 'Tayabas Pasalubong Center',
        areaId: 'tayabas',
        address: 'Quezon Ave., Brgy. Angeles Zone I, Tayabas City',
      },
      cargoDescription: 'Malagkit (glutinous rice), sacked',
      cargoCategory: 'Dry Goods',
      quantity: 12,
      unit: 'sack',
      weightKg: 600,
      readyAt: '2026-09-26T09:30',
      quotedFreight: 3000,
      notes: "For this weekend's suman and kakanin orders.",
      status: 'Requested',
      createdAt: '2026-09-25T07:40',
    },
  ];
  return { BACKHAUL_LISTINGS, BACKHAUL_REQUESTS };
}
