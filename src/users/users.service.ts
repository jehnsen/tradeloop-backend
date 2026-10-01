import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { notFound } from '../common/http/app.exception';
import { paginate } from '../common/http/pagination';
import { definedOnly } from '../common/utils/pick';
import { hashPassword } from '../common/utils/password';
import { UpdateProfileDto, UpdateUserStatusDto, UserQueryDto } from './dto/user.dto';
import { User, UserStatus } from './entities/user.entity';

export interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  status?: UserStatus;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    private readonly audit: AuditService,
  ) {}

  findByEmail(email: string, manager?: EntityManager): Promise<User | null> {
    return (manager?.getRepository(User) ?? this.repo).findOne({
      where: { email: normalizeEmail(email) },
    });
  }

  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email: normalizeEmail(email) })
      .getOne();
  }

  findWithPassword(id: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id })
      .getOne();
  }

  async create(input: CreateUserInput, manager: EntityManager): Promise<User> {
    const repo = manager.getRepository(User);
    const user = repo.create({
      email: normalizeEmail(input.email),
      passwordHash: await hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      status: input.status ?? UserStatus.ACTIVE,
    });
    const saved = await repo.save(user);
    delete (saved as Partial<User>).passwordHash;
    return saved;
  }

  async getById(id: string): Promise<User> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw notFound('User');
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    await this.repo.update({ id: userId }, definedOnly(dto));
    return this.getById(userId);
  }

  async updatePassword(userId: string, password: string): Promise<void> {
    await this.repo.update({ id: userId }, { passwordHash: await hashPassword(password) });
  }

  async touchLogin(userId: string): Promise<void> {
    await this.repo.update({ id: userId }, { lastLoginAt: new Date() });
  }

  list(query: UserQueryDto) {
    const qb = this.repo.createQueryBuilder('u');
    if (query.status) qb.andWhere('u.status = :status', { status: query.status });
    if (query.search) {
      qb.andWhere("(u.email ILIKE :s OR (u.first_name || ' ' || u.last_name) ILIKE :s)", {
        s: `%${query.search}%`,
      });
    }
    return paginate(qb, query, { createdAt: 'u.createdAt', email: 'u.email' }, 'createdAt');
  }

  async updateStatus(id: string, dto: UpdateUserStatusDto): Promise<User> {
    const user = await this.getById(id);
    await this.repo.update({ id }, { status: dto.status });
    await this.audit.record({
      action: 'user.status_changed',
      entityType: 'User',
      entityId: id,
      metadata: { from: user.status, to: dto.status },
    });
    return this.getById(id);
  }
}
