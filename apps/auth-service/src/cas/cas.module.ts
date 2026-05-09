import { Module } from '@nestjs/common';
import { CasController } from './cas.controller';
import { CasService } from './cas.service';
import { UserModule } from '../user/user.module';

@Module({
  imports: [UserModule],
  controllers: [CasController],
  providers: [CasService],
  exports: [CasService],
})
export class CasModule {}
