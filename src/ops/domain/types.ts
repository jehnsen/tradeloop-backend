// GENERATED from trade-route-frontend/types/index.ts by scripts/sync-domain.mjs. Do not edit here:
// change the frontend file and run `npm run domain:sync`.
// TradeLoop domain types. Dates are stored as local ISO strings:
// "YYYY-MM-DD" for dates and "YYYY-MM-DDTHH:mm" for date-times.
//
// Phase 1 is a logistics operations system: Quote → Job → Load → Trip → Delivery → POD →
// Invoice → Payment, plus fleet records. The product-trading types (Order, PurchaseOrder,
// InventoryBatch, SalesInvoice…) back the secondary "Trading" module and are independent
// of trips and cargo.

export type ISODate = string;
export type ISODateTime = string;

// ─── Roles ──────────────────────────────────────────────────────────────────
export type Role =
  | "owner"
  | "sales"
  | "dispatcher"
  | "procurement"
  | "warehouse"
  | "accounting"
  | "driver"
  | "customer";

// ─── Geography ──────────────────────────────────────────────────────────────
export type Region = "Quezon Province" | "Metro Manila" | "Cavite" | "Laguna" | "Batangas" | "Visayas" | "Mindanao";

export type AreaId =
  | "lucena"
  | "sariaya"
  | "tayabas"
  | "pagbilao"
  | "candelaria"
  | "navotas"
  | "valenzuela"
  | "caloocan"
  | "quezon-city"
  | "manila"
  | "pasay"
  | "paranaque"
  | "las-pinas"
  | "bacoor"
  | "imus"
  | "dasmarinas"
  | "general-trias"
  | "calamba"
  | "santa-rosa"
  | "batangas-city"
  | "cebu"
  | "iloilo"
  | "bacolod"
  | "davao"
  | "cagayan-de-oro"
  | "general-santos";

export interface Area {
  id: AreaId;
  name: string;
  province: string;
  region: Region;
  /** Road distance from the Lucena Main Warehouse, one way. 0 for inter-island. */
  distanceKm: number;
  /** Typical drive time from Lucena in minutes (early-morning traffic). */
  driveMinutes: number;
  interIsland?: boolean;
}

export interface Address {
  line1: string;
  barangay: string;
  city: string;
  province: string;
  areaId: AreaId;
  landmark?: string;
}

/** A pickup, drop-off or stop location. */
export interface Place {
  name: string;
  areaId: AreaId;
  address?: string;
}

// ─── People ─────────────────────────────────────────────────────────────────
export interface StaffMember {
  id: string;
  name: string;
  role: Role;
  title: string;
  phone: string;
  initials: string;
}

// ─── Customers ──────────────────────────────────────────────────────────────
export type CustomerType =
  | "Palengke Vendor"
  | "Restaurant"
  | "Hotel"
  | "Resort"
  | "Seafood Dealer"
  | "Distributor"
  | "Retailer"
  | "Grocery"
  | "Catering Company"
  | "Agri Trader"
  | "Cooperative"
  | "General Merchandise";

export type PaymentTerms = "COD" | "Credit 7 Days" | "Credit 15 Days" | "Credit 30 Days" | "50% Down, Balance on Arrival";
export type CustomerStatus = "active" | "new" | "on-hold" | "inactive";
export type LeadSource =
  | "Facebook Marketplace"
  | "Facebook Group"
  | "Facebook Page"
  | "Messenger"
  | "Referral"
  | "Walk-in"
  | "Existing Customer Referral"
  | "Backhaul Marketplace";
export type Fulfillment = "truck" | "pickup" | "partner";
export type PaymentBehavior = "prompt" | "average" | "slow" | "delinquent";

export interface ContactPerson {
  name: string;
  position: string;
  phone: string;
  email?: string;
  primary?: boolean;
}

export interface DeliveryAddress extends Address {
  id: string;
  label: string;
  receivingHours: string;
  default?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  type: CustomerType;
  areaId: AreaId;
  contacts: ContactPerson[];
  addresses: DeliveryAddress[];
  paymentTerms: PaymentTerms;
  creditLimit: number;
  salespersonId: string;
  leadSource: LeadSource;
  customerSince: ISODate;
  /** Trading module: products usually bought. Logistics customers leave this empty. */
  preferredProductIds: string[];
  fulfillment: Fulfillment;
  status: CustomerStatus;
  notes: string;
  deliveryFee: number;
  /** Used by the demo data generators to shape payment history. */
  paymentBehavior: PaymentBehavior;
  /** Relative booking frequency weight for the generators (1–10). */
  frequency: number;
  tin?: string;
}

// ─── Fleet ──────────────────────────────────────────────────────────────────
export type TruckStatus = "Available" | "Assigned" | "Loading" | "On Trip" | "Maintenance" | "Out of Service";

export interface Truck {
  id: string;
  code: string;
  name: string;
  make: string;
  model: string;
  vehicleType: string;
  body: string;
  plateNo: string;
  year: number;
  /** Configured operational payload used for load planning (not a manufacturer rating). */
  capacityKg: number;
  cargoVolumeCbm: number;
  /** Last recorded odometer reading (trip start/end or fuel log). */
  mileageKm: number;
  /** Planning figure used to estimate diesel before a fill-up is logged. */
  fuelEfficiencyKmPerL: number;
  primaryDriverId: string;
  /** Set when the owner parks the truck (major repair, franchise issue). */
  outOfService?: boolean;
  color: string;
}

