import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessService } from './access.service.js';
import { AuthGuard } from './auth.guard.js';
import { ContentService } from './content.service.js';
import { DatabaseService } from './database.service.js';
import { DeliveryService } from './delivery.service.js';
import { ExperienceService } from './experience.service.js';
import {
  ContentController,
  DeliveryController,
  HealthController,
  IdentityController,
  PublicController,
  TenancyController,
} from './http.controller.js';
import { IdentityService } from './identity.service.js';
import { PlatformService } from './platform.service.js';
import { TenancyService } from './tenancy.service.js';

@Module({
  controllers: [HealthController, IdentityController, TenancyController, ContentController, DeliveryController, PublicController],
  providers: [
    DatabaseService,
    AccessService,
    IdentityService,
    TenancyService,
    ContentService,
    ExperienceService,
    DeliveryService,
    PlatformService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
