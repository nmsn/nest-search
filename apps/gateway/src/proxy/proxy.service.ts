import { Injectable, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Method } from 'axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { HttpClientService } from '../common/http-client/http-client.service';

@Injectable()
export class ProxyService {
  // 从 ConfigService 读下游 URL(替代 module-level SERVICE_MAP)
  private readonly serviceMap: Record<string, string>;

  constructor(
    @InjectPinoLogger(ProxyService.name) private readonly logger: PinoLogger,
    private readonly httpClient: HttpClientService,
    config: ConfigService,
  ) {
    this.serviceMap = {
      sync: config.getOrThrow<string>('SYNC_SERVICE_URL'),
      search: config.getOrThrow<string>('SEARCH_SERVICE_URL'),
      form: config.getOrThrow<string>('FORM_SERVICE_URL'),
      auth: config.getOrThrow<string>('AUTH_SERVICE_URL'),
    };
  }

  async forward(
    service: string,
    method: Method,
    path: string,
    body?: any,
    headers?: Record<string, string>,
  ) {
    const baseUrl = this.serviceMap[service];
    if (!baseUrl) {
      throw new Error(`Unknown service: ${service}`);
    }

    const url = `${baseUrl}${path}`;
    this.logger.info(`Proxying ${method} ${path} → ${service}-service`);

    // HttpClientService 自动加 x-request-id 头,ProxyService 不管
    try {
      return await this.httpClient.request({
        method,
        url,
        data: body,
        headers,
        timeout: 30000,
      });
    } catch (error: any) {
      if (error.response) {
        this.logger.error(
          `Downstream error: ${error.response.status} ${error.response.data?.message}`,
        );
        // ✅ 抛 HttpException,不是裸 data
        throw new HttpException(error.response.data, error.response.status);
      }
      this.logger.error(`Proxy error: ${error.message}`);
      throw error;
    }
  }
}