import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const ASSIGNABLE_ROLES = ['ADMIN', 'AGENT'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export class CreateInviteDto {
  @ApiProperty({ example: 'asesor@marca.com' })
  @IsEmail({}, { message: 'Escribe un correo válido.' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ enum: ASSIGNABLE_ROLES })
  @IsIn(ASSIGNABLE_ROLES, { message: 'Elige un rol: administrador o asesor.' })
  role!: AssignableRole;
}

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: ASSIGNABLE_ROLES })
  @IsIn(ASSIGNABLE_ROLES, { message: 'Elige un rol: administrador o asesor.' })
  role!: AssignableRole;
}

export class InviteTokenParamDto {
  @ApiProperty()
  @Matches(/^[a-f0-9]{64}$/, { message: 'Esta invitación ya no es válida.' })
  token!: string;
}

export class AcceptInviteDto {
  @ApiProperty({ example: 'María Pérez' })
  @IsString()
  @MinLength(2, { message: 'Escribe tu nombre.' })
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(128)
  password!: string;
}
