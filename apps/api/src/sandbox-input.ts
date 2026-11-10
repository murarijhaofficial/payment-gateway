import { BadRequestException } from '@nestjs/common';

export function objectBody(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Expected a JSON object');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !allowed.includes(key)))
    throw new BadRequestException('Unexpected input field');
  return body;
}
export function textField(body: Record<string, unknown>, key: string, min = 1, max = 120): string {
  const value = body[key];
  if (typeof value !== 'string' || value.trim().length < min || value.length > max)
    throw new BadRequestException(`Invalid ${key}`);
  return value.trim();
}
export function integerField(
  body: Record<string, unknown>,
  key: string,
  min = 1,
  max = 100000000,
): number {
  const value = body[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw new BadRequestException(`Invalid ${key}`);
  return value;
}
export function uuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw new BadRequestException('Invalid identifier');
  return value;
}
export function passwordField(body: Record<string, unknown>): string {
  const value = body['password'];
  if (typeof value !== 'string' || value.length < 12 || value.length > 128)
    throw new BadRequestException('Use a password between 12 and 128 characters');
  return value;
}
