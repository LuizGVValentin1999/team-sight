import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken } from './jwt.js';

export type AuthenticatedUser = {
  sub: string;
  role: string;
};

export function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): AuthenticatedUser | null {
  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader?.startsWith('Bearer ')) {
    reply.status(401).send({ message: 'Não autenticado' });
    return null;
  }

  const token = authorizationHeader.slice(7);
  const payload = verifyAccessToken(token);

  if (!payload) {
    reply.status(401).send({ message: 'Token inválido ou expirado' });
    return null;
  }

  return {
    sub: payload.sub,
    role: payload.role
  };
}
