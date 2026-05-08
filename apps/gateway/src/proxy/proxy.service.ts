import { Injectable, Logger } from '@nestjs/common';
import axios, { Method } from 'axios';

const SERVICE_MAP: Record<string, string> = {
  sync: process.env.SYNC_SERVICE_URL || 'http://localhost:3001',
  search: process.env.SEARCH_SERVICE_URL || 'http://localhost:3002',
  form: process.env.FORM_SERVICE_URL || 'http://localhost:3003',
};

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  async forward(
    service: string,
    method: Method,
    path: string,
    body?: any,
    headers?: Record<string, string>,
  ) {
    const baseUrl = SERVICE_MAP[service];
    if (!baseUrl) {
      throw new Error(`Unknown service: ${service}`);
    }

    const url = `${baseUrl}${path}`;
    this.logger.log(`Proxying ${method} ${path} → ${service}-service`);

    try {
      const response = await axios({
        method,
        url,
        data: body,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        timeout: 30000,
      });

      return response.data;
    } catch (error) {
      if (error.response) {
        this.logger.error(`Downstream error: ${error.response.status} ${error.response.data?.message}`);
        throw error.response.data;
      }
      this.logger.error(`Proxy error: ${error.message}`);
      throw error;
    }
  }
}
