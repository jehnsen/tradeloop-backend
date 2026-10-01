import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { whereWithinRadius } from '../common/geo/geo';
import { badRequest } from '../common/http/app.exception';

interface RadiusInput {
  lat?: number;
  lng?: number;
  radiusKm?: number;
}

/** Applies an optional radius filter on a geography column; all three parameters are required together. */
export function applyRadius<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  column: string,
  input: RadiusInput,
  prefix: string,
): void {
  const given = [input.lat, input.lng, input.radiusKm].filter((v) => v !== undefined).length;
  if (given === 0) return;
  if (given !== 3)
    throw badRequest(
      'INVALID_RADIUS_FILTER',
      `${prefix}Lat, ${prefix}Lng and ${prefix}RadiusKm must be provided together`,
    );
  whereWithinRadius(qb, column, { lat: input.lat!, lng: input.lng! }, input.radiusKm!, prefix);
}

export function applyPlace<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  city: string | undefined,
  province: string | undefined,
  prefix: string,
): void {
  if (city) qb.andWhere(`${alias}.city ILIKE :${prefix}City`, { [`${prefix}City`]: city });
  if (province)
    qb.andWhere(`${alias}.province ILIKE :${prefix}Province`, { [`${prefix}Province`]: province });
}

/** [from, until] window overlaps [dateFrom, dateTo]. */
export function applyWindowOverlap<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  fromColumn: string,
  untilColumn: string,
  dateFrom?: Date,
  dateTo?: Date,
): void {
  if (dateFrom) qb.andWhere(`${untilColumn} >= :dateFrom`, { dateFrom });
  if (dateTo) qb.andWhere(`${fromColumn} <= :dateTo`, { dateTo });
}
