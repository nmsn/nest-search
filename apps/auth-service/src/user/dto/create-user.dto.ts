import { IsString, IsOptional, IsEmail, IsEnum, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(['admin', 'user'])
  role?: 'admin' | 'user';
}
