export interface WatcherConfig {
  interval_seconds: number;
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
  trigger_label: 'state:triaged'
};

export const DEFAULT_CONFIG: IssueflowConfig = {
  watcher: DEFAULT_WATCHER_CONFIG,
  autonomous_mode: false,
  state_backend: 'github-labels'
};

export const MIN_INTERVAL_SECONDS = 5;
