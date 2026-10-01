import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { PostingVisibility } from './entities/marketplace.enums';

/**
 * SQL predicate: posting is readable by the viewer organization. Owners always see their own;
 * others see NETWORK postings, and PARTNERS_ONLY postings when the owner lists them as partner.
 */
export function visibilityPredicate(alias: string, viewerParam: string): string {
  return `(${alias}.organization_id = :${viewerParam}
    OR ${alias}.visibility = '${PostingVisibility.NETWORK}'
    OR (${alias}.visibility = '${PostingVisibility.PARTNERS_ONLY}' AND EXISTS (
      SELECT 1 FROM organization_partnerships op
       WHERE op.organization_id = ${alias}.organization_id AND op.partner_organization_id = :${viewerParam})))`;
}

export function whereVisibleTo<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  viewerOrganizationId: string,
): SelectQueryBuilder<T> {
  return qb.andWhere(visibilityPredicate(alias, 'viewerOrgId'), {
    viewerOrgId: viewerOrganizationId,
  });
}

export function whereNotExpired<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
): SelectQueryBuilder<T> {
  return qb.andWhere(`(${alias}.expires_at IS NULL OR ${alias}.expires_at > now())`);
}
