import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { AppConfig } from '../common/config/configuration';
import { CommissionType } from '../common/enums';
import { Organization } from '../organizations/entities/organization.entity';
import { CommissionRule } from './commission';

@Injectable()
export class CommissionService {
  private readonly defaults: CommissionRule;

  constructor(
    private readonly dataSource: DataSource,
    config: ConfigService<AppConfig, true>,
  ) {
    const billing = config.get('billing', { infer: true });
    this.defaults = {
      type: billing.commissionType as CommissionType,
      value: billing.commissionValue,
    };
  }

  /** Carrier-specific override (set by platform admins) or the platform default. */
  async ruleFor(carrierOrganizationId: string, manager?: EntityManager): Promise<CommissionRule> {
    const org = await (manager ?? this.dataSource.manager).getRepository(Organization).findOne({
      where: { id: carrierOrganizationId },
      select: { id: true, commissionType: true, commissionValue: true },
    });
    if (org?.commissionType) return { type: org.commissionType, value: org.commissionValue ?? 0 };
    return this.defaults;
  }
}
