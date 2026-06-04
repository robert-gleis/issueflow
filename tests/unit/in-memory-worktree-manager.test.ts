import { describe, expect, it } from 'vitest';

import { InMemoryWorktreeManager } from '../../src/worktrees/in-memory.js';
import { InMemoryWorktreePlacement, type WorktreePlacement } from '../../src/worktrees/placement.js';
import {
  WorktreeManagerError,
  type WorktreeIntent,
  type WorktreeLocation,
  type WorktreeOwner
} from '../../src/worktrees/types.js';

function makeClock(times: string[]): () => Date {
  const dates = times.map((iso) => new Date(iso));
  let i = 0;
  return () => {
    const result = dates[Math.min(i, dates.length - 1)];
    i += 1;
    return result;
  };
}

function makeIdFactory(prefix = 'wt'): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}

describe('InMemoryWorktreeManager.acquire', () => {
  it('records a fresh worktree for a new owner', async () => {
    const placement = new InMemoryWorktreePlacement();
    const manager = new InMemoryWorktreeManager({
      placement,
      idFactory: makeIdFactory(),
      now: makeClock(['2026-06-04T10:00:00.000Z'])
    });

    const owner: WorktreeOwner = { kind: 'team', id: 'team-42' };
    const intent: WorktreeIntent = { branchName: 'feature/team-42', issueNumber: 42 };

    const record = await manager.acquire({ owner, intent });

    expect(record.id).toBe('wt-1');
    expect(record.owner).toEqual(owner);
    expect(record.location).toEqual({ path: '/inmem/feature/team-42', branchName: 'feature/team-42' });
    expect(record.issueNumber).toBe(42);
    expect(record.createdAt.toISOString()).toBe('2026-06-04T10:00:00.000Z');
    expect(record.lastSeenAt.toISOString()).toBe('2026-06-04T10:00:00.000Z');
  });

  it('stores issueNumber as null when intent omits it for non-issue owners', async () => {
    const manager = new InMemoryWorktreeManager({
      placement: new InMemoryWorktreePlacement(),
      idFactory: makeIdFactory(),
      now: makeClock(['2026-06-04T10:00:00.000Z'])
    });

    const record = await manager.acquire({
      owner: { kind: 'agent', id: 'agent-7' },
      intent: { branchName: 'feature/agent-7' }
    });

    expect(record.issueNumber).toBeNull();
  });

  it('requires intent.issueNumber to match owner.id when owner.kind is issue', async () => {
    const manager = new InMemoryWorktreeManager({
      placement: new InMemoryWorktreePlacement(),
      idFactory: makeIdFactory(),
      now: makeClock(['2026-06-04T10:00:00.000Z'])
    });

    await expect(
      manager.acquire({
        owner: { kind: 'issue', id: '19' },
        intent: { branchName: 'issue/19' }
      })
    ).rejects.toMatchObject({
      name: 'WorktreeManagerError',
      code: 'invalid-intent',
      message: expect.stringMatching(/missing/)
    } satisfies Partial<WorktreeManagerError>);

    await expect(
      manager.acquire({
        owner: { kind: 'issue', id: '19' },
        intent: { branchName: 'issue/19', issueNumber: 20 }
      })
    ).rejects.toMatchObject({
      name: 'WorktreeManagerError',
      code: 'invalid-intent'
    } satisfies Partial<WorktreeManagerError>);
  });

  it('rejects an issue owner.id that does not parse as a positive integer', async () => {
    const manager = new InMemoryWorktreeManager({
      placement: new InMemoryWorktreePlacement(),
      idFactory: makeIdFactory(),
      now: makeClock(['2026-06-04T10:00:00.000Z'])
    });

    await expect(
      manager.acquire({
        owner: { kind: 'issue', id: 'abc' },
        intent: { branchName: 'issue/abc', issueNumber: 1 }
      })
    ).rejects.toMatchObject({
      name: 'WorktreeManagerError',
      code: 'invalid-intent'
    } satisfies Partial<WorktreeManagerError>);

    await expect(
      manager.acquire({
        owner: { kind: 'issue', id: '' },
        intent: { branchName: 'issue/0', issueNumber: 0 }
      })
    ).rejects.toMatchObject({
      name: 'WorktreeManagerError',
      code: 'invalid-intent'
    } satisfies Partial<WorktreeManagerError>);

    await expect(
      manager.acquire({
        owner: { kind: 'issue', id: '0' },
        intent: { branchName: 'issue/0', issueNumber: 0 }
      })
    ).rejects.toMatchObject({
      name: 'WorktreeManagerError',
      code: 'invalid-intent'
    } satisfies Partial<WorktreeManagerError>);
  });

  it('treats a one-sided suggestedPath (one undefined, the other set) as a different intent (strict equality)', async () => {
    const manager = new InMemoryWorktreeManager({
      placement: new InMemoryWorktreePlacement(),
      idFactory: makeIdFactory(),
      now: makeClock(['2026-06-04T10:00:00.000Z', '2026-06-04T11:00:00.000Z'])
    });

    const owner: WorktreeOwner = { kind: 'team', id: 'team-42' };

    await manager.acquire({
      owner,
      intent: { branchName: 'feature/x' }
    });

    await expect(
      manager.acquire({
        owner,
        intent: { branchName: 'feature/x', suggestedPath: '/foo' }
      })
    ).rejects.toMatchObject({ code: 'owner-already-acquired' });
  });

  it('is idempotent on same-intent re-acquire: same record, lastSeenAt refreshed, placement.ensure once', async () => {
    const ensureCalls: WorktreeIntent[] = [];
    const placement: WorktreePlacement = {
      ensure: async (intent) => {
        ensureCalls.push(intent);
        return { path: '/p/issue/19', branchName: 'issue/19' };
      },
      list: async () => [],
      remove: async () => {}
    };

    const manager = new InMemoryWorktreeManager({
      placement,
      idFactory: makeIdFactory(),
      now: makeClock(['2026-06-04T10:00:00.000Z', '2026-06-04T11:00:00.000Z'])
    });

    const owner: WorktreeOwner = { kind: 'issue', id: '19' };
    const intent: WorktreeIntent = { branchName: 'issue/19', issueNumber: 19 };

    const first = await manager.acquire({ owner, intent });
    const second = await manager.acquire({ owner, intent });

    expect(second.id).toBe(first.id);
    expect(second.createdAt.toISOString()).toBe('2026-06-04T10:00:00.000Z');
    expect(second.lastSeenAt.toISOString()).toBe('2026-06-04T11:00:00.000Z');
    expect(ensureCalls).toHaveLength(1);
  });

  it('throws owner-already-acquired when the same owner re-acquires with a different intent', async () => {
    const manager = new InMemoryWorktreeManager({
      placement: new InMemoryWorktreePlacement(),
      idFactory: makeIdFactory(),
      now: makeClock(['2026-06-04T10:00:00.000Z', '2026-06-04T11:00:00.000Z'])
    });

    const owner: WorktreeOwner = { kind: 'team', id: 'team-42' };

    await manager.acquire({ owner, intent: { branchName: 'feature/team-42-a' } });

    await expect(
      manager.acquire({ owner, intent: { branchName: 'feature/team-42-b' } })
    ).rejects.toMatchObject({
      name: 'WorktreeManagerError',
      code: 'owner-already-acquired'
    } satisfies Partial<WorktreeManagerError>);
  });

  it('treats differing optional suggestedPath as a different intent (collides)', async () => {
    const manager = new InMemoryWorktreeManager({
      placement: new InMemoryWorktreePlacement(),
      idFactory: makeIdFactory(),
      now: makeClock(['2026-06-04T10:00:00.000Z', '2026-06-04T11:00:00.000Z'])
    });

    const owner: WorktreeOwner = { kind: 'team', id: 'team-42' };

    await manager.acquire({
      owner,
      intent: { branchName: 'feature/x', suggestedPath: '/a' }
    });

    await expect(
      manager.acquire({
        owner,
        intent: { branchName: 'feature/x', suggestedPath: '/b' }
      })
    ).rejects.toMatchObject({ code: 'owner-already-acquired' });
  });

  it('wraps a placement failure as placement-failed and leaves the registry empty', async () => {
    const placement: WorktreePlacement = {
      ensure: async () => {
        throw new Error('disk full');
      },
      list: async () => [],
      remove: async () => {}
    };

    const manager = new InMemoryWorktreeManager({
      placement,
      idFactory: makeIdFactory(),
      now: makeClock(['2026-06-04T10:00:00.000Z'])
    });

    await expect(
      manager.acquire({
        owner: { kind: 'team', id: 'team-42' },
        intent: { branchName: 'feature/x' }
      })
    ).rejects.toMatchObject({
      name: 'WorktreeManagerError',
      code: 'placement-failed',
      message: expect.stringContaining('disk full')
    } satisfies Partial<WorktreeManagerError>);

    expect(await manager.list()).toEqual([]);
    expect(await manager.findByOwner({ kind: 'team', id: 'team-42' })).toBeNull();
  });
});

