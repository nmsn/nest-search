import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { DrizzleService } from '../database/drizzle.service';
import { casTickets } from '../database/schema/cas-tickets';
import { casServices } from '../database/schema/cas-services';
import { users } from '../database/schema/users';
import { eq, and, gt } from 'drizzle-orm';
import { randomBytes } from 'crypto';

@Injectable()
export class CasService {
  constructor(private readonly drizzle: DrizzleService) {}

  async issueTgt(userId: number): Promise<string> {
    const ticket = `TGT-${randomBytes(32).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

    await this.drizzle.db.insert(casTickets).values({
      ticket,
      type: 'TGT',
      userId,
      expiresAt,
    });

    return ticket;
  }

  async issueSt(tgtTicket: string, serviceUrl: string): Promise<string> {
    // Validate TGT
    const tgt = await this.validateTgt(tgtTicket);
    if (!tgt) throw new UnauthorizedException('Invalid or expired TGT');

    // Validate service is registered
    const [service] = await this.drizzle.db
      .select()
      .from(casServices)
      .where(and(
        eq(casServices.serviceUrl, serviceUrl),
        eq(casServices.enabled, true),
      ))
      .limit(1);

    if (!service) throw new BadRequestException('Service not registered');

    // Issue ST
    const ticket = `ST-${randomBytes(32).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 30 * 1000); // 30 seconds

    await this.drizzle.db.insert(casTickets).values({
      ticket,
      type: 'ST',
      userId: tgt.userId,
      service: serviceUrl,
      expiresAt,
    });

    return ticket;
  }

  async validateSt(ticket: string, serviceUrl: string) {
    const [st] = await this.drizzle.db
      .select()
      .from(casTickets)
      .where(and(
        eq(casTickets.ticket, ticket),
        eq(casTickets.type, 'ST'),
        eq(casTickets.consumed, false),
        gt(casTickets.expiresAt, new Date()),
      ))
      .limit(1);

    if (!st) throw new UnauthorizedException('Invalid or expired service ticket');
    if (st.service !== serviceUrl) throw new UnauthorizedException('Service URL mismatch');

    // Mark as consumed
    await this.drizzle.db
      .update(casTickets)
      .set({ consumed: true })
      .where(eq(casTickets.id, st.id));

    // Get user
    const [user] = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.id, st.userId))
      .limit(1);

    if (!user) throw new UnauthorizedException('User not found');
    if (user.status === 'disabled') throw new UnauthorizedException('User account is disabled');

    return user;
  }

  async validateTgt(ticket: string) {
    const [tgt] = await this.drizzle.db
      .select()
      .from(casTickets)
      .where(and(
        eq(casTickets.ticket, ticket),
        eq(casTickets.type, 'TGT'),
        gt(casTickets.expiresAt, new Date()),
      ))
      .limit(1);

    return tgt || null;
  }

  async destroyTgt(ticket: string) {
    await this.drizzle.db
      .delete(casTickets)
      .where(and(
        eq(casTickets.ticket, ticket),
        eq(casTickets.type, 'TGT'),
      ));
  }
}
