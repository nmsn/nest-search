import { Inject, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';

@Injectable()
export class HttpClientService {
  constructor(
    private readonly http: HttpService,
    @Inject(REQUEST) private readonly currentRequest: Request,
  ) {}

  async request<T = any>(config: AxiosRequestConfig): Promise<T> {
    // 自动从当前 request 拿 requestId,加到 x-request-id 头
    const requestId = (this.currentRequest as any).id;
    const headers = {
      'Content-Type': 'application/json',
      ...config.headers,
      ...(requestId ? { 'x-request-id': requestId } : {}),
    };

    const response = await firstValueFrom(
      this.http.request<T>({ ...config, headers }),
    );
    return response.data;
  }
}