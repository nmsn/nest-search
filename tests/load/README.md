# nest-search 性能压测

> k6 压测脚本，Phase C 第 2 课（0051）。

## 安装

```bash
# macOS
brew install k6

# Linux
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D64AC9D6
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# 验证
k6 version
```

## 脚本说明

| 脚本 | 场景 | 用途 |
|------|------|------|
| `smoke.js` | 1 VU × 10s × 10 次 | 冒烟测试 / CI |
| `search-products.js` | 阶梯 0→50 VU × 50s | 主压测试 |
| `multi-endpoint.js` | 3 场景混合 × 30s | 模拟真实混合流量 |

## 使用方式

### 1. 冒烟测试（先跑这个）

```bash
# 1. 启动 search-service
pnpm run start:search &

# 2. 跑冒烟测试（10 秒）
k6 run tests/load/smoke.js
```

### 2. 主压测试

```bash
k6 run tests/load/search-products.js
```

### 3. 多端点混合

```bash
k6 run tests/load/multi-endpoint.js
```

### 4. 输出报告

```bash
# JSON 输出（便于后续解析）
k6 run --out json=results.json tests/load/search-products.js

# HTML 报告（需要 k6-reporter 扩展）
k6 run --out json=results.json tests/load/search-products.js
```

## 阈值（thresholds）

| 指标 | 阈值 | 说明 |
|------|------|------|
| `http_req_duration` P95 | < 500ms | 95% 请求 < 500ms |
| `http_req_failed` | < 1% | 失败率 < 1% |

k6 跑完会判断阈值，**失败则返回非 0 退出码**，适合 CI 拦截。

## 监控项

k6 默认输出关键指标：

```
http_req_duration   - HTTP 请求耗时
http_req_failed     - 失败率
http_reqs           - 总请求数
iterations          - 完整迭代数
vus                 - 当前 VU 数
data_received       - 接收数据量
data_sent           - 发送数据量
```

## 注意事项

### 当前数据量限制

```
nest-search 现有: 30 条产品
建议: 1万+ 条数据压测才有意义
当前压测结果仅作 baseline 参考
```

### 不要在线上压测

```bash
❌ 在生产环境跑
❌ 在开发环境压（数据/配置不一致）
✅ 准备 staging 环境
```

## 相关文件

- `smoke.js` - 冒烟测试
- `search-products.js` - 搜索接口压测
- `multi-endpoint.js` - 多端点压测
- `../../docs/teaching/lessons/0051-load-testing-k6.md` - 课程文档
- `../../docs/testing/load-test-report.md` - 压测报告（手动填写）
