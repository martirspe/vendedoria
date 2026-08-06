import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