export interface DriverUnavailability {
  from: ISODate;
  to: ISODate;
  reason: string;
}

export interface Driver {
  id: string;
  name: string;
  initials: string;
  phone: string;
  /** Fictional, masked license number. */
  licenseNo: string;
  licenseExpiry: ISODate;
  licenseRestrictions: string;
  assignedTruckId: string;
  hiredDate: ISODate;
  address: string;
  emergencyContact: string;
  unavailable: DriverUnavailability[];
}

export interface Helper {
  id: string;
  name: string;
  phone: string;
}

export type MaintenanceType =
  | "Preventive Maintenance"
  | "Oil Change"
  | "Tire Replacement"
  | "Brake Service"
  | "Engine Repair"
  | "Electrical"
  | "Aircon"
  | "Body Repair"
  | "Other";
export type MaintenanceStatus = "Scheduled" | "In Progress" | "Completed" | "Cancelled";

export interface MaintenanceRecord {
  id: string;
  truckId: string;
  type: MaintenanceType;
  /** Odometer at service (or planned odometer for scheduled work). */
  odometerKm: number;
  date: ISODate;
  vendor: string;
  cost: number;
  notes: string;
  nextServiceDate?: ISODate;
  nextServiceKm?: number;
  status: MaintenanceStatus;
  downtimeHours?: number;
}

export interface FuelLog {
  id: string;
  truckId: string;
  tripId?: string;
  driverId: string;
  date: ISODateTime;
  odometerKm: number;
  liters: number;
  pricePerLiter: number;
  totalCost: number;
  station: string;
  areaId: AreaId;
  /** Full-tank fill-ups allow a full-to-full fuel efficiency calculation. */
  fullTank: boolean;
  receiptRef?: string;
}

export type VehicleDocumentType =
  | "OR/CR"
  | "LTO Registration"
  | "Comprehensive Insurance"
  | "CTPL Insurance"
  | "Emission Test"
  | "LTFRB Franchise (CPC)"
  | "Fish Port Gate Pass"
  | "Driver's License"
  | "NBI Clearance"
  | "Drug Test";

export interface VehicleDocument {
  id: string;
  type: VehicleDocumentType;
  truckId?: string;
  driverId?: string;
  /** Fictional reference, masked where it would be sensitive. */
  reference: string;
  issuer: string;
  issueDate: ISODate;
  expiryDate: ISODate;
  attachment?: string;
  notes?: string;
}

// ─── Sales & CRM ────────────────────────────────────────────────────────────
export type LeadStage = "New" | "Contacted" | "Quoted" | "Sample Order" | "Negotiating" | "Won" | "Lost";

export interface LeadActivity {
  at: ISODateTime;
  note: string;
  by: string;
}

export interface Lead {
  id: string;
  businessName: string;
  contactName: string;
  phone: string;
  source: LeadSource;
  location: string;
  areaId?: AreaId;
  businessType: CustomerType;
  /** What they need hauled, e.g. "Sugpo & tahong, iced". */
  cargoInterest: string;
  /** Typical lane, e.g. "Lucena → Imus". */
  lane: string;
  potentialVolume: string;
  /** Estimated monthly freight revenue. */
  potentialMonthlyValue: number;
  stage: LeadStage;
  ownerId: string;
  createdAt: ISODate;
  lastContactAt: ISODate;
  nextStep?: string;
  lostReason?: string;
  convertedCustomerId?: string;
  activities: LeadActivity[];
}

export type CargoCategory = "Seafood" | "Shellfish" | "Produce" | "Dry Goods" | "General Cargo";
export type TruckRequirement = "Shared van (LTL)" | "Full truck — 10-wheeler" | "Insulated van, iced cargo";

export interface Charge {
  label: string;
  amount: number;
}

export type QuoteStatus = "Draft" | "Sent" | "Accepted" | "Rejected" | "Expired";

export interface FreightQuote {
  id: string;
  customerId?: string;
  leadId?: string;
  pickup: Place;
  dropoff: Place;
  cargoDescription: string;
  cargoCategory: CargoCategory;
  weightKg: number;
  volumeCbm?: number;
  truckRequirement: TruckRequirement;
  pickupDate: ISODate;
  requiredDate: ISODate;
  freightCharge: number;
  additionalCharges: Charge[];
  notes?: string;
  validUntil: ISODate;
  status: QuoteStatus;
  createdAt: ISODateTime;
  createdBy: string;
  sentAt?: ISODateTime;
  respondedAt?: ISODateTime;
  rejectReason?: string;
  jobId?: string;
}

// ─── Logistics jobs & cargo ─────────────────────────────────────────────────
export type JobStatus =
  | "Inquiry"
  | "Quoted"
  | "Confirmed"
  | "Awaiting Dispatch"
  | "Assigned"
  | "In Transit"
  | "Delivered"
  | "Completed"
  | "Cancelled";

