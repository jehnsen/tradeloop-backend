import {
  EntityManager,
  FindOptionsRelations,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import { notFound } from '../http/app.exception';

/**
 * Loads a tenant-owned row by id, scoped to the caller's organization. Rows owned by other
 * tenants are reported as not found so IDs cannot be probed across organizations.
 */
export async function findOwnedOrFail<
  T extends ObjectLiteral & { id: string; organizationId: string | null },
>(
  repo: Repository<T>,
  id: string,
  organizationId: string,
  label: string,
  options: { lock?: boolean; relations?: FindOptionsRelations<T> } = {},
): Promise<T> {
  const entity = await repo.findOne({
    where: { id, organizationId } as FindOptionsWhere<T>,
    relations: options.relations,
    lock: options.lock ? { mode: 'pessimistic_write' } : undefined,
  });
  if (!entity) throw notFound(label);
  return entity;
}

export const repoFor = <T extends ObjectLiteral>(
  manager: EntityManager | undefined,
  fallback: Repository<T>,
): Repository<T> => (manager ? manager.getRepository<T>(fallback.target) : fallback);
