import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateAccountDto {
  @ApiProperty({ example: 'María Pérez' })
  @IsString()
  @MinLength(2, { message: 'Escribe tu nombre.' })
  @MaxLength(120, { message: 'Tu nombre puede tener hasta 120 caracteres.' })
  fullName!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Escribe tu contraseña actual.' })
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'La nueva contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(128, { message: 'La nueva contraseña puede tener hasta 128 caracteres.' })
  newPassword!: string;

  @ApiPropertyOptional({ description: 'Refresh token of this device; its session stays open.' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  refreshToken?: string;
}

export class RevokeSessionsDto {
  @ApiProperty({ description: 'Refresh token of this device; its session stays open.' })
  @IsString()
  @MaxLength(256)
  refreshToken!: string;
}