export type JobSource = "Phone" | "Messenger" | "Facebook" | "Sales Staff" | "Repeat Customer" | "Referral" | "Customer Portal" | "Load Board" | "Backhaul Marketplace";

/** Outbound = leaves Lucena; Return = hauled on a return (backhaul) leg toward Quezon. */
export type Leg = "outbound" | "return";

export interface JobEvent {
  at: ISODateTime;
  label: string;
  by: string;
  note?: string;
}

export interface LogisticsJob {
  id: string;
  customerId: string;
  source: JobSource;
  quoteId?: string;
  leg: Leg;
  pickup: Place;
  dropoff: Place;
  /** Receiving contact at drop-off (may differ from the booking customer). */
  consignee: { name: string; phone: string };
  cargoDescription: string;
  cargoCategory: CargoCategory;
  weightKg: number;
  volumeCbm?: number;
  truckRequirement: TruckRequirement;
  pickupAt: ISODateTime;
  requiredBy: ISODateTime;
  freightCharge: number;
  additionalCharges: Charge[];
  paymentTerms: PaymentTerms;
  status: JobStatus;
  tripId?: string;
  salespersonId: string;
  instructions?: string;
  notes?: string;
  createdAt: ISODateTime;
  /** When the consignee received the cargo (POD). Drives invoice issue date. */
  deliveredAt?: ISODateTime;
  history: JobEvent[];
  cancelReason?: string;
}

export type LoadType = "Outbound" | "Backhaul" | "Third-Party" | "Company-Owned";
export type LoadStatus = "Pending" | "Assigned" | "Loaded" | "In Transit" | "Delivered" | "Cancelled";

export interface Load {
  id: string;
  jobId?: string;
  /** Booking customer; empty for company-owned cargo. */
  customerId?: string;
  type: LoadType;
  leg: Leg;
  cargoDescription: string;
  cargoCategory: CargoCategory;
  quantity: number;
  unit: string;
  weightKg: number;
  pickup: Place;
  destination: Place;
  tripId?: string;
  status: LoadStatus;
  handlingNotes?: string;
  /** Company-owned cargo only: purchase value, for backhaul value reporting (not freight revenue). */
  estimatedValue?: number;
  createdAt: ISODateTime;
}

// ─── Trips ──────────────────────────────────────────────────────────────────
export type TripStatus = "Planned" | "Loading" | "Ready" | "Dispatched" | "In Transit" | "Returning" | "Completed" | "Cancelled";

export interface RouteTemplate {
  id: string;
  name: string;
  outboundAreas: AreaId[];
  returnAreas: AreaId[];
  roundTripKm: number;
  tollFee: number;
  departure: string;
  expectedReturn: string;
}

export type StopType = "Pickup" | "Delivery" | "Backhaul Pickup" | "Fuel" | "Port" | "Warehouse" | "Other";
export type StopStatus = "Pending" | "Arrived" | "Completed" | "Skipped";

export interface TripStop {
  id: string;
  seq: number;
  type: StopType;
  location: Place;
  customerId?: string;
  contactName?: string;
  contactPhone?: string;
  plannedArrival: ISODateTime;
  actualArrival?: ISODateTime;
  plannedDeparture: ISODateTime;
  actualDeparture?: ISODateTime;
  loaded: string[];
  unloaded: string[];
  status: StopStatus;
  notes?: string;
}

export interface TripEvent {
  at: ISODateTime;
  label: string;
  by: string;
  note?: string;
}

export interface Trip {
  id: string;
  date: ISODate;
  truckId: string;
  driverId: string;
  helperIds: string[];
  routeId: string;
  status: TripStatus;
  departure: ISODateTime;
  actualDeparture?: ISODateTime;
  expectedReturn: ISODateTime;
  actualReturn?: ISODateTime;
  odometerStart?: number;
  odometerEnd?: number;
  stops: TripStop[];
  notes?: string;
  history: TripEvent[];
}

// ─── Deliveries ─────────────────────────────────────────────────────────────
export type DeliveryStatus = "Scheduled" | "Loading" | "Ready" | "In Transit" | "Arrived" | "Delivered" | "Failed" | "Returned";

export interface ProofOfDelivery {
  receivedBy: string;
  signedAt: ISODateTime;
  /** Delivery receipt number written on the DR. */
  receiptNo: string;
  signatureCaptured: boolean;
  photoCount: number;
  driverNotes?: string;
  customerRemarks?: string;
  shortKg?: number;
  damagedKg?: number;
}

export type DeliveryIssueType = "Damaged Cargo" | "Short Quantity" | "Late Arrival" | "Consignee Unavailable" | "Rejected by Consignee" | "Road / Access Problem" | "Vehicle Problem" | "Other";

export interface DeliveryIssue {
  type: DeliveryIssueType;
  note: string;
  reportedAt: ISODateTime;
  reportedBy: string;
}

export interface Delivery {
  id: string;
  jobId: string;
  tripId: string;
  customerId: string;
  loadIds: string[];
  status: DeliveryStatus;
  eta: ISODateTime;
  arrivedAt?: ISODateTime;
  completedAt?: ISODateTime;
  pod?: ProofOfDelivery;
  issues: DeliveryIssue[];
  failureReason?: string;
}

