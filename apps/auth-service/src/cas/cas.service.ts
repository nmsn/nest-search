import { Injectable } from "@nestjs/common";
import { DrizzleService } from "../database/drizzle.service";
import {
  CasTgtInvalidException,
  CasServiceNotRegisteredException,
  CasTicketInvalidException,
  CasTicketMismatchException,
} from "../exceptions/cas.exception";
import { UserNotFoundException, UserDisabledException } from "../exceptions/user.exceptions";
import { casTickets } from "../database/schema/cas-tickets";
import { casServices } from "../database/schema/cas-services";
import { users } from "../database/schema/users";
import { eq, and, gt } from "drizzle-orm";
import { randomBytes } from "crypto";

import * as bcrypt from "bcrypt";

@Injectable()
export class CasService {
  constructor(private readonly drizzle: DrizzleService) {}

  async issueTgt(userId: number): Promise<string> {
    const ticket = `TGT-${randomBytes(32).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

    await this.drizzle.db.insert(casTickets).values({
      ticket,
      type: "TGT",
      userId,
      expiresAt,
    });

    return ticket;
  }

  async issueSt(
    tgtTicket: string,
    serviceUrl: string,
  ): Promise<{ ticket: string; serviceUrl: string }> {
    // Validate TGT
    const tgt = await this.validateTgt(tgtTicket);
    if (!tgt) throw new CasTgtInvalidException(tgtTicket);

    // Validate service is registered
    const [service] = await this.drizzle.db
      .select()
      .from(casServices)
      .where(
        and(
          eq(casServices.serviceUrl, serviceUrl),
          eq(casServices.enabled, true),
        ),
      )
      .limit(1);

    if (!service) throw new CasServiceNotRegisteredException(serviceUrl);

    // Issue ST
    const ticket = `ST-${randomBytes(32).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 30 * 1000); // 30 seconds

    await this.drizzle.db.insert(casTickets).values({
      ticket,
      type: "ST",
      userId: tgt.userId,
      service: serviceUrl,
      expiresAt,
    });

    return { ticket, serviceUrl: service.serviceUrl };
  }

  async validateSt(ticket: string, serviceUrl: string) {
    const [st] = await this.drizzle.db
      .select()
      .from(casTickets)
      .where(
        and(
          eq(casTickets.ticket, ticket),
          eq(casTickets.type, "ST"),
          eq(casTickets.consumed, false),
          gt(casTickets.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!st) throw new CasTicketInvalidException(ticket);
    if (st.service !== serviceUrl) throw new CasTicketMismatchException(ticket, serviceUrl);

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

    if (!user) throw new UserNotFoundException(st.userId);
    if (user.status === "disabled") throw new UserDisabledException(st.userId);

    return user;
  }

  async validateTgt(ticket: string) {
    const [tgt] = await this.drizzle.db
      .select()
      .from(casTickets)
      .where(
        and(
          eq(casTickets.ticket, ticket),
          eq(casTickets.type, "TGT"),
          gt(casTickets.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return tgt || null;
  }

  async destroyTgt(ticket: string) {
    await this.drizzle.db
      .delete(casTickets)
      .where(and(eq(casTickets.ticket, ticket), eq(casTickets.type, "TGT")));
  }

  /**
   * 用 Relations API 查用户 + 他的所有 ticket
   * 返回嵌套结构: { id, username, ..., casTickets: [{ ... }] }
   */
  async findUserWithTickets(userId: number) {
    return this.drizzle.db.query.users.findFirst({
      where: eq(users.id, userId),
      with: { casTickets: true },
    });
  }

  /**
   * 事务:创建用户 + 创建首个 ticket 原子操作
   * 如果 ticket 创建失败,user 也回滚
   */
  async createUserWithTicket(input: {
    username: string;
    password: string;
    ticket: string;
  }) {
    return this.drizzle.db.transaction(async (tx) => {
      // 1. bcrypt 密码(事务内)
      const passwordHash = await bcrypt.hash(input.password, 10);

      // 2. 创建用户(PostgreSQL 用 .returning({ id }),不是 mysql2 的 $returningId)
      const [userResult] = await tx
        .insert(users)
        .values({
          username: input.username,
          passwordHash,
        })
        .returning({ id: users.id });
      const userId = userResult.id;

      // 3. 创建 ticket
      await tx.insert(casTickets).values({
        ticket: input.ticket,
        type: "TGT",
        userId,
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8h
      });

      return { userId };
    });
  }
}
