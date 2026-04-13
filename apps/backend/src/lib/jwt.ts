import jwt from 'jsonwebtoken';

export type AccessTokenPayload = {
  sub: string;
  role: string;
  iat?: number;
  exp?: number;
};

function getJwtSecret() {
  return process.env.JWT_SECRET ?? 'teamsight-dev-secret';
}

export function signAccessToken(payload: { sub: string; role: string }) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '8h' });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AccessTokenPayload;

    if (!decoded?.sub || !decoded?.role) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}