// ─── Load board ─────────────────────────────────────────────────────────────
// Freight and truck-space posts picked up from Messenger/Viber GCs, Facebook and direct
// contacts. The board structures them and matches them against our trips; it does not
// replace those channels. Booking a post onto our truck turns it into a Job + Load.

export type LoadBoardSource = "Messenger GC" | "Viber GC" | "Facebook Group" | "Facebook Post" | "Direct Contact" | "Existing Customer" | "Internal";
export type TruckType = "10-Wheeler Closed Van" | "10-Wheeler Wing Van" | "6-Wheeler Closed Van" | "6-Wheeler Reefer Van" | "4-Wheeler Closed Van";
export type RequiredTruckType = TruckType | "Any Closed Van" | "Any Truck";

export type AvailableLoadStatus = "Looking for Truck" | "Matching" | "Reserved" | "Booked" | "Expired" | "Cancelled";
export type CapacityStatus = "Open" | "Partially Filled" | "Full" | "Departed" | "Expired" | "Cancelled";

export interface BoardContact {
  name: string;
  phone: string;
}

/** Trucking business outside our fleet that posts loads or truck space in the GCs. */
export interface TruckingPartner {
  id: string;
  name: string;
  contact: BoardContact;
  truckTypes: TruckType[];
  channel: LoadBoardSource;
  /** GC or group where they usually post, e.g. "Quezon–NCR Trucking GC". */
  channelName?: string;
  typicalRoutes: string[];
  notes?: string;
  since: ISODate;
}

interface BoardPostBase {
  id: string;
  source: LoadBoardSource;
  /** GC / group name or post note, as the coordinator recorded it. */
  sourceReference?: string;
  contact: BoardContact;
  partnerId?: string;
  notes?: string;
  createdAt: ISODateTime;
  postedBy: string;
  closedReason?: string;
}

/** Cargo that needs a truck. */
export interface AvailableLoad extends BoardPostBase {
  customerId?: string;
  pickup: Place;
  destination: Place;
  cargoDescription: string;
  cargoCategory: CargoCategory;
  weightKg: number;
  truckType: RequiredTruckType;
  pickupAt: ISODateTime;
  deliveryBy?: ISODateTime;
  offeredFreight?: number;
  specialHandling?: string;
  /** Recorded status. Once a job exists, Reserved / Booked / Cancelled follow the job. */
  status: AvailableLoadStatus;
  jobId?: string;
  capacityId?: string;
  bookedAt?: ISODateTime;
}

interface CapacityBase extends BoardPostBase {
  /** Empty = accepts any cargo category. */
  acceptedCargo: CargoCategory[];
  restrictions?: string;
  /** Recorded status. Open / Partially Filled / Full / Departed are derived unless closed. */
  status: CapacityStatus;
}

/** Space on one of our trips. Capacity figures always come from the trip's loads. */
export interface InternalCapacity extends CapacityBase {
  fleet: "internal";
  tripId: string;
  leg: Leg;
}

/** Space on a partner's truck, as they posted it. */
export interface ExternalCapacity extends CapacityBase {
  fleet: "external";
  truckType: TruckType;
  currentLocation: Place;
  destination: Place;
  plannedRoute: AreaId[];
  totalCapacityKg: number;
  usedCapacityKg: number;
  departureAt: ISODateTime;
}

export type AvailableCapacity = InternalCapacity | ExternalCapacity;

// ─── Backhaul marketplace (preview) ─────────────────────────────────────────
// Our own return legs published for outside traders and shippers. Shippers get an instant
// quote and request space; dispatch confirms each request, which then becomes a Job + Load on
// the trip. Open space is always read from the trip — never stored on the listing.

export type BackhaulListingStatus = "Published" | "Paused" | "Full" | "Departed" | "Closed";

/** One listing per trip's return leg. */
export interface BackhaulListing {
  id: string;
  tripId: string;
  /** Rate offered to shippers on this leg, gross kg. */
  ratePerKg: number;
  minimumCharge: number;
  /** Empty = accepts any cargo category. */
  acceptedCargo: CargoCategory[];
  restrictions?: string;
  /** Recorded status. Full / Departed are derived from the trip. */
  status: Extract<BackhaulListingStatus, "Published" | "Paused" | "Closed">;
  publishedAt: ISODateTime;
  publishedBy: string;
}

export type BackhaulRequestStatus = "Requested" | "Confirmed" | "Declined" | "Cancelled" | "Expired";

/** A shipper asking for space on a listed return leg. */
export interface BackhaulBookingRequest {
  id: string;
  listingId: string;
  /** Set when the shipper is (or becomes) one of our customers. */
  customerId?: string;
  shipper: { businessName: string; contactName: string; phone: string };
  /** Receiving contact at drop-off; the shipper's contact when empty. */
  consignee?: { name: string; phone: string };
  pickup: Place;
  dropoff: Place;
  cargoDescription: string;
  cargoCategory: CargoCategory;
  quantity: number;
  unit: string;
  weightKg: number;
  /** When the cargo is ready for pickup. */
  readyAt: ISODateTime;
  /** Instant quote shown to the shipper when they asked. */
  quotedFreight: number;
  notes?: string;
  /** Recorded status. Cancelled follows the job; Expired is derived once the leg departs. */
  status: Extract<BackhaulRequestStatus, "Requested" | "Confirmed" | "Declined">;
  createdAt: ISODateTime;
  respondedAt?: ISODateTime;
  respondedBy?: string;
  declineReason?: string;
  jobId?: string;
}

