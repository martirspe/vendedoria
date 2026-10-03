import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePlaygroundSessionDto {
  @ApiPropertyOptional({ example: 'Prueba del vendedor' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;
}

export class SendPlaygroundMessageDto {
  @ApiProperty({ example: 'Hola, buscan polos?' })
  @IsString()
  @MinLength(1)
  text!: string;

  @ApiPropertyOptional({ description: 'Sales agent to test; defaults to the primary one' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  agentId?: string;
}
