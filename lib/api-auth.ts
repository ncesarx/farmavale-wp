import "server-only";
import { extractBearerToken, hashApiToken } from "@/lib/api-credentials";
import { prisma } from "@/lib/prisma";

export async function authenticateApiRequest(authorization: string | null, scope: string) {
  const token = extractBearerToken(authorization);
  if (!token) return null;

  const credential = await prisma.apiCredential.findFirst({
    where: {
      tokenHash: hashApiToken(token),
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      scopes: { has: scope },
    },
    select: { id: true, organizationId: true, name: true },
  });
  if (!credential) return null;

  await prisma.apiCredential.update({
    where: { id: credential.id },
    data: { lastUsedAt: new Date() },
  });
  return credential;
}