/** A listed return leg as outside shippers see it: no trip id, plate, driver or exact truck times. */
export interface ShipperListing {
  listingId: string;
  date: ISODate;
  vehicleType: string;
  body: string;
  /** Generic name used in fit-check messages ("our truck"). */
  truckLabel: string;
  /** Times are the start of the hour; shippers see two-hour windows. */
  leg: { origin: Place; destination: Place; routeAreas: AreaId[]; areaEta: Partial<Record<AreaId, ISODateTime>>; departureAt: ISODateTime; arrivalAt: ISODateTime };
  pickupAreas: AreaId[];
  openKg: number;
  accepting: boolean;
  listing: Pick<BackhaulListing, "ratePerKg" | "minimumCharge" | "acceptedCargo" | "restrictions">;
}

/** A shipper's own request as they see it when they check its status. */
export interface ShipperRequestView {
  id: string;
  status: BackhaulRequestStatus;
  declineReason?: string;
  cargoDescription: string;
  quantity: number;
  unit: string;
  weightKg: number;
  pickup: Place;
  dropoff: Place;
  quotedFreight: number;
  tripDate?: ISODate;
  /** Start of the two-hour pickup window. */
  pickupWindowAt?: ISODateTime;
  bookingRef?: string;
  bookingStatus?: JobStatus;
}

/** The public Return trips page: the operator's contact details and open return legs. */
export interface PublicBackhaulBoard {
  profile: PublicTenantProfile;
  listings: ShipperListing[];
}

/** A shipper's request from the public page (customer links are set by dispatch, never by shippers). */
export type ShipperRequestInput = Omit<NewBackhaulRequestInput, "customerId">;

// ─── Finance (freight billing) ──────────────────────────────────────────────
export type PaymentMethod = "Cash" | "Bank Transfer" | "GCash" | "Maya" | "Check" | "COD";

export interface Payment {
  id: string;
  receiptNo: string;
  customerId: string;
  invoiceId: string;
  jobId: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  date: ISODateTime;
  recordedBy: string;
  notes?: string;
}

/** Freight billing — one invoice per delivered job. Derived from jobs + payments. */
export interface Invoice {
  id: string;
  jobId: string;
  customerId: string;
  tripId?: string;
  issueDate: ISODate;
  dueDate: ISODate;
  total: number;
  paid: number;
  balance: number;
  daysOverdue: number;
  status: "Paid" | "Current" | "Overdue" | "Partial";
}

export type PaymentStatus = "Unpaid" | "Partial" | "Paid" | "Credit";

export type ExpenseCategory =
  | "Diesel"
  | "Toll"
  | "Driver Allowance"
  | "Helper Allowance"
  | "Meals"
  | "Parking"
  | "Loading Fee"
  | "Unloading Fee"
  | "Port Fee"
  | "Repair"
  | "Other";

export interface Expense {
  id: string;
  date: ISODate;
  category: ExpenseCategory;
  amount: number;
  description: string;
  tripId?: string;
  truckId?: string;
  driverId?: string;
  fuelLogId?: string;
  paidTo: string;
  recordedBy: string;
  receiptRef?: string;
}

// ─── Notifications ──────────────────────────────────────────────────────────
export type NotificationKind = "job" | "trip" | "delivery" | "finance" | "fleet" | "backhaul" | "lead" | "order";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  at: ISODateTime;
  href: string;
  severity: "info" | "success" | "warning" | "critical";
  read: boolean;
  roles: Role[];
}

// ─── Tenant ─────────────────────────────────────────────────────────────────
/** The operator's own business profile, printed on receipts and shown on the portal. */
export interface CompanyProfile {
  name: string;
  shortName: string;
  address: string;
  warehouse: string;
  phone: string;
  mobile: string;
  messenger: string;
  email: string;
  tin: string;
  businessHours: string;
  bankAccountMasked: string;
  gcashMasked: string;
}

/** Per-organization reference data loaded with the session: the business, its people and trucks. */
export interface TenantProfile {
  company: CompanyProfile;
  staff: StaffMember[];
  helpers: Helper[];
  trucks: Truck[];
  drivers: Driver[];
  /** Freight revenue recorded in the paper ledger before go-live, per customer. */
  lifetimeBaseline: Record<string, number>;
  /** Trading module: product sales before go-live, per customer. */
  salesLifetimeBaseline: Record<string, number>;
}

/** What the public pages may know about the operator: the business and its dispatch desk. */
export type PublicTenantProfile = Pick<TenantProfile, "company" | "staff">;

