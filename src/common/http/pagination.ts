import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { badRequest } from './app.exception';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIn(['ASC', 'DESC'])
  order: 'ASC' | 'DESC' = 'DESC';
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  [key: string]: unknown;
}

export class Paginated<T> {
  constructor(
    readonly items: T[],
    readonly meta: PageMeta,
  ) {}

  map<R>(fn: (item: T) => R): Paginated<R> {
    return new Paginated(this.items.map(fn), this.meta);
  }
}

export type SortMap = Record<string, string>;

export async function paginate<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  query: PaginationQueryDto,
  sortable: SortMap,
  defaultSort: string,
): Promise<Paginated<T>> {
  const sortKey = query.sort ?? defaultSort;
  const column = sortable[sortKey];
  if (!column) {
    throw badRequest('INVALID_SORT', `sort must be one of: ${Object.keys(sortable).join(', ')}`);
  }
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const order = query.order ?? 'DESC';
  qb.orderBy(column, order)
    .addOrderBy(`${qb.alias}.id`, order)
    .skip((page - 1) * limit)
    .take(limit);
  const [items, total] = await qb.getManyAndCount();
  return new Paginated(items, { page, limit, total, totalPages: Math.ceil(total / limit) });
}
