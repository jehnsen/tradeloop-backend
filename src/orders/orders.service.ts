import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { TenantContext } from '../common/auth/auth-context';
import {
  DomainEventPublisher,
  DomainEvents,
  ShipmentStatusChangedEvent,
} from '../common/events/domain-events';
import { conflict, invalidTransition } from '../common/http/app.exception';
import { paginate } from '../common/http/pagination';
import { SequenceService } from '../common/sequence/sequence.service';
import { definedOnly } from '../common/utils/pick';
import { findOwnedOrFail } from '../common/utils/tenant';
import { CustomersService } from '../customers/customers.service';
import { Load, LoadStatus } from '../loads/load.entity';
import { Shipment, ShipmentStatus } from '../shipments/shipment.entity';
import { CreateOrderDto, OrderQueryDto, UpdateOrderDto } from './dto/order.dto';
import { deriveOrderStatus } from './order-status';
import { Order, OrderStatus } from './order.entity';

const EDITABLE = [OrderStatus.DRAFT, OrderStatus.CONFIRMED];
const CANCELLABLE = [OrderStatus.DRAFT, OrderStatus.CONFIRMED, OrderStatus.PROCESSING];
const SHIPMENT_IN_PROGRESS = [
  ShipmentStatus.ASSIGNED,
  ShipmentStatus.PICKED_UP,
  ShipmentStatus.IN_TRANSIT,
];

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly repo: Repository<Order>,
    private readonly dataSource: DataSource,
    private readonly customers: CustomersService,
    private readonly sequences: SequenceService,
    private readonly events: DomainEventPublisher,
    private readonly audit: AuditService,
  ) {}

  async create(ctx: TenantContext, dto: CreateOrderDto): Promise<Order> {
    const { confirm, ...data } = dto;
    const order = await this.dataSource.transaction(async (manager) => {
      await this.customers.get(ctx.organizationId, dto.customerId, manager);
      const repo = manager.getRepository(Order);
      return repo.save(
        repo.create({
          ...data,
          organizationId: ctx.organizationId,
          orderNumber: await this.sequences.next('ORD', ctx.organizationId, manager),
          status: confirm ? OrderStatus.CONFIRMED : OrderStatus.DRAFT,
          createdBy: ctx.userId,
        }),
      );
    });
    await this.audit.record({
      action: 'order.created',
      entityType: 'Order',
      entityId: order.id,
      metadata: { orderNumber: order.orderNumber },
    });
    await this.events.publish(DomainEvents.ORDER_CREATED, {
      orderId: order.id,
      organizationId: order.organizationId,
      orderNumber: order.orderNumber,
    });
    return order;
  }

  list(ctx: TenantContext, query: OrderQueryDto) {
    const qb = this.repo
      .createQueryBuilder('o')
      .leftJoin('o.customer', 'c')
      .addSelect(['c.id', 'c.name', 'c.companyName'])
      .where('o.organizationId = :org', { org: ctx.organizationId });
    if (query.status) qb.andWhere('o.status = :status', { status: query.status });
    if (query.customerId)
      qb.andWhere('o.customerId = :customerId', { customerId: query.customerId });
    if (query.orderNumber)
      qb.andWhere('o.orderNumber ILIKE :num', { num: `%${query.orderNumber}%` });
    if (query.externalReference)
      qb.andWhere('o.externalReference = :ext', { ext: query.externalReference });
    const dateColumn = `o.${query.dateField ?? 'createdAt'}`;
    if (query.from) qb.andWhere(`${dateColumn} >= :from`, { from: query.from });
    if (query.to) qb.andWhere(`${dateColumn} <= :to`, { to: query.to });
    return paginate(
      qb,
      query,
      {
        createdAt: 'o.createdAt',
        orderNumber: 'o.orderNumber',
        requestedPickupAt: 'o.requestedPickupAt',
      },
      'createdAt',
    );
  }

  get(ctx: TenantContext, id: string): Promise<Order> {
    return findOwnedOrFail(this.repo, id, ctx.organizationId, 'Order', {
      relations: { customer: true },
    });
  }

  async update(ctx: TenantContext, id: string, dto: UpdateOrderDto): Promise<Order> {
    const order = await findOwnedOrFail(this.repo, id, ctx.organizationId, 'Order');
    if (!EDITABLE.includes(order.status)) throw invalidTransition('order', order.status, 'edit');
    if (dto.customerId) await this.customers.get(ctx.organizationId, dto.customerId);
    await this.repo.save(Object.assign(order, definedOnly(dto)));
    await this.audit.record({
      action: 'order.updated',
      entityType: 'Order',
      entityId: id,
      metadata: { changes: Object.keys(definedOnly(dto)) },
    });
    return this.get(ctx, id);
  }

  async confirm(ctx: TenantContext, id: string): Promise<Order> {
    const order = await findOwnedOrFail(this.repo, id, ctx.organizationId, 'Order');
    if (order.status !== OrderStatus.DRAFT)
      throw invalidTransition('order', order.status, 'confirm');
    order.status = OrderStatus.CONFIRMED;
    await this.repo.save(order);
    await this.audit.record({ action: 'order.confirmed', entityType: 'Order', entityId: id });
    return order;
  }

  async cancel(ctx: TenantContext, id: string, reason?: string): Promise<Order> {
    const order = await this.dataSource.transaction(async (manager) => {
      const o = await findOwnedOrFail(
        manager.getRepository(Order),
        id,
        ctx.organizationId,
        'Order',
        { lock: true },
      );
      if (!CANCELLABLE.includes(o.status)) throw invalidTransition('order', o.status, 'cancel');
      const shipments = await manager.getRepository(Shipment).find({ where: { orderId: id } });
      if (shipments.some((s) => SHIPMENT_IN_PROGRESS.includes(s.status))) {
        throw conflict(
          'ORDER_IN_PROGRESS',
          'Order has shipments assigned to trips; unassign them first',
        );
      }
      const cancellable = shipments
        .filter((s) => [ShipmentStatus.PENDING, ShipmentStatus.PLANNED].includes(s.status))
        .map((s) => s.id);
      if (cancellable.length) {
        await manager
          .getRepository(Shipment)
          .update({ id: In(cancellable) }, { status: ShipmentStatus.CANCELLED });
        await manager
          .getRepository(Load)
          .update(
            { shipmentId: In(cancellable), status: LoadStatus.PENDING },
            { status: LoadStatus.CANCELLED },
          );
      }
      o.status = OrderStatus.CANCELLED;
      return manager.getRepository(Order).save(o);
    });
    await this.audit.record({
      action: 'order.cancelled',
      entityType: 'Order',
      entityId: id,
      metadata: { reason },
    });
    return order;
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    const order = await findOwnedOrFail(this.repo, id, ctx.organizationId, 'Order');
    if (order.status !== OrderStatus.DRAFT)
      throw conflict('ORDER_NOT_DRAFT', 'Only draft orders can be deleted');
    await this.repo.softDelete({ id });
    await this.audit.record({ action: 'order.deleted', entityType: 'Order', entityId: id });
  }

  @OnEvent(DomainEvents.SHIPMENT_STATUS_CHANGED)
  async onShipmentStatusChanged(event: ShipmentStatusChangedEvent): Promise<void> {
    if (!event.orderId) return;
    await this.dataSource.transaction(async (manager) => {
      const order = await manager
        .getRepository(Order)
        .findOne({ where: { id: event.orderId! }, lock: { mode: 'pessimistic_write' } });
      if (!order) return;
      const shipments = await manager
        .getRepository(Shipment)
        .find({ where: { orderId: order.id }, select: { id: true, status: true } });
      const next = deriveOrderStatus(
        order.status,
        shipments.map((s) => s.status),
      );
      if (next !== order.status) {
        await manager.getRepository(Order).update({ id: order.id }, { status: next });
        await this.audit.record(
          {
            action: 'order.status_changed',
            entityType: 'Order',
            entityId: order.id,
            organizationId: order.organizationId,
            metadata: { from: order.status, to: next },
          },
          manager,
        );
      }
    });
  }
}
