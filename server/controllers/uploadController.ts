import { Request, Response } from "express";
import cloudinaryConfig from "../config/cloudinary.js";

const { cloudinary } = cloudinaryConfig;

type TransformAction = "recolor" | "bg-removal";
const TRANSFORM_ACTIONS: TransformAction[] = ["recolor", "bg-removal"];

const sanitizeColor = (color?: string): string => {
    const value = (color || "red").replace(/^#/, "");
    return /^[a-zA-Z0-9]+$/.test(value) ? value : "red";
};

// 优化已经上传到 Cloudinary 图片的访问 URL，让图片加载得更快、文件更小。
// 它是在 Cloudinary URL 中添加 f_auto,q_auto 参数，让 Cloudinary 自动优化图片格式和质量。
export const optimizeDeliveryUrl = (url: string): string => {
    if (!url || typeof url !== "string" || url.includes(".svg")) return url;

    return url.replace(
        /\/image\/upload\/(?!f_auto,q_auto\/)/,
        "/image/upload/f_auto,q_auto/",
    );
};

// 如果 action 是 "bg-removal"，就生成去背景的参数；否则，就生成换颜色的参数。
export function applyCloudinaryTransform(
    url: string,
    action: TransformAction,
    options: { prompt?: string; toColor?: string; multiple?: boolean } = {},
): string {
    const transform =
        action === "bg-removal"
            ? "e_background_removal,f_auto,q_auto"
            : [
                  `e_gen_recolor:prompt_${encodeURIComponent(options.prompt || "object")}`,
                  `to-color_${sanitizeColor(options.toColor)}`,
                  ...(options.multiple ? ["multiple_true"] : []),
              ].join(";") + ",f_auto,q_auto";

    // generate new url
    return url.replace("/image/upload/", `/image/upload/${transform}/`);
}

// 负责接收 Multer 提供的 Buffer，把图片上传到 Cloudinary，然后返回图片 URL。
// fileBuffer: 上传图片的二进制数据
// folder:     Cloudinary 中保存图片的文件夹
// options:    可选的类型，如 MIME 类型、文件名
export const uploadToCloudinary = (
    fileBuffer: Buffer,
    folder: string = "shoppingo",
    options: { mimetype?: string; filename?: string } = {},
): Promise<string> => {
    return new Promise((resolve, reject) => {
        // ① Check if image is an SVG
        const isSvg =
            options.mimetype === "image/svg+xml" ||
            options.filename?.toLowerCase().endsWith(".svg");

        // ② Create Cloudinary upload stream
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: "image",
                ...(isSvg ? { format: "svg" } : {}),
            },
            // ③ Handle upload result
            (error, result) => {
                if (error || !result) {
                    // upload failed, reject the promise with an error
                    reject(error || new Error("Upload failed"));
                } else {
                    // upload succeeded, resolve the promise with the secure_url
                    resolve(
                        isSvg
                            ? result.secure_url
                            : optimizeDeliveryUrl(result.secure_url),
                    );
                }
            },
        );

        // ④ send the file buffer to the upload stream，真正发送 buffer
        uploadStream.end(fileBuffer);
    });
};

