import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { config } from './config';
const sign = (text: string) =>
  createHmac('sha256', config.SESSION_SECRET).update(text).digest('hex');
export function issueSession() {
  const body = Buffer.from(JSON.stringify({ sub: 'alex', exp: Date.now() + 86400000 })).toString(
    'base64url',
  );
  return `${body}.${sign(body)}`;
}
export function validSession(token: unknown): boolean {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [body, signature] = parts;
  if (!body || !signature || signature.length !== 64) return false;
  try {
    if (!timingSafeEqual(Buffer.from(sign(body)), Buffer.from(signature))) return false;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as {
      exp: number;
      sub: string;
    };
    return payload.sub === 'alex' && payload.exp > Date.now();
  } catch {
    return false;
  }
}
@Injectable()
export class SessionGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const cookies = req.cookies as Record<string, unknown> | undefined;
    if (!validSession(cookies?.ig_session))
      throw new UnauthorizedException('Sign in to save changes.');
    return true;
  }
}
