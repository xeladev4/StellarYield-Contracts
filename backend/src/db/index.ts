// Database connection — configure via DATABASE_URL env var
// Replace with your preferred client (pg, Drizzle, Prisma, etc.)

export async function query<T = Record<string, unknown>>(
  _sql: string,
  _params?: unknown[],
): Promise<T[]> {
  throw new Error("Not implemented");
}
