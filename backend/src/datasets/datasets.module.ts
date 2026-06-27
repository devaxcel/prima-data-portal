import {
  Body, Controller, Get, Module, Param, Patch, Post, Delete, Query, Req,
  UseGuards, NotFoundException, ForbiddenException, BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import {
  Prisma, DatasetStatus, AuditAction, UserRole,
} from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength, Matches, IsBoolean } from 'class-validator';

import { PrismaService } from '../prisma/prisma.module';
import { AuditService } from '../audit/audit.module';
import { StorageService } from '../storage/storage.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, CurrentUser, JwtPayload } from '../auth/decorators/roles.decorator';

// ─── DTOs ─────────────────────────────────────────────────────────

class CreateDatasetDto {
  @ApiProperty() @IsString() @MinLength(2) name: string;
  @ApiProperty() @IsString() @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be lowercase letters, numbers, and dashes only',
  })
  slug: string;
  @ApiProperty() @IsString() description: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() categoryId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() coverage?: string;
}

class UpdateDatasetDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() categoryId?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() coverage?: string;
}

class PrepareUploadDto {
  @ApiProperty() @IsString() version: string;
  @ApiProperty() @IsString() fileName: string;
  @ApiProperty() @IsString() contentType: string;
}

class ConfirmVersionDto {
  @ApiProperty() @IsString() version: string;
  @ApiProperty() @IsString() fileKey: string;
  @ApiProperty() @IsString() fileName: string;
  @ApiProperty() @IsString() mimeType: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() changelog?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() setCurrent?: boolean;
}

// ─── Service ──────────────────────────────────────────────────────

