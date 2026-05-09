import { Controller, Post, Get, Body, Headers } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from '../user/dto/login.dto';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { UserService } from '../user/user.service';
import * as jwt from 'jsonwebtoken';
import { CAS_CONFIG, JwtPayload } from '@app/shared';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  @Post('register')
  async register(@Body() dto: CreateUserDto) {
    const user = await this.userService.create(dto);
    const { passwordHash, ...result } = user as any;
    return result;
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.username, dto.password);
  }

  @Post('validate')
  async validate(@Body() body: { ticket: string; service: string }) {
    return this.authService.validateTicket(body.ticket, body.service);
  }

  @Post('logout')
  async logout() {
    // JWT is stateless — client discards token. No server-side session to destroy.
    return { message: 'Logged out' };
  }

  @Get('me')
  async me(@Headers('authorization') auth: string) {
    if (!auth?.startsWith('Bearer ')) {
      return { user: null };
    }
    try {
      const token = auth.slice(7);
      const payload = jwt.verify(token, CAS_CONFIG.jwtSecret) as unknown as JwtPayload;
      const user = await this.userService.findById(payload.sub);
      const { passwordHash, ...result } = user as any;
      return { user: result };
    } catch {
      return { user: null };
    }
  }
}