// 如果 Cloudinary 上传失败，不直接报错，而是把图片 Buffer 转换成 Base64 Data URL
const toDataUrl = (file: Express.Multer.File): string =>
    `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

// Upload single image
export const uploadSingle = async (req: Request, res: Response): Promise<void> => {
    try {
        const file = req.file;
        if (!file) {
            res.status(400).json({ success: false, message: "No image file provided" });
            return;
        }

        const url = await uploadToCloudinary(file.buffer, "shoppingo", {
            mimetype: file.mimetype,
            filename: file.originalname,
        }).catch(() => toDataUrl(file));

        // return url to frontend
        res.json({ success: true, url });
    } catch (error: any) {
        console.error(error?.message);
        res.status(500).json({ success: false, message: "Image upload failed" });
    }
};

// Upload multiple images
export const uploadMultiple = async (req: Request, res: Response): Promise<void> => {
    try {
        const files = (req.files as Express.Multer.File[] | undefined) ?? [];

        if (!files.length) {
            res.status(400).json({ success: false, message: "No image file provided" });
            return;
        }

        const urls = await Promise.all(
            files.map((file) =>
                uploadToCloudinary(file.buffer, "shoppingo", {
                    mimetype: file.mimetype,
                    filename: file.originalname,
                }).catch(() => toDataUrl(file)),
            ),
        );

        res.json({ success: true, urls });
    } catch (error: any) {
        // 如果 error 存在，就读取它的 message；如果 error 是 null 或 undefined，就返回 undefined，不会报错。
        console.error(error?.message);
        res.status(500).json({ success: false, message: "Image upload failed" });
    }
};

// AI Transformation (Generative recolor & background removal)
export const aiTransform = async (req: Request, res: Response): Promise<void> => {
    try {
        // Object Destructuring: 从前端发送的 req.body 中，一次性取出 5 个属性，并分别保存到变量中
        const { imageUrl, action, prompt, toColor, multiple } = req.body ?? {};

        if (!imageUrl || typeof imageUrl !== "string") {
            res.status(400).json({ success: false, message: "Valid image is required" });
            return;
        }
        if (!TRANSFORM_ACTIONS.includes(action)) {
            res.status(400).json({
                success: false,
                message: `action must be one of: ${TRANSFORM_ACTIONS.join(", ")}`,
            });
            return;
        }

        // https://res.cloudinary.com/myshop/image/upload/photo.jpg
        //                            ↑
        //                        cloud_name
        const cloudName = cloudinary.config().cloud_name;
        let baseCloudinaryUrl: string = imageUrl;

        // ① 检查图片是不是在自己的 Cloudinary（用 startsWith，避免 URL 中间夹带字符串绕过检查）
        const isOwnCloudinary =
            !!cloudName && imageUrl.startsWith(`https://res.cloudinary.com/${cloudName}/`);

        if (!isOwnCloudinary) {
            // ② 上传图片
            const uploadResult = await cloudinary.uploader.upload(imageUrl, {
                folder: "shoppingo/products",
                resource_type: "image",
            });
            // ③ 获取上传后的 URL
            baseCloudinaryUrl = uploadResult.secure_url;
        }

        const transformedUrl = applyCloudinaryTransform(baseCloudinaryUrl, action, {
            prompt,
            toColor,
            multiple: Boolean(multiple),
        });

        res.json({ success: true, url: transformedUrl, originalUrl: imageUrl, action });
    } catch (error: any) {
        console.error(error?.message);
        res.status(500).json({ success: false, message: "AI transformation failed" });
    }
};






//检查 URL 是否属于自己的 Cloudinary
const ensureCloudinaryUrl = async (
    url: string,
    folder = "shoppingo/tryon"//如果需要上传图片，希望把它存放在哪个文件夹
): Promise<string> => {
    const cloudName = cloudinary.config().cloud_name;
    //yes,return the rul
    if (cloudName && url.startsWith(`https://res.cloudinary.com/${cloudName}/`)) {
        return url;
    }
    //no,upload the photo
    const res = await cloudinary.uploader.upload(url, {
        folder,
        resource_type: "image"
    }).catch(() => null);

    // 上传成功 → 返回 Cloudinary 生成的新 URL。
    // 上传失败 → 返回图片原来的 URL。
    return res?.secure_url || url;
};




export interface GenerateOnModelParams {
    prompt: string;
    productImageUrl: string;
    modelImageUrl: string;
    targetPublicId?: string;
    preference?: string;
}

export interface GenerateOnModelResult {
    secureUrl: string;
    publicId: string;
    model?: string;
    limits?: unknown;
}

// Cloudinary Image Generation API 的同步响应结构（只声明用到的字段）
interface CloudinaryGenerateResponse {
    data?: {
        assets?: Array<{
            model?: { family?: string; tier?: string; id?: string };
            storage?: { public_id?: string; secure_url?: string };
        }>;
    };
    limits?: unknown;
    error?: { message?: string };
    message?: string;
}

