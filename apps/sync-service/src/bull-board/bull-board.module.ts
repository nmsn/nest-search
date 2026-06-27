// apps/sync-service/src/bull-board/bull-board.module.ts
import { Module } from "@nestjs/common";
import { BullBoardModule } from "@bull-board/nestjs";
import { ExpressAdapter } from "@bull-board/express";

@Module({
  imports: [
    BullBoardModule.forRoot({
      route: "/queues",
      adapter: ExpressAdapter,
    }),
  ],
})
export class BullBoardConfigModule {}
