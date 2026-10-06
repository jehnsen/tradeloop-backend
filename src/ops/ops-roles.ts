import { Role } from '../common/enums';
import type { Role as AppRole } from './domain/types';

/** The app's role vocabulary (nav, notifications, history attribution) for each membership role. */
export const APP_ROLE: Record<Role, AppRole> = {
  [Role.OWNER]: 'owner',
  [Role.ADMIN]: 'owner',
  [Role.VIEWER]: 'owner',
  [Role.PLATFORM_ADMIN]: 'owner',
  [Role.OPERATIONS_MANAGER]: 'dispatcher',
  [Role.DISPATCHER]: 'dispatcher',
  [Role.DRIVER_MANAGER]: 'dispatcher',
  [Role.DRIVER]: 'driver',
  [Role.FINANCE]: 'accounting',
  [Role.SALES]: 'sales',
  [Role.WAREHOUSE]: 'warehouse',
  [Role.PROCUREMENT]: 'procurement',
  [Role.CUSTOMER]: 'customer',
};

const MANAGERS = [Role.OWNER, Role.ADMIN, Role.OPERATIONS_MANAGER];

/** Who may run which ops commands. VIEWER sees everything and changes nothing. */
export const OpsRoles = {
  /** Every office desk (notifications, read-only lookups). */
  STAFF: [
    ...MANAGERS,
    Role.DISPATCHER,
    Role.DRIVER_MANAGER,
    Role.FINANCE,
    Role.SALES,
    Role.WAREHOUSE,
    Role.PROCUREMENT,
    Role.DRIVER,
  ],
  /** Leads, quotes, customers and bookings. */
  SALES: [...MANAGERS, Role.SALES, Role.DISPATCHER],
  /** Trips, dispatch, the Load Board and backhaul listings. */
  DISPATCH: [...MANAGERS, Role.DISPATCHER, Role.DRIVER_MANAGER],
  /** Stop, delivery and POD updates from the road. Drivers act on their own trips only. */
  FIELD: [...MANAGERS, Role.DISPATCHER, Role.DRIVER_MANAGER, Role.DRIVER],
  /** Collections. */
  FINANCE: [Role.OWNER, Role.ADMIN, Role.FINANCE],
  /** Trip expenses are logged by dispatch and accounting. */
  EXPENSES: [...MANAGERS, Role.DISPATCHER, Role.DRIVER_MANAGER, Role.FINANCE],
  /** Maintenance and vehicle documents. */
  FLEET: [...MANAGERS, Role.DISPATCHER, Role.DRIVER_MANAGER],
  /** Trading preview: sales orders, procurement and stock. */
  TRADING: [...MANAGERS, Role.SALES, Role.PROCUREMENT, Role.WAREHOUSE, Role.FINANCE],
  /** Trading preview actions a customer takes on the portal (for their own account only). */
  PORTAL: [...MANAGERS, Role.SALES, Role.CUSTOMER],
  /** Demo data reset. */
  OWNER: [Role.OWNER, Role.ADMIN],
} as const satisfies Record<string, readonly Role[]>;
