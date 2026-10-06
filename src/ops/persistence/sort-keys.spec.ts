import { assignSortKeys, renumber, SORT_STEP } from './sort-keys';

const sorted = (order: string[], keys: Map<string, number>, changed: Map<string, number>) => {
  const all = new Map([...keys, ...changed]);
  return [...order].sort((a, b) => all.get(a)! - all.get(b)!);
};

describe('assignSortKeys', () => {
  const keys = renumber(['a', 'b', 'c']);

  it('keys a prepended record before the first one, touching nothing else', () => {
    const changed = assignSortKeys(['n', 'a', 'b', 'c'], keys);
    expect([...changed.keys()]).toEqual(['n']);
    expect(changed.get('n')).toBe(keys.get('a')! - SORT_STEP);
  });

  it('keys appended and inserted records between their neighbours', () => {
    const order = ['a', 'x', 'y', 'b', 'c', 'z'];
    const changed = assignSortKeys(order, keys);
    expect([...changed.keys()].sort()).toEqual(['x', 'y', 'z']);
    expect(sorted(order, keys, changed)).toEqual(order);
  });

  it('renumbers when existing records moved', () => {
    const order = ['c', 'a', 'b'];
    const changed = assignSortKeys(order, keys);
    expect(sorted(order, keys, changed)).toEqual(order);
  });

  it('renumbers when the gap between neighbours is used up', () => {
    const tight = new Map([
      ['a', 1],
      ['b', 1 + 1e-9],
    ]);
    const order = ['a', 'n', 'b'];
    const changed = assignSortKeys(order, tight);
    expect(sorted(order, tight, changed)).toEqual(order);
  });
});
