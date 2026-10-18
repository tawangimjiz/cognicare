import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional() @IsBoolean() notif?: boolean;
  @IsOptional() @IsBoolean() sound?: boolean;
  @IsOptional() @IsBoolean() largeText?: boolean;
}
