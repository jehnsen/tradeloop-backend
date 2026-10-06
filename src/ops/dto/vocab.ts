/**
 * Allowed values for the ops DTOs. Each list is checked against its domain union at compile time:
 * adding a value to the union without listing it here fails the build.
 */
import { AREAS } from '../domain/data/areas';
import type {
  AreaId,
  AvailableLoadStatus,
  CapacityStatus,
  CargoCategory,
  CustomerType,
  DeliveryIssueType,
  ExpenseCategory,
  Fulfillment,
  JobSource,
  LeadSource,
  LeadStage,
  Leg,
  LoadBoardSource,
  LoadType,
  MaintenanceStatus,
  MaintenanceType,
  ManualTripStatus,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentTerms,
  POStatus,
  QuoteStatus,
  RequiredTruckType,
  SalesPaymentMethod,
  TruckRequirement,
  TruckType,
  Weekday,
} from '../domain/types';

/** Lists every member of the union `T` exactly as a readonly tuple, or fails to compile. */
const all =
  <T extends string>() =>
  <const A extends readonly T[]>(
    values: A & ([Exclude<T, A[number]>] extends [never] ? unknown : never),
  ) =>
    values;

export const AREA_IDS = AREAS.map((a) => a.id) as AreaId[];
export const CUSTOMER_TYPES = all<CustomerType>()([
  'Palengke Vendor',
  'Restaurant',
  'Hotel',
  'Resort',
  'Seafood Dealer',
  'Distributor',
  'Retailer',
  'Grocery',
  'Catering Company',
  'Agri Trader',
  'Cooperative',
  'General Merchandise',
]);
export const PAYMENT_TERMS = all<PaymentTerms>()([
  'COD',
  'Credit 7 Days',
  'Credit 15 Days',
  'Credit 30 Days',
  '50% Down, Balance on Arrival',
]);
export const LEAD_SOURCES = all<LeadSource>()([
  'Facebook Marketplace',
  'Facebook Group',
  'Facebook Page',
  'Messenger',
  'Referral',
  'Walk-in',
  'Existing Customer Referral',
  'Backhaul Marketplace',
]);
export const FULFILLMENTS = all<Fulfillment>()(['truck', 'pickup', 'partner']);
export const LEAD_STAGES = all<LeadStage>()([
  'New',
  'Contacted',
  'Quoted',
  'Sample Order',
  'Negotiating',
  'Won',
  'Lost',
]);
export const CARGO_CATEGORIES = all<CargoCategory>()([
  'Seafood',
  'Shellfish',
  'Produce',
  'Dry Goods',
  'General Cargo',
]);
export const TRUCK_REQUIREMENTS = all<TruckRequirement>()([
  'Shared van (LTL)',
  'Full truck — 10-wheeler',
  'Insulated van, iced cargo',
]);
export const QUOTE_STATUSES = all<QuoteStatus>()([
  'Draft',
  'Sent',
  'Accepted',
  'Rejected',
  'Expired',
]);
/** Job statuses set by hand before dispatch; the rest follow trips and deliveries. */
export const MANUAL_JOB_STATUSES = ['Quoted', 'Confirmed', 'Awaiting Dispatch'] as const;
export const NEW_JOB_STATUSES = ['Inquiry', 'Confirmed', 'Awaiting Dispatch'] as const;
export const JOB_SOURCES = all<JobSource>()([
  'Phone',
  'Messenger',
  'Facebook',
  'Sales Staff',
  'Repeat Customer',
  'Referral',
  'Customer Portal',
  'Load Board',
  'Backhaul Marketplace',
]);
/** Sources set only by the system (board bookings, marketplace confirmations). */
export const MANUAL_JOB_SOURCES = JOB_SOURCES.filter(
  (s) => s !== 'Load Board' && s !== 'Backhaul Marketplace',
);
export const LEGS = all<Leg>()(['outbound', 'return']);
export const LOAD_TYPES = all<LoadType>()(['Outbound', 'Backhaul', 'Third-Party', 'Company-Owned']);
export const MANUAL_TRIP_STATUSES = all<ManualTripStatus>()([
  'Loading',
  'Ready',
  'Dispatched',
  'Cancelled',
]);
export const DELIVERY_ISSUE_TYPES = all<DeliveryIssueType>()([
  'Damaged Cargo',
  'Short Quantity',
  'Late Arrival',
  'Consignee Unavailable',
  'Rejected by Consignee',
  'Road / Access Problem',
  'Vehicle Problem',
  'Other',
]);
export const PAYMENT_METHODS = all<PaymentMethod>()([
  'Cash',
  'Bank Transfer',
  'GCash',
  'Maya',
  'Check',
  'COD',
]);
export const EXPENSE_CATEGORIES = all<ExpenseCategory>()([
  'Diesel',
  'Toll',
  'Driver Allowance',
  'Helper Allowance',
  'Meals',
  'Parking',
  'Loading Fee',
  'Unloading Fee',
  'Port Fee',
  'Repair',
  'Other',
]);
export const MAINTENANCE_TYPES = all<MaintenanceType>()([
  'Preventive Maintenance',
  'Oil Change',
  'Tire Replacement',
  'Brake Service',
  'Engine Repair',
  'Electrical',
  'Aircon',
  'Body Repair',
  'Other',
]);
export const MAINTENANCE_STATUSES = all<MaintenanceStatus>()([
  'Scheduled',
  'In Progress',
  'Completed',
  'Cancelled',
]);
export const BOARD_SOURCES = all<LoadBoardSource>()([
  'Messenger GC',
  'Viber GC',
  'Facebook Group',
  'Facebook Post',
  'Direct Contact',
  'Existing Customer',
  'Internal',
]);
export const TRUCK_TYPES = all<TruckType>()([
  '10-Wheeler Closed Van',
  '10-Wheeler Wing Van',
  '6-Wheeler Closed Van',
  '6-Wheeler Reefer Van',
  '4-Wheeler Closed Van',
]);
export const REQUIRED_TRUCK_TYPES = all<RequiredTruckType>()([
  'Any Truck',
  'Any Closed Van',
  ...TRUCK_TYPES,
]);
export const BOARD_LOAD_STATUSES = all<AvailableLoadStatus>()([
  'Looking for Truck',
  'Matching',
  'Reserved',
  'Booked',
  'Expired',
  'Cancelled',
]);
export const CAPACITY_STATUSES = all<CapacityStatus>()([
  'Open',
  'Partially Filled',
  'Full',
  'Departed',
  'Expired',
  'Cancelled',
]);
export const LISTING_STATUSES = ['Published', 'Paused', 'Closed'] as const;
export const ORDER_SOURCES = all<OrderSource>()([
  'Customer Portal',
  'Facebook Messenger',
  'Phone',
  'Facebook Lead',
  'Salesperson',
  'Repeat Order',
]);
export const ORDER_STATUSES = all<OrderStatus>()([
  'Draft',
  'Pending Confirmation',
  'Confirmed',
  'Preparing',
  'Ready for Dispatch',
  'Out for Delivery',
  'Delivered',
  'Partially Delivered',
  'Cancelled',
]);
export const NEW_ORDER_STATUSES = ['Draft', 'Pending Confirmation', 'Confirmed'] as const;
export const SALES_PAYMENT_METHODS = all<SalesPaymentMethod>()([
  'Cash',
  'GCash',
  'Maya',
  'Bank Transfer',
  'Check',
  'COD',
  'Credit Settlement',
]);
export const PO_STATUSES = all<POStatus>()([
  'Draft',
  'Sent',
  'Confirmed',
  'Ready for Pickup',
  'Picked Up',
  'Partially Received',
  'Received',
  'Cancelled',
]);
export const WEEKDAYS = all<Weekday>()([
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]);
export const STANDING_ORDER_STATUSES = ['active', 'paused', 'cancelled'] as const;

/** "YYYY-MM-DD" */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** "YYYY-MM-DDTHH:mm" (local Philippine time) */
export const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
/** Readable record ids: JOB-260925-009, CUS-022, TRIP-260925-01-S03… */
export const RECORD_ID_RE = /^[A-Z]{1,5}-[A-Z0-9-]{1,32}$/;
