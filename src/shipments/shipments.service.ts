import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { TenantContext } from '../common/auth/auth-context';
import {
  DomainEventPublisher,
  DomainEvents,
  ShipmentStatusChangedEvent,
} from '../common/events/domain-events';
import { badRequest, conflict, invalidTransition } from '../common/http/app.exception';
import { paginate } from '../common/http/pagination';
import { SequenceService } from '../common/sequence/sequence.service';
import { definedOnly } from '../common/utils/pick';
import { findOwnedOrFail, repoFor } from '../common/utils/tenant';
import { Load, LoadStatus } from '../loads/load.entity';
import { LocationsService } from '../locations/locations.service';
import { Order, OrderStatus } from '../orders/order.entity';
import { CreateShipmentDto, ShipmentQueryDto, UpdateShipmentDto } from './dto/shipment.dto';
import { deriveShipmentStatus } from './shipment-status';
import { Shipment, ShipmentStatus } from './shipment.entity';

const EDITABLE = [ShipmentStatus.PENDING, ShipmentStatus.PLANNED];
const FAILABLE = [ShipmentStatus.ASSIGNED, ShipmentStatus.PICKED_UP, ShipmentStatus.IN_TRANSIT];

@Injectable()
export class ShipmentsService {
  constructor(
    @InjectRepository(Shipment) private readonly repo: Repository<Shipment>,
    private readonly dataSource: DataSource,
    private readonly locations: LocationsService,
    private readonly sequences: SequenceService,
    private readonly events: DomainEventPublisher,
    private readonly audit: AuditService,
  ) {}

  async create(ctx: TenantContext, dto: CreateShipmentDto): Promise<Shipment> {
    this.assertWindows(dto);
    const shipment = await this.dataSource.transaction(async (manager) => {
      if (dto.orderId) {
        const order = await findOwnedOrFail(
          manager.getRepository(Order),
          dto.orderId,
          ctx.organizationId,
          'Order',
        );
        if ([OrderStatus.CANCELLED, OrderStatus.COMPLETED].includes(order.status)) {
          throw conflict('ORDER_CLOSED', `Cannot add shipments to a ${order.status} order`);
        }
      }
      await this.locations.getAccessible(ctx.organizationId, dto.pickupLocationId, manager);
      await this.locations.getAccessible(ctx.organizationId, dto.deliveryLocationId, manager);
      const repo = manager.getRepository(Shipment);
      return repo.save(
        repo.create({
          ...dto,
          organizationId: ctx.organizationId,
          shipmentNumber: await this.sequences.next('SHP', ctx.organizationId, manager),
          status: ShipmentStatus.PENDING,
        }),
      );
    });
    await this.audit.record({
      action: 'shipment.created',
      entityType: 'Shipment',
      entityId: shipment.id,
    });
    await this.events.publish(DomainEvents.SHIPMENT_CREATED, {
      id: shipment.id,
      organizationId: shipment.organizationId,
    });
    return shipment;
  }

  list(ctx: TenantContext, query: ShipmentQueryDto) {
    const qb = this.repo
      .createQueryBuilder('s')
      .leftJoin('s.pickupLocation', 'pl')
      .leftJoin('s.deliveryLocation', 'dl')
      .addSelect([
        'pl.id',
        'pl.name',
        'pl.city',
        'pl.province',
        'dl.id',
        'dl.name',
        'dl.city',
        'dl.province',
      ])
      .where('s.organizationId = :org', { org: ctx.organizationId });
    if (query.status) qb.andWhere('s.status = :status', { status: query.status });
    if (query.orderId) qb.andWhere('s.orderId = :orderId', { orderId: query.orderId });
    if (query.shipmentNumber)
      qb.andWhere('s.shipmentNumber ILIKE :num', { num: `%${query.shipmentNumber}%` });
    if (query.from) qb.andWhere('s.createdAt >= :from', { from: query.from });
    if (query.to) qb.andWhere('s.createdAt <= :to', { to: query.to });
    return paginate(
      qb,
      query,
      { createdAt: 's.createdAt', pickupWindowStart: 's.pickupWindowStart' },
      'createdAt',
    );
  }

  get(organizationId: string, id: string, manager?: EntityManager): Promise<Shipment> {
    return findOwnedOrFail(repoFor(manager, this.repo), id, organizationId, 'Shipment', {
      relations: { pickupLocation: true, deliveryLocation: true },
    });
  }

  async update(ctx: TenantContext, id: string, dto: UpdateShipmentDto): Promise<Shipment> {
    const shipment = await findOwnedOrFail(this.repo, id, ctx.organizationId, 'Shipment');
    if (!EDITABLE.includes(shipment.status))
      throw invalidTransition('shipment', shipment.status, 'edit');
    if (dto.orderId)
      await findOwnedOrFail(
        this.dataSource.getRepository(Order),
        dto.orderId,
        ctx.organizationId,
        'Order',
      );
    if (dto.pickupLocationId)
      await this.locations.getAccessible(ctx.organizationId, dto.pickupLocationId);
    if (dto.deliveryLocationId)
      await this.locations.getAccessible(ctx.organizationId, dto.deliveryLocationId);
    Object.assign(shipment, definedOnly(dto));
    this.assertWindows(shipment);
    await this.repo.save(shipment);
    return this.get(ctx.organizationId, id);
  }

