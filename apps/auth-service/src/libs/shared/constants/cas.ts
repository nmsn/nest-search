// TODO(后续 lesson): 把 CAS_CONFIG 从 module-level const 转成 @Injectable CAS_CONFIG_SERVICE
// 原因: 当前 CAS_CONFIG 在 module 加载时读 process.env,无法享受 ConfigModule 校验 + 类型推断
// 改造路径:
//   1. 新建 @Injectable() class CasConfigService, 注入 ConfigService
//   2. 把 CAS_CONFIG 字段改成 CasConfigService 的实例字段
//   3. 改 30+ 个 CAS_CONFIG.x 使用点为注入 + this.casConfig.x
// 风险: 改动面大, 测试要同步更新 (auth.e2e-spec.ts 用到 CAS_CONFIG)
// 见 LR-0025 反思

export const CAS_CONFIG = {
  cookieName: 'TGC',
  cookieDomain: process.env.CAS_COOKIE_DOMAIN || '.example.local',
  tgtExpiresIn: process.env.CAS_TGT_EXPIRES_IN || '8h',
  stExpiresIn: process.env.CAS_ST_EXPIRES_IN || '30s',
  jwtSecret: process.env.JWT_SECRET || 'nest-search-jwt-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
};
