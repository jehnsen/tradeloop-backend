import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import type { Point } from 'geojson';

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371.0088;

export function toPoint(lat: number, lng: number): Point {
  return { type: 'Point', coordinates: [lng, lat] };
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** SQL expression for a geography point built from named parameters. */
export const pointSql = (latParam: string, lngParam: string) =>
  `ST_SetSRID(ST_MakePoint(:${lngParam}, :${latParam}), 4326)::geography`;

/** Restricts a query to rows whose geography column lies within radiusKm of a coordinate. */
export function whereWithinRadius<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  column: string,
  center: LatLng,
  radiusKm: number,
  paramPrefix: string,
): SelectQueryBuilder<T> {
  return qb.andWhere(
    `ST_DWithin(${column}, ${pointSql(`${paramPrefix}Lat`, `${paramPrefix}Lng`)}, :${paramPrefix}Meters)`,
    {
      [`${paramPrefix}Lat`]: center.lat,
      [`${paramPrefix}Lng`]: center.lng,
      [`${paramPrefix}Meters`]: radiusKm * 1000,
    },
  );
}

/** Adds a computed distance (km) column to a query for sorting or display. */
export function selectDistanceKm<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  column: string,
  center: LatLng,
  alias: string,
): SelectQueryBuilder<T> {
  return qb
    .addSelect(`ST_Distance(${column}, ${pointSql(`${alias}Lat`, `${alias}Lng`)}) / 1000`, alias)
    .setParameters({ [`${alias}Lat`]: center.lat, [`${alias}Lng`]: center.lng });
}
