import { CommissionType } from '../common/enums';
import { calculateCommission } from './commission';

describe('calculateCommission', () => {
  it('applies a percentage in centavos', () => {
    expect(calculateCommission(25_000, { type: CommissionType.PERCENTAGE, value: 5 })).toEqual({
      platformCommissionType: CommissionType.PERCENTAGE,
      platformCommissionValue: 5,
      platformCommissionAmount: 1_250,
      carrierNetAmount: 23_750,
    });
  });

  it('rounds half up to the centavo', () => {
    // 2.5% of 10.10 = 0.2525 -> 0.25 ; 2.5% of 10.30 = 0.2575 -> 0.26
    expect(
      calculateCommission(10.1, { type: CommissionType.PERCENTAGE, value: 2.5 })
        .platformCommissionAmount,
    ).toBe(0.25);
    expect(
      calculateCommission(10.3, { type: CommissionType.PERCENTAGE, value: 2.5 })
        .platformCommissionAmount,
    ).toBe(0.26);
    expect(
      calculateCommission(0.1, { type: CommissionType.PERCENTAGE, value: 5 })
        .platformCommissionAmount,
    ).toBe(0.01);
  });

  it('supports fractional percentages without float error', () => {
    const r = calculateCommission(19_999.99, { type: CommissionType.PERCENTAGE, value: 7.25 });
    expect(r.platformCommissionAmount).toBe(1_450);
    expect(r.carrierNetAmount).toBe(18_549.99);
  });

  it('commission plus net always equals the agreed amount', () => {
    for (const amount of [0, 0.01, 1, 99.99, 12_345.67, 9_999_999.99]) {
      for (const value of [0, 1, 3.33, 12.5, 100]) {
        const r = calculateCommission(amount, { type: CommissionType.PERCENTAGE, value });
        expect(Math.round((r.platformCommissionAmount + r.carrierNetAmount) * 100)).toBe(
          Math.round(amount * 100),
        );
      }
    }
  });

  it('applies a fixed fee capped at the agreed amount', () => {
    expect(calculateCommission(10_000, { type: CommissionType.FIXED, value: 500 })).toMatchObject({
      platformCommissionAmount: 500,
      carrierNetAmount: 9_500,
    });
    expect(calculateCommission(300, { type: CommissionType.FIXED, value: 500 })).toMatchObject({
      platformCommissionAmount: 300,
      carrierNetAmount: 0,
    });
  });

  it('charges nothing for NONE', () => {
    expect(calculateCommission(10_000, { type: CommissionType.NONE, value: 99 })).toEqual({
      platformCommissionType: CommissionType.NONE,
      platformCommissionValue: 0,
      platformCommissionAmount: 0,
      carrierNetAmount: 10_000,
    });
  });

  it('is deterministic', () => {
    const rule = { type: CommissionType.PERCENTAGE, value: 4.75 };
    expect(calculateCommission(87_654.32, rule)).toEqual(calculateCommission(87_654.32, rule));
  });

  it('rejects invalid input', () => {
    expect(() => calculateCommission(-1, { type: CommissionType.FIXED, value: 1 })).toThrow(
      RangeError,
    );
    expect(() => calculateCommission(100, { type: CommissionType.PERCENTAGE, value: 101 })).toThrow(
      RangeError,
    );
    expect(() => calculateCommission(Number.NaN, { type: CommissionType.NONE, value: 0 })).toThrow(
      RangeError,
    );
  });
});
