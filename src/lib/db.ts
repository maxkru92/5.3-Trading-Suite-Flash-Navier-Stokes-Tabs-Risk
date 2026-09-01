import { PrismaClient } from '@prisma/client'

/**
 * KRUPP CAPITAL // PRISMA CLIENT SINGLETON (standard Next.js pattern)
 *
 * NOTE (r9 post-mortem): an in-process "self-heal" variant of this file
 * (createRequire + require-cache eviction to dodge a stale client after a
 * live `prisma generate`) hard-crashed the dev server under Turbopack —
 * do NOT reintroduce it. After `prisma generate`, a dev-server restart is
 * the supported path (the restart re-imports '@prisma/client' from disk,
 * which already carries every generated delegate).
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
