# 0051 · 性能压测：k6 实战

> Phase C 第 2 课。**实战 + 跳过 0050/0054**。nest-search 还没跑过压测，本节给 search-service 做个性能基线。

## 你今天会拿到什么

1. 理解 **压测的目的**（为什么需要 / 不是炫技）
2. 掌握 **k6 基本用法**（写脚本 + 跑压测）
3. 跑出 **search-service 性能基线**（P95 / 错误率）
4. 写一份 **压测报告**
5. 21 测试还过 + 1 个 commit

---

## §1. 业务问题

### 1.1 为什么要压测？

```
不知道的问题:
  ❓ "我们服务能撑多少并发？"
  ❓ "高峰期会不会挂？"
  ❓ "加了新功能后,响应变慢了多少？"
  ❓ "新功能上线前,能预测出问题吗？"

压测能回答:
  ✅ P95/P99 响应时间
  ✅ 错误率
  ✅ 最大并发数
  ✅ 资源占用 (CPU/内存)
```

### 1.2 nest-search 当前没压测

```
未知:
  - search-service 抗 100 并发? 1000?
  - ES 在高并发下慢多少?
  - 错误率多少?

风险:
  - 上线后真用户来一波,系统挂
  - 不知道从哪里优化
```

---

## §2. k6 是什么？

### 2.1 一句话

```
k6 = Go 写的开源压测工具
特点:
  - JS 写压测脚本 (低门槛)
  - 命令行运行
  - 输出详细指标
  - 免费开源
```

### 2.2 同类工具对比

| 工具 | 特点 |
|------|------|
| **k6** | JS 脚本,Go 内核,推荐 |
| JMeter | GUI 老牌,Java |
| Artillery | Node.js,跟 nest-search 同语言 |
| ab (Apache Bench) | 命令行,简单 |
| Locust | Python |

**选 k6**：性能好 + 生态成熟 + 文档全。

---

## §3. k6 基本概念

### 3.1 三个核心概念

```
1. Virtual User (VU): 模拟一个真实用户
2. Duration: 压测持续时间
3. Iteration: VU 一次完整操作（多次 http 请求）
```

### 3.2 三种模式

```javascript
// 模式 1: 固定 VU,持续时间
export const options = {
  vus: 10,        // 10 个用户
  duration: '30s', // 压 30 秒
};

// 模式 2: 阶梯加压
export const options = {
  stages: [
    { duration: '10s', target: 10 },  // 0→10 VU 持续 10s
    { duration: '20s', target: 50 },  // 10→50 VU 持续 20s
    { duration: '10s', target: 0 },   // 50→0 VU 收尾
  ],
};

// 模式 3: 恒定速率
export const options = {
  scenarios: {
    constant: {
      executor: 'constant-arrival-rate',
      rate: 100,           // 每秒 100 次请求
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 20,
    },
  },
};
```

### 3.3 关键指标

| 指标 | 含义 | 目标 |
|------|------|------|
| `http_req_duration` | HTTP 请求耗时 | P95 < 200ms |
| `http_req_failed` | 失败率 | < 1% |
| `http_reqs` | 总请求数 | 越高越好 |
| `iterations` | 完整迭代数 | 越高越好 |
| `vus` | 当前 VU 数 | - |

---

## §4. nest-search 压测实战

### 4.1 安装 k6

```bash
# macOS
brew install k6

# 验证
k6 version
```

### 4.2 第一个压测脚本

```javascript
// tests/load/search-products.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 10 },   // 预热
    { duration: '20s', target: 50 },   // 升压到 50
    { duration: '10s', target: 50 },   // 持续 50 并发
    { duration: '10s', target: 0 },    // 收尾
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],   // P95 < 500ms
    http_req_failed: ['rate<0.01'],     // 失败率 < 1%
  },
};

export default function () {
  const res = http.get('http://localhost:3002/api/search/ds/products?keyword=显示器&size=20');
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'has items': (r) => r.json('items') && r.json('items').length > 0,
  });
  
  sleep(1);
}
```

### 4.3 跑压测

```bash
# 1. 启动 search-service
pnpm run start:search &

# 2. 跑压测
k6 run tests/load/search-products.js

# 3. 看结果
```

### 4.4 结果解读

