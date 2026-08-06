import {
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChannelConnectionMode } from '@prisma/client';

export class ConnectWhatsAppDto {
  @ApiProperty({
    example: '123456789012345',
    description: 'WhatsApp Business phone number ID from Meta',
  })
  @IsString()
  @MinLength(3)
  phoneNumberId!: string;

  @ApiProperty({
    description: 'Meta permanent or system user access token for Cloud API',
  })
  @IsString()
  @MinLength(10)
  accessToken!: string;

  @ApiPropertyOptional({ example: '+51 999 999 999' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ enum: ChannelConnectionMode })
  @IsOptional()
  @IsEnum(ChannelConnectionMode)
  connectionMode?: ChannelConnectionMode;

  @ApiPropertyOptional({
    description: 'Business account ID (WABA) when available',
  })
  @IsOptional()
  @IsString()
  wabaId?: string;
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
