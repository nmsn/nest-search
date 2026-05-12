export const BUSINESS_LINES = {
  ds: {
    code: 'ds',
    name: '商显',
    tablePrefix: 'ds_',
    esIndex: 'products_ds',
  },
  zk: {
    code: 'zk',
    name: '道闸',
    tablePrefix: 'zk_',
    esIndex: 'products_zk',
  },
  meeting: {
    code: 'meeting',
    name: '会议平板',
    tablePrefix: 'mt_',
    esIndex: 'products_meeting',
  },
} as const;

export type BusinessLineCode = keyof typeof BUSINESS_LINES;

export function isValidBusinessLine(code: string): code is BusinessLineCode {
  return code in BUSINESS_LINES;
}
