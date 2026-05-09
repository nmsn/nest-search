import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserModule } from '../user/user.module';
import { CasModule } from '../cas/cas.module';

@Module({
  imports: [UserModule, CasModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
