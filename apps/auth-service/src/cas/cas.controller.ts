import { Controller, Get, Post, Body, Query, Res, Req, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { CasService } from './cas.service';
import { UserService } from '../user/user.service';

@Controller('cas')
export class CasController {
  constructor(
    private readonly casService: CasService,
    private readonly userService: UserService,
  ) {}

  @Get('login')
  async loginPage(
    @Query('service') service: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Check if TGC cookie exists (user already logged in)
    const tgc = req.cookies?.TGC;
    if (tgc) {
      const tgt = await this.casService.validateTgt(tgc);
      if (tgt) {
        // Auto-issue ST and redirect
        try {
          const st = await this.casService.issueSt(tgc, service);
          return res.redirect(`${service}?ST=${st}`);
        } catch {
          // TGT valid but service issue — show login page
        }
      }
    }

    // Return login page (simple HTML form)
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>CAS Login</title></head>
      <body>
        <h2>CAS 单点登录</h2>
        <form method="POST" action="/cas/login">
          <input type="hidden" name="service" value="${service}" />
          <div><label>用户名: <input type="text" name="username" required /></label></div>
          <div><label>密&nbsp;&nbsp;码: <input type="password" name="password" required /></label></div>
          <div><button type="submit">登录</button></div>
        </form>
      </body>
      </html>
    `);
  }

  @Post('login')
  async handleLogin(
    @Body() body: { username: string; password: string; service: string },
    @Res() res: Response,
  ) {
    const user = await this.userService.validatePassword(body.username, body.password);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    // Issue TGT
    const tgt = await this.casService.issueTgt(user.id);

    // Set TGC cookie
    res.cookie('TGC', tgt, {
      httpOnly: true,
      domain: process.env.CAS_COOKIE_DOMAIN || '.example.local',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    });

    // Issue ST and redirect
    const st = await this.casService.issueSt(tgt, body.service);
    res.redirect(`${body.service}?ST=${st}`);
  }

  @Get('validate')
  async validateV1(@Query('ticket') ticket: string, @Query('service') service: string) {
    const user = await this.casService.validateSt(ticket, service);
    return { valid: true, username: user.username };
  }

  @Post('serviceValidate')
  async validateV2(@Body() body: { ticket: string; service: string }) {
    const user = await this.casService.validateSt(body.ticket, body.service);
    // CAS 2.0/3.0 returns XML, but we'll return JSON for simplicity
    return {
      serviceResponse: {
        authenticationSuccess: {
          user: user.username,
          attributes: { id: user.id, role: user.role },
        },
      },
    };
  }

  @Get('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    const tgc = req.cookies?.TGC;
    if (tgc) {
      await this.casService.destroyTgt(tgc);
    }
    res.clearCookie('TGC', {
      domain: process.env.CAS_COOKIE_DOMAIN || '.example.local',
    });
    res.send('已退出登录');
  }
}
