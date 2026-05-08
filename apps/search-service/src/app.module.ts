import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ElasticsearchModule } from './elasticsearch/elasticsearch.module';
import { ElasticsearchService } from './elasticsearch/elasticsearch.service';
import { SearchModule } from './search/search.module';
import { initIndices } from './elasticsearch/elasticsearch.init';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
