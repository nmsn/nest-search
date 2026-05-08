import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SyncModule,
  ],
})
export class AppModule {}
