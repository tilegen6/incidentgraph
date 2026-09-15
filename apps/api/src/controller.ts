import {
  getBootstrap,
  listIncidents,
  listLogs,
  getMetrics,
  searchWorkspace,
  baseTelemetryQuerySchema as querySchema,
} from '../../../packages/shared/src/queries';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Patch,
  Query,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  annotationSchema,
  createIncidentSchema,
  ingestSchema,
  updateIncidentSchema,
} from '../../../packages/shared/src';
import { Storage } from './storage';
import { IncidentService } from './incident-service';
import { SessionGuard, Public, issueSession, validSession, revokeSession } from './auth';
import { config } from './config';
import { ReadCache } from './cache';
import { InProcessEventProcessor } from './event-processor';
function parse<T extends z.ZodType<unknown, z.ZodTypeDef, unknown>>(
  schema: T,
  value: unknown,
): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  return result.data;
}

@Controller('api')
export class ApiController {
  constructor(
    @Inject(Storage) private readonly storage: Storage,
    @Inject(IncidentService) private readonly incidents: IncidentService,
    @Inject(ReadCache) private readonly cache: ReadCache,
    @Inject(InProcessEventProcessor) private readonly processor: InProcessEventProcessor,
  ) {}
  @Public() @Get('health') health() {
    return { status: 'ok', storage: config.STORAGE_MODE, version: '1.0.1' };
  }
  @Public() @Get('auth/config') authConfig() {
    return { demoMode: config.DEMO_MODE };
  }
  @Public() @Post('auth/login') @HttpCode(200) login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = parse(
      z.object({ email: z.string().email().max(254), password: z.string().max(256) }),
      body,
    );
    const a = createHash('sha256').update(input.password).digest(),
      b = createHash('sha256').update(config.ADMIN_PASSWORD).digest();
    const validPassword = timingSafeEqual(a, b);
    if (input.email !== config.ADMIN_EMAIL || !validPassword)
      throw new UnauthorizedException('Invalid email or password');
    revokeSession((req.cookies as Record<string, unknown> | undefined)?.ig_session);
    res.cookie('ig_session', issueSession(), {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    });
    return { name: 'Alex Morgan', email: input.email };
  }
  @Post('auth/logout') @HttpCode(200) logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    revokeSession((req.cookies as Record<string, unknown> | undefined)?.ig_session);
    res.clearCookie('ig_session', { path: '/' });
    return { ok: true };
  }
  @Public() @Get('auth/me') me(@Req() req: Request, @Res() res: Response) {
    return res.json(
      validSession((req.cookies as Record<string, unknown> | undefined)?.ig_session)
        ? { name: 'Alex Morgan', email: config.ADMIN_EMAIL }
        : null,
    );
  }
  @Get('bootstrap') bootstrap(@Query() query: unknown) {
    const q = parse(querySchema, query);
    return getBootstrap(this.storage.snapshot(), q, config);
  }
  @Get('incidents') list(@Query() query: unknown) {
    const q = parse(
      querySchema.extend({
        status: z.string().optional(),
        severity: z.string().optional(),
        from: z.string().datetime().optional(),
      }),
      query,
    );
    return listIncidents(this.storage.snapshot(), q);
  }
  @Get('incidents/:id') detail(@Param('id') id: string) {
    const incident = this.incidents.find(id);
    const d = this.storage.snapshot();
    return {
      ...incident,
      events: d.events.filter((e) => e.incidentId === id),
      annotations: d.annotations.filter((e) => e.incidentId === id),
    };
  }
  @Post('incidents') @UseGuards(SessionGuard) create(@Body() body: unknown) {
    return this.incidents.create(parse(createIncidentSchema, body));
  }
  @Patch('incidents/:id') @UseGuards(SessionGuard) update(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.incidents.update(id, parse(updateIncidentSchema, body));
  }
  @Post('incidents/:id/analyze') @UseGuards(SessionGuard) analyze(@Param('id') id: string) {
    return this.incidents.analyze(id);
  }
  @Post('incidents/:id/annotations') @UseGuards(SessionGuard) async annotate(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    this.incidents.find(id);
    const { body: text } = parse(annotationSchema, body);
    const note = {
      id: randomUUID(),
      incidentId: id,
      author: 'Alex Morgan',
      body: text,
      createdAt: new Date().toISOString(),
    };
    await this.storage.addAnnotation(note);
    return note;
  }
  @Post('ingest') @UseGuards(SessionGuard) ingest(@Body() body: unknown) {
    return this.processor.process(parse(ingestSchema, body).events);
  }
  @Get('logs') logs(@Query() query: unknown) {
    const q = parse(querySchema, query);
    return listLogs(this.storage.snapshot(), q);
  }
  @Get('metrics') metrics(@Query() query: unknown) {
    const q = parse(querySchema, query);
    return this.cache.remember(`metrics:${q.environment}:${q.service}:${q.range}`, () =>
      getMetrics(this.storage.snapshot(), q),
    );
  }
  @Get('search') search(@Query() query: unknown) {
    const q = parse(querySchema, query);
    return searchWorkspace(this.storage.snapshot(), q);
  }
}
