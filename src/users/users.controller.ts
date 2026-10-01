import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthContext } from '../common/auth/auth-context';
import { CurrentAuth, PlatformAdminOnly } from '../common/auth/decorators';
import { UpdateProfileDto, UpdateUserStatusDto, UserQueryDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('users/me')
  me(@CurrentAuth() auth: AuthContext) {
    return this.users.getById(auth.userId);
  }

  @Patch('users/me')
  updateMe(@CurrentAuth() auth: AuthContext, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(auth.userId, dto);
  }

  @Get('admin/users')
  @PlatformAdminOnly()
  list(@Query() query: UserQueryDto) {
    return this.users.list(query);
  }

  @Get('admin/users/:id')
  @PlatformAdminOnly()
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.getById(id);
  }

  @Patch('admin/users/:id/status')
  @PlatformAdminOnly()
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserStatusDto) {
    return this.users.updateStatus(id, dto);
  }
}