// ─── Operations data & API contract ─────────────────────────────────────────
/** Every operational record of one organization, as the API serves it. */
export interface OpsData {
  customers: Customer[];
  leads: Lead[];
  quotes: FreightQuote[];
  jobs: LogisticsJob[];
  loads: Load[];
  trips: Trip[];
  deliveries: Delivery[];
  payments: Payment[];
  expenses: Expense[];
  fuelLogs: FuelLog[];
  maintenance: MaintenanceRecord[];
  documents: VehicleDocument[];
  notifications: AppNotification[];
  truckingPartners: TruckingPartner[];
  boardLoads: AvailableLoad[];
  boardCapacity: AvailableCapacity[];
  backhaulListings: BackhaulListing[];
  backhaulRequests: BackhaulBookingRequest[];
  orders: Order[];
  purchaseOrders: PurchaseOrder[];
  salesPayments: SalesPayment[];
  inventory: InventoryBatch[];
  standingOrders: StandingOrder[];
  quoteRequests: QuoteRequest[];
}
export type OpsCollection = keyof OpsData;

/** Records added, changed or removed in one collection. Records are replaced whole. */
export interface CollectionChange<T> {
  upsert: T[];
  remove: string[];
  /** Full id order of the collection, sent when records were added or moved. */
  order?: string[];
}
export type OpsChanges = { [K in OpsCollection]?: CollectionChange<OpsData[K][number]> };

/** Who a snapshot was served to. */
export interface OpsViewer {
  name: string;
  role: Role;
  /** The driver (DRV-…) or customer (CUS-…) this login acts as. */
  subjectRef: string | null;
  /** Owners may preview the app as the other desks (the API still applies their own permissions). */
  canViewAs: boolean;
  /** `demo`: a demo organization whose data owners can reset to the seed. */
  organization: { name: string; code: string; demo: boolean };
}

/** GET /ops/snapshot: the organization's data at one version. */
export interface OpsSnapshot {
  viewer: OpsViewer;
  version: number;
  /** The operations clock (demo clock while the seed is anchored to it). */
  now: ISODateTime;
  profile: TenantProfile;
  data: OpsData;
}

/** Response of every ops command: its result plus the records it changed. */
export interface OpsCommandResponse<R = unknown> {
  result: R;
  changes: OpsChanges;
  version: number;
  now: ISODateTime;
}

// ─── Command inputs ─────────────────────────────────────────────────────────
// What the screens send to the ops API. The server fills ids, timestamps and attribution.

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export interface CargoLineInput {
  cargoDescription: string;
  cargoCategory: CargoCategory;
  quantity: number;
  unit: string;
  weightKg: number;
  handlingNotes?: string;
}

export interface NewJobInput {
  customerId: string;
  source: JobSource;
  leg: Leg;
  pickup: Place;
  dropoff: Place;
  consignee: { name: string; phone: string };
  cargo: CargoLineInput[];
  truckRequirement: TruckRequirement;
  pickupAt: ISODateTime;
  requiredBy: ISODateTime;
  freightCharge: number;
  additionalCharges: Charge[];
  paymentTerms: PaymentTerms;
  instructions?: string;
  notes?: string;
  status: "Inquiry" | "Confirmed" | "Awaiting Dispatch";
  quoteId?: string;
  loadType?: LoadType;
}

export interface NewQuoteInput {
  customerId?: string;
  leadId?: string;
  pickup: Place;
  dropoff: Place;
  cargoDescription: string;
  cargoCategory: CargoCategory;
  weightKg: number;
  volumeCbm?: number;
  truckRequirement: TruckRequirement;
  pickupDate: ISODate;
  requiredDate: ISODate;
  freightCharge: number;
  additionalCharges: Charge[];
  notes?: string;
  validUntil: ISODate;
  status: "Draft" | "Sent";
}

export type NewLeadInput = Omit<Lead, "id" | "activities" | "createdAt" | "lastContactAt">;
export type NewCustomerInput = Omit<Customer, "id" | "customerSince" | "status" | "paymentBehavior" | "frequency">;

export interface NewCompanyLoadInput {
  cargoDescription: string;
  cargoCategory: CargoCategory;
  quantity: number;
  unit: string;
  weightKg: number;
  leg: Leg;
  pickup: Place;
  destination: Place;
  estimatedValue?: number;
  handlingNotes?: string;
  tripId?: string;
}

export interface NewTripInput {
  date: ISODate;
  truckId: string;
  driverId: string;
  helperIds: string[];
  routeId: string;
  departure: ISODateTime;
  notes?: string;
}

/** Trip statuses a dispatcher (or driver) sets directly; the rest follow stops and deliveries. */
export type ManualTripStatus = Extract<TripStatus, "Loading" | "Ready" | "Dispatched" | "Cancelled">;

export interface TripCloseInput {
  odometerEnd: number;
  fuel?: { liters: number; pricePerLiter: number; station: string };
}

export type PodInput = Omit<ProofOfDelivery, "signedAt" | "receiptNo"> & { receiptNo?: string };
export type DeliveryIssueInput = Pick<DeliveryIssue, "type" | "note">;

export interface NewPaymentInput {
  invoiceId: string;
  jobId: string;
  customerId: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  notes?: string;
}

export type NewExpenseInput = Omit<Expense, "id" | "recordedBy">;

