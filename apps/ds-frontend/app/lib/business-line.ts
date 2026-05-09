export const BUSINESS_LINE = 'ds' as const;

export function withBusinessLine(path: string): string {
  return path.replace(':businessLine', BUSINESS_LINE);
}
