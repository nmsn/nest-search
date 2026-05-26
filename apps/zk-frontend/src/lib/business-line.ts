export const BUSINESS_LINE = 'zk' as const;

export function withBusinessLine(path: string): string {
  return path.replace(':businessLine', BUSINESS_LINE);
}
