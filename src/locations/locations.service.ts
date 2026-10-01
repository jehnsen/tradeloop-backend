import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, IsNull, Repository } from 'typeorm';
import { TenantContext } from '../common/auth/auth-context';
import { toPoint, whereWithinRadius } from '../common/geo/geo';
import { badRequest, forbidden, notFound } from '../common/http/app.exception';
import { paginate } from '../common/http/pagination';
import { definedOnly } from '../common/utils/pick';
import { repoFor } from '../common/utils/tenant';
import { CreateLocationDto, LocationQueryDto, UpdateLocationDto } from './dto/location.dto';
import { Location } from './location.entity';

@Injectable()
export class LocationsService {
  constructor(@InjectRepository(Location) private readonly repo: Repository<Location>) {}

  async create(ctx: TenantContext, dto: CreateLocationDto): Promise<Location> {
    const { shared, ...data } = dto;
    if (shared && !ctx.isPlatformAdmin)
      throw forbidden(
        'PLATFORM_ADMIN_REQUIRED',
        'Only platform admins can create shared locations',
      );
    const saved = await this.repo.save(
      this.repo.create({
        ...data,
        country: data.country?.toUpperCase() ?? 'PH',
        organizationId: shared ? null : ctx.organizationId,
        location: toPoint(data.latitude, data.longitude),
      }),
    );
    return this.getAccessible(ctx.organizationId, saved.id);
  }

  list(ctx: TenantContext, query: LocationQueryDto) {
    const qb = this.repo.createQueryBuilder('l').where(
      new Brackets((w) => {
        w.where('l.organizationId = :org', { org: ctx.organizationId });
        if (query.includeShared !== false) w.orWhere('l.organizationId IS NULL');
      }),
    );
    if (query.type) qb.andWhere('l.type = :type', { type: query.type });
    if (query.city) qb.andWhere('l.city ILIKE :city', { city: query.city });
    if (query.province) qb.andWhere('l.province ILIKE :province', { province: query.province });
    if (query.search) {
      qb.andWhere('(l.name ILIKE :s OR l.addressLine ILIKE :s OR l.city ILIKE :s)', {
        s: `%${query.search}%`,
      });
    }
    if (query.lat !== undefined || query.lng !== undefined || query.radiusKm !== undefined) {
      if (query.lat === undefined || query.lng === undefined || query.radiusKm === undefined) {
        throw badRequest(
          'INVALID_RADIUS_FILTER',
          'lat, lng and radiusKm must be provided together',
        );
      }
      whereWithinRadius(
        qb,
        'l.location',
        { lat: query.lat, lng: query.lng },
        query.radiusKm,
        'near',
      );
    }
    return paginate(
      qb,
      query,
      { name: 'l.name', createdAt: 'l.createdAt', city: 'l.city' },
      'createdAt',
    );
  }

  /** Own locations and platform-shared locations are usable by a tenant. */
  async getAccessible(
    organizationId: string,
    id: string,
    manager?: EntityManager,
  ): Promise<Location> {
    const location = await repoFor(manager, this.repo).findOne({
      where: [
        { id, organizationId },
        { id, organizationId: IsNull() },
      ],
    });
    if (!location) throw notFound('Location');
    return location;
  }

  async update(ctx: TenantContext, id: string, dto: UpdateLocationDto): Promise<Location> {
    const location = await this.getWritable(ctx, id);
    Object.assign(location, definedOnly(dto));
    if (dto.country) location.country = dto.country.toUpperCase();
    if (dto.latitude !== undefined || dto.longitude !== undefined) {
      location.location = toPoint(location.latitude, location.longitude);
    }
    await this.repo.save(location);
    return this.getAccessible(ctx.organizationId, id);
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    await this.getWritable(ctx, id);
    await this.repo.softDelete({ id });
  }

  private async getWritable(ctx: TenantContext, id: string): Promise<Location> {
    const location = await this.getAccessible(ctx.organizationId, id);
    if (location.organizationId === null && !ctx.isPlatformAdmin) {
      throw forbidden('SHARED_LOCATION', 'Shared locations can only be changed by platform admins');
    }
    return location;
  }
}