export interface NewFuelLogInput {
  truckId: string;
  tripId?: string;
  driverId: string;
  date: ISODateTime;
  odometerKm: number;
  liters: number;
  pricePerLiter: number;
  station: string;
  areaId: AreaId;
  fullTank: boolean;
  receiptRef?: string;
}

export type NewMaintenanceInput = Omit<MaintenanceRecord, "id">;
export type MaintenanceUpdateInput = Partial<Pick<MaintenanceRecord, "cost" | "odometerKm" | "date" | "notes">>;
export type DocumentRenewalInput = Pick<VehicleDocument, "reference" | "issueDate" | "expiryDate"> & { attachment?: string };

type BoardManaged = "id" | "createdAt" | "postedBy" | "status" | "closedReason";
export type NewBoardLoadInput = Omit<AvailableLoad, BoardManaged | "jobId" | "capacityId" | "bookedAt">;
export type NewCapacityInput = DistributiveOmit<AvailableCapacity, BoardManaged>;
export type NewPartnerInput = Omit<TruckingPartner, "id" | "since">;

export interface BookBoardLoadInput {
  loadId: string;
  /** Capacity post the load was matched with (our trip or a partner truck). */
  capacityId?: string;
  /** Bill-to customer; when empty a new customer is created from the poster. */
  customerId?: string;
  newCustomerName?: string;
  freightCharge: number;
  paymentTerms: PaymentTerms;
  consignee: { name: string; phone: string };
}

export type PublishListingInput = Pick<BackhaulListing, "tripId" | "ratePerKg" | "minimumCharge" | "acceptedCargo" | "restrictions">;
export type NewBackhaulRequestInput = Omit<BackhaulBookingRequest, "id" | "quotedFreight" | "status" | "createdAt" | "respondedAt" | "respondedBy" | "declineReason" | "jobId">;

export interface ConfirmBackhaulRequestInput {
  requestId: string;
  /** Bill-to customer; when empty a new customer is created from the shipper. */
  customerId?: string;
  freightCharge: number;
  paymentTerms: PaymentTerms;
}

/** Result of booking a board post or confirming a backhaul request. Re-booking never creates a second job. */
export interface BookingResult {
  jobId: string;
  created: boolean;
}

export interface NewOrderInput {
  customerId: string;
  source: OrderSource;
  items: OrderItem[];
  discount: number;
  deliveryFee: number;
  deliveryDate: ISODate;
  paymentTerms: PaymentTerms;
  addressId: string;
  notes?: string;
  status: "Draft" | "Pending Confirmation" | "Confirmed";
  fulfillment?: Fulfillment;
  deliveryWindow?: string;
}
export type OrderEditInput = Pick<Order, "deliveryDate" | "discount" | "deliveryFee" | "notes" | "items">;

export interface NewSalesPaymentInput {
  invoiceId: string;
  orderId: string;
  customerId: string;
  amount: number;
  method: SalesPaymentMethod;
  reference: string;
  notes?: string;
}

export interface NewPOInput {
  supplierId: string;
  items: POItem[];
  pickupDate: ISODate;
  status: "Draft" | "Sent";
  notes?: string;
}

export type StandingOrderInput = Omit<StandingOrder, "id"> & { id?: string };
export type NewQuoteRequestInput = Omit<QuoteRequest, "id" | "status" | "createdAt">;

// ═══ Trading module (Phase 2 preview) ════════════════════════════════════════
// Product sales, procurement and stock. Independent of trips and cargo.

export type ProductCategory = "seafood" | "produce";
export type ProductUnit = "kg" | "pc";
export type ProductStatus = "active" | "low-stock" | "seasonal" | "inactive";
/** Outbound = sourced in Quezon and sold in Manila. Backhaul = bought in Manila/CALABARZON. */
export type ProductFlow = "outbound" | "backhaul";

export interface Product {
  id: string;
  sku: string;
  slug: string;
  name: string;
  localName?: string;
  variant?: string;
  category: ProductCategory;
  subcategory: string;
  unit: ProductUnit;
  /** Weight per unit in kg (1 for kg-based items). */
  unitWeightKg: number;
  /** Multiplier for gross weight: ice, styro boxes, banyera, sacks. */
  loadFactor: number;
  cost: number;
  wholesalePrice: number;
  sellingPrice: number;
  moq: number;
  bulkThreshold: number;
  origin: string;
  flow: ProductFlow;
  grade: string;
  description: string;
  packaging: string[];
  storage: string;
  shelfLifeDays: number;
  status: ProductStatus;
  icon: "shrimp" | "shell" | "fish" | "crab" | "squid" | "onion" | "garlic" | "ginger" | "tomato" | "potato" | "carrot" | "cabbage" | "citrus" | "coconut" | "banana" | "chili" | "sweet-potato";
}

export interface StandingOrderLine {
  productId: string;
  quantity: number;
}

export type Weekday = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday";

export interface StandingOrder {
  id: string;
  customerId: string;
  day: Weekday;
  lines: StandingOrderLine[];
  status: "active" | "paused" | "cancelled";
  startDate: ISODate;
  notes?: string;
}

export type SupplierType = "Seafood Source" | "Farm Supplier" | "Agricultural Trader" | "Wholesale Market" | "Distributor";

