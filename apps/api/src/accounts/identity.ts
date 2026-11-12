import { createClerkClient, verifyToken } from '@clerk/backend';

export interface ProvisionedUser {
  id: string;
  username: string | null;
}

export interface IdentityProvider {
  authenticate(token: string, origin?: string): Promise<string | null>;
  findByExternalId(externalId: string): Promise<ProvisionedUser | undefined>;
  resetPassword(userId: string, password: string): Promise<void>;
  createUser(input: {
    username: string;
    password: string;
    externalId: string;
  }): Promise<ProvisionedUser>;
}

export class CredentialsRejected extends Error {
  constructor(public readonly code: 'USERNAME_TAKEN' | 'CREDENTIALS_REJECTED') {
    super(code);
  }
}

export interface ClerkBindings {
  CLERK_SECRET_KEY?: string;
  CLERK_ISSUER?: string;
  CLERK_JWT_KEY?: string;
  CLERK_AUDIENCE?: string;
}

export function clerkIdentity(
  env: ClerkBindings,
  authorizedParties: string[],
): IdentityProvider | null {
  const {
    CLERK_SECRET_KEY: secretKey,
    CLERK_ISSUER: issuer,
    CLERK_JWT_KEY: jwtKey,
    CLERK_AUDIENCE: audience,
  } = env;
  if (!secretKey || !issuer || !audience || !authorizedParties.length) return null;
  const clerk = createClerkClient({ secretKey, telemetry: { disabled: true } });

  return {
    async authenticate(token, origin) {
      try {
        const claims = await verifyToken(token, {
          secretKey,
          jwtKey,
          issuer,
          audience,
          authorizedParties,
        });
        if (
          claims.iss !== issuer ||
          !(Array.isArray(claims.aud) ? claims.aud.includes(audience) : claims.aud === audience) ||
          typeof claims.exp !== 'number' ||
          typeof claims.azp !== 'string' ||
          !authorizedParties.includes(claims.azp) ||
          (origin && claims.azp !== origin) ||
          claims.sts === 'pending' ||
          !claims.sid?.startsWith('sess_') ||
          !claims.sub.startsWith('user_')
        )
          return null;
        return claims.sub;
      } catch {
        return null;
      }
    },
    async findByExternalId(externalId) {
      const { data } = await clerk.users.getUserList({ externalId: [externalId], limit: 1 });
      return data.find((user) => user.externalId === externalId);
    },
    async resetPassword(userId, password) {
      await clerk.users.updateUser(userId, { password, signOutOfOtherSessions: true });
    },
    async createUser(input) {
      try {
        return await clerk.users.createUser(input);
      } catch (error) {
        const response = error as {
          status?: number;
          errors?: { code: string; meta?: { paramName?: string } }[];
        };
        if (response?.status === 422 && Array.isArray(response.errors)) {
          if (
            response.errors.some(
              ({ code, meta }) =>
                code === 'form_identifier_exists' && meta?.paramName === 'username',
            )
          ) {
            throw new CredentialsRejected('USERNAME_TAKEN');
          }
          if (
            response.errors.every(
              ({ code }) =>
                code.startsWith('form_password_') || code === 'form_param_format_invalid',
            )
          ) {
            throw new CredentialsRejected('CREDENTIALS_REJECTED');
          }
        }
        throw error;
      }
    },
  };
}
