import { CommissionType } from '../common/enums';

export interface CommissionRule {
  type: CommissionType;
  value: number;
}

export interface CommissionResult {
  platformCommissionType: CommissionType;
  platformCommissionValue: number;
  platformCommissionAmount: number;
  carrierNetAmount: number;
}

const toCents = (amount: number) => Math.round(amount * 100);

/**
 * Deterministic commission calculation in integer centavos.
 * PERCENTAGE rounds half-up to the centavo; FIXED is capped at the agreed amount.
 */
export function calculateCommission(agreedAmount: number, rule: CommissionRule): CommissionResult {
  if (!Number.isFinite(agreedAmount) || agreedAmount < 0)
    throw new RangeError('agreedAmount must be a non-negative number');
  if (!Number.isFinite(rule.value) || rule.value < 0)
    throw new RangeError('commission value must be non-negative');

  const amountCents = toCents(agreedAmount);
  let commissionCents = 0;
  switch (rule.type) {
    case CommissionType.PERCENTAGE: {
      if (rule.value > 100) throw new RangeError('percentage commission cannot exceed 100');
      const basisPoints = BigInt(Math.round(rule.value * 100));
      commissionCents = Number((BigInt(amountCents) * basisPoints + 5000n) / 10000n);
      break;
    }
    case CommissionType.FIXED:
      commissionCents = Math.min(amountCents, toCents(rule.value));
      break;
    case CommissionType.NONE:
      commissionCents = 0;
      break;
  }
  return {
    platformCommissionType: rule.type,
    platformCommissionValue: rule.type === CommissionType.NONE ? 0 : rule.value,
    platformCommissionAmount: commissionCents / 100,
    carrierNetAmount: (amountCents - commissionCents) / 100,
  };
}