describe('InMemoryWorktreeManager.release', () => {
  it('removes the record from the registry without disk side effects by default', async () => {
    const removeCalls: WorktreeLocation[] = [];
    const placement: WorktreePlacement = {
      ensure: async (intent) => ({ path: `/p/${intent.branchName}`, branchName: intent.branchName }),
      list: async () => [],
      remove: async (loc) => {
        removeCalls.push(loc);
      }
    };
    const manager = new InMemoryWorktreeManager({
      placement,
      idFactory: makeIdFactory(),
      now: makeClock(['2026-06-04T10:00:00.000Z'])
    });

    const owner: WorktreeOwner = { kind: 'team', id: 'team-42' };
    const record = await manager.acquire({ owner, intent: { branchName: 'feature/x' } });

    await manager.release({ id: record.id });

    expect(await manager.get(record.id)).toBeNull();
    expect(await manager.findByOwner(owner)).toBeNull();
    expect(removeCalls).toEqual([]);
  });

  it('asks the placement to remove the location when deleteOnDisk is true', async () => {
    const removeCalls: WorktreeLocation[] = [];
    const placement: WorktreePlacement = {
      ensure: async (intent) => ({ path: `/p/${intent.branchName}`, branchName: intent.branchName }),
      list: async () => [],
      remove: async (loc) => {
        removeCalls.push(loc);
      }
    };
    const manager = new InMemoryWorktreeManager({
      placement,
      idFactory: makeIdFactory(),
      now: makeClock(['2026-06-04T10:00:00.000Z'])
    });

    const record = await manager.acquire({
      owner: { kind: 'team', id: 'team-42' },
      intent: { branchName: 'feature/x' }
    });

    await manager.release({ id: record.id, deleteOnDisk: true });

    expect(removeCalls).toEqual([{ path: '/p/feature/x', branchName: 'feature/x' }]);
    expect(await manager.get(record.id)).toBeNull();
  });

  it('is a no-op for an unknown id and does not call placement.remove', async () => {
    const removeCalls: WorktreeLocation[] = [];
    const placement: WorktreePlacement = {
      ensure: async (intent) => ({ path: `/p/${intent.branchName}`, branchName: intent.branchName }),
      list: async () => [],
      remove: async (loc) => {
        removeCalls.push(loc);
      }
    };
    const manager = new InMemoryWorktreeManager({
      placement,
      idFactory: makeIdFactory(),
      now: makeClock(['2026-06-04T10:00:00.000Z'])
    });

    await expect(manager.release({ id: 'wt-does-not-exist' })).resolves.toBeUndefined();
    await expect(manager.release({ id: 'wt-does-not-exist', deleteOnDisk: true })).resolves.toBeUndefined();
    expect(removeCalls).toHaveLength(0);
  });

  it('is a no-op when called twice for the same id (safe to retry)', async () => {
    const manager = new InMemoryWorktreeManager({
      placement: new InMemoryWorktreePlacement(),
      idFactory: makeIdFactory(),
      now: makeClock(['2026-06-04T10:00:00.000Z'])
    });

    const record = await manager.acquire({
      owner: { kind: 'team', id: 'team-42' },
      intent: { branchName: 'feature/x' }
    });

    await manager.release({ id: record.id });
    await expect(manager.release({ id: record.id })).resolves.toBeUndefined();
  });

  it('propagates placement.remove errors unchanged and leaves the record in place', async () => {
    const placement: WorktreePlacement = {
      ensure: async (intent) => ({ path: `/p/${intent.branchName}`, branchName: intent.branchName }),
      list: async () => [],
      remove: async () => {
        throw new Error('rm: permission denied');
      }
    };
    const manager = new InMemoryWorktreeManager({
      placement,
      idFactory: makeIdFactory(),
      now: makeClock(['2026-06-04T10:00:00.000Z'])
    });

    const record = await manager.acquire({
      owner: { kind: 'team', id: 'team-42' },
      intent: { branchName: 'feature/x' }
    });

    await expect(manager.release({ id: record.id, deleteOnDisk: true })).rejects.toMatchObject({
      message: 'rm: permission denied'
    });

    expect(await manager.get(record.id)).not.toBeNull();
  });

  it('allows acquire to reuse the same owner after release', async () => {
    const manager = new InMemoryWorktreeManager({
      placement: new InMemoryWorktreePlacement(),
      idFactory: makeIdFactory(),
      now: makeClock([
        '2026-06-04T10:00:00.000Z',
        '2026-06-04T11:00:00.000Z'
      ])
    });

    const owner: WorktreeOwner = { kind: 'team', id: 'team-42' };

    const first = await manager.acquire({ owner, intent: { branchName: 'feature/a' } });
    await manager.release({ id: first.id });

    const second = await manager.acquire({ owner, intent: { branchName: 'feature/b' } });

    expect(second.id).not.toBe(first.id);
    expect(second.location.branchName).toBe('feature/b');
  });
});

