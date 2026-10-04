import { Equals, IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export const TERMS_REQUIRED = 'Debes aceptar los Términos y Condiciones para crear tu cuenta.';

export class RegisterDto {
  @ApiProperty({ example: 'ops@marca.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'María Pérez' })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty({ example: 'Mi Tienda' })
  @IsString()
  @MinLength(2)
  businessName!: string;

  @ApiProperty({ description: 'Acceptance of the platform terms; must be true.', example: true })
  @Equals(true, { message: TERMS_REQUIRED })
  acceptTerms!: boolean;
}

export class LoginDto {
  @ApiProperty({ example: 'ops@marca.com' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}
