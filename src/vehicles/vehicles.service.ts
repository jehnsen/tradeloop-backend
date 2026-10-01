import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { TenantContext } from '../common/auth/auth-context';
import { conflict } from '../common/http/app.exception';
import { paginate } from '../common/http/pagination';
import { definedOnly } from '../common/utils/pick';
import { findOwnedOrFail, repoFor } from '../common/utils/tenant';
import { CreateVehicleDto, UpdateVehicleDto, VehicleQueryDto } from './dto/vehicle.dto';
import { Vehicle, VehicleStatus } from './vehicle.entity';

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(Vehicle) private readonly repo: Repository<Vehicle>,
    private readonly audit: AuditService,
  ) {}

  async create(ctx: TenantContext, dto: CreateVehicleDto): Promise<Vehicle> {
    const vehicle = await this.repo.save(
      this.repo.create({ ...dto, organizationId: ctx.organizationId }),
    );
    await this.audit.record({
      action: 'vehicle.created',
      entityType: 'Vehicle',
      entityId: vehicle.id,
      metadata: { plateNumber: vehicle.plateNumber },
    });
    return vehicle;
  }

  list(ctx: TenantContext, query: VehicleQueryDto) {
    const qb = this.repo
      .createQueryBuilder('v')
      .where('v.organizationId = :org', { org: ctx.organizationId });
    if (query.status) qb.andWhere('v.status = :status', { status: query.status });
    if (query.vehicleType) qb.andWhere('v.vehicleType = :type', { type: query.vehicleType });
    if (query.search)
      qb.andWhere('(v.plateNumber ILIKE :s OR v.make ILIKE :s OR v.model ILIKE :s)', {
        s: `%${query.search}%`,
      });
    if (query.minWeightKg !== undefined)
      qb.andWhere('v.maxWeightKg >= :w', { w: query.minWeightKg });
    return paginate(
      qb,
      query,
      { plateNumber: 'v.plateNumber', createdAt: 'v.createdAt', maxWeightKg: 'v.maxWeightKg' },
      'createdAt',
    );
  }

  get(organizationId: string, id: string, manager?: EntityManager): Promise<Vehicle> {
    return findOwnedOrFail(repoFor(manager, this.repo), id, organizationId, 'Vehicle');
  }

  async update(ctx: TenantContext, id: string, dto: UpdateVehicleDto): Promise<Vehicle> {
    const vehicle = await this.get(ctx.organizationId, id);
    if (dto.status && vehicle.status === VehicleStatus.IN_USE) {
      throw conflict('VEHICLE_IN_USE', 'Vehicle status is controlled by its active trip');
    }
    const saved = await this.repo.save(Object.assign(vehicle, definedOnly(dto)));
    await this.audit.record({
      action: 'vehicle.updated',
      entityType: 'Vehicle',
      entityId: id,
      metadata: { changes: Object.keys(definedOnly(dto)) },
    });
    return saved;
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    const vehicle = await this.get(ctx.organizationId, id);
    if (vehicle.status === VehicleStatus.IN_USE)
      throw conflict('VEHICLE_IN_USE', 'Vehicle is on an active trip');
    await this.repo.softDelete({ id, organizationId: ctx.organizationId });
    await this.audit.record({ action: 'vehicle.deleted', entityType: 'Vehicle', entityId: id });
  }

  async setStatus(ids: string[], status: VehicleStatus, manager: EntityManager): Promise<void> {
    if (ids.length) await manager.getRepository(Vehicle).update({ id: In(ids) }, { status });
  }
}
