import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DrizzleService } from '../database/drizzle.service';
import { users } from '../database/schema/users';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UserService {
  constructor(private readonly drizzle: DrizzleService) {}

  async create(dto: CreateUserDto) {
    const existing = await this.findByUsername(dto.username);
    if (existing) throw new ConflictException('Username already exists');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const insertResult = await this.drizzle.db.insert(users).values({
      username: dto.username,
      passwordHash,
      email: dto.email,
      role: dto.role || 'user',
    });
    const insertedId = insertResult[0].insertId;
    return this.findById(Number(insertedId));
  }

  async findById(id: number) {
    const [result] = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!result) throw new NotFoundException(`User #${id} not found`);
    return result;
  }

  async findByUsername(username: string) {
    const [result] = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    return result || null;
  }

  async validatePassword(username: string, password: string) {
    const user = await this.findByUsername(username);
    if (!user) return null;
    if (user.status === 'disabled') return null;

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;
    return user;
  }
}
