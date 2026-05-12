export const CAS_CONFIG = {
  cookieName: 'TGC',
  cookieDomain: process.env.CAS_COOKIE_DOMAIN || '.example.local',
  tgtExpiresIn: process.env.CAS_TGT_EXPIRES_IN || '8h',
  stExpiresIn: process.env.CAS_ST_EXPIRES_IN || '30s',
  jwtSecret: process.env.JWT_SECRET || 'nest-search-jwt-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
};