@Injectable()
export class DatasetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async listForClient(userId: string, params: {
    skip?: number; take?: number; search?: string; categoryId?: string;
    sortBy?: 'name' | 'updatedAt' | 'createdAt' | 'category';
    sortOrder?: 'asc' | 'desc';
  }) {
    const { skip = 0, take = 25, search, categoryId, sortBy = 'updatedAt', sortOrder = 'desc' } = params;
    const where: Prisma.DatasetWhereInput = {
      status: DatasetStatus.PUBLISHED,
    };
    if (categoryId) where.categoryId = categoryId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.DatasetOrderByWithRelationInput =
      sortBy === 'category'
        ? { category: { name: sortOrder } }
        : { [sortBy]: sortOrder };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.dataset.findMany({
        where, skip, take: Math.min(take, 100),
        orderBy,
        include: {
          currentVersion: true,
          category: { select: { id: true, name: true, slug: true, parentId: true } },
        },
      }),
      this.prisma.dataset.count({ where }),
    ]);

    return { items: this.serialize(items), total, skip, take };
  }

  async listForAdmin(params: {
    skip?: number; take?: number; search?: string;
    status?: DatasetStatus; categoryId?: string;
    sortBy?: 'name' | 'updatedAt' | 'createdAt' | 'category';
    sortOrder?: 'asc' | 'desc';
  }) {
    const { skip = 0, take = 25, search, status, categoryId, sortBy = 'updatedAt', sortOrder = 'desc' } = params;
    const where: Prisma.DatasetWhereInput = {};
    if (status) where.status = status;
    if (categoryId) where.categoryId = categoryId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.DatasetOrderByWithRelationInput =
      sortBy === 'category'
        ? { category: { name: sortOrder } }
        : { [sortBy]: sortOrder };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.dataset.findMany({
        where, skip, take: Math.min(take, 100),
        orderBy,
        include: {
          currentVersion: true,
          uploadedBy: { select: { id: true, fullName: true, email: true } },
          category: { select: { id: true, name: true, slug: true, parentId: true } },
          _count: { select: { access: true, versions: true, downloads: true } },
        },
      }),
      this.prisma.dataset.count({ where }),
    ]);

    return { items: this.serialize(items), total, skip, take };
  }

  async detail(id: string, user: JwtPayload) {
    const dataset = await this.prisma.dataset.findUnique({
      where: { id },
      include: {
        versions: { orderBy: { publishedAt: 'desc' } },
        currentVersion: true,
        uploadedBy: { select: { id: true, fullName: true } },
        category: { select: { id: true, name: true, slug: true, parentId: true } },
      },
    });
    if (!dataset) throw new NotFoundException();

    if (user.role === UserRole.CLIENT) {
      if (dataset.status !== DatasetStatus.PUBLISHED) throw new NotFoundException();
    }

    return this.serializeOne(dataset);
  }

  async create(dto: CreateDatasetDto, uploadedById: string) {
    const existing = await this.prisma.dataset.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new BadRequestException('A dataset with this slug already exists');

    if (dto.categoryId) {
      const cat = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!cat) throw new BadRequestException('Category not found');
    }

    const dataset = await this.prisma.dataset.create({
      data: { ...dto, status: DatasetStatus.DRAFT, uploadedById },
    });
    await this.audit.log({
      action: AuditAction.DATASET_UPLOADED,
      actorId: uploadedById,
      targetType: 'Dataset',
      targetId: dataset.id,
      metadata: { name: dataset.name },
    });
    return this.serializeOne(dataset);
  }

  async update(id: string, dto: UpdateDatasetDto, actorId: string) {
    const dataset = await this.prisma.dataset.update({
      where: { id }, data: dto,
    });
    await this.audit.log({
      action: AuditAction.DATASET_UPDATED,
      actorId, targetType: 'Dataset', targetId: id,
      metadata: dto as any,
    });
    return this.serializeOne(dataset);
  }

  // Step 1 — request a presigned URL the client PUTs the file to directly
  async prepareUpload(datasetId: string, dto: PrepareUploadDto) {
    const dataset = await this.prisma.dataset.findUnique({ where: { id: datasetId } });
    if (!dataset) throw new NotFoundException();

    const key = this.storage.buildKey(dataset.slug, dto.version, dto.fileName);
    const uploadUrl = await this.storage.getUploadUrl(key, dto.contentType);
    return { uploadUrl, fileKey: key };
  }

  // Step 2 — confirm the file is in storage and create a version row
  async confirmVersion(datasetId: string, dto: ConfirmVersionDto, actorId: string) {
    const dataset = await this.prisma.dataset.findUnique({ where: { id: datasetId } });
    if (!dataset) throw new NotFoundException();

    const fileSizeBytes = await this.storage.headSize(dto.fileKey);

    const version = await this.prisma.datasetVersion.upsert({
  where: { datasetId_version: { datasetId, version: dto.version } },
  create: {
    datasetId,
    version: dto.version,
    fileKey: dto.fileKey,
    fileName: dto.fileName,
    fileSizeBytes: BigInt(fileSizeBytes),
    mimeType: dto.mimeType,
    changelog: dto.changelog,
  },
  update: {
    fileKey: dto.fileKey,
    fileName: dto.fileName,
    fileSizeBytes: BigInt(fileSizeBytes),
    mimeType: dto.mimeType,
    changelog: dto.changelog,
  },
});

    const fileTypeFromMime = mimeToLabel(dto.mimeType, dto.fileName);
// ─── Helpers ──────────────────────────────────────────────────────

function mimeToLabel(mimeType: string, fileName: string): string {
  const map: Record<string, string> = {
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'application/vnd.ms-excel': 'XLS',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/msword': 'DOC',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
    'application/pdf': 'PDF',
    'text/csv': 'CSV',
    'application/json': 'JSON',
    'application/zip': 'ZIP',
    'text/plain': 'TXT',
    'application/parquet': 'PARQUET',
  };
  if (map[mimeType.toLowerCase()]) return map[mimeType.toLowerCase()];

  // Fallback to file extension
  const ext = fileName.split('.').pop()?.toUpperCase();
  if (ext && ext.length <= 6) return ext;

  return 'FILE';
}
    if (dto.setCurrent !== false) {
      await this.prisma.dataset.update({
        where: { id: datasetId },
        data: {
          currentVersionId: version.id,
          fileType: fileTypeFromMime || dataset.fileType,
        },
      });
    }

    await this.audit.log({
      action: AuditAction.DATASET_UPDATED,
      actorId, targetType: 'Dataset', targetId: datasetId,
      metadata: { newVersion: dto.version, fileName: dto.fileName },
    });

    return this.serializeOne(version);
  }

  async publish(id: string, actorId: string) {
    const dataset = await this.prisma.dataset.findUnique({
      where: { id },
      include: { currentVersion: true },
    });
    if (!dataset) throw new NotFoundException();
    if (!dataset.currentVersion) {
      throw new BadRequestException('Cannot publish a dataset without an uploaded file');
    }
    const updated = await this.prisma.dataset.update({
      where: { id },
      data: { status: DatasetStatus.PUBLISHED, publishedAt: new Date() },
    });
    await this.audit.log({
      action: AuditAction.DATASET_PUBLISHED,
      actorId, targetType: 'Dataset', targetId: id,
    });
    return this.serializeOne(updated);
  }

  async archive(id: string, actorId: string) {
    const updated = await this.prisma.dataset.update({
      where: { id }, data: { status: DatasetStatus.ARCHIVED },
    });
    await this.audit.log({
      action: AuditAction.DATASET_ARCHIVED,
      actorId, targetType: 'Dataset', targetId: id,
    });
    return this.serializeOne(updated);
  }

 async delete(id: string, actorId: string) {
  const dataset = await this.prisma.dataset.findUnique({
    where: { id }, include: { versions: true },
  });
  if (!dataset) throw new NotFoundException();

  // Best-effort delete files from storage
  for (const v of dataset.versions) {
    await this.storage.delete(v.fileKey);
  }

  // Clear child rows that don't cascade — Download FK blocks the delete otherwise
  await this.prisma.$transaction([
    this.prisma.dataset.update({
      where: { id },
      data: { currentVersionId: null },
    }),
    this.prisma.download.deleteMany({ where: { datasetId: id } }),
    this.prisma.datasetAccess.deleteMany({ where: { datasetId: id } }),
    this.prisma.datasetVersion.deleteMany({ where: { datasetId: id } }),
    this.prisma.dataset.delete({ where: { id } }),
  ]);

  await this.audit.log({
    action: AuditAction.DATASET_DELETED,
    actorId, targetType: 'Dataset', targetId: id,
    metadata: { name: dataset.name },
  });
}

  // Client-facing — secure presigned download
  async getDownloadUrl(
    datasetId: string,
    versionId: string | undefined,
    user: JwtPayload,
    ctx: { ipAddress?: string; userAgent?: string },
  ) {
    const dataset = await this.prisma.dataset.findUnique({
      where: { id: datasetId },
      include: { currentVersion: true },
    });
    if (!dataset) throw new NotFoundException();
    if (user.role === UserRole.CLIENT && dataset.status !== DatasetStatus.PUBLISHED) {
      throw new NotFoundException();
    }

    const version = versionId
      ? await this.prisma.datasetVersion.findFirst({ where: { id: versionId, datasetId } })
      : dataset.currentVersion;
    if (!version) throw new NotFoundException('No version available');

    const url = await this.storage.getDownloadUrl(version.fileKey, version.fileName);

    await this.prisma.download.create({
      data: {
        userId: user.sub, datasetId, versionId: version.id,
        ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
      },
    });
    await this.audit.log({
      action: AuditAction.DATASET_DOWNLOADED,
      actorId: user.sub, targetType: 'Dataset', targetId: datasetId,
      metadata: { versionId: version.id, fileName: version.fileName },
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    });

    return { url, expiresInSeconds: 300, fileName: version.fileName };
  }

  async listMyDownloads(userId: string, params: { skip?: number; take?: number }) {
    const { skip = 0, take = 50 } = params;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.download.findMany({
        where: { userId },
        skip, take: Math.min(take, 200),
        orderBy: { createdAt: 'desc' },
        include: { dataset: { select: { id: true, name: true, fileType: true } } },
      }),
      this.prisma.download.count({ where: { userId } }),
    ]);
    return { items, total, skip, take };
  }

  // BigInt → string for JSON
  private serialize<T>(items: T[]): any[] { return items.map((i) => this.serializeOne(i)); }
  private serializeOne(item: any): any {
    if (!item) return item;
    return JSON.parse(JSON.stringify(item, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v));
  }
}

