/**
 * Demo tenant: Lucena Fresh Trading & Logistics. 30 days of trip history, today's live operations
 * (Fri Sep 25, 2026, 7:48 AM), tomorrow's plan, the Load Board, the Backhaul Marketplace preview and
 * the trading preview. Deterministic and relationally consistent.
 */
import { setClock } from '../domain/data/company';
import { applyTenantProfile } from '../domain/data/tenant';
import type { OpsData, TenantProfile } from '../domain/types';
import { generateBackhaulSeed } from './backhaul-marketplace';
import { CUSTOMERS, STANDING_ORDERS } from './customers';
import { VEHICLE_DOCUMENTS } from './fleet-records';
import { LEADS } from './leads';
import { generateBoardSeed } from './load-board';
import { generateLogisticsSeed } from './logistics-seed';
import { DEMO_COMPANY, DEMO_DRIVERS, DEMO_HELPERS, DEMO_STAFF, DEMO_TRUCKS } from './profile';
import { generateTradingSeed } from './trading-seed';

/** The seed's "now". The demo clock starts here (OPS_CLOCK_ANCHOR). */
export const DEMO_NOW = '2026-09-25T07:48';

export interface DemoTenant {
  profile: TenantProfile;
  data: OpsData;
}

export function buildDemoTenant(): DemoTenant {
  const base: TenantProfile = {
    company: DEMO_COMPANY,
    staff: DEMO_STAFF,
    helpers: DEMO_HELPERS,
    trucks: DEMO_TRUCKS,
    drivers: DEMO_DRIVERS,
    lifetimeBaseline: {},
    salesLifetimeBaseline: {},
  };
  // The generators read the fleet, staff and clock registries.
  applyTenantProfile(base);
  setClock(DEMO_NOW);
  const logistics = generateLogisticsSeed();
  const trading = generateTradingSeed();
  const board = generateBoardSeed(logistics);
  const backhaul = generateBackhaulSeed(logistics);
  const profile: TenantProfile = {
    ...base,
    lifetimeBaseline: logistics.lifetimeBaseline,
    salesLifetimeBaseline: trading.lifetimeBaseline,
  };
  return {
    profile,
    data: {
      customers: CUSTOMERS,
      leads: LEADS,
      quotes: logistics.quotes,
      jobs: logistics.jobs,
      loads: logistics.loads,
      trips: logistics.trips,
      deliveries: logistics.deliveries,
      payments: logistics.payments,
      expenses: logistics.expenses,
      fuelLogs: logistics.fuelLogs,
      maintenance: logistics.maintenance,
      documents: VEHICLE_DOCUMENTS,
      notifications: logistics.notifications,
      truckingPartners: board.TRUCKING_PARTNERS,
      boardLoads: board.BOARD_LOADS,
      boardCapacity: board.BOARD_CAPACITY,
      backhaulListings: backhaul.BACKHAUL_LISTINGS,
      backhaulRequests: backhaul.BACKHAUL_REQUESTS,
      orders: trading.orders,
      purchaseOrders: trading.purchaseOrders,
      salesPayments: trading.salesPayments,
      inventory: trading.inventory,
      standingOrders: STANDING_ORDERS,
      quoteRequests: trading.quoteRequests,
    },
  };
}
