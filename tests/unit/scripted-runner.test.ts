import { describe, expect, it } from 'vitest';

import { ScriptedRunner } from '../../src/runners/scripted.js';

describe('ScriptedRunner', () => {
  describe('initial state', () => {
    it('reports state "idle" before spawn() is called', async () => {
      const runner = new ScriptedRunner('r1');

      const status = await runner.status();

      expect(runner.id).toBe('r1');
      expect(status.state).toBe('idle');
      expect(status.startedAt).toBeUndefined();
      expect(status.stoppedAt).toBeUndefined();
      expect(status.exitCode).toBeUndefined();
      expect(status.error).toBeUndefined();
    });

    it('returns empty logs before spawn()', async () => {
      const runner = new ScriptedRunner('r1', { stdout: 'will not appear yet' });

      const snapshot = await runner.logs();

      expect(snapshot.stdout).toBe('');
      expect(snapshot.stderr).toBe('');
      expect(snapshot.combined).toBe('');
      expect(snapshot.truncated).toBe(false);
    });
  });

  describe('spawn() — happy path', () => {
    it('transitions idle → running and records startedAt', async () => {
      const runner = new ScriptedRunner('r1');

      await runner.spawn({ binary: '/bin/true', args: [], cwd: '/tmp' });
      const status = await runner.status();

      expect(status.state).toBe('running');
      expect(status.startedAt).toBeInstanceOf(Date);
      expect(status.exitCode).toBeUndefined();
    });

    it('exposes scripted stdout/stderr after spawn', async () => {
      const runner = new ScriptedRunner('r1', { stdout: 'hello\n', stderr: 'oops\n' });

      await runner.spawn({ binary: '/bin/true', args: [], cwd: '/tmp' });
      const snapshot = await runner.logs();

      expect(snapshot.stdout).toBe('hello\n');
      expect(snapshot.stderr).toBe('oops\n');
      expect(snapshot.combined).toBe('[stdout]\nhello\n\n[stderr]\noops\n');
      expect(snapshot.truncated).toBe(false);
    });

    it('produces combined logs with only the populated half when stderr is empty', async () => {
      const runner = new ScriptedRunner('r1', { stdout: 'only out' });

      await runner.spawn({ binary: '/bin/true', args: [], cwd: '/tmp' });
      const snapshot = await runner.logs();

      expect(snapshot.combined).toBe('[stdout]\nonly out');
    });
  });

  describe('spawn() — invalid state', () => {
    it('rejects with invalid-state when called twice without stop', async () => {
      const runner = new ScriptedRunner('r1');
      await runner.spawn({ binary: '/bin/true', args: [], cwd: '/tmp' });

      await expect(
        runner.spawn({ binary: '/bin/true', args: [], cwd: '/tmp' })
      ).rejects.toMatchObject({
        name: 'RunnerError',
        code: 'invalid-state'
      });
    });
  });

  describe('spawn() — spawnDelayMs makes the starting state observable', () => {
    it('reports "starting" mid-flight and "running" after the delay', async () => {
      const runner = new ScriptedRunner('r1', { spawnDelayMs: 30 });

      const spawnPromise = runner.spawn({ binary: '/bin/true', args: [], cwd: '/tmp' });

      // First status() is awaited before the spawn delay resolves, so we should see starting.
      const midFlight = await runner.status();
      expect(midFlight.state).toBe('starting');
      expect(midFlight.startedAt).toBeInstanceOf(Date);

      await spawnPromise;
      const afterSpawn = await runner.status();
      expect(afterSpawn.state).toBe('running');
    });
  });

  describe('spawn() — failOnSpawn drives the runner into the error state', () => {
    it('rejects with spawn-failed and exposes the reason via status.error', async () => {
      const runner = new ScriptedRunner('r1', { failOnSpawn: 'boom' });

      await expect(
        runner.spawn({ binary: '/bin/true', args: [], cwd: '/tmp' })
      ).rejects.toMatchObject({
        name: 'RunnerError',
        code: 'spawn-failed',
        message: 'boom'
      });

      const status = await runner.status();
      expect(status.state).toBe('error');
      expect(status.error).toBe('boom');
      expect(status.startedAt).toBeInstanceOf(Date);
      expect(status.stoppedAt).toBeUndefined();
    });
  });

  describe('stop() lifecycle', () => {
    it('transitions running → stopped, sets stoppedAt and exitCode from the script', async () => {
      const runner = new ScriptedRunner('r1', { exitCode: 7 });
      await runner.spawn({ binary: '/bin/true', args: [], cwd: '/tmp' });

      await runner.stop();
      const status = await runner.status();

      expect(status.state).toBe('stopped');
      expect(status.stoppedAt).toBeInstanceOf(Date);
      expect(status.exitCode).toBe(7);
    });

    it('defaults exitCode to 0 when the script omits it', async () => {
      const runner = new ScriptedRunner('r1');
      await runner.spawn({ binary: '/bin/true', args: [], cwd: '/tmp' });

      await runner.stop();
      const status = await runner.status();

      expect(status.exitCode).toBe(0);
    });

    it('is a no-op when called from idle (never spawned)', async () => {
      const runner = new ScriptedRunner('r1');

      await expect(runner.stop()).resolves.toBeUndefined();
      const status = await runner.status();
      expect(status.state).toBe('idle');
      expect(status.stoppedAt).toBeUndefined();
      expect(status.exitCode).toBeUndefined();
    });

    it('is idempotent when already stopped', async () => {
      const runner = new ScriptedRunner('r1');
      await runner.spawn({ binary: '/bin/true', args: [], cwd: '/tmp' });
      await runner.stop();
      const firstStoppedAt = (await runner.status()).stoppedAt;

      await expect(runner.stop()).resolves.toBeUndefined();
      const status = await runner.status();

      expect(status.state).toBe('stopped');
      expect(status.stoppedAt).toEqual(firstStoppedAt);
    });

    it('transitions error → stopped after a failed spawn', async () => {
      const runner = new ScriptedRunner('r1', { failOnSpawn: 'boom', exitCode: 2 });
      await runner.spawn({ binary: '/bin/true', args: [], cwd: '/tmp' }).catch(() => {});
      const beforeStop = await runner.status();
      expect(beforeStop.state).toBe('error');

      await runner.stop();
      const status = await runner.status();

      expect(status.state).toBe('stopped');
      expect(status.stoppedAt).toBeInstanceOf(Date);
      expect(status.exitCode).toBe(2);
      expect(status.error).toBe('boom');
    });

    it('transitions starting → stopped while spawn is still in flight', async () => {
      const runner = new ScriptedRunner('r1', { spawnDelayMs: 50, exitCode: 1 });
      const spawnPromise = runner.spawn({ binary: '/bin/true', args: [], cwd: '/tmp' });

      const midFlight = await runner.status();
      expect(midFlight.state).toBe('starting');

      await runner.stop();
      const status = await runner.status();

      expect(status.state).toBe('stopped');
      expect(status.exitCode).toBe(1);

      // The in-flight spawn must not flip state back to running after stop.
      await spawnPromise.catch(() => {});
      const finalStatus = await runner.status();
      expect(finalStatus.state).toBe('stopped');
    });
  });
});
