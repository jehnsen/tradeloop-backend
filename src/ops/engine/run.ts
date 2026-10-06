import { randomBytes } from 'node:crypto';
import { setClock } from '../domain/data/company';
import { applyTenantProfile } from '../domain/data/tenant';
import { diffOpsData } from '../domain/lib/ops-data';
import type { OpsChanges, OpsData, Role, TenantProfile } from '../domain/types';
import type { OpsClock } from './clock';
import { createCommands, type DataBox, type OpsCommandName, type OpsCommands } from './commands';

/**
 * Runs `fn` with the domain registries (company, staff, fleet, baselines, clock) set to one
 * organization. The registries are process-wide, so `fn` must be synchronous: nothing else can
 * run between setting them and finishing.
 */
export function withTenant<T>(profile: TenantProfile, now: string, fn: () => T): T {
  applyTenantProfile(profile);
  setClock(now);
  const result = fn();
  if (result instanceof Promise) throw new Error('withTenant callbacks must be synchronous');
  return result;
}

export interface RunContext {
  profile: TenantProfile;
  clock: OpsClock;
  actor: string;
  role: Role;
}

export type CommandArgs<N extends OpsCommandName> = Parameters<OpsCommands[N]>;
export type CommandResult<N extends OpsCommandName> = ReturnType<OpsCommands[N]>;

export interface CommandRun<N extends OpsCommandName> {
  data: OpsData;
  result: CommandResult<N>;
  changes: OpsChanges;
}

const notificationId = () => `N-${randomBytes(5).toString('hex')}`;

/** Apply one command to a data set and return the new data set with what changed. */
export function runCommand<N extends OpsCommandName>(
  data: OpsData,
  ctx: RunContext,
  name: N,
  args: CommandArgs<N>,
): CommandRun<N> {
  return withTenant(ctx.profile, ctx.clock.now(), () => {
    let current = data;
    const box: DataBox = {
      get: () => current,
      set: (patch) => {
        current = { ...current, ...(typeof patch === 'function' ? patch(current) : patch) };
      },
    };
    const commands = createCommands(box, {
      actor: ctx.actor,
      role: ctx.role,
      stamp: () => ctx.clock.stamp(),
      notificationId,
    });
    const command = commands[name] as (...a: CommandArgs<N>) => CommandResult<N>;
    const result = command(...args);
    return { data: current, result, changes: diffOpsData(data, current) };
  });
}
