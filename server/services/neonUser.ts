import { prisma } from "../config/prisma.js";

// prisma.schema already has model, so we only need
// define the user format to be returned from the database
export interface NeonUserRecord {
    id: string;
    name: string | null;
    email: string;
    role: string | null;
    createdAt?: Date | null;
}

// neon can add delete user automatically in neon Auth,
// so we don't need to implement delete user function in our backend
// we only need to implement find user function, and we can use the find user function to check
// if the user exists in our database
// neon_auth.user is managed by Neon Auth, not by schema.prisma, so we query it with raw SQL
// 查询出错时直接抛出，不要当成"用户不存在"
export const findNeonUser = async (filter: { id?: string; email?: string }): Promise<NeonUserRecord | null> => {
    let rows: NeonUserRecord[] = [];

    if (filter.id) {
        rows = await prisma.$queryRaw<NeonUserRecord[]>`
            SELECT id, name, email, role, "createdAt"
            FROM neon_auth.user
            WHERE id = ${filter.id}::uuid
            LIMIT 1
        `;
    } else if (filter.email) {
        rows = await prisma.$queryRaw<NeonUserRecord[]>`
            SELECT id, name, email, role, "createdAt"
            FROM neon_auth.user
            WHERE LOWER(email) = ${filter.email.trim().toLowerCase()}
            LIMIT 1
        `;
    }

    return rows[0] || null;
};

// update a user's role in neon_auth.user (raw SQL)
export const updateNeonUserRole = async (
    userId: string,
    role: string
): Promise<number> => {
    if (!userId) {
        throw new Error("userId is required");
    }

    const allowedRoles = ["admin", "merchant", "customer"] as const;
    const normalizedRole = role.trim().toLowerCase();

    if (!allowedRoles.includes(normalizedRole as (typeof allowedRoles)[number])) {
        throw new Error(`Invalid role: ${role}`);
    }

    // returns the number of affected rows (0 = user not found)
    return await prisma.$executeRaw`
        UPDATE neon_auth.user
        SET role = ${normalizedRole}
        WHERE id = ${userId}::uuid
    `;
};

// ADMIN: users who are merchants — role = 'merchant', or anyone who owns a store
export const findNeonMerchants = async (): Promise<NeonUserRecord[]> => {
    return await prisma.$queryRaw<NeonUserRecord[]>`
        SELECT u.id, u.name, u.email, u.role, u."createdAt"
        FROM neon_auth.user u
        WHERE u.role = 'merchant'
           OR EXISTS (SELECT 1 FROM public.stores s WHERE s.merchant_id = u.id)
        ORDER BY u."createdAt" DESC
    `;
};