describe('InMemoryWorktreeManager.get / findByOwner / list', () => {
  it('returns null and empty array before any acquire', async () => {
    const manager = new InMemoryWorktreeManager({
      placement: new InMemoryWorktreePlacement(),
      idFactory: makeIdFactory(),
      now: makeClock(['2026-06-04T10:00:00.000Z'])
    });

    expect(await manager.get('wt-1')).toBeNull();
    expect(await manager.findByOwner({ kind: 'team', id: 'team-42' })).toBeNull();
    expect(await manager.list()).toEqual([]);
  });

  it('returns every active record across multiple owner kinds', async () => {
    const manager = new InMemoryWorktreeManager({
      placement: new InMemoryWorktreePlacement(),
      idFactory: makeIdFactory(),
      now: makeClock([
        '2026-06-04T10:00:00.000Z',
        '2026-06-04T10:05:00.000Z',
        '2026-06-04T10:10:00.000Z'
      ])
    });

    const r1 = await manager.acquire({
      owner: { kind: 'team', id: 'team-42' },
      intent: { branchName: 'feature/team-42' }
    });
    const r2 = await manager.acquire({
      owner: { kind: 'agent', id: 'agent-7' },
      intent: { branchName: 'feature/agent-7' }
    });
    const r3 = await manager.acquire({
      owner: { kind: 'issue', id: '19' },
      intent: { branchName: 'issue/19', issueNumber: 19 }
    });

    const ids = (await manager.list()).map((rec) => rec.id).sort();
    expect(ids).toEqual([r1.id, r2.id, r3.id].sort());

    expect(await manager.findByOwner({ kind: 'agent', id: 'agent-7' })).toEqual(r2);
    expect(await manager.findByOwner({ kind: 'issue', id: '19' })).toEqual(r3);
    expect(await manager.findByOwner({ kind: 'team', id: 'team-99' })).toBeNull();
  });
});

