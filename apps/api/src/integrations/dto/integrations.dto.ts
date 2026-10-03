import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class SetCustomDomainDto {
  @ApiProperty({ example: 'www.mitienda.pe' })
  @IsString()
  @MaxLength(253)
  domain!: string;
}

export class UpdateTrackingDto {
  @ApiPropertyOptional({ example: '123456789012345', description: 'Meta Pixel ID; empty string removes it.' })
  @IsOptional()
  @Matches(/^(\d{10,20})?$/, { message: 'El ID del píxel de Meta son solo números (entre 10 y 20).' })
  metaPixelId?: string;

  @ApiPropertyOptional({ example: 'G-ABC123XYZ9', description: 'GA4 measurement ID; empty string removes it.' })
  @IsOptional()
  @Matches(/^(G-[A-Z0-9]{4,12})?$/, { message: 'El ID de Google Analytics empieza con G-, por ejemplo G-ABC123XYZ9.' })
  ga4MeasurementId?: string;
}
