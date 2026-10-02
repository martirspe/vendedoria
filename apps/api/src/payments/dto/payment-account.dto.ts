import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class ConnectPaymentAccountDto {
  @ApiPropertyOptional({ description: 'Required on first connection; omit to keep the current one.' })
  @IsOptional()
  @IsString()
  @Matches(/^(APP_USR|TEST)-[A-Za-z0-9-]{20,200}$/, {
    message: 'El Access Token debe empezar con APP_USR- o TEST-.',
  })
  accessToken?: string;

  @ApiProperty()
  @IsString()
  @Matches(/^(APP_USR|TEST)-[A-Za-z0-9-]{20,120}$/, {
    message: 'La Public Key debe empezar con APP_USR- o TEST-.',
  })
  publicKey!: string;

  @ApiPropertyOptional({ description: 'Webhook signing secret; omit to keep the current one.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9_-]{16,200}$/, { message: 'La clave secreta del webhook no es válida.' })
  webhookSecret?: string;

  @ApiProperty({ description: 'True for production credentials, false for test credentials.' })
  @IsBoolean()
  liveMode!: boolean;
}
