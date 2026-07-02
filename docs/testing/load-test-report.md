# nest-search 性能压测报告

> Phase C 第 2 课（0051）实战报告。**跑完 k6 后手动填写**。

## 测试环境

- **日期**: 2026-07-02
- **k6 版本**: 0.45.0
- **硬件**: MacBook Air M1
- **nest-search**: 30 条产品（建议 1万+，当前仅作 baseline）
- **search-service**: 端口 3002
- **ES**: 8.15.5 + IK + pinyin

## 测试场景

| 场景 | 脚本 | 配置 |
|------|------|------|
| 冒烟测试 | `smoke.js` | 1 VU × 10s × 10 req |
| 主压测试 | `search-products.js` | 阶梯 0→50 VU × 50s |
| 多端点 | `multi-endpoint.js` | 搜索30+详情10+聚合5 VU × 30s |

## 阈值（CI 拦截）

| 指标 | 阈值 | 说明 |
|------|------|------|
| `http_req_duration` P95 | < 500ms | 95% 请求 < 500ms |
| `http_req_failed` | < 1% | 失败率 < 1% |

## 结果（待填写）

### 冒烟测试

```
执行命令: k6 run tests/load/smoke.js
结果:
  - status 200: ___
  - has results: ___
  - 失败率: ___
  - 响应时间: ___

结论: ✅ / ❌
```

### 主压测试

```
执行命令: k6 run tests/load/search-products.js
结果:
  - 总请求数: ___
  - P50: ___ms
  - P95: ___ms
  - P99: ___ms
  - 失败率: ___%
  - 吞吐: ___req/s

阈值通过: ✅ / ❌
```

### 多端点

```
执行命令: k6 run tests/load/multi-endpoint.js
结果:
  - search 端点 P95: ___ms
  - detail 端点 P95: ___ms
  - aggregations 端点 P95: ___ms
  - 总失败率: ___%
```

## 结论

### nest-search 当前性能

```
数据量: 30 条
  → 30 条规模太小, 压测结果不代表真实负载
  → 但代码逻辑 (Pino + ES 缓存 + IK 索引) 已就绪

阈值表现:
  - 主压: P95 < 500ms 是否达成? ___
  - 错误率 < 1% 是否达成? ___
```

### 后续优化方向

```
当前未优化项:
  - 30 条数据, 搜索都是缓存命中
  - 上 1万 条后, 实际性能会变
  
生产前必做:
  - 扩到 1万+ 条产品
  - 准备 staging 环境
  - 配置 ELK / Prometheus 监控
  - 设 SLO (Phase C 0052)
```

### Phase C 进度

- [x] 0051 k6 压测 - 脚本就绪, baseline 待跑
- [ ] 0052 SLO/SLI 文档
- [ ] 0053 Prometheus 集成

## 跑压测步骤

```bash
# 1. 启动 search-service
pnpm run start:search &

# 2. 等待 5 秒启动
sleep 5

# 3. 跑冒烟测试（先验证服务能响应）
k6 run tests/load/smoke.js

# 4. 跑主压测试
k6 run tests/load/search-products.js

# 5. 跑多端点
k6 run tests/load/multi-endpoint.js

# 6. 填报告（手动）
```

## CI/CD 集成建议

```yaml
# .github/workflows/load-test.yml
name: Load Test
on: [pull_request]
jobs:
  load:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run k6 smoke test
        run: |
          docker run --rm -v $PWD:/app grafana/k6 run /app/tests/load/smoke.js
```

只在 PR 阶段跑冒烟测试，主压测试作为定期任务（每周一次）。
