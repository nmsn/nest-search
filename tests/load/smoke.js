// tests/load/smoke.js
// 冒烟测试: 快速验证服务能承受最低负载
// 用法: k6 run tests/load/smoke.js
// 用途: CI / 部署后快速验证

import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 1,              // 单 VU
  duration: '10s',     // 短时间
  iterations: 10,      // 固定 10 次请求
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  const res = http.get('http://localhost:3002/api/search/ds/products?keyword=显示器');
  check(res, {
    'status 200': (r) => r.status === 200,
    'has results': (r) => r.json('total') > 0,
  });
}
