import { HttpClientService } from './http-client.service';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';

describe('HttpClientService', () => {
  let service: HttpClientService;
  let mockHttp: jest.Mocked<HttpService>;

  beforeEach(() => {
    mockHttp = { request: jest.fn() } as any;
    const mockRequest = { id: 'test-req-id-123', headers: {} } as any;
    service = new HttpClientService(mockHttp, mockRequest);
  });

  it('auto-adds x-request-id header from current REQUEST', async () => {
    mockHttp.request.mockReturnValue(of({ data: { ok: true } } as any));

    await service.request({ method: 'GET', url: 'http://x.com/y' });

    expect(mockHttp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'http://x.com/y',
        headers: expect.objectContaining({
          'x-request-id': 'test-req-id-123',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('does NOT add x-request-id when request has no id', async () => {
    (service as any).currentRequest = { headers: {} };
    mockHttp.request.mockReturnValue(of({ data: {} } as any));

    await service.request({ method: 'GET', url: 'http://x.com/y' });

    const call = mockHttp.request.mock.calls[0][0] as any;
    expect(call.headers).not.toHaveProperty('x-request-id');
  });

  it('preserves caller-provided headers', async () => {
    mockHttp.request.mockReturnValue(of({ data: {} } as any));

    await service.request({
      method: 'POST',
      url: 'http://x.com/y',
      headers: { Authorization: 'Bearer xyz' },
    });

    expect(mockHttp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer xyz',
          'x-request-id': 'test-req-id-123',
        }),
      }),
    );
  });
});