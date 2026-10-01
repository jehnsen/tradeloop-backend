import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { TenantContext } from '../common/auth/auth-context';
import { DomainEventPublisher, DomainEvents } from '../common/events/domain-events';
import { conflict, invalidTransition } from '../common/http/app.exception';
import { paginate } from '../common/http/pagination';
import { definedOnly } from '../common/utils/pick';
import { findOwnedOrFail, repoFor } from '../common/utils/tenant';
import { Shipment, ShipmentStatus } from '../shipments/shipment.entity';
import { CreateLoadDto, LoadQueryDto, UpdateLoadDto } from './dto/load.dto';
import { Load, LoadStatus } from './load.entity';

const CLOSED_SHIPMENT = [ShipmentStatus.CANCELLED, ShipmentStatus.DELIVERED, ShipmentStatus.FAILED];

@Injectable()
export class LoadsService {
  constructor(
    @InjectRepository(Load) private readonly repo: Repository<Load>,
    @InjectRepository(Shipment) private readonly shipments: Repository<Shipment>,
    private readonly events: DomainEventPublisher,
    private readonly audit: AuditService,
  ) {}

  async create(ctx: TenantContext, dto: CreateLoadDto): Promise<Load> {
    if (dto.shipmentId) await this.assertShipmentOpen(ctx.organizationId, dto.shipmentId);
    const load = await this.repo.save(
      this.repo.create({ ...dto, organizationId: ctx.organizationId, status: LoadStatus.PENDING }),
    );
    await this.audit.record({ action: 'load.created', entityType: 'Load', entityId: load.id });
    await this.events.publish(DomainEvents.LOAD_CREATED, {
      id: load.id,
      organizationId: load.organizationId,
    });
    return load;
  }

  list(ctx: TenantContext, query: LoadQueryDto) {
    const qb = this.repo
      .createQueryBuilder('l')
      .where('l.organizationId = :org', { org: ctx.organizationId });
    if (query.status) qb.andWhere('l.status = :status', { status: query.status });
    if (query.shipmentId)
      qb.andWhere('l.shipmentId = :shipmentId', { shipmentId: query.shipmentId });
    if (query.cargoType) qb.andWhere('l.cargoType = :cargoType', { cargoType: query.cargoType });
    if (query.requiredVehicleType)
      qb.andWhere('l.requiredVehicleType = :rvt', { rvt: query.requiredVehicleType });
    if (query.minWeightKg !== undefined)
      qb.andWhere('l.weightKg >= :minW', { minW: query.minWeightKg });
    if (query.maxWeightKg !== undefined)
      qb.andWhere('l.weightKg <= :maxW', { maxW: query.maxWeightKg });
    return paginate(qb, query, { createdAt: 'l.createdAt', weightKg: 'l.weightKg' }, 'createdAt');
  }

  get(organizationId: string, id: string, manager?: EntityManager): Promise<Load> {
    return findOwnedOrFail(repoFor(manager, this.repo), id, organizationId, 'Load');
  }

  async update(ctx: TenantContext, id: string, dto: UpdateLoadDto): Promise<Load> {
    const load = await this.get(ctx.organizationId, id);
    if (load.status !== LoadStatus.PENDING) throw invalidTransition('load', load.status, 'edit');
    if (dto.shipmentId) await this.assertShipmentOpen(ctx.organizationId, dto.shipmentId);
    return this.repo.save(Object.assign(load, definedOnly(dto)));
  }

  async cancel(ctx: TenantContext, id: string): Promise<Load> {
    const load = await this.get(ctx.organizationId, id);
    if (load.status !== LoadStatus.PENDING) throw invalidTransition('load', load.status, 'cancel');
    load.status = LoadStatus.CANCELLED;
    await this.repo.save(load);
    await this.audit.record({ action: 'load.cancelled', entityType: 'Load', entityId: id });
    return load;
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    const load = await this.get(ctx.organizationId, id);
    if (load.status !== LoadStatus.PENDING)
      throw conflict('LOAD_NOT_PENDING', 'Only pending loads can be deleted');
    await this.repo.softDelete({ id });
  }

  private async assertShipmentOpen(organizationId: string, shipmentId: string): Promise<void> {
    const shipment = await findOwnedOrFail(this.shipments, shipmentId, organizationId, 'Shipment');
    if (CLOSED_SHIPMENT.includes(shipment.status)) {
      throw conflict('SHIPMENT_CLOSED', `Cannot add loads to a ${shipment.status} shipment`);
    }
  }
}