export interface Supplier {
  id: string;
  name: string;
  type: SupplierType;
  address: Address;
  /** Where goods are collected (may differ from office address). */
  pickupLocation: string;
  pickupAreaId: AreaId;
  contactPerson: string;
  phone: string;
  productIds: string[];
  paymentTerms: "Cash on Pickup" | "GCash on Pickup" | "Credit 7 Days" | "Credit 15 Days";
  reliability: number;
  /** Extra km off the regular truck route. */
  detourKm: number;
  status: "active" | "preferred" | "inactive";
  since: ISODate;
  notes: string;
}

export interface SupplierQuote {
  id: string;
  supplierId: string;
  productId: string;
  availableQty: number;
  quotedPrice: number;
  quotedAt: ISODateTime;
  validUntil: ISODate;
}

export type OrderSource =
  | "Customer Portal"
  | "Facebook Messenger"
  | "Phone"
  | "Facebook Lead"
  | "Salesperson"
  | "Repeat Order";

export type OrderStatus =
  | "Draft"
  | "Pending Confirmation"
  | "Confirmed"
  | "Preparing"
  | "Ready for Dispatch"
  | "Out for Delivery"
  | "Delivered"
  | "Partially Delivered"
  | "Cancelled";

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  /** Quantity actually delivered (for partial deliveries). */
  deliveredQty?: number;
}

export interface OrderEvent {
  at: ISODateTime;
  label: string;
  by: string;
  note?: string;
}

/** Trading sales order (product sale). Fulfilment runs through a logistics job in the live system. */
export interface Order {
  id: string;
  customerId: string;
  source: OrderSource;
  items: OrderItem[];
  discount: number;
  deliveryFee: number;
  status: OrderStatus;
  paymentTerms: PaymentTerms;
  addressId: string;
  createdAt: ISODateTime;
  deliveryDate: ISODate;
  /** Customer's requested receiving window, e.g. "Before 8:00 AM". */
  deliveryWindow?: string;
  fulfillment: Fulfillment;
  salespersonId: string;
  notes?: string;
  history: OrderEvent[];
  cancelReason?: string;
  /** When goods were received by the customer (or handed to the sea-freight partner). */
  deliveredAt?: ISODateTime;
}

export type POStatus =
  | "Draft"
  | "Sent"
  | "Confirmed"
  | "Ready for Pickup"
  | "Picked Up"
  | "Partially Received"
  | "Received"
  | "Cancelled";

export interface POItem {
  productId: string;
  quantity: number;
  unitCost: number;
  receivedQty?: number;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  items: POItem[];
  status: POStatus;
  createdAt: ISODateTime;
  pickupDate: ISODate;
  pickupLocation: string;
  pickupAreaId: AreaId;
  deliveredBySupplier?: boolean;
  pickupEta?: ISODateTime;
  pickedUpAt?: ISODateTime;
  receivedAt?: ISODateTime;
  createdBy: string;
  notes?: string;
}

export type InventoryLocation =
  | "Lucena Main Warehouse"
  | "Truck 01"
  | "Truck 02"
  | "Temporary Manila Pickup"
  | "Supplier Pickup";

export interface InventoryBatch {
  id: string;
  productId: string;
  location: InventoryLocation;
  source: string;
  supplierId?: string;
  poId?: string;
  receivedAt: ISODateTime;
  onHand: number;
  damaged: number;
  unitCost: number;
  note?: string;
}

export type SalesPaymentMethod = "Cash" | "GCash" | "Maya" | "Bank Transfer" | "Check" | "COD" | "Credit Settlement";

export interface SalesPayment {
  id: string;
  receiptNo: string;
  customerId: string;
  invoiceId: string;
  orderId: string;
  amount: number;
  method: SalesPaymentMethod;
  reference: string;
  date: ISODateTime;
  recordedBy: string;
  notes?: string;
}

export interface SalesInvoice {
  id: string;
  orderId: string;
  customerId: string;
  issueDate: ISODate;
  dueDate: ISODate;
  total: number;
  paid: number;
  balance: number;
  daysOverdue: number;
  status: "Paid" | "Current" | "Overdue" | "Partial";
}

export interface QuoteRequest {
  id: string;
  businessName: string;
  contactName: string;
  phone: string;
  businessType: CustomerType;
  productId: string;
  quantity: number;
  unit: string;
  frequency: string;
  deliveryArea: string;
  preferredDate: ISODate;
  notes?: string;
  status: "Submitted" | "Under Review" | "Quoted" | "Accepted" | "Declined";
  quotedPrice?: number;
  createdAt: ISODateTime;
  customerId?: string;
}

/** Stock position of one product at the Lucena warehouse (derived from batches, orders and POs). */
export interface ProductStock {
  productId: string;
  onHand: number;
  damaged: number;
  reserved: number;
  demand: number;
  available: number;
  incoming: number;
  inTransit: number;
  value: number;
  shortage: number;
}

/** The public storefront: the operator's contact details and product availability. */
export interface PublicStorefront {
  profile: PublicTenantProfile;
  stock: ProductStock[];
}

export interface CartLine {
  productId: string;
  quantity: number;
}
