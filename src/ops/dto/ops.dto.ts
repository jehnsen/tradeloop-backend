/**
 * Request bodies of the ops API. Each class implements the shared command input type from the
 * domain (types/index.ts in the app), so the API contract and the screens cannot drift apart.
 */
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { trim } from '../../common/http/dto';
import type {
  AreaId,
  AvailableLoadStatus,
  BookBoardLoadInput,
  CapacityStatus,
  CargoCategory,
  CargoLineInput,
  Charge,
  ConfirmBackhaulRequestInput,
  ContactPerson,
  CustomerType,
  DeliveryAddress,
  DeliveryIssueType,
  DocumentRenewalInput,
  ExpenseCategory,
  ExternalCapacity,
  Fulfillment,
  InternalCapacity,
  JobSource,
  LeadSource,
  LeadStage,
  Leg,
  LoadBoardSource,
  LoadType,
  MaintenanceStatus,
  MaintenanceType,
  MaintenanceUpdateInput,
  ManualTripStatus,
  NewBoardLoadInput,
  NewCompanyLoadInput,
  NewCustomerInput,
  NewExpenseInput,
  NewFuelLogInput,
  NewJobInput,
  NewLeadInput,
  NewMaintenanceInput,
  NewOrderInput,
  NewPartnerInput,
  NewPaymentInput,
  NewPOInput,
  NewQuoteInput,
  NewQuoteRequestInput,
  NewSalesPaymentInput,
  NewTripInput,
  OrderEditInput,
  OrderItem,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentTerms,
  Place,
  PodInput,
  POItem,
  POStatus,
  ProofOfDelivery,
  PublishListingInput,
  QuoteStatus,
  RequiredTruckType,
  SalesPaymentMethod,
  ShipperRequestInput,
  StandingOrderInput,
  StandingOrderLine,
  TripCloseInput,
  TruckRequirement,
  TruckType,
  TruckingPartner,
  Weekday,
} from '../domain/types';
import * as V from './vocab';

type Distribute<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type CapacityBase = 'id' | 'createdAt' | 'postedBy' | 'status' | 'closedReason';

const Text = (max = 200) => [IsString(), MaxLength(max)];
const apply =
  (...decorators: PropertyDecorator[]): PropertyDecorator =>
  (target, key) => {
    for (const d of decorators) d(target, key);
  };
/** Required non-empty text. */
const Req = (max = 200) => apply(trim(), ...Text(max), MinLength(1));
/** Optional text. */
const Opt = (max = 2000) => apply(IsOptional(), trim(), ...Text(max));
const Ref = () =>
  apply(IsString(), Matches(V.RECORD_ID_RE, { message: '$property must be a record id' }));
const OptRef = () => apply(IsOptional(), Ref());
const Day = () =>
  apply(IsString(), Matches(V.DATE_RE, { message: '$property must be YYYY-MM-DD' }));
const At = () =>
  apply(IsString(), Matches(V.DATETIME_RE, { message: '$property must be YYYY-MM-DDTHH:mm' }));
const Kg = () => apply(IsNumber({ maxDecimalPlaces: 2 }), Min(0), Max(100_000));
const Pesos = () => apply(IsNumber({ maxDecimalPlaces: 2 }), Min(0), Max(100_000_000));
const Nested = (cls: () => new () => object) => apply(ValidateNested(), Type(cls));
const NestedList = (cls: () => new () => object, max = 50) =>
  apply(IsArray(), ArrayMaxSize(max), ValidateNested({ each: true }), Type(cls));
const OneOf = (values: readonly string[]) => IsIn(values as string[]);
const ListOf = (values: readonly string[], max = 30) =>
  apply(IsArray(), ArrayMaxSize(max), IsIn(values as string[], { each: true }));

// ─── Shared value objects ───────────────────────────────────────────────────
export class PlaceDto implements Place {
  @Req(200) name: string;
  @OneOf(V.AREA_IDS) areaId: AreaId;
  @Opt(300) address?: string;
}

export class ChargeDto implements Charge {
  @Req(100) label: string;
  @Pesos() amount: number;
}

export class PersonDto {
  @Req(120) name: string;
  @Req(40) phone: string;
}

export class CargoLineDto implements CargoLineInput {
  @Req(200) cargoDescription: string;
  @OneOf(V.CARGO_CATEGORIES) cargoCategory: CargoCategory;
  @IsNumber() @Min(0.01) @Max(100_000) quantity: number;
  @Req(30) unit: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100_000) weightKg: number;
  @Opt(500) handlingNotes?: string;
}

export class NoteDto {
  @Opt(1000) note?: string;
}

export class ReasonDto {
  @Req(1000) reason: string;
}

export class OptionalReasonDto {
  @Opt(1000) reason?: string;
}

export class AssignTripDto {
  /** Trip to put the cargo on; null takes it off its trip. */
  @OptRef() tripId: string | null;
}

// ─── Sales & CRM ────────────────────────────────────────────────────────────
export class NewQuoteDto implements NewQuoteInput {
  @OptRef() customerId?: string;
  @OptRef() leadId?: string;
  @Nested(() => PlaceDto) pickup: PlaceDto;
  @Nested(() => PlaceDto) dropoff: PlaceDto;
  @Req(300) cargoDescription: string;
  @OneOf(V.CARGO_CATEGORIES) cargoCategory: CargoCategory;
  @Kg() weightKg: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1000) volumeCbm?: number;
  @OneOf(V.TRUCK_REQUIREMENTS) truckRequirement: TruckRequirement;
  @Day() pickupDate: string;
  @Day() requiredDate: string;
  @Pesos() freightCharge: number;
  @NestedList(() => ChargeDto, 20) additionalCharges: ChargeDto[];
  @Opt() notes?: string;
  @Day() validUntil: string;
  @OneOf(['Draft', 'Sent']) status: 'Draft' | 'Sent';
}

export class QuoteStatusDto {
  @OneOf(V.QUOTE_STATUSES) status: QuoteStatus;
  @Opt(1000) reason?: string;
}

export class NewLeadDto implements NewLeadInput {
  @Req() businessName: string;
  @Req(120) contactName: string;
  @Req(40) phone: string;
  @OneOf(V.LEAD_SOURCES) source: LeadSource;
  @Req() location: string;
  @IsOptional() @OneOf(V.AREA_IDS) areaId?: AreaId;
  @OneOf(V.CUSTOMER_TYPES) businessType: CustomerType;
  @Req(300) cargoInterest: string;
  @Req() lane: string;
  @Req() potentialVolume: string;
  @Pesos() potentialMonthlyValue: number;
  @OneOf(V.LEAD_STAGES) stage: LeadStage;
  @Ref() ownerId: string;
  @Opt(500) nextStep?: string;
  @Opt(500) lostReason?: string;
}

export class LeadStageDto {
  @OneOf(V.LEAD_STAGES) stage: LeadStage;
  @Opt(1000) note?: string;
}

export class ContactPersonDto implements ContactPerson {
  @Req(120) name: string;
  @Req(80) position: string;
  @Req(40) phone: string;
  @Opt(254) email?: string;
  @IsOptional() @IsBoolean() primary?: boolean;
}

export class DeliveryAddressDto implements DeliveryAddress {
  /** Assigned by the server (CUS-…-A1); any value sent is replaced. */
  @IsOptional() @IsString() @MaxLength(60) id: string;
  @Req(80) label: string;
  @Req(300) line1: string;
  @Req(120) barangay: string;
  @Req(120) city: string;
  @Req(120) province: string;
  @OneOf(V.AREA_IDS) areaId: AreaId;
  @Opt(300) landmark?: string;
  @Req(120) receivingHours: string;
  @IsOptional() @IsBoolean() default?: boolean;
}

export class NewCustomerDto implements NewCustomerInput {
  @Req() name: string;
  @OneOf(V.CUSTOMER_TYPES) type: CustomerType;
  @OneOf(V.AREA_IDS) areaId: AreaId;
  @NestedList(() => ContactPersonDto, 10) @ArrayMinSize(1) contacts: ContactPersonDto[];
  @NestedList(() => DeliveryAddressDto, 10) @ArrayMinSize(1) addresses: DeliveryAddressDto[];
  @OneOf(V.PAYMENT_TERMS) paymentTerms: PaymentTerms;
  @Pesos() creditLimit: number;
  @Ref() salespersonId: string;
  @OneOf(V.LEAD_SOURCES) leadSource: LeadSource;
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) preferredProductIds: string[];
  @OneOf(V.FULFILLMENTS) fulfillment: Fulfillment;
  @IsString() @MaxLength(4000) notes: string;
  @Pesos() deliveryFee: number;
  @Opt(40) tin?: string;
}

// ─── Jobs & cargo ───────────────────────────────────────────────────────────
export class NewJobDto implements NewJobInput {
  @Ref() customerId: string;
  @OneOf(V.MANUAL_JOB_SOURCES) source: JobSource;
  @OneOf(V.LEGS) leg: Leg;
  @Nested(() => PlaceDto) pickup: PlaceDto;
  @Nested(() => PlaceDto) dropoff: PlaceDto;
  @Nested(() => PersonDto) consignee: PersonDto;
  @NestedList(() => CargoLineDto, 30) @ArrayMinSize(1) cargo: CargoLineDto[];
  @OneOf(V.TRUCK_REQUIREMENTS) truckRequirement: TruckRequirement;
  @At() pickupAt: string;
  @At() requiredBy: string;
  @Pesos() freightCharge: number;
  @NestedList(() => ChargeDto, 20) additionalCharges: ChargeDto[];
  @OneOf(V.PAYMENT_TERMS) paymentTerms: PaymentTerms;
  @Opt() instructions?: string;
  @Opt() notes?: string;
  @OneOf(V.NEW_JOB_STATUSES) status: (typeof V.NEW_JOB_STATUSES)[number];
  @OptRef() quoteId?: string;
  @IsOptional() @OneOf(V.LOAD_TYPES) loadType?: LoadType;
}

export class JobStatusDto {
  @OneOf(V.MANUAL_JOB_STATUSES) status: (typeof V.MANUAL_JOB_STATUSES)[number];
  @Opt(1000) note?: string;
}

export class NewCompanyLoadDto implements NewCompanyLoadInput {
  @Req(200) cargoDescription: string;
  @OneOf(V.CARGO_CATEGORIES) cargoCategory: CargoCategory;
  @IsNumber() @Min(0.01) @Max(100_000) quantity: number;
  @Req(30) unit: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100_000) weightKg: number;
  @OneOf(V.LEGS) leg: Leg;
  @Nested(() => PlaceDto) pickup: PlaceDto;
  @Nested(() => PlaceDto) destination: PlaceDto;
  @IsOptional() @Pesos() estimatedValue?: number;
  @Opt(500) handlingNotes?: string;
  @OptRef() tripId?: string;
}

// ─── Trips ──────────────────────────────────────────────────────────────────
export class NewTripDto implements NewTripInput {
  @Day() date: string;
  @Ref() truckId: string;
  @Ref() driverId: string;
  @IsArray() @ArrayMaxSize(4) @Matches(V.RECORD_ID_RE, { each: true }) helperIds: string[];
  @Ref() routeId: string;
  @At() departure: string;
  @Opt() notes?: string;
}

export class TripStatusDto {
  @OneOf(V.MANUAL_TRIP_STATUSES) status: ManualTripStatus;
}

export class FuelFillDto {
  @IsNumber() @Min(1) @Max(1000) liters: number;
  @IsNumber() @Min(1) @Max(500) pricePerLiter: number;
  @Req(200) station: string;
}

export class TripCloseDto implements TripCloseInput {
  @IsInt() @Min(0) @Max(5_000_000) odometerEnd: number;
  @IsOptional() @Nested(() => FuelFillDto) fuel?: FuelFillDto;
}

// ─── Deliveries & POD ───────────────────────────────────────────────────────
export class PodDto implements PodInput {
  @Req(120) receivedBy: string;
  @IsBoolean() signatureCaptured: boolean;
  @IsInt() @Min(0) @Max(50) photoCount: number;
  @Opt(1000) driverNotes?: string;
  @Opt(1000) customerRemarks?: string;
  @IsOptional() @Kg() shortKg?: number;
  @IsOptional() @Kg() damagedKg?: number;
  @Opt(40) receiptNo?: string;
}

export class DeliverDto {
  @Nested(() => PodDto) pod: PodDto;
  /** COD cash the driver collected; recorded as a payment on the job's invoice. */
  @IsOptional() @Pesos() cashCollected?: number;
}

export class PodPatchDto implements Partial<ProofOfDelivery> {
  @Opt(120) receivedBy?: string;
  @IsOptional() @IsBoolean() signatureCaptured?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(50) photoCount?: number;
  @Opt(1000) driverNotes?: string;
  @Opt(1000) customerRemarks?: string;
  @IsOptional() @Kg() shortKg?: number;
  @IsOptional() @Kg() damagedKg?: number;
  @Opt(40) receiptNo?: string;
}

export class DeliveryIssueDto {
  @OneOf(V.DELIVERY_ISSUE_TYPES) type: DeliveryIssueType;
  @Req(1000) note: string;
  /** The drop failed and the cargo returns to Lucena. */
  @IsOptional() @IsBoolean() failed?: boolean;
}

// ─── Finance ────────────────────────────────────────────────────────────────
export class NewPaymentDto implements NewPaymentInput {
  @Ref() invoiceId: string;
  @Ref() jobId: string;
  @Ref() customerId: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100_000_000) amount: number;
  @OneOf(V.PAYMENT_METHODS) method: PaymentMethod;
  @Req(120) reference: string;
  @Opt(1000) notes?: string;
}

export class NewExpenseDto implements NewExpenseInput {
  @Day() date: string;
  @OneOf(V.EXPENSE_CATEGORIES) category: ExpenseCategory;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(10_000_000) amount: number;
  @Req(300) description: string;
  @OptRef() tripId?: string;
  @OptRef() truckId?: string;
  @OptRef() driverId?: string;
  @Req(200) paidTo: string;
  @Opt(120) receiptRef?: string;
}

// ─── Fleet ──────────────────────────────────────────────────────────────────
export class NewFuelLogDto implements NewFuelLogInput {
  @Ref() truckId: string;
  @OptRef() tripId?: string;
  @Ref() driverId: string;
  @At() date: string;
  @IsInt() @Min(0) @Max(5_000_000) odometerKm: number;
  @IsNumber() @Min(1) @Max(1000) liters: number;
  @IsNumber() @Min(1) @Max(500) pricePerLiter: number;
  @Req(200) station: string;
  @OneOf(V.AREA_IDS) areaId: AreaId;
  @IsBoolean() fullTank: boolean;
  @Opt(120) receiptRef?: string;
}

export class NewMaintenanceDto implements NewMaintenanceInput {
  @Ref() truckId: string;
  @OneOf(V.MAINTENANCE_TYPES) type: MaintenanceType;
  @IsInt() @Min(0) @Max(5_000_000) odometerKm: number;
  @Day() date: string;
  @Req(200) vendor: string;
  @Pesos() cost: number;
  @IsString() @MaxLength(2000) notes: string;
  @IsOptional() @Day() nextServiceDate?: string;
  @IsOptional() @IsInt() @Min(0) @Max(5_000_000) nextServiceKm?: number;
  @OneOf(V.MAINTENANCE_STATUSES) status: MaintenanceStatus;
  @IsOptional() @IsNumber() @Min(0) @Max(10_000) downtimeHours?: number;
}

export class MaintenanceUpdateDto implements MaintenanceUpdateInput {
  @IsOptional() @Pesos() cost?: number;
  @IsOptional() @IsInt() @Min(0) @Max(5_000_000) odometerKm?: number;
  @IsOptional() @Day() date?: string;
  @Opt(2000) notes?: string;
}

export class MaintenanceStatusDto {
  @OneOf(V.MAINTENANCE_STATUSES) status: MaintenanceStatus;
  @IsOptional() @Nested(() => MaintenanceUpdateDto) patch?: MaintenanceUpdateDto;
}

export class DocumentRenewalDto implements DocumentRenewalInput {
  @Req(120) reference: string;
  @Day() issueDate: string;
  @Day() expiryDate: string;
  @Opt(200) attachment?: string;
}

// ─── Load board ─────────────────────────────────────────────────────────────
export class NewBoardLoadDto implements NewBoardLoadInput {
  @OneOf(V.BOARD_SOURCES) source: LoadBoardSource;
  @Opt(200) sourceReference?: string;
  @Nested(() => PersonDto) contact: PersonDto;
  @OptRef() partnerId?: string;
  @Opt() notes?: string;
  @OptRef() customerId?: string;
  @Nested(() => PlaceDto) pickup: PlaceDto;
  @Nested(() => PlaceDto) destination: PlaceDto;
  @Req(300) cargoDescription: string;
  @OneOf(V.CARGO_CATEGORIES) cargoCategory: CargoCategory;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(100_000) weightKg: number;
  @OneOf(V.REQUIRED_TRUCK_TYPES) truckType: RequiredTruckType;
  @At() pickupAt: string;
  @IsOptional() @At() deliveryBy?: string;
  @IsOptional() @Pesos() offeredFreight?: number;
  @Opt(500) specialHandling?: string;
}

class CapacityPostDto {
  @OneOf(V.BOARD_SOURCES) source: LoadBoardSource;
  @Opt(200) sourceReference?: string;
  @Nested(() => PersonDto) contact: PersonDto;
  @OptRef() partnerId?: string;
  @Opt() notes?: string;
  @ListOf(V.CARGO_CATEGORIES) acceptedCargo: CargoCategory[];
  @Opt(500) restrictions?: string;
}

export class InternalCapacityDto
  extends CapacityPostDto
  implements Distribute<InternalCapacity, CapacityBase>
{
  @OneOf(['internal']) fleet: 'internal';
  @Ref() tripId: string;
  @OneOf(V.LEGS) leg: Leg;
}

export class ExternalCapacityDto
  extends CapacityPostDto
  implements Distribute<ExternalCapacity, CapacityBase>
{
  @OneOf(['external']) fleet: 'external';
  @OneOf(V.TRUCK_TYPES) truckType: TruckType;
  @Nested(() => PlaceDto) currentLocation: PlaceDto;
  @Nested(() => PlaceDto) destination: PlaceDto;
  @ListOf(V.AREA_IDS) plannedRoute: AreaId[];
  @IsNumber() @Min(1) @Max(100_000) totalCapacityKg: number;
  @Kg() usedCapacityKg: number;
  @At() departureAt: string;
}

export class NewPartnerDto implements NewPartnerInput {
  @Req() name: string;
  @Nested(() => PersonDto) contact: PersonDto;
  @ListOf(V.TRUCK_TYPES) truckTypes: TruckType[];
  @OneOf(V.BOARD_SOURCES) channel: LoadBoardSource;
  @Opt(200) channelName?: string;
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  typicalRoutes: TruckingPartner['typicalRoutes'];
  @Opt() notes?: string;
}

export class BoardLoadStatusDto {
  @OneOf(V.BOARD_LOAD_STATUSES) status: AvailableLoadStatus;
  @Opt(1000) reason?: string;
}

export class CapacityStatusDto {
  @OneOf(V.CAPACITY_STATUSES) status: CapacityStatus;
  @Opt(1000) reason?: string;
}

export class CapacityUsedDto {
  @Kg() usedKg: number;
}

export class ReserveDto {
  @Ref() capacityId: string;
}

export class BookBoardLoadDto implements Omit<BookBoardLoadInput, 'loadId'> {
  @OptRef() capacityId?: string;
  @OptRef() customerId?: string;
  @Opt(200) newCustomerName?: string;
  @Pesos() freightCharge: number;
  @OneOf(V.PAYMENT_TERMS) paymentTerms: PaymentTerms;
  @Nested(() => PersonDto) consignee: PersonDto;
}

// ─── Backhaul marketplace (preview) ─────────────────────────────────────────
export class PublishListingDto implements PublishListingInput {
  @Ref() tripId: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.5) @Max(100) ratePerKg: number;
  @Pesos() minimumCharge: number;
  @ListOf(V.CARGO_CATEGORIES) acceptedCargo: CargoCategory[];
  @Opt(500) restrictions?: string;
}

export class ListingStatusDto {
  @OneOf(V.LISTING_STATUSES) status: (typeof V.LISTING_STATUSES)[number];
}

export class ShipperDto {
  @Req() businessName: string;
  @Req(120) contactName: string;
  @Req(40)
  @Matches(/^\+?[\d\s()-]{7,}$/, { message: 'phone must be a mobile number' })
  phone: string;
}

/** A shipper's request from the public Return trips page. */
export class ShipperRequestDto implements ShipperRequestInput {
  @Ref() listingId: string;
  @Nested(() => ShipperDto) shipper: ShipperDto;
  @IsOptional() @Nested(() => PersonDto) consignee?: PersonDto;
  @Nested(() => PlaceDto) pickup: PlaceDto;
  @Nested(() => PlaceDto) dropoff: PlaceDto;
  @Req(300) cargoDescription: string;
  @OneOf(V.CARGO_CATEGORIES) cargoCategory: CargoCategory;
  @IsNumber() @Min(0.01) @Max(100_000) quantity: number;
  @Req(30) unit: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(100_000) weightKg: number;
  @At() readyAt: string;
  @Opt(1000) notes?: string;
}

/** Dispatch recording a request on a shipper's behalf (may link an existing customer). */
export class BackhaulRequestDto extends ShipperRequestDto {
  @OptRef() customerId?: string;
}

export class ConfirmRequestDto implements Omit<ConfirmBackhaulRequestInput, 'requestId'> {
  @OptRef() customerId?: string;
  @Pesos() freightCharge: number;
  @OneOf(V.PAYMENT_TERMS) paymentTerms: PaymentTerms;
}

