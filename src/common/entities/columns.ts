import { Column, ColumnOptions, ValueTransformer } from 'typeorm';
import type { Point } from 'geojson';

export const numericTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : Number(value)),
};

export function NumericColumn(
  options: { precision?: number; scale?: number } & Pick<
    ColumnOptions,
    'nullable' | 'default'
  > = {},
) {
  return Column({
    type: 'numeric',
    precision: options.precision ?? 12,
    scale: options.scale ?? 2,
    nullable: options.nullable,
    default: options.default,
    transformer: numericTransformer,
  });
}

export function GeographyPointColumn(options: Pick<ColumnOptions, 'nullable'> = {}) {
  return Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: options.nullable,
    select: false,
  });
}

export type GeoPoint = Point;
