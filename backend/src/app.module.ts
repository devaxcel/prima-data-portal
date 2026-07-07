import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DatasetsModule } from './datasets/datasets.module';
import { AccessModule } from './access/access.module';
import { AuditModule } from './audit/audit.module';
import { StorageModule } from './storage/storage.module';
import { EmailModule } from './email/email.module';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';
import { SearchModule } from './search/search.module';
import { CategoriesModule } from './categories/categories.module';
import { PreviewModule } from './preview/preview.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'medium', ttl: 60_000, limit: 200 },
    ]),
    PrismaModule,
    EmailModule,
    StorageModule,
    AuditModule,
    AuthModule,
    UsersModule,
    DatasetsModule,
    AccessModule,
    AdminModule,
    HealthModule,
    SearchModule,
    CategoriesModule,
    PreviewModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
