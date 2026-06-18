import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(1, { message: 'username 不能为空' })
  username: string;

  @IsString()
  @MinLength(6, { message: 'password 至少 6 位' })
  password: string;

  @IsOptional()
  @IsEmail({}, { message: 'email 格式不对' })
  email?: string;
}