  plan(ctx: TenantContext, id: string) {
    return this.transition(ctx, id, 'plan', [ShipmentStatus.PENDING], ShipmentStatus.PLANNED);
  }

  fail(ctx: TenantContext, id: string, reason?: string) {
    return this.transition(ctx, id, 'fail', FAILABLE, ShipmentStatus.FAILED, reason);
  }

  async cancel(ctx: TenantContext, id: string, reason?: string): Promise<Shipment> {
    const shipment = await this.dataSource.transaction(async (manager) => {
      const s = await findOwnedOrFail(
        manager.getRepository(Shipment),
        id,
        ctx.organizationId,
        'Shipment',
        { lock: true },
      );
      if (!EDITABLE.includes(s.status)) throw invalidTransition('shipment', s.status, 'cancel');
      await manager
        .getRepository(Load)
        .update({ shipmentId: id, status: LoadStatus.PENDING }, { status: LoadStatus.CANCELLED });
      s.status = ShipmentStatus.CANCELLED;
      return manager.getRepository(Shipment).save(s);
    });
    await this.afterStatusChange(shipment, 'shipment.cancelled', reason);
    return shipment;
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    const shipment = await findOwnedOrFail(this.repo, id, ctx.organizationId, 'Shipment');
    if (shipment.status !== ShipmentStatus.PENDING)
      throw conflict('SHIPMENT_NOT_PENDING', 'Only pending shipments can be deleted');
    const hasLoads = await this.dataSource
      .getRepository(Load)
      .exists({ where: { shipmentId: id } });
    if (hasLoads) throw conflict('SHIPMENT_HAS_LOADS', 'Delete or cancel the shipment loads first');
    await this.repo.softDelete({ id });
  }

  /**
   * Recomputes shipment statuses from their loads inside a transaction. Returns change events that
   * the caller should publish after commit.
   */
  async syncFromLoads(
    manager: EntityManager,
    shipmentIds: Array<string | null>,
  ): Promise<ShipmentStatusChangedEvent[]> {
    const ids = [...new Set(shipmentIds.filter((id): id is string => !!id))];
    if (!ids.length) return [];
    const shipments = await manager.getRepository(Shipment).find({ where: { id: In(ids) } });
    const loads = await manager.getRepository(Load).find({
      where: { shipmentId: In(ids) },
      select: { id: true, shipmentId: true, status: true },
    });
    const changes: ShipmentStatusChangedEvent[] = [];
    for (const shipment of shipments) {
      const next = deriveShipmentStatus(
        shipment.status,
        loads.filter((l) => l.shipmentId === shipment.id).map((l) => l.status),
      );
      if (next === shipment.status) continue;
      await manager.getRepository(Shipment).update({ id: shipment.id }, { status: next });
      changes.push({
        shipmentId: shipment.id,
        organizationId: shipment.organizationId,
        orderId: shipment.orderId,
        status: next,
      });
    }
    return changes;
  }

  async publishChanges(changes: ShipmentStatusChangedEvent[]): Promise<void> {
    for (const change of changes)
      await this.events.publish(DomainEvents.SHIPMENT_STATUS_CHANGED, change);
  }

  private async transition(
    ctx: TenantContext,
    id: string,
    action: string,
    from: ShipmentStatus[],
    to: ShipmentStatus,
    reason?: string,
  ): Promise<Shipment> {
    const shipment = await findOwnedOrFail(this.repo, id, ctx.organizationId, 'Shipment');
    if (!from.includes(shipment.status))
      throw invalidTransition('shipment', shipment.status, action);
    shipment.status = to;
    await this.repo.save(shipment);
    await this.afterStatusChange(
      shipment,
      `shipment.${action === 'fail' ? 'failed' : 'planned'}`,
      reason,
    );
    return shipment;
  }

  private async afterStatusChange(
    shipment: Shipment,
    action: string,
    reason?: string,
  ): Promise<void> {
    await this.audit.record({
      action,
      entityType: 'Shipment',
      entityId: shipment.id,
      metadata: { reason },
    });
    await this.events.publish(DomainEvents.SHIPMENT_STATUS_CHANGED, {
      shipmentId: shipment.id,
      organizationId: shipment.organizationId,
      orderId: shipment.orderId,
      status: shipment.status,
    } satisfies ShipmentStatusChangedEvent);
  }

  private assertWindows(
    s: Partial<
      Pick<
        Shipment,
        'pickupWindowStart' | 'pickupWindowEnd' | 'deliveryWindowStart' | 'deliveryWindowEnd'
      >
    >,
  ) {
    if (s.pickupWindowStart && s.pickupWindowEnd && s.pickupWindowStart > s.pickupWindowEnd) {
      throw badRequest('INVALID_WINDOW', 'pickupWindowStart must be before pickupWindowEnd');
    }
    if (
      s.deliveryWindowStart &&
      s.deliveryWindowEnd &&
      s.deliveryWindowStart > s.deliveryWindowEnd
    ) {
      throw badRequest('INVALID_WINDOW', 'deliveryWindowStart must be before deliveryWindowEnd');
    }
  }
}
