import { Body, Controller, Delete, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { CurrentUser, type AuthUser } from './common.js';
import { IamService } from './iam.service.js';

@ApiTags('iam')
@ApiBearerAuth()
@Controller('v1/management')
export class IamController {
  constructor(private readonly iam: IamService) {}

  @Post('organizations')
  createOrganization(@CurrentUser() user: AuthUser, @Body() body: { name: string }) {
    return this.iam.createOrganization(user, body.name);
  }

  @Get('organizations/:organizationId/users')
  listUsers(@CurrentUser() user: AuthUser, @Param('organizationId') organizationId: string) {
    return this.iam.listUsers(user, organizationId);
  }

  @Post('organizations/:organizationId/users')
  invite(@CurrentUser() user: AuthUser, @Param('organizationId') organizationId: string, @Body() body: Record<string, unknown>) {
    return this.iam.invite(user, { ...body, organizationId });
  }

  @Post('users/:userId/disable')
  disable(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.iam.setStatus(user, userId, 'disabled');
  }

  @Post('users/:userId/enable')
  enable(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.iam.setStatus(user, userId, 'active');
  }

  @Post('users/:userId/password-reset')
  reset(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.iam.requestReset(user, userId);
  }

  @Post('users/:userId/platform-admin')
  promote(@CurrentUser() user: AuthUser, @Param('userId') userId: string, @Body() body: { currentPassword: string }) {
    return this.iam.promote(user, userId, body.currentPassword);
  }

  @Get('organizations/:organizationId/groups')
  listGroups(@CurrentUser() user: AuthUser, @Param('organizationId') organizationId: string) {
    return this.iam.listGroups(user, organizationId);
  }

  @Post('organizations/:organizationId/groups')
  createGroup(@CurrentUser() user: AuthUser, @Param('organizationId') organizationId: string, @Body() body: unknown) {
    return this.iam.createGroup(user, organizationId, body);
  }

  @Post('organizations/:organizationId/groups/:roleId/members')
  addMember(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('roleId') roleId: string,
    @Body() body: { userId: string },
  ) {
    return this.iam.addMemberToGroup(user, organizationId, roleId, body.userId);
  }

  @Delete('organizations/:organizationId/groups/:roleId/members/:userId')
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('roleId') roleId: string,
    @Param('userId') userId: string,
  ) {
    return this.iam.removeMemberFromGroup(user, organizationId, roleId, userId);
  }

  @Post('service-accounts')
  createServiceAccount(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.iam.createServiceAccount(user, body);
  }

  @Post('service-accounts/:userId/revoke')
  revokeServiceAccount(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.iam.revokeServiceCredential(user, userId);
  }

  @Get('access/explain')
  explain(
    @CurrentUser() user: AuthUser,
    @Query('siteId') siteId: string,
    @Query('permission') permission: string,
    @Query('userId') userId?: string,
    @Query('folderId') folderId?: string,
    @Query('kind') kind?: 'page' | 'asset',
  ) {
    return this.iam.explain(user, { siteId, permission, userId, folderId, kind });
  }

  @Get('audit')
  async audit(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId: string | undefined,
    @Query('siteId') siteId: string | undefined,
    @Query('actorId') actorId: string | undefined,
    @Query('action') action: string | undefined,
    @Query('result') result: string | undefined,
    @Query('kind') kind: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const payload = await this.iam.listAudit(user, { organizationId, siteId, actorId, action, result, kind, from, to, format });
    if ('format' in payload && payload.format === 'csv') {
      reply.header('content-type', 'text/csv; charset=utf-8');
      return payload.body;
    }
    return payload;
  }
}