describe('InMemoryWorktreeManager.touch', () => {
  it('refreshes lastSeenAt for a known id', async () => {
    const manager = new InMemoryWorktreeManager({
      placement: new InMemoryWorktreePlacement(),
      idFactory: makeIdFactory(),
      now: makeClock(['2026-06-04T10:00:00.000Z', '2026-06-04T11:00:00.000Z'])
    });

    const record = await manager.acquire({
      owner: { kind: 'team', id: 'team-42' },
      intent: { branchName: 'feature/x' }
    });

    await manager.touch(record.id);

    const refreshed = await manager.get(record.id);
    expect(refreshed?.lastSeenAt.toISOString()).toBe('2026-06-04T11:00:00.000Z');
  });

  it('honors an explicit now argument when provided', async () => {
    const manager = new InMemoryWorktreeManager({
      placement: new InMemoryWorktreePlacement(),
      idFactory: makeIdFactory(),
      now: makeClock(['2026-06-04T10:00:00.000Z'])
    });

    const record = await manager.acquire({
      owner: { kind: 'team', id: 'team-42' },
      intent: { branchName: 'feature/x' }
    });

    await manager.touch(record.id, new Date('2026-06-04T20:00:00.000Z'));

    const refreshed = await manager.get(record.id);
    expect(refreshed?.lastSeenAt.toISOString()).toBe('2026-06-04T20:00:00.000Z');
  });

  it('is a no-op for an unknown id', async () => {
    const manager = new InMemoryWorktreeManager({
      placement: new InMemoryWorktreePlacement(),
      idFactory: makeIdFactory(),
      now: makeClock(['2026-06-04T10:00:00.000Z'])
    });

    await expect(manager.touch('wt-missing')).resolves.toBeUndefined();
  });

  it('is a no-op for an unknown id even with an explicit now', async () => {
    const manager = new InMemoryWorktreeManager({
      placement: new InMemoryWorktreePlacement(),
      idFactory: makeIdFactory(),
      now: makeClock(['2026-06-04T10:00:00.000Z'])
    });

    await expect(
      manager.touch('wt-missing', new Date('2026-06-04T20:00:00.000Z'))
    ).resolves.toBeUndefined();
  });
});
