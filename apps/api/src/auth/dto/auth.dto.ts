import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import { MIN_PASSWORD_LENGTH } from '../credentials';

export class RegisterDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(MIN_PASSWORD_LENGTH) password!: string;
  @IsString() @MinLength(1) fullName!: string;
  @IsIn(['patient', 'caregiver']) role!: 'patient' | 'caregiver';
}

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(1) password!: string;
}
