import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  authorId?: string | null;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  authorId?: string | null;
  phone?: string | null;
  city?: string | null;
}
