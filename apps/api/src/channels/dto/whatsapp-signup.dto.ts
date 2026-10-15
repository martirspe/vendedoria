import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class WhatsAppSignupStateDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100)
  sessionId!: string;
  @ApiProperty() @Matches(/^[A-Za-z0-9_-]{43}$/)
  state!: string;
}
export class AuthorizeWhatsAppSignupDto extends WhatsAppSignupStateDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(4096)
  code!: string;
}
export class CompleteWhatsAppSignupDto extends WhatsAppSignupStateDto {
  @ApiProperty() @Matches(/^\d{5,30}$/)
  phoneNumberId!: string;
  @ApiProperty() @Matches(/^\d{5,30}$/)
  wabaId!: string;
  @ApiPropertyOptional({ description: 'Six-digit two-step verification PIN; required for unregistered Cloud API numbers' })
  @IsOptional() @Matches(/^\d{6}$/)
  pin?: string;
}
