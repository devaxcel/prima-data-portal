import {
  Body, Controller, Get, Injectable, Module, NotFoundException, Param, Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, CurrentUser, JwtPayload } from '../auth/decorators/roles.decorator';

class UpdateSettingDto {
  @ApiProperty() @IsString() @MaxLength(10000) value!: string;
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Client-facing — returns only settings marked isPublic:true */
  async listPublic() {
    const rows = await this.prisma.portalSetting.findMany({
      where: { isPublic: true },
      select: { key: true, value: true },
    });
    return rows.reduce<Record<string, string>>((acc, r) => {
      acc[r.key] = r.value;
      return acc;
    }, {});
  }

  /** Admin-only — returns everything with metadata */
  async listAll() {
    return this.prisma.portalSetting.findMany({
      orderBy: { key: 'asc' },
    });
  }

  async get(key: string) {
    const row = await this.prisma.portalSetting.findUnique({ where: { key } });
    if (!row) throw new NotFoundException(`Setting "${key}" not found`);
    return row;
  }

  async update(key: string, dto: UpdateSettingDto, updatedById: string) {
    const existing = await this.prisma.portalSetting.findUnique({ where: { key } });
    if (!existing) throw new NotFoundException(`Setting "${key}" not found`);

    return this.prisma.portalSetting.update({
      where: { key },
      data: { value: dto.value, updatedById },
    });
  }
}

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly svc: SettingsService) {}

  /** Any authenticated user can read public settings (used by client portal) */
  @Get('public')
  publicSettings() {
    return this.svc.listPublic();
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  listAll() {
    return this.svc.listAll();
  }

  @Get(':key')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  get(@Param('key') key: string) {
    return this.svc.get(key);
  }

  @Patch(':key')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  update(
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(key, dto, user.sub);
  }
}

@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
