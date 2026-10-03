import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { CHOOSABLE_SLUG } from '../storefront-host';

export class UpdateSubdomainDto {
  @ApiProperty({ example: 'casa-andina', description: 'New store subdomain (3–40 lowercase letters, digits or hyphens)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @Matches(CHOOSABLE_SLUG, {
    message:
      'Usa entre 3 y 40 letras minúsculas, números o guiones, sin empezar ni terminar en guion y sin guiones seguidos.',
  })
  slug!: string;
}
