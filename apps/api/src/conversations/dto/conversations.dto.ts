import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConversationStatus } from '@prisma/client';

export class UpdateConversationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  agentEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  markedAsSale?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  markedUnattended?: boolean;

  @ApiPropertyOptional({ enum: ConversationStatus })
  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;
}

export class SendMessageDto {
  @ApiProperty({ example: 'Claro, te ayudo con el envío.' })
  @IsString()
  @MinLength(1)
  text!: string;
}
