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
});
