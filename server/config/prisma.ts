import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export { prisma };

// TypeScript 代码
//       ↓
// Prisma Client
// （理解你想查询哪个用户）
//       ↓
// PrismaPg Adapter
// （让 Prisma 使用 PostgreSQL 驱动）
//       ↓
// PostgreSQL Driver
// （与数据库建立连接、发送查询、接收结果）
//       ↓
// PostgreSQL Database
// （真正执行 SQL 并返回数据）