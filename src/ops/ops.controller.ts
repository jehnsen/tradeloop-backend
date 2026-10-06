import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantContext } from '../common/auth/auth-context';
import { Roles, Tenant } from '../common/auth/decorators';
import {
  AssignTripDto,
  BackhaulRequestDto,
  BoardLoadStatusDto,
  BookBoardLoadDto,
  CapacityStatusDto,
  CapacityUsedDto,
  ConfirmRequestDto,
  DeliverDto,
  DeliveryIssueDto,
  DocumentRenewalDto,
  ExternalCapacityDto,
  InternalCapacityDto,
  JobStatusDto,
  LeadStageDto,
  ListingStatusDto,
  MaintenanceStatusDto,
  NewBoardLoadDto,
  NewCompanyLoadDto,
  NewCustomerDto,
  NewExpenseDto,
  NewFuelLogDto,
  NewJobDto,
  NewLeadDto,
  NewMaintenanceDto,
  NewOrderDto,
  NewPartnerDto,
  NewPaymentDto,
  NewPODto,
  NewQuoteDto,
  NewQuoteRequestDto,
  NewSalesPaymentDto,
  NewTripDto,
  OrderStatusDto,
  PodPatchDto,
  POStatusDto,
  PublishListingDto,
  QuoteStatusDto,
  ReasonDto,
  ReserveDto,
  StandingOrderDto,
  StandingOrderStatusDto,
  TripCloseDto,
  TripStatusDto,
  UpdateOrderDto,
} from './dto/ops.dto';
import {
  ownDelivery,
  ownFuelLog,
  ownQuoteRequest,
  ownStandingOrder,
  ownStandingOrderId,
  ownTrip,
  portalOrder,
  tripStatusBy,
} from './ops-guards';
import { OpsRoles } from './ops-roles';
import { OpsService } from './ops.service';

/**
 * TradeLoop operations API. Reads return the organization's whole data set (`GET /ops/snapshot`);
 * every write is a workflow command that answers with its result and the records it changed.
 * Record ids in paths are the readable ids (JOB-260925-009, TRIP-260925-01…).
 */
@ApiTags('Operations')
@ApiBearerAuth()
@Controller('ops')
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  // ─── Data ──────────────────────────────────────────────────────────────────
  @Get('snapshot')
  snapshot(@Tenant() ctx: TenantContext) {
    return this.ops.snapshot(ctx);
  }

  /** Cheap poll target: clients refetch the snapshot when the version moves. */
  @Get('version')
  version(@Tenant() ctx: TenantContext) {
    return this.ops.version(ctx);
  }

  @Post('demo/reset')
  @HttpCode(200)
  @Roles(...OpsRoles.OWNER)
  resetDemo(@Tenant() ctx: TenantContext) {
    return this.ops.resetDemo(ctx);
  }

  // ─── Sales & CRM ───────────────────────────────────────────────────────────
  @Post('quotes')
  @Roles(...OpsRoles.SALES)
  createQuote(@Tenant() ctx: TenantContext, @Body() dto: NewQuoteDto) {
    return this.ops.execute(ctx, 'createQuote', [dto]);
  }

  @Post('quotes/:id/status')
  @HttpCode(200)
  @Roles(...OpsRoles.SALES)
  setQuoteStatus(
    @Tenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: QuoteStatusDto,
  ) {
    return this.ops.execute(ctx, 'setQuoteStatus', [id, dto.status, dto.reason]);
  }

  @Post('quotes/:id/convert')
  @HttpCode(200)
  @Roles(...OpsRoles.SALES)
  convertQuote(@Tenant() ctx: TenantContext, @Param('id') id: string) {
    return this.ops.execute(ctx, 'convertQuoteToJob', [id]);
  }

  @Post('leads')
  @Roles(...OpsRoles.SALES)
  addLead(@Tenant() ctx: TenantContext, @Body() dto: NewLeadDto) {
    return this.ops.execute(ctx, 'addLead', [dto]);
  }

  @Post('leads/:id/stage')
  @HttpCode(200)
  @Roles(...OpsRoles.SALES)
  moveLead(@Tenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: LeadStageDto) {
    return this.ops.execute(ctx, 'moveLead', [id, dto.stage, dto.note]);
  }

  @Post('leads/:id/convert')
  @HttpCode(200)
  @Roles(...OpsRoles.SALES)
  convertLead(@Tenant() ctx: TenantContext, @Param('id') id: string) {
    return this.ops.execute(ctx, 'convertLead', [id]);
  }

  @Post('customers')
  @Roles(...OpsRoles.SALES)
  addCustomer(@Tenant() ctx: TenantContext, @Body() dto: NewCustomerDto) {
    return this.ops.execute(ctx, 'addCustomer', [dto]);
  }

  // ─── Jobs & cargo ──────────────────────────────────────────────────────────
  @Post('jobs')
  @Roles(...OpsRoles.SALES)
  createJob(@Tenant() ctx: TenantContext, @Body() dto: NewJobDto) {
    return this.ops.execute(ctx, 'createJob', [dto]);
  }

  @Post('jobs/:id/status')
  @HttpCode(200)
  @Roles(...OpsRoles.SALES)
  setJobStatus(@Tenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: JobStatusDto) {
    return this.ops.execute(ctx, 'setJobStatus', [id, dto.status, dto.note]);
  }

  @Post('jobs/:id/cancel')
  @HttpCode(200)
  @Roles(...OpsRoles.SALES)
  cancelJob(@Tenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.ops.execute(ctx, 'cancelJob', [id, dto.reason]);
  }

  @Post('jobs/:id/assign')
  @HttpCode(200)
  @Roles(...OpsRoles.DISPATCH)
  assignJob(@Tenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: AssignTripDto) {
    return this.ops.execute(ctx, 'assignJobToTrip', [id, dto.tripId ?? null]);
  }

  @Post('loads')
  @Roles(...OpsRoles.DISPATCH)
  createCompanyLoad(@Tenant() ctx: TenantContext, @Body() dto: NewCompanyLoadDto) {
    return this.ops.execute(ctx, 'createCompanyLoad', [dto]);
  }

  @Post('loads/:id/assign')
  @HttpCode(200)
  @Roles(...OpsRoles.DISPATCH)
  assignLoad(@Tenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: AssignTripDto) {
    return this.ops.execute(ctx, 'assignLoadToTrip', [id, dto.tripId ?? null]);
  }

  // ─── Trips ─────────────────────────────────────────────────────────────────
  @Post('trips')
  @Roles(...OpsRoles.DISPATCH)
  createTrip(@Tenant() ctx: TenantContext, @Body() dto: NewTripDto) {
    return this.ops.execute(ctx, 'createTrip', [dto]);
  }

  @Post('trips/:id/status')
  @HttpCode(200)
  @Roles(...OpsRoles.FIELD)
  setTripStatus(@Tenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: TripStatusDto) {
    return this.ops.execute(ctx, 'setTripStatus', [id, dto.status], tripStatusBy(id, dto.status));
  }

  @Post('trips/:id/complete')
  @HttpCode(200)
  @Roles(...OpsRoles.FIELD)
  completeTrip(@Tenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: TripCloseDto) {
    return this.ops.execute(ctx, 'completeTrip', [id, dto], ownTrip(id));
  }

  @Post('trips/:id/stops/:stopId/arrive')
  @HttpCode(200)
  @Roles(...OpsRoles.FIELD)
  arriveAtStop(
    @Tenant() ctx: TenantContext,
    @Param('id') id: string,
    @Param('stopId') stopId: string,
  ) {
    return this.ops.execute(ctx, 'markStopArrived', [id, stopId], ownTrip(id));
  }

  @Post('trips/:id/stops/:stopId/complete')
  @HttpCode(200)
  @Roles(...OpsRoles.FIELD)
  completeStop(
    @Tenant() ctx: TenantContext,
    @Param('id') id: string,
    @Param('stopId') stopId: string,
  ) {
    return this.ops.execute(ctx, 'completeStop', [id, stopId], ownTrip(id));
  }

  // ─── Deliveries & POD ──────────────────────────────────────────────────────
  @Post('deliveries/:id/arrive')
  @HttpCode(200)
  @Roles(...OpsRoles.FIELD)
  arrive(@Tenant() ctx: TenantContext, @Param('id') id: string) {
    return this.ops.execute(ctx, 'markArrived', [id], ownDelivery(id));
  }

  @Post('deliveries/:id/deliver')
  @HttpCode(200)
  @Roles(...OpsRoles.FIELD)
  deliver(@Tenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: DeliverDto) {
    return this.ops.execute(
      ctx,
      'markDelivered',
      [id, dto.pod, dto.cashCollected],
      ownDelivery(id),
    );
  }

  @Patch('deliveries/:id/pod')
  @Roles(...OpsRoles.FIELD)
  updatePod(@Tenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: PodPatchDto) {
    return this.ops.execute(ctx, 'updatePod', [id, dto], ownDelivery(id));
  }

  @Post('deliveries/:id/issues')
  @Roles(...OpsRoles.FIELD)
  reportIssue(
    @Tenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: DeliveryIssueDto,
  ) {
    return this.ops.execute(
      ctx,
      'reportDeliveryIssue',
      [id, { type: dto.type, note: dto.note }, dto.failed],
      ownDelivery(id),
    );
  }

  // ─── Finance ───────────────────────────────────────────────────────────────
  @Post('payments')
  @Roles(...OpsRoles.FINANCE)
  recordPayment(@Tenant() ctx: TenantContext, @Body() dto: NewPaymentDto) {
    return this.ops.execute(ctx, 'recordPayment', [dto]);
  }

  @Post('expenses')
  @Roles(...OpsRoles.EXPENSES)
  addExpense(@Tenant() ctx: TenantContext, @Body() dto: NewExpenseDto) {
    return this.ops.execute(ctx, 'addExpense', [dto]);
  }

  // ─── Fleet ─────────────────────────────────────────────────────────────────
  @Post('fuel-logs')
  @Roles(...OpsRoles.FIELD)
  addFuelLog(@Tenant() ctx: TenantContext, @Body() dto: NewFuelLogDto) {
    return this.ops.execute(ctx, 'addFuelLog', [dto], ownFuelLog(dto.driverId, dto.tripId));
  }

  @Post('maintenance')
  @Roles(...OpsRoles.FLEET)
  addMaintenance(@Tenant() ctx: TenantContext, @Body() dto: NewMaintenanceDto) {
    return this.ops.execute(ctx, 'addMaintenance', [dto]);
  }

  @Post('maintenance/:id/status')
  @HttpCode(200)
  @Roles(...OpsRoles.FLEET)
  setMaintenanceStatus(
    @Tenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: MaintenanceStatusDto,
  ) {
    return this.ops.execute(ctx, 'setMaintenanceStatus', [id, dto.status, dto.patch]);
  }

  @Post('documents/:id/renew')
  @HttpCode(200)
  @Roles(...OpsRoles.FLEET)
  renewDocument(
    @Tenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: DocumentRenewalDto,
  ) {
    return this.ops.execute(ctx, 'renewDocument', [id, dto]);
  }

  // ─── Load board ────────────────────────────────────────────────────────────
  @Post('board/loads')
  @Roles(...OpsRoles.DISPATCH)
  postBoardLoad(@Tenant() ctx: TenantContext, @Body() dto: NewBoardLoadDto) {
    return this.ops.execute(ctx, 'postBoardLoad', [dto]);
  }

  @Post('board/loads/:id/status')
  @HttpCode(200)
  @Roles(...OpsRoles.DISPATCH)
  setBoardLoadStatus(
    @Tenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: BoardLoadStatusDto,
  ) {
    return this.ops.execute(ctx, 'setBoardLoadStatus', [id, dto.status, dto.reason]);
  }

  @Post('board/loads/:id/reserve')
  @HttpCode(200)
  @Roles(...OpsRoles.DISPATCH)
  reserve(@Tenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: ReserveDto) {
    return this.ops.execute(ctx, 'reserveOnPartnerTruck', [id, dto.capacityId]);
  }

  /** Idempotent: re-booking never creates a second job or load. */
  @Post('board/loads/:id/book')
  @HttpCode(200)
  @Roles(...OpsRoles.DISPATCH)
  book(@Tenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: BookBoardLoadDto) {
    return this.ops.execute(ctx, 'bookBoardLoad', [{ ...dto, loadId: id }]);
  }

  @Post('board/capacity/internal')
  @Roles(...OpsRoles.DISPATCH)
  postOurCapacity(@Tenant() ctx: TenantContext, @Body() dto: InternalCapacityDto) {
    return this.ops.execute(ctx, 'postCapacity', [dto]);
  }

  @Post('board/capacity/external')
  @Roles(...OpsRoles.DISPATCH)
  postPartnerCapacity(@Tenant() ctx: TenantContext, @Body() dto: ExternalCapacityDto) {
    return this.ops.execute(ctx, 'postCapacity', [dto]);
  }

  @Post('board/capacity/:id/status')
  @HttpCode(200)
  @Roles(...OpsRoles.DISPATCH)
  setCapacityStatus(
    @Tenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: CapacityStatusDto,
  ) {
    return this.ops.execute(ctx, 'setCapacityStatus', [id, dto.status, dto.reason]);
  }

  @Post('board/capacity/:id/used')
  @HttpCode(200)
  @Roles(...OpsRoles.DISPATCH)
  updateCapacityUsed(
    @Tenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: CapacityUsedDto,
  ) {
    return this.ops.execute(ctx, 'updateCapacityUsed', [id, dto.usedKg]);
  }

  @Post('board/partners')
  @Roles(...OpsRoles.DISPATCH)
  addPartner(@Tenant() ctx: TenantContext, @Body() dto: NewPartnerDto) {
    return this.ops.execute(ctx, 'addTruckingPartner', [dto]);
  }

  // ─── Backhaul marketplace (preview) ────────────────────────────────────────
  /** One listing per return leg; publishing again updates the terms. */
  @Post('backhaul/listings')
  @HttpCode(200)
  @Roles(...OpsRoles.DISPATCH)
  publishListing(@Tenant() ctx: TenantContext, @Body() dto: PublishListingDto) {
    return this.ops.execute(ctx, 'publishBackhaulListing', [dto]);
  }

  @Post('backhaul/listings/:id/status')
  @HttpCode(200)
  @Roles(...OpsRoles.DISPATCH)
  setListingStatus(
    @Tenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: ListingStatusDto,
  ) {
    return this.ops.execute(ctx, 'setBackhaulListingStatus', [id, dto.status]);
  }

  @Post('backhaul/requests')
  @Roles(...OpsRoles.DISPATCH)
  recordRequest(@Tenant() ctx: TenantContext, @Body() dto: BackhaulRequestDto) {
    return this.ops.execute(ctx, 'requestBackhaulSpace', [dto]);
  }

  /** Idempotent: confirming again never creates a second job. */
  @Post('backhaul/requests/:id/confirm')
  @HttpCode(200)
  @Roles(...OpsRoles.DISPATCH)
  confirmRequest(
    @Tenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: ConfirmRequestDto,
  ) {
    return this.ops.execute(ctx, 'confirmBackhaulRequest', [{ ...dto, requestId: id }]);
  }

  @Post('backhaul/requests/:id/decline')
  @HttpCode(200)
  @Roles(...OpsRoles.DISPATCH)
  declineRequest(@Tenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.ops.execute(ctx, 'declineBackhaulRequest', [id, dto.reason]);
  }

  // ─── Notifications ─────────────────────────────────────────────────────────
  @Post('notifications/read-all')
  @HttpCode(200)
  @Roles(...OpsRoles.STAFF)
  readAll(@Tenant() ctx: TenantContext) {
    return this.ops.execute(ctx, 'markAllNotificationsRead', []);
  }

  @Post('notifications/:id/read')
  @HttpCode(200)
  @Roles(...OpsRoles.STAFF)
  read(@Tenant() ctx: TenantContext, @Param('id') id: string) {
    return this.ops.execute(ctx, 'markNotificationRead', [id]);
  }

  // ─── Trading (Phase 2 preview) ─────────────────────────────────────────────
  @Post('orders')
  @Roles(...OpsRoles.TRADING, ...OpsRoles.PORTAL)
  createOrder(@Tenant() ctx: TenantContext, @Body() dto: NewOrderDto) {
    return this.ops.execute(ctx, 'createOrder', [dto], portalOrder(dto));
  }

  @Patch('orders/:id')
  @Roles(...OpsRoles.TRADING)
  updateOrder(@Tenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: UpdateOrderDto) {
    return this.ops.execute(ctx, 'updateOrder', [id, dto.patch, dto.event]);
  }

  @Post('orders/:id/status')
  @HttpCode(200)
  @Roles(...OpsRoles.TRADING)
  setOrderStatus(
    @Tenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: OrderStatusDto,
  ) {
    return this.ops.execute(ctx, 'setOrderStatus', [id, dto.status, dto.note]);
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  @Roles(...OpsRoles.TRADING)
  cancelOrder(@Tenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.ops.execute(ctx, 'cancelOrder', [id, dto.reason]);
  }

  @Post('sales-payments')
  @Roles(...OpsRoles.FINANCE, ...OpsRoles.TRADING)
  recordSalesPayment(@Tenant() ctx: TenantContext, @Body() dto: NewSalesPaymentDto) {
    return this.ops.execute(ctx, 'recordSalesPayment', [dto]);
  }

  @Post('purchase-orders')
  @Roles(...OpsRoles.TRADING)
  createPO(@Tenant() ctx: TenantContext, @Body() dto: NewPODto) {
    return this.ops.execute(ctx, 'createPO', [dto]);
  }

  @Post('purchase-orders/:id/status')
  @HttpCode(200)
  @Roles(...OpsRoles.TRADING)
  setPOStatus(@Tenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: POStatusDto) {
    return this.ops.execute(ctx, 'setPOStatus', [id, dto.status]);
  }

  /** Creates the standing order, or updates it when `id` is given. */
  @Put('standing-orders')
  @Roles(...OpsRoles.TRADING, ...OpsRoles.PORTAL)
  saveStandingOrder(@Tenant() ctx: TenantContext, @Body() dto: StandingOrderDto) {
    return this.ops.execute(ctx, 'saveStandingOrder', [dto], ownStandingOrder(dto));
  }

  @Post('standing-orders/:id/status')
  @HttpCode(200)
  @Roles(...OpsRoles.TRADING, ...OpsRoles.PORTAL)
  setStandingOrderStatus(
    @Tenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: StandingOrderStatusDto,
  ) {
    return this.ops.execute(
      ctx,
      'setStandingOrderStatus',
      [id, dto.status],
      ownStandingOrderId(id),
    );
  }

  @Post('quote-requests')
  @Roles(...OpsRoles.TRADING, ...OpsRoles.PORTAL)
  addQuoteRequest(@Tenant() ctx: TenantContext, @Body() dto: NewQuoteRequestDto) {
    return this.ops.execute(ctx, 'addQuoteRequest', [dto], ownQuoteRequest(dto.customerId));
  }
}
