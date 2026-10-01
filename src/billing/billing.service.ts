import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BillingSummaryQueryDto } from './dto/billing.dto';
import { CommissionService } from './commission.service';

interface SummaryRow {
  status: string;
  currency: string;
  bookings: string;
  gross: string | null;
  commission: string | null;
  net: string | null;
}

const toSummary = (rows: SummaryRow[]) =>
  rows.map((r) => ({
    status: r.status,
    currency: r.currency,
    bookings: Number(r.bookings),
    grossAmount: Number(r.gross ?? 0),
    platformCommissionAmount: Number(r.commission ?? 0),
    carrierNetAmount: Number(r.net ?? 0),
  }));

@Injectable()
export class BillingService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly commissions: CommissionService,
  ) {}

  async organizationSummary(organizationId: string, query: BillingSummaryQueryDto) {
    const [asCarrier, asShipper, rule] = await Promise.all([
      this.aggregate('carrier_organization_id = $1', [organizationId], query),
      this.aggregate('shipper_organization_id = $1', [organizationId], query),
      this.commissions.ruleFor(organizationId),
    ]);
    return {
      period: { from: query.from ?? null, to: query.to ?? null },
      commissionRule: rule,
      asCarrier: toSummary(asCarrier),
      // Shippers only see what they pay; platform commission is a carrier-side charge.
      asShipper: toSummary(asShipper).map(({ status, currency, bookings, grossAmount }) => ({
        status,
        currency,
        bookings,
        totalAmount: grossAmount,
      })),
    };
  }

  async platformSummary(query: BillingSummaryQueryDto) {
    return {
      period: { from: query.from ?? null, to: query.to ?? null },
      totals: toSummary(await this.aggregate('TRUE', [], query)),
    };
  }

  private aggregate(
    scope: string,
    params: unknown[],
    query: BillingSummaryQueryDto,
  ): Promise<SummaryRow[]> {
    const values = [...params];
    let where = scope;
    if (query.from) {
      values.push(query.from);
      where += ` AND created_at >= $${values.length}`;
    }
    if (query.to) {
      values.push(query.to);
      where += ` AND created_at <= $${values.length}`;
    }
    return this.dataSource.query(
      `SELECT status, currency, COUNT(*) AS bookings, SUM(agreed_amount) AS gross,
              SUM(platform_commission_amount) AS commission, SUM(carrier_net_amount) AS net
         FROM marketplace_bookings WHERE ${where}
        GROUP BY status, currency ORDER BY status, currency`,
      values,
    );
  }
}