// ─── Controller ────────────────────────────────────────────────────

@ApiTags('datasets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('datasets')
export class DatasetsController {
  constructor(private readonly svc: DatasetsService) {}

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: DatasetStatus,
    @Query('sortBy') sortBy?: 'name' | 'updatedAt' | 'createdAt' | 'category',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    const params = {
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      search, categoryId, sortBy, sortOrder,
    };
    if (user.role === UserRole.ADMIN) {
      return this.svc.listForAdmin({ ...params, status });
    }
    return this.svc.listForClient(user.sub, params);
  }

  @Get('downloads/mine')
  myDownloads(
    @CurrentUser() user: JwtPayload,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.svc.listMyDownloads(user.sub, {
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.detail(id, user);
  }

  @Post(':id/download')
  download(
    @Param('id') id: string,
    @Body('versionId') versionId: string | undefined,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.svc.getDownloadUrl(id, versionId, user, {
      ipAddress: req.ip, userAgent: req.get('user-agent') ?? undefined,
    });
  }

  // Authoring — admin & data manager only

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateDatasetDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDatasetDto, @CurrentUser() user: JwtPayload) {
    return this.svc.update(id, dto, user.sub);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/upload-url')
  prepareUpload(@Param('id') id: string, @Body() dto: PrepareUploadDto) {
    return this.svc.prepareUpload(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/versions')
  confirmVersion(
    @Param('id') id: string,
    @Body() dto: ConfirmVersionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.confirmVersion(id, dto, user.sub);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/publish')
  publish(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.publish(id, user.sub);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/archive')
  archive(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.archive(id, user.sub);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.delete(id, user.sub);
  }
}

@Module({
  controllers: [DatasetsController],
  providers: [DatasetsService],
  exports: [DatasetsService],
})
export class DatasetsModule {}
