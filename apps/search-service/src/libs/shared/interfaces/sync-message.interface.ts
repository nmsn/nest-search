export interface SyncMessage {
  businessLine: string;
  triggeredBy: 'cron' | 'manual';
  timestamp: Date;
}

export interface SyncFullMessage extends SyncMessage {
  type: 'full';
}

export interface SyncIncrementalMessage extends SyncMessage {
  type: 'incremental';
  lastSyncTime: Date;
}

export interface FormSubmittedEvent {
  formId: number;
  businessLine: string;
  schemeId: number;
  totalAmount: number;
  timestamp: Date;
}
