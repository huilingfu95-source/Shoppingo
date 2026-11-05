import multer from "multer";

const storage = multer.memoryStorage();

const maxFileSize = 10485760; // 10MB

export const upload = multer({
  storage: storage,
  limits: { fileSize: maxFileSize },
});




// 1. Frontend：用户上传图片
//        ↓
// 2. Multer Middleware：接收图片并暂存到 Server RAM（req.file.buffer）
//        ↓  
//        ├── 解析文件
//        ├── 检查文件大小
//        ├── 将文件存储在 RAM 中
//        └── 将文件信息放入 req.file
// 3. Controller：读取 Buffer，通过 Cloudinary SDK 上传图片
//        ↓
// 4. Cloudinary：存储图片并返回 URL（secure_url）
//        ↓
// 5. Prisma Client：将图片 URL 写入 Neon PostgreSQL
//        ↓
// 6. Neon PostgreSQL：持久保存 URL（String），不保存图片本身
//        ↓
// 7. 请求结束后：Buffer 不再被引用时，由 Node.js 垃圾回收机制回收内存