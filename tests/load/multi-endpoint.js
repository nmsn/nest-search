// tests/load/multi-endpoint.js
// 多端点混合压测
// 用法: k6 run tests/load/multi-endpoint.js

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    // 场景 1: 30 VU 持续搜索浏览
    search: {
      executor: 'constant-vus',
      vus: 30,
      duration: '30s',
      exec: 'searchTest',
    },
    // 场景 2: 10 VU 持续详情页
    detail: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
      exec: 'detailTest',
    },
    // 场景 3: 5 VU 持续聚合
    aggregations: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
      exec: 'aggTest',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export function searchTest() {
  const url = 'http://localhost:3002/api/search/ds/products?keyword=显示器&size=20';
  const res = http.get(url);
  check(res, { 'search ok': (r) => r.status === 200 });
  sleep(1);
}

export function detailTest() {
  const ids = ['P001', 'P006', 'P009', 'P010'];
  const id = ids[Math.floor(Math.random() * ids.length)];
  const url = `http://localhost:3002/api/search/ds/products/${id}`;
  const res = http.get(url);
  check(res, { 'detail ok': (r) => r.status === 200 });
  sleep(2);
}

export function aggTest() {
  const url = 'http://localhost:3002/api/search/ds/aggregations';
  const res = http.get(url);
  check(res, { 'agg ok': (r) => r.status === 200 });
  sleep(2);
}