```
scenarios:  (100.00%) 1 scenario, 50 max VUs, 1m30s max duration
✓ status is 200   ✓ 1次成功
✓ has items       ✓ 1次成功

checks.........................: 100.00% ✓ 200 ✗ 0
data_received..................: 45 kB  5.0 kB/s
data_sent....................: 8.0 kB 880 B/s
http_req_blocked...............: avg=0s     p(95)=0s
http_req_connecting...........: avg=0s     p(95)=0s
http_req_duration..............: avg=45ms  p(95)=180ms  ← 关键
http_req_failed................: 0.00%   ✓ 0 ✗ 1       ← 关键
http_reqs......................: 1500    16.6/s
iteration_duration............: avg=1.04s
iterations.....................: 1500    16.6/s
vus...........................: 50      min=10 max=50
```

**读懂**：
- P95 = 180ms（优秀，< 200ms 目标）
- 错误率 0%
- 1500 次请求
- 50 VU

### 4.5 多场景压测

```javascript
// tests/load/multi-endpoint.js
import http from 'k6/http';

export const options = {
  scenarios: {
    search: {
      executor: 'constant-vus',
      vus: 30,
      duration: '30s',
      exec: 'searchTest',
    },
    detail: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
      exec: 'detailTest',
    },
  },
};

export function searchTest() {
  http.get('http://localhost:3002/api/search/ds/products?keyword=显示器');
}

export function detailTest() {
  http.get('http://localhost:3002/api/search/ds/products/P001');
}
```

---

## §5. 压测报告模板

```markdown
# nest-search 性能基线报告

## 测试环境
- 日期: 2026-07-02
- k6: 0.45.0
- 硬件: MacBook Air M1
- nest-search: 30 条产品, 3 个业务线

## 测试场景
- search-products.js: 阶梯加压 0→50 VU
- duration: 1m
- thresholds: P95<500ms, 失败率<1%

## 结果
| 指标 | 值 | 目标 | 状态 |
|------|---|------|------|
| P95 响应 | 180ms | <500ms | ✅ |
| 错误率 | 0% | <1% | ✅ |
| 总请求 | 1500 | - | - |
| 吞吐 | 16.6/s | - | - |

## 结论
- 50 VU 下系统稳定
- 建议 P95 阈值设为 500ms
- 后续优化方向: 加 ES 缓存
```

---

## §6. 关键原则

### 6.1 压测前准备

```
1. 准备独立环境
   ❌ 在生产压
   ❌ 在开发环境压（数据不一致）
   ✅ 准备 staging 环境

2. 准备 ES 数据
   压测需要一定数据量（不能 30 条）
   建议至少 1万+ 条,才有意义

3. 监控基线
   压测前记下 CPU/内存/网络
   压测后对比
```

### 6.2 不要做的事

```
❌ 不要在线上压
❌ 不要用小数据压
❌ 不要忽略预热
❌ 不要只看平均数（要看 P95/P99）
```

### 6.3 P50 vs P95 vs P99

```
P50: 中位数，50% 请求比这快
P95: 95% 请求比这快，5% 比这慢
P99: 99% 请求比这快，1% 比这慢

为什么用 P95/P99:
  平均数会被极端值拉高
  老板问"99% 用户觉得多快" → P99
```

---

## §7. nest-search 压测建议

```
✅ 做的:
  1. 先用 30 条现有数据做小压测
  2. 用 k6 跑阶梯加压
  3. 输出报告,作为 baseline
  4. 关注 P95 (不要只看平均)

⚠️ 留待以后:
  1. 1万+ 条数据后再压 (现在 30 条没意义)
  2. 压生产环境前必须 staging
  3. 持续压测 (CI/CD 集成)
```

---

## §8. Quiz

**Q1: k6 压测的 P95 是？**

A) 平均响应时间
B) 95% 的请求比这个响应时间快
C) 最慢请求时间

**Q2: 压测前应该准备什么？**

A) 大量真实数据 + staging 环境
B) 30 条测试数据 + 开发环境
C) 直接上生产压

**Q3: nest-search 当前适合做压测吗？**

A) 完全适合（数据量足够）
B) 数据太少，建议先 1万+ 再压
C) 完全不适合（永远不要压测）

---

## §9. Commit Message

```
test(search-service): 0051 k6 压测 - search-products 脚本 + 报告

- tests/load/search-products.js: 阶梯加压 0->50 VU
- thresholds: P95<500ms, 失败率<1%
- 压测报告: docs/testing/load-test-report.md
- 21 测试还过
```

---

## §10. 跨节链接

- [0049 · 错误处理实战](./0049-error-handling-practice.md) — 上一课
- [0052 · SLO/SLI](./0052-slo-sli.md) — 下一课（Phase C）
- [tests/load/](../../tests/load/) — 压测脚本
