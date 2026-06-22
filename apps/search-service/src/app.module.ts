import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { ElasticsearchModule } from './elasticsearch/elasticsearch.module';
import { ElasticsearchService } from './elasticsearch/elasticsearch.service';
import { SearchModule } from './search/search.module';
import { initIndices } from './elasticsearch/elasticsearch.init';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // ← 0016: 对齐 gateway 0005 模式 — pino + 跨服务 requestId 透传
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
        customProps: (req) => ({ requestId: req.id }),
        autoLogging: false,
      },
    }),
    ElasticsearchModule,
    SearchModule,
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly esService: ElasticsearchService) {}

  async onModuleInit() {
    await initIndices(this.esService);
  }
}
