import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsISO8601, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min, ValidateNested,
} from 'class-validator';

const DOMAIN_KEYS = ['focus', 'speed', 'direction', 'language', 'memory', 'mood'];

export class StartSessionDto {
  @IsString() gameId!: string;
  @IsInt() @Min(1) @Max(5) tier!: number;
}

export class ScoreInputDto {
  @IsIn(DOMAIN_KEYS) domain!: string;
  @IsNumber() @Min(0) rawScore!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) errorRate?: number;
  @IsOptional() @IsInt() @Min(0) meanReactionTimeMs?: number;
}

export class SessionEventInputDto {
  @IsString() type!: string;
  @IsISO8601() at!: string;
  @IsOptional() @IsInt() @Min(0) reactionTimeMs?: number;
  @IsOptional() @IsObject() data?: Record<string, unknown>;
}

export class EndSessionDto {
  @IsIn(['completed', 'timed_out', 'out_of_mistakes', 'abandoned']) status!: string;
  @IsInt() @Min(0) totalDurationMs!: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => ScoreInputDto)
  scores!: ScoreInputDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => SessionEventInputDto)
  events?: SessionEventInputDto[];
  @IsOptional() @IsObject() metrics?: Record<string, unknown>;
}
