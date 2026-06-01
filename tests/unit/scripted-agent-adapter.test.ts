import { describe, expect, it } from 'vitest';

import { ScriptedAgentAdapter } from '../../src/agents/scripted.js';

describe('ScriptedAgentAdapter', () => {
  describe('initial state', () => {
    it('reports state "idle" before start() is called', async () => {
      const adapter = new ScriptedAgentAdapter({ steps: [] });

      const status = await adapter.status();

      expect(status.state).toBe('idle');
      expect(status.startedAt).toBeUndefined();
      expect(status.lastActivityAt).toBeUndefined();
      expect(status.error).toBeUndefined();
    });
  });

  describe('start()', () => {
    it('transitions idle → running and records startedAt', async () => {
      const adapter = new ScriptedAgentAdapter({ steps: [] });

      await adapter.start({ workingDirectory: '/tmp/work' });
      const status = await adapter.status();

      expect(status.state).toBe('running');
      expect(status.startedAt).toBeInstanceOf(Date);
    });

    it('rejects with invalid-state when called twice without stop', async () => {
      const adapter = new ScriptedAgentAdapter({ steps: [] });
      await adapter.start({ workingDirectory: '/tmp/work' });

      await expect(adapter.start({ workingDirectory: '/tmp/work' })).rejects.toMatchObject({
        name: 'AgentAdapterError',
        code: 'invalid-state'
      });
    });
  });

  describe('stop()', () => {
    it('transitions running → stopped', async () => {
      const adapter = new ScriptedAgentAdapter({ steps: [] });
      await adapter.start({ workingDirectory: '/tmp/work' });

      await adapter.stop();
      const status = await adapter.status();

      expect(status.state).toBe('stopped');
    });

    it('is a no-op when never started', async () => {
      const adapter = new ScriptedAgentAdapter({ steps: [] });

      await expect(adapter.stop()).resolves.toBeUndefined();
      const status = await adapter.status();
      expect(status.state).toBe('idle');
    });

    it('is idempotent when already stopped', async () => {
      const adapter = new ScriptedAgentAdapter({ steps: [] });
      await adapter.start({ workingDirectory: '/tmp/work' });
      await adapter.stop();

      await expect(adapter.stop()).resolves.toBeUndefined();
      const status = await adapter.status();
      expect(status.state).toBe('stopped');
    });
  });
});