// 调用 Cloudinary image_to_image：[1] = 模特图，[2] = 商品图，生成模特穿上商品的照片
// 1.接收 GenerateOnModelParams Prompt + 模特图片 + 商品图片
export const generateOnModelImage = async (
    params: GenerateOnModelParams
): Promise<GenerateOnModelResult> => {
    //2.use cloudinary api generate photo
    const { cloud_name, api_key, api_secret } = cloudinary.config();

    if (!cloud_name || !api_key || !api_secret) {
        throw new Error("Cloudinary instance credentials are not configured");
    }

    const targetPublicId =
        params.targetPublicId?.trim() ||
        `tryOn/model_${Date.now()}`;
    //3.payload 就是你准备发送给 Cloudinary AI API 的请求内容。
    const payload = {
        prompt: params.prompt,
        // 顺序很重要：prompt 里的 [1] [2] 按这里的位置对应
        reference_images: [
            { source_type: "url", url: params.modelImageUrl },
            { source_type: "url", url: params.productImageUrl },
        ],
        // auto：让 Cloudinary 根据 prompt / 参考图数量自动选一个支持编辑的模型
        model: { mode: "auto", ...(params.preference ? { preference:params.preference } : {})},
        // 生成结果直接存进自己的 Cloudinary media library
        target: { target_type: "managed_asset", public_id: targetPublicId },
    };

    // Basic Auth：username = API key，password = API secret
    const auth = Buffer.from(`${api_key}:${api_secret}`).toString("base64");
    //4.send post request 
    const response = await fetch(
        `https://api.cloudinary.com/v2/generate/${cloud_name}/image_to_image`,
        {
            method: "POST",
            headers: {
                Authorization: `Basic ${auth}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        }
    );


    const data: any = await response.json().catch(() => null);

    if (!response.ok || !data) {
        const err: any = new Error(
            data?.error?.message ||
            data?.message ||
            `Cloudinary API error (${response.status})`
        );

        err.status = response.status;
        err.details = data?.error;
        throw err;
    }

    const asset = data?.data?.assets?.[0] || data?.data?.result?.assets?.[0];

    const rawUrl =
        asset?.storage?.secure_url ||
        asset?.secure_url ||
        data?.secure_url;

    if (!rawUrl) {
        throw new Error("No image URL returned from Cloudinary generation");
    }
    //5.generate result
    return {
        secureUrl: optimizeDeliveryUrl(rawUrl),
        publicId: asset?.storage?.public_id || targetPublicId,
        model:
            typeof asset?.model === "string"
                ? asset.model
                : asset?.model?.id ||
                  [asset?.model?.family, asset?.model?.tier].filter(Boolean).join(":") ||
                  undefined,
        limits: data?.limits,
    };
};




// ? 后面：条件为 true 时返回的值。
// : 后面：条件为 false 时返回的值。
// Controller endpoint for on-model catalog photography / virtual try-on use our products
export const onModelCatalog = async (req: Request, res: Response): Promise<void> => {
    try {
        const {productImageUrl, modelImageUrl,garmentType,pose,background
            ,customPrompt,preference,targetPublicId} = req.body ?? {};
        if(!productImageUrl){
            res.status(400).json({ success: false, message: "productImageUrl is required" });
            return;
        }
        const defaultModel = "https://images.unsplash.com/photo-1728476028122-b3992eca9164?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D";

        const [modelUrl, productUrl] = await Promise.all([
            ensureCloudinaryUrl(modelImageUrl || defaultModel, "shoppingo/models"),
            ensureCloudinaryUrl(productImageUrl, "shoppingo/products")
        ]);

        const prompt = customPrompt?.trim()
            //用户输入完整的prompt[1]&&[2]
            ? customPrompt.includes("[1]") && customPrompt.includes("[2]")
                ? customPrompt.trim()
                /// 用户只写了额外要求，自动补充试衣指令
                : `Dress person in [1] in garment from [2], ${customPrompt.trim()}, photorealistic.`
             // 用户没有提供 customPrompt，使用默认指令
            : `Dress person in [1] in garment from [2], photorealistic.`;
        
            const result = await generateOnModelImage({
                prompt,
                modelImageUrl:modelUrl,
                productImageUrl: productUrl,
                targetPublicId,
                preference,
            })

            res.json({
                success: true,
                url: result.secureUrl,
                publicId: result.publicId,
                model: result.model,
                prompt,
                modelUrl,
                productUrl,
                limits: result.limits

            })
    } catch (error:any) {
        console.log(error?.message)
        res.status(500).json({
            success: false,
            message: "Failed to generate on-model catalog photo",
    })

    }
};


















// AI Transform 流程:
// 前端传入 imageUrl
//         ↓
// 通过 cloudName 检查 URL
//         ↓
// 图片是否属于自己的 Cloudinary？
//         ↓
//    ┌────┴────┐
//    ↓         ↓
//   是         否
//    ↓         ↓
// 直接使用    先上传到自己的 Cloudinary
//    ↓         ↓
//    └────┬────┘
//         ↓
// 获得 baseCloudinaryUrl
//         ↓
//    applyCloudinaryTransform()
//          ↓
//       生成新的 URL
//           ↓
//    res.json() 返回给前端