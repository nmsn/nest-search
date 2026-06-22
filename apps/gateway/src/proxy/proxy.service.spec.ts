import { ProxyService } from './proxy.service';
import { HttpClientService } from '../common/http-client/http-client.service';
import { HttpException } from '@nestjs/common';

describe('ProxyService', () => {
  let service: ProxyService;
  let mockHttpClient: jest.Mocked<HttpClientService>;
  let mockLogger: any;

  beforeEach(() => {
    mockHttpClient = { request: jest.fn() } as any;
    mockLogger = { info: jest.fn(), error: jest.fn() };
    service = new ProxyService(mockLogger, mockHttpClient);
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