import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SyncService } from './sync.service';
import { BUSINESS_LINES, BusinessLineCode } from '../libs/shared/index';

@Injectable()
export class SyncScheduler {
  private readonly logger = new Logger(SyncScheduler.name);

  constructor(private readonly syncService: SyncService) {}

  @Cron('0 2 * * *')
  async handleDailyIncrementalSync() {
    this.logger.log('Starting daily incremental sync for all business lines');

    for (const code of Object.keys(BUSINESS_LINES)) {
      try {
        await this.syncService.triggerIncrementalSync(code as BusinessLineCode);
      } catch (error: any) {
        this.logger.error(`Incremental sync failed for ${code}: ${error.message}`);
      }
    }
  }

  @Cron('0 3 * * 0')
  async handleWeeklyFullSync() {
    this.logger.log('Starting weekly full sync for all business lines');

    for (const code of Object.keys(BUSINESS_LINES)) {
      try {
        await this.syncService.triggerFullSync(code as BusinessLineCode);
      } catch (error: any) {
        this.logger.error(`Full sync failed for ${code}: ${error.message}`);
      }
    }
  }
}
