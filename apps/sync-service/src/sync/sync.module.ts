import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncFullConsumer, SyncIncrementalConsumer } from './sync.consumer';
import { SyncScheduler } from './sync.scheduler';
import { SyncRecordsService } from './sync-records.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
        },
      }),
    }),
    BullModule.registerQueue(
      { name: 'sync-full' },
      { name: 'sync-incremental' },
    ),
  ],
  controllers: [SyncController],
  providers: [SyncService, SyncFullConsumer, SyncIncrementalConsumer, SyncScheduler, SyncRecordsService],
})
export class SyncModule {}
