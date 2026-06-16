import type { WorkflowState } from '../workflow/state-machine.js';

export type WatcherSource = 'assigned-to-me' | 'label';
export type WatcherIntakeMode = 'confirm' | 'auto';

export interface WatcherConfig {
  interval_seconds: number;
  source: WatcherSource;
  intake_mode: WatcherIntakeMode;
  initial_state: Exclude<WorkflowState, 'closed'>;
  trigger_label: string;
}

export type StateBackend = 'github-labels' | 'local';

export interface IssueflowConfig {
  watcher: WatcherConfig;
  autonomous_mode: boolean;
  state_backend: StateBackend;
}

export const DEFAULT_WATCHER_CONFIG: WatcherConfig = {
  interval_seconds: 60,
  source: 'assigned-to-me',
  intake_mode: 'confirm',
  initial_state: 'triaged',
  trigger_label: 'triaged'
};

export const DEFAULT_CONFIG: IssueflowConfig = {
  watcher: DEFAULT_WATCHER_CONFIG,
  autonomous_mode: false,
  state_backend: 'local'
};

export const MIN_INTERVAL_SECONDS = 5;
