/**
 * tRPC contracts 索引 — 所有 service 的 contract 从这里导出
 *
 * 用法(gateway):
 *   import { authSchemas, type TrpcContext } from '@app/shared/contracts';
 *
 * 用法(backend service):
 *   import { trpc, authSchemas, AuthErrors } from '@app/shared/contracts';
 */
export * from './auth.contract';
