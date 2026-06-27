import {
  Controller,
  Post,
  Get,
  Param,
  BadRequestException,
  NotFoundException,
  Query,
} from "@nestjs/common";
import { SyncService } from "./sync.service";
import { SyncRecordsService } from "./sync-records.service";
import { isValidBusinessLine } from "../libs/shared/index";

@Controller("api/sync")
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly syncRecordsService: SyncRecordsService,
  ) {}

  @Post("full/:businessLine")
  triggerFullSync(@Param("businessLine") businessLine: string) {
    if (!isValidBusinessLine(businessLine)) {
      throw new BadRequestException(`Invalid business line: ${businessLine}`);
    }
    return this.syncService.triggerFullSync(businessLine);
  }

  @Post("incremental/:businessLine")
  triggerIncrementalSync(@Param("businessLine") businessLine: string) {
    if (!isValidBusinessLine(businessLine)) {
      throw new BadRequestException(`Invalid business line: ${businessLine}`);
    }
    return this.syncService.triggerIncrementalSync(businessLine);
  }

  @Get("records")
  getSyncRecords() {
    return this.syncRecordsService.findAll();
  }

  // sync.controller.ts
  @Get("jobs/:id")
  async getJobStatus(@Param("id") jobId: string) {
    // 在两个 queue 里找
    const job = await this.syncService.findJob(jobId);
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);

    return {
      id: job.id,
      status: await job.getState(), // waiting | active | completed | failed | delayed
      data: job.data,
      attemptsMade: job.attemptsMade,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      timestamp: job.timestamp,
    };
  }

  @Post("delayed/:businessLine")
  triggerDelayedSync(
    @Param("businessLine") businessLine: string,
    @Query("delay") delay: string,
  ) {
    if (!isValidBusinessLine(businessLine)) {
      throw new BadRequestException(`Invalid business line: ${businessLine}`);
    }
    const delaySeconds = parseInt(delay, 10) || 60;
    return this.syncService.triggerDelayedSync(businessLine, delaySeconds);
  }
}