export class RequestLookupDto {
  @Req(40) phone: string;
}

// ─── Trading (Phase 2 preview) ──────────────────────────────────────────────
export class OrderItemDto implements OrderItem {
  @Req(40) productId: string;
  @IsNumber() @Min(0.01) @Max(100_000) quantity: number;
  @Pesos() unitPrice: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100_000) deliveredQty?: number;
}

export class NewOrderDto implements NewOrderInput {
  @Ref() customerId: string;
  @OneOf(V.ORDER_SOURCES) source: OrderSource;
  @NestedList(() => OrderItemDto, 60) @ArrayMinSize(1) items: OrderItemDto[];
  @Pesos() discount: number;
  @Pesos() deliveryFee: number;
  @Day() deliveryDate: string;
  @OneOf(V.PAYMENT_TERMS) paymentTerms: PaymentTerms;
  @Req(60) addressId: string;
  @Opt() notes?: string;
  @OneOf(V.NEW_ORDER_STATUSES) status: (typeof V.NEW_ORDER_STATUSES)[number];
  @IsOptional() @OneOf(V.FULFILLMENTS) fulfillment?: Fulfillment;
  @Opt(120) deliveryWindow?: string;
}

export class OrderEditDto implements OrderEditInput {
  @Day() deliveryDate: string;
  @Pesos() discount: number;
  @Pesos() deliveryFee: number;
  @Opt() notes?: string;
  @NestedList(() => OrderItemDto, 60) @ArrayMinSize(1) items: OrderItemDto[];
}

export class OrderEventDto {
  @Req(200) label: string;
  @Opt(1000) note?: string;
}

export class UpdateOrderDto {
  @Nested(() => OrderEditDto) patch: OrderEditDto;
  @IsOptional() @Nested(() => OrderEventDto) event?: OrderEventDto;
}

export class OrderStatusDto {
  @OneOf(V.ORDER_STATUSES) status: OrderStatus;
  @Opt(1000) note?: string;
}

export class NewSalesPaymentDto implements NewSalesPaymentInput {
  @Req(40) invoiceId: string;
  @Ref() orderId: string;
  @Ref() customerId: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100_000_000) amount: number;
  @OneOf(V.SALES_PAYMENT_METHODS) method: SalesPaymentMethod;
  @Req(120) reference: string;
  @Opt(1000) notes?: string;
}

export class POItemDto implements POItem {
  @Req(40) productId: string;
  @IsNumber() @Min(0.01) @Max(100_000) quantity: number;
  @Pesos() unitCost: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100_000) receivedQty?: number;
}

export class NewPODto implements NewPOInput {
  @Req(40) supplierId: string;
  @NestedList(() => POItemDto, 60) @ArrayMinSize(1) items: POItemDto[];
  @Day() pickupDate: string;
  @OneOf(['Draft', 'Sent']) status: 'Draft' | 'Sent';
  @Opt() notes?: string;
}

export class POStatusDto {
  @OneOf(V.PO_STATUSES) status: POStatus;
}

export class StandingOrderLineDto implements StandingOrderLine {
  @Req(40) productId: string;
  @IsNumber() @Min(0.01) @Max(100_000) quantity: number;
}

export class StandingOrderDto implements StandingOrderInput {
  @IsOptional() @Req(20) id?: string;
  @Ref() customerId: string;
  @OneOf(V.WEEKDAYS) day: Weekday;
  @NestedList(() => StandingOrderLineDto, 60) @ArrayMinSize(1) lines: StandingOrderLineDto[];
  @OneOf(V.STANDING_ORDER_STATUSES) status: (typeof V.STANDING_ORDER_STATUSES)[number];
  @Day() startDate: string;
  @Opt() notes?: string;
}

export class StandingOrderStatusDto {
  @OneOf(V.STANDING_ORDER_STATUSES) status: (typeof V.STANDING_ORDER_STATUSES)[number];
}

export class NewQuoteRequestDto implements NewQuoteRequestInput {
  @Req() businessName: string;
  @Req(120) contactName: string;
  @Req(40) phone: string;
  @OneOf(V.CUSTOMER_TYPES) businessType: CustomerType;
  @Req(40) productId: string;
  @IsNumber() @Min(0.01) @Max(100_000) quantity: number;
  @Req(30) unit: string;
  @Req(120) frequency: string;
  @Req(200) deliveryArea: string;
  @Day() preferredDate: string;
  @Opt() notes?: string;
  @OptRef() customerId?: string;
}
