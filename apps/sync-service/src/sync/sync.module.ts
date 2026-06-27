import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncFullConsumer, SyncIncrementalConsumer } from './sync.consumer';
import { SyncScheduler } from './sync.scheduler';
import { SyncRecordsService } from './sync-records.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.registerQueue(
      { name: 'sync-full' },
      { name: 'sync-incremental' },
    ),
    BullBoardModule.forFeature(
      { name: 'sync-full', adapter: BullMQAdapter },
      { name: 'sync-incremental', adapter: BullMQAdapter },
    ),
  ],
  controllers: [SyncController],
  providers: [SyncService, SyncFullConsumer, SyncIncrementalConsumer, SyncScheduler, SyncRecordsService],
})
export class SyncModule {}
