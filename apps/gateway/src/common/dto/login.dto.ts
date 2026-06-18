import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1, { message: 'username 不能为空' })
  username: string;

  @IsString()
  @MinLength(6, { message: 'password 至少 6 位' })
  password: string;
}