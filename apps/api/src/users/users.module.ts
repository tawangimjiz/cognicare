import { Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, AccessService],
  exports: [UsersService, AccessService],
})
export class UsersModule {}
