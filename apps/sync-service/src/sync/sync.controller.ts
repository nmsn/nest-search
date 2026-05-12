import { Controller, Post, Get, Param, BadRequestException } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncRecordsService } from './sync-records.service';
import { isValidBusinessLine } from '../libs/shared/index';

@Controller('api/sync')
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly syncRecordsService: SyncRecordsService,
  ) {}

  @Post('full/:businessLine')
  triggerFullSync(@Param('businessLine') businessLine: string) {
    if (!isValidBusinessLine(businessLine)) {
      throw new BadRequestException(`Invalid business line: ${businessLine}`);
    }
    return this.syncService.triggerFullSync(businessLine);
  }

  @Post('incremental/:businessLine')
  triggerIncrementalSync(@Param('businessLine') businessLine: string) {
    if (!isValidBusinessLine(businessLine)) {
      throw new BadRequestException(`Invalid business line: ${businessLine}`);
    }
    return this.syncService.triggerIncrementalSync(businessLine);
  }

  @Get('records')
  getSyncRecords() {
    return this.syncRecordsService.findAll();
  }
}
