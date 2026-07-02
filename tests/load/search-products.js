// tests/load/search-products.js
// 压测: search-service 搜索接口
// 用法: k6 run tests/load/search-products.js

import http from 'k6/http';
import { check, sleep } from 'k6';

// 阶梯加压: 0 -> 10 VU (预热) -> 50 VU (主压) -> 0 (收尾)
export const options = {
  stages: [
    { duration: '10s', target: 10 },  // 预热
    { duration: '20s', target: 50 },  // 加压到 50
    { duration: '10s', target: 50 },  // 持续 50 VU
    { duration: '10s', target: 0 },   // 收尾
  ],
  // 通过条件 (CI 友好)
  thresholds: {
    http_req_duration: ['p(95)<500'],  // P95 < 500ms
    http_req_failed: ['rate<0.01'],    // 失败率 < 1%
  },
};

// 测试场景: 关键词搜索
export default function () {
  const keywords = ['显示器', '65寸', '海信', '会议平板', '道闸'];
  const keyword = keywords[Math.floor(Math.random() * keywords.length)];
  const url = `http://localhost:3002/api/search/ds/products?keyword=${encodeURIComponent(keyword)}&size=20`;

  const res = http.get(url);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has items': (r) => {
      const body = r.json();
      return body && body.items && body.items.length > 0;
    },
  });

  sleep(1);
}
