import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ConnectWhatsAppManualDto {
  @ApiProperty({ description: 'Customer-owned Meta app ID' })
  @Matches(/^\d{5,30}$/)
  appId!: string;

  @ApiProperty({ description: 'Customer-owned Meta app secret; encrypted at rest', writeOnly: true })
  @Matches(/^[a-fA-F0-9]{32}$/)
  appSecret!: string;

  @ApiProperty({ description: 'Token issued by the customer app with WhatsApp messaging and management permissions', writeOnly: true })
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  accessToken!: string;

  @ApiProperty({ description: 'Customer WhatsApp Business Account ID' })
  @Matches(/^\d{5,30}$/)
  wabaId!: string;

  @ApiProperty({ description: 'Registered Cloud API phone number ID' })
  @Matches(/^\d{5,30}$/)
  phoneNumberId!: string;
}
