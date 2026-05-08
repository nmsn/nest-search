import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncConsumer } from './sync.consumer';
import { SyncScheduler } from './sync.scheduler';
import { SyncRecordsService } from './sync-records.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SyncController],
  providers: [SyncService, SyncConsumer, SyncScheduler, SyncRecordsService],
})
export class SyncModule {}
