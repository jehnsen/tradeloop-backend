import { EntityManager } from 'typeorm';
import { OrganizationType, Role } from '../../common/enums';
import { hashPassword } from '../../common/utils/password';
import { OpsStore } from '../../ops/persistence/ops-store';
import { buildDemoTenant } from '../../ops/seed';
import { OrganizationMembership } from '../../organizations/entities/organization-membership.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';

export const LUCENA_FRESH_CODE = 'LUCENA-FRESH';

/** One login per desk of the TradeLoop demo, plus a driver and a portal customer. */
const ACCOUNTS: [email: string, first: string, last: string, role: Role, subjectRef?: string][] = [
  ['owner@lucenafresh.local', 'Rodel', 'Samonte', Role.OWNER],
  ['sales@lucenafresh.local', 'Kristine', 'Ramos', Role.SALES],
  ['dispatch@lucenafresh.local', 'Noel', 'Pascual', Role.DISPATCHER],
  ['procurement@lucenafresh.local', 'Edwin', 'Manalo', Role.PROCUREMENT],
  ['warehouse@lucenafresh.local', 'Bong', 'Esguerra', Role.WAREHOUSE],
  ['accounting@lucenafresh.local', 'Grace', 'Lontoc', Role.FINANCE],
  ['driver@lucenafresh.local', 'Joel', 'Mendoza', Role.DRIVER, 'DRV-01'],
  ['driver2@lucenafresh.local', 'Ramon', 'Villanueva', Role.DRIVER, 'DRV-02'],
  ['marco@seasidegrill.local', 'Marco', 'Villareal', Role.CUSTOMER, 'CUS-022'],
];

/**
 * Lucena Fresh Trading & Logistics: the TradeLoop demo tenant with its full operations data set.
 * Idempotent — skipped when the organization already exists (reset it from the app instead).
 */
export async function seedLucenaFresh(m: EntityManager, password: string): Promise<string[]> {
  const orgs = m.getRepository(Organization);
  if (await orgs.exists({ where: { code: LUCENA_FRESH_CODE } })) return [];
  const org = await orgs.save(
    orgs.create({
      name: 'Lucena Fresh Trading & Logistics',
      code: LUCENA_FRESH_CODE,
      type: OrganizationType.LOGISTICS_PROVIDER,
      email: 'orders@lucenafresh.ph',
      phone: '(042) 710-4418',
      metadata: { opsDemo: true },
    }),
  );
  const passwordHash = await hashPassword(password);
  const lines: string[] = [];
  for (const [email, firstName, lastName, role, subjectRef] of ACCOUNTS) {
    let user = await m.getRepository(User).findOne({ where: { email } });
    user ??= await m
      .getRepository(User)
      .save(m.getRepository(User).create({ email, passwordHash, firstName, lastName }));
    await m
      .getRepository(OrganizationMembership)
      .insert({ organizationId: org.id, userId: user.id, role, subjectRef: subjectRef ?? null });
    lines.push(`${email.padEnd(32)} ${role.padEnd(18)} ${org.name}`);
  }
  const demo = buildDemoTenant();
  await new OpsStore().replaceAll(m, org.id, demo.profile, demo.data, 1);
  return lines;
}
