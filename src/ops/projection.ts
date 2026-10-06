import { Role } from '../common/enums';
import { emptyOpsData } from './domain/lib/ops-data';
import type { OpsData, TenantProfile } from './domain/types';

/** What one login may read of the organization's data. Office roles see everything. */
export function projectData(data: OpsData, role: Role, subjectRef: string | null): OpsData {
  if (role === Role.DRIVER) {
    // A driver's phone gets their own trips with the cargo and drops on them — never money or sales.
    const trips = data.trips.filter((t) => !!subjectRef && t.driverId === subjectRef);
    const tripIds = new Set(trips.map((t) => t.id));
    const loads = data.loads.filter((l) => !!l.tripId && tripIds.has(l.tripId));
    const jobIds = new Set(loads.map((l) => l.jobId));
    const out = emptyOpsData();
    out.trips = trips;
    out.loads = loads;
    out.jobs = data.jobs.filter((j) => jobIds.has(j.id));
    out.deliveries = data.deliveries.filter((d) => tripIds.has(d.tripId));
    out.customers = data.customers;
    out.fuelLogs = data.fuelLogs.filter((f) => f.driverId === subjectRef);
    out.notifications = data.notifications.filter((n) => n.roles.includes('driver'));
    return out;
  }
  if (role === Role.CUSTOMER) {
    const mine = <T extends { customerId?: string }>(rows: T[]) =>
      rows.filter((r) => !!subjectRef && r.customerId === subjectRef);
    const out = emptyOpsData();
    out.customers = data.customers.filter((c) => c.id === subjectRef);
    out.jobs = mine(data.jobs);
    out.deliveries = mine(data.deliveries);
    out.orders = mine(data.orders);
    out.salesPayments = mine(data.salesPayments);
    out.standingOrders = mine(data.standingOrders);
    out.quoteRequests = mine(data.quoteRequests);
    return out;
  }
  return data;
}

/** Customers get the business's contact details only; staff get the full profile. */
export function projectProfile(
  profile: TenantProfile,
  role: Role,
  subjectRef: string | null,
): TenantProfile {
  if (role !== Role.CUSTOMER) return profile;
  return {
    company: profile.company,
    staff: profile.staff.filter((s) => s.role === 'dispatcher' || s.role === 'sales'),
    helpers: [],
    trucks: [],
    drivers: [],
    lifetimeBaseline: {},
    salesLifetimeBaseline:
      subjectRef && subjectRef in profile.salesLifetimeBaseline
        ? { [subjectRef]: profile.salesLifetimeBaseline[subjectRef] }
        : {},
  };
}
