import { ProxyService } from './proxy.service';
import { HttpClientService } from '../common/http-client/http-client.service';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';

describe('ProxyService', () => {
  let service: ProxyService;
  let mockHttpClient: jest.Mocked<HttpClientService>;
  let mockLogger: any;
  let mockConfig: jest.Mocked<ConfigService>;

  beforeEach(() => {
    mockHttpClient = { request: jest.fn() } as any;
    mockLogger = { info: jest.fn(), error: jest.fn() };
    // ConfigService 注入:模拟下游 URL(0021 Tier 3 改造后多了一个参数)
    mockConfig = {
      getOrThrow: jest.fn((key: string) => {
        const map: Record<string, string> = {
          SYNC_SERVICE_URL: 'http://localhost:3001',
          SEARCH_SERVICE_URL: 'http://localhost:3002',
          FORM_SERVICE_URL: 'http://localhost:3003',
          AUTH_SERVICE_URL: 'http://localhost:3004',
        };
        return map[key];
      }),
    } as any;
    service = new ProxyService(mockLogger, mockHttpClient, mockConfig);
  });

  it('forwards to correct downstream URL', async () => {
    mockHttpClient.request.mockResolvedValue({ ok: true });

    await service.forward('auth', 'POST', '/api/auth/login', { x: 1 });

    expect(mockHttpClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'http://localhost:3004/api/auth/login',
        data: { x: 1 },
      })
    );
  });

  it('throws on unknown service', async () => {
    await expect(service.forward('unknown', 'GET', '/x')).rejects.toThrow(
      'Unknown service: unknown',
    );
  });

  it('wraps downstream error as HttpException with status', async () => {
    const downstreamErr = {
      response: { status: 401, data: { message: 'Invalid credentials' } },
    };
    mockHttpClient.request.mockRejectedValue(downstreamErr);

    await expect(
      service.forward('auth', 'POST', '/api/auth/login', {}),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('rethrows plain error when no response field', async () => {
    mockHttpClient.request.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.forward('auth', 'GET', '/x')).rejects.toThrow(
      'ECONNREFUSED',
    );
  });
});