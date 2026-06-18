import { Inject, Injectable, HttpException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import axios, { Method } from 'axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

const SERVICE_MAP: Record<string, string> = {
  sync: process.env.SYNC_SERVICE_URL || 'http://localhost:3001',
  search: process.env.SEARCH_SERVICE_URL || 'http://localhost:3002',
  form: process.env.FORM_SERVICE_URL || 'http://localhost:3003',
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3004',
};

@Injectable()
export class ProxyService {
  constructor(
    @InjectPinoLogger(ProxyService.name) private readonly logger: PinoLogger,   // ← 保留(0005 装的)
    @Inject(REQUEST) private readonly request: Request,                            // ← 新增
  ) {}

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
    this.logger.info(`Proxying ${method} ${path} → ${service}-service`);

    // ✅ 自动把当前请求的 reqId 加到转发头里
    const requestId = (this.request as any).id;   // nestjs-pino 注入的
    const forwardedHeaders = {
      'Content-Type': 'application/json',
      ...(requestId ? { 'x-request-id': requestId } : {}),
      ...headers,
    };

    try {
      const response = await axios({
        method,
        url,
        data: body,
        headers: forwardedHeaders,
        timeout: 30000,
      });

      return response.data;
    } catch (error: any) {
      if (error.response) {
        this.logger.error(`Downstream error: ${error.response.status} ${error.response.data?.message}`);
        throw new HttpException(error.response.data, error.response.status);
      }
      this.logger.error(`Proxy error: ${error.message}`);
      throw error;
    }
  }
}