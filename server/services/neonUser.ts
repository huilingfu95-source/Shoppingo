import { prisma } from "../config/prisma.js";
//prisma.schema already has model,so we only need
//define the user format to be returned from the database
export interface NeonUserRecord {
    id: string;
    name: string | null;
    email: string;
    role: string | null;
    createdAt?: Date | null;
}
//neon can add delete user automatically in neon Auth,
//so we don't need to implement delete user function in our backend
//we only need to implement find user function, and we can use the find user function to check
// if the user exists in our database
// neon_auth.user is managed by Neon Auth, not by schema.prisma, so we query it with raw SQL
export const findNeonUser = async (filter: { id?: string; email?: string }): Promise<NeonUserRecord | null> => {
    try {
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
    } catch (error) {
        console.error("findNeonUser failed:", error);
        return null;
    }
};
