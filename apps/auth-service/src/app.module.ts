import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DrizzleModule } from './database/drizzle.module';
import { UserModule } from './user/user.module';
import { CasModule } from './cas/cas.module';
import { AuthModule } from './auth/auth.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DrizzleModule,
    RedisModule,
    UserModule,
    CasModule,
    AuthModule,
  ],
})
export class AppModule {}
