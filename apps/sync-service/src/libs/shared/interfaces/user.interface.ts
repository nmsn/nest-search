export interface JwtPayload {
  sub: number;
  username: string;
  role: 'admin' | 'user';
  iat?: number;
  exp?: number;
}

export interface AuthUser {
  userId: number;
  username: string;
  role: 'admin' | 'user';
}
