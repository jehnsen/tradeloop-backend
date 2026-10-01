import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { TenantContext } from '../common/auth/auth-context';
import { paginate } from '../common/http/pagination';
import { definedOnly } from '../common/utils/pick';
import { findOwnedOrFail, repoFor } from '../common/utils/tenant';
import { Customer } from './customer.entity';
import { CreateCustomerDto, CustomerQueryDto, UpdateCustomerDto } from './dto/customer.dto';

@Injectable()
export class CustomersService {
  constructor(@InjectRepository(Customer) private readonly repo: Repository<Customer>) {}

  create(ctx: TenantContext, dto: CreateCustomerDto): Promise<Customer> {
    return this.repo.save(this.repo.create({ ...dto, organizationId: ctx.organizationId }));
  }

  list(ctx: TenantContext, query: CustomerQueryDto) {
    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.organizationId = :org', { org: ctx.organizationId });
    if (query.status) qb.andWhere('c.status = :status', { status: query.status });
    if (query.search) {
      qb.andWhere('(c.name ILIKE :s OR c.companyName ILIKE :s OR c.email ILIKE :s)', {
        s: `%${query.search}%`,
      });
    }
    return paginate(qb, query, { name: 'c.name', createdAt: 'c.createdAt' }, 'createdAt');
  }

  get(organizationId: string, id: string, manager?: EntityManager): Promise<Customer> {
    return findOwnedOrFail(repoFor(manager, this.repo), id, organizationId, 'Customer');
  }

  async update(ctx: TenantContext, id: string, dto: UpdateCustomerDto): Promise<Customer> {
    const customer = await this.get(ctx.organizationId, id);
    return this.repo.save(Object.assign(customer, definedOnly(dto)));
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    await this.get(ctx.organizationId, id);
    await this.repo.softDelete({ id, organizationId: ctx.organizationId });
  }
}
