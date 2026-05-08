import { IsString, IsOptional, IsEnum, IsObject } from 'class-validator';

export class CreateSchemeDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['draft', 'published', 'archived'])
  status?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}

export class UpdateSchemeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['draft', 'published', 'archived'])
  status?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}
