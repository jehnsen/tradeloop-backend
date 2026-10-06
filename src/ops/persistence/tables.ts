import type { OpsCollection, OpsData } from '../domain/types';

/**
 * Storage layout of the operations records (Postgres schema `ops`, see the OpsSchema migration).
 *
 * Every record is stored whole in `data` (jsonb), the canonical copy the engine works with. The
 * key columns below are extracted from it on every write: they carry the foreign keys between
 * records (deferred, checked at commit) and make the records queryable from SQL.
 */
export type ColumnType = 'text' | 'date' | 'timestamp' | 'numeric' | 'boolean';
type Value = string | number | boolean | null | undefined;

export interface KeyColumn<T> {
  name: string;
  type: ColumnType;
  value: (row: T) => Value;
}

export interface TableSpec<T> {
  table: string;
  columns: KeyColumn<T>[];
}

type Row<K extends OpsCollection> = OpsData[K][number];
const col = <T>(name: string, type: ColumnType, value: (row: T) => Value): KeyColumn<T> => ({
  name,
  type,
  value,
});
/** Date-times are local Philippine time ("YYYY-MM-DDTHH:mm"); dates are "YYYY-MM-DD". */
const day = (v: string | undefined) => (v ? v.slice(0, 10) : null);

export const OPS_TABLES: { [K in OpsCollection]: TableSpec<Row<K>> } = {
  customers: {
    table: 'customers',
    columns: [col('name', 'text', (r) => r.name), col('status', 'text', (r) => r.status)],
  },
  leads: {
    table: 'leads',
    columns: [
      col('stage', 'text', (r) => r.stage),
      col('converted_customer_id', 'text', (r) => r.convertedCustomerId),
    ],
  },
  quotes: {
    table: 'quotes',
    columns: [
      col('status', 'text', (r) => r.status),
      col('customer_id', 'text', (r) => r.customerId),
      col('lead_id', 'text', (r) => r.leadId),
      col('job_id', 'text', (r) => r.jobId),
    ],
  },
  jobs: {
    table: 'jobs',
    columns: [
      col('status', 'text', (r) => r.status),
      col('customer_id', 'text', (r) => r.customerId),
      col('trip_id', 'text', (r) => r.tripId),
      col('quote_id', 'text', (r) => r.quoteId),
      col('leg', 'text', (r) => r.leg),
      col('pickup_at', 'timestamp', (r) => r.pickupAt),
      col('freight_charge', 'numeric', (r) => r.freightCharge),
    ],
  },
  loads: {
    table: 'loads',
    columns: [
      col('status', 'text', (r) => r.status),
      col('job_id', 'text', (r) => r.jobId),
      col('trip_id', 'text', (r) => r.tripId),
      col('customer_id', 'text', (r) => r.customerId),
      col('leg', 'text', (r) => r.leg),
      col('weight_kg', 'numeric', (r) => r.weightKg),
    ],
  },
  trips: {
    table: 'trips',
    columns: [
      col('status', 'text', (r) => r.status),
      col('trip_date', 'date', (r) => r.date),
      col('truck_id', 'text', (r) => r.truckId),
      col('driver_id', 'text', (r) => r.driverId),
      col('route_id', 'text', (r) => r.routeId),
    ],
  },
  deliveries: {
    table: 'deliveries',
    columns: [
      col('status', 'text', (r) => r.status),
      col('job_id', 'text', (r) => r.jobId),
      col('trip_id', 'text', (r) => r.tripId),
      col('customer_id', 'text', (r) => r.customerId),
    ],
  },
  payments: {
    table: 'payments',
    columns: [
      col('job_id', 'text', (r) => r.jobId),
      col('customer_id', 'text', (r) => r.customerId),
      col('invoice_id', 'text', (r) => r.invoiceId),
      col('amount', 'numeric', (r) => r.amount),
      col('paid_at', 'timestamp', (r) => r.date),
    ],
  },
  expenses: {
    table: 'expenses',
    columns: [
      col('category', 'text', (r) => r.category),
      col('amount', 'numeric', (r) => r.amount),
      col('expense_date', 'date', (r) => day(r.date)),
      col('trip_id', 'text', (r) => r.tripId),
      col('truck_id', 'text', (r) => r.truckId),
      col('fuel_log_id', 'text', (r) => r.fuelLogId),
    ],
  },
  fuelLogs: {
    table: 'fuel_logs',
    columns: [
      col('truck_id', 'text', (r) => r.truckId),
      col('trip_id', 'text', (r) => r.tripId),
      col('driver_id', 'text', (r) => r.driverId),
      col('logged_at', 'timestamp', (r) => r.date),
    ],
  },
  maintenance: {
    table: 'maintenance_records',
    columns: [
      col('truck_id', 'text', (r) => r.truckId),
      col('status', 'text', (r) => r.status),
      col('service_date', 'date', (r) => r.date),
    ],
  },
  documents: {
    table: 'vehicle_documents',
    columns: [
      col('truck_id', 'text', (r) => r.truckId),
      col('driver_id', 'text', (r) => r.driverId),
      col('expiry_date', 'date', (r) => r.expiryDate),
    ],
  },
  notifications: {
    table: 'notifications',
    columns: [col('notified_at', 'timestamp', (r) => r.at), col('read', 'boolean', (r) => r.read)],
  },
  truckingPartners: {
    table: 'trucking_partners',
    columns: [col('name', 'text', (r) => r.name)],
  },
  boardLoads: {
    table: 'board_loads',
    columns: [
      col('status', 'text', (r) => r.status),
      col('job_id', 'text', (r) => r.jobId),
      col('capacity_id', 'text', (r) => r.capacityId),
      col('partner_id', 'text', (r) => r.partnerId),
      col('customer_id', 'text', (r) => r.customerId),
    ],
  },
  boardCapacity: {
    table: 'board_capacity',
    columns: [
      col('status', 'text', (r) => r.status),
      col('fleet', 'text', (r) => r.fleet),
      col('trip_id', 'text', (r) => (r.fleet === 'internal' ? r.tripId : null)),
      col('partner_id', 'text', (r) => r.partnerId),
    ],
  },
  backhaulListings: {
    table: 'backhaul_listings',
    columns: [col('trip_id', 'text', (r) => r.tripId), col('status', 'text', (r) => r.status)],
  },
  backhaulRequests: {
    table: 'backhaul_requests',
    columns: [
      col('listing_id', 'text', (r) => r.listingId),
      col('job_id', 'text', (r) => r.jobId),
      col('customer_id', 'text', (r) => r.customerId),
      col('status', 'text', (r) => r.status),
    ],
  },
  orders: {
    table: 'sales_orders',
    columns: [
      col('customer_id', 'text', (r) => r.customerId),
      col('status', 'text', (r) => r.status),
      col('delivery_date', 'date', (r) => r.deliveryDate),
    ],
  },
  purchaseOrders: {
    table: 'purchase_orders',
    columns: [
      col('supplier_id', 'text', (r) => r.supplierId),
      col('status', 'text', (r) => r.status),
    ],
  },
  salesPayments: {
    table: 'sales_payments',
    columns: [
      col('order_id', 'text', (r) => r.orderId),
      col('customer_id', 'text', (r) => r.customerId),
      col('amount', 'numeric', (r) => r.amount),
    ],
  },
  inventory: {
    table: 'inventory_batches',
    columns: [col('product_id', 'text', (r) => r.productId), col('po_id', 'text', (r) => r.poId)],
  },
  standingOrders: {
    table: 'standing_orders',
    columns: [
      col('customer_id', 'text', (r) => r.customerId),
      col('status', 'text', (r) => r.status),
    ],
  },
  quoteRequests: {
    table: 'quote_requests',
    columns: [
      col('customer_id', 'text', (r) => r.customerId),
      col('status', 'text', (r) => r.status),
    ],
  },
};

/** Fleet master data: part of the tenant profile, stored as rows so trips and logs can reference them. */
export const FLEET_TABLES = { trucks: 'trucks', drivers: 'drivers' } as const;

export const SQL_TYPE: Record<ColumnType, string> = {
  text: 'text',
  date: 'date',
  timestamp: 'timestamp',
  numeric: 'numeric',
  boolean: 'boolean',
};
