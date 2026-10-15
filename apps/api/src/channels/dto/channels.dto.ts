import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConnectInstagramDto {
  @ApiProperty({ description: 'Instagram user access token (Instagram API with Instagram Login)' })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  accessToken!: string;

  @ApiPropertyOptional({
    example: '17841400000000000',
    description: 'Instagram account ID; only used when the token cannot be checked (local development)',
  })
  @IsOptional()
  @Matches(/^\d{5,30}$/)
  accountId?: string;
}

export class SimulateInboundDto {
  @ApiProperty({ example: '51999999999' })
  @IsString()
  @MinLength(8)
  fromPhone!: string;

  @ApiProperty({ example: 'Hola, ¿tienen polos?' })
  @IsString()
  @MinLength(1)
  text!: string;

  @ApiPropertyOptional({ example: 'Ana Pérez' })
  @IsOptional()
  @IsString()
  contactName?: string;
}
