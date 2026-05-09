import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { CAS_CONFIG, JwtPayload } from '@app/shared';
import { UserService } from '../user/user.service';
import { CasService } from '../cas/cas.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly casService: CasService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.userService.validatePassword(username, password);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.status === 'disabled') throw new ForbiddenException('User account is disabled');

    return this.generateToken(user);
  }

  async validateTicket(ticket: string, service: string) {
    const user = await this.casService.validateSt(ticket, service);
    return this.generateToken(user);
  }

  private generateToken(user: any) {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    const token = jwt.sign(payload, CAS_CONFIG.jwtSecret, {
      expiresIn: CAS_CONFIG.jwtExpiresIn,
    } as any);

    return {
      token,
      user: { id: user.id, username: user.username, role: user.role },
    };
  }
}
