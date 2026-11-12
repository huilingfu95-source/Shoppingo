
//JSON.stringify() 只负责转换数据(javascript->json)
//new Response()：创建一个可以返回给前端的 HTTP 响应，define a function,not run the function
//fetch()：可以同时实现 Router + Controller 的功能
//JavaScript 是语言 → Node.js 是运行环境（like python hello.py） → Express 是backend框架 → Next.js 是全栈框架。
//function json(data: unknown, status = 200) {
//     return new Response(JSON.stringify(data), {
//         status
//     });
// }
import { neon } from "@neondatabase/serverless"
const json = (data: unknown, status = 200)=> new Response(JSON.stringify(data), {
    status,
    //http request or response's metadata
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }
})
//这个函数返回一个 Promise，而这个 Promise 成功完成后会得到一个 Response 对象
//fetch()：Cloudflare Worker 接收 HTTP Request 的入口。
//fetch 里的 if 判断 method 和路径，满足某条路由，
// 就执行对应的逻辑去查数据库，然后把结果 return 回去，之前用的prisma查database
export default {
    async fetch(request: Request, env?: {DATABASE_URL?: string})
    :Promise<Response>{
        const {method,url} = request;
        //（Cross-Origin Request）就是：前端网页向不同来源（Origin）的服务器发送请求。‘
        //通常用OPTIONS preexamine
        if (method === "OPTIONS"){
            return new Response(null, {status:204, headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, Authorization",

            }})
        }

        if(method !== "GET" && method !== "HEAD"){
            return json({ success:false, message:"Method not allowed"},405)

        }
        const databaseUrl = env?.DATABASE_URL || process.env.DATABASE_URL;
        if (!databaseUrl){
            return json({ success:false, message:"DATABASE_URL is not configured"},500)
        }
        //neon(databaseUrl) 产生的这个函数，可以直接对你的 Neon PostgreSQL 数据库执行任何 SQL
        //第一条：Worker → Neon
        const sql = neon(databaseUrl);
        //第二条：前端 → Worker
        const { pathname, searchParams } = new URL(url);

        const path = pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";

        try {
            // Health check
            if (path === "/" || path === "/health"){
                return json({success: true, service: " Neon Public API",
                timeStamp: new Date().toISOString() });
            }
           //Featured stores
            if (path === "/stores/public/featured" || path === "/stores/featured") {
                const stores = await sql`
                    SELECT id, name, slug, logo_url, banner_url, description, currency,
                        created_at
                    FROM stores
                    WHERE status = 'active'
                    ORDER BY created_at DESC
                    LIMIT 12`;

                return json({ success: true, stores });
            }
            //storeSlugMatch 是用来匹配某一家特定商店的 URL 的
            //store by slug
            const storeSlugMatch = path.match(/^\/stores\/slug\/([^/]+)$/);
            
            if (storeSlugMatch) {
                const slug = decodeURIComponent(storeSlugMatch[1]);

                const [store] = await sql`
                    SELECT id, merchant_id, name, slug, logo_url, banner_url, description,
                        currency, status, shipping_fee, free_shipping_threshold,
                        hero_style, accent_color, created_at
                    FROM stores
                    WHERE slug = ${slug}
                    LIMIT 1`;

                if (!store) return json({ success: false, message: "Store not found" }, 404);

                if (store.status === "suspended") {
                    return json({
                        success: false,
                        message: "This store is currently suspended by platform administration."
                    },403);
                }
                return json({success:true,store})
            }

            //Product by Id
            // 从 products 表找到 ID 为 101 的商品。
            // 通过 LEFT JOIN 获取商品的分类信息。
            // 再通过 LEFT JOIN 获取商品所属商店的信息。
            // 返回这一件商品的详细信息。
            const productMatch = path.match(/^\/products\/(\d+)$/);
            if(productMatch){
                const productId = Number(productMatch[1]);
                
            const [product] = await sql`
                SELECT p.id, p.store_id, p.category_id, p.name, p.description, p.price, p.compare_at_price,
                    p.sku, p.stock, p.images, p.variants, p.status, p.created_at,
                    c.name AS category_name, c.slug AS category_slug,
                    s.name AS store_name, s.slug AS store_slug, s.status AS store_status
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.id
                LEFT JOIN stores s ON p.store_id = s.id
                WHERE p.id = ${productId}
                LIMIT 1
            `
            if(!product) return json({ success: false, message:"Product not found"},404)
                return json({success:true,product})
            }

            //product list
            //GET /products?storeSlug=nike&categoryId=5&status=active&search=shoes
            //Product List 是让用户浏览和搜索商品的；Product by ID 是让用户点击某个商品后查看详情的。

        if (path === "/products") {
            const storeSlug = searchParams.get("storeSlug");
            const storeIdParam = searchParams.get("storeId");
            const categoryIdParam = searchParams.get("categoryId");
            const status = searchParams.get("status") || null;
            const search = searchParams.get("search")?.trim() || null;

            let targetStoreId = storeIdParam ? Number(storeIdParam) : null;

            if (storeSlug) {
                const [store] = await sql`
                    SELECT id FROM stores
                    WHERE slug = ${storeSlug}
                    LIMIT 1
                `;

                if (!store) {
                    return json({
                        success: false,
                        message: "Store not found"
                    }, 404);
                }

                targetStoreId = Number(store.id);
            }

            if (!targetStoreId) {
                return json({
                    success: false,
                    message: "storeId or storeSlug is required"
                }, 400);
            }

            const categoryId = categoryIdParam ? Number(categoryIdParam) : null;

            const products = await sql`
                SELECT p.id, p.store_id, p.category_id, p.name, p.description,
                    p.price, p.compare_at_price, p.sku, p.stock, p.images,
                    p.variants, p.status, p.created_at,
                    c.name AS category_name, c.slug AS category_slug
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.id
                WHERE p.store_id = ${targetStoreId}
                AND (${status}::text IS NULL OR p.status = ${status})
                AND (${categoryId}::int IS NULL OR p.category_id = ${categoryId})
                AND (${search}::text IS NULL OR (              
                    p.name ILIKE '%' || ${search} || '%'
                    OR p.description ILIKE '%' || ${search} || '%'
                    OR p.sku ILIKE '%' || ${search} || '%'
                ))
                ORDER BY p.created_at DESC
            `;

            return json({ success: true, products });
            }

            return json({
                success: false,
                message: "Route not found in Neon Public API"
            }, 404);

            } catch (error: any) {
                console.error("Neon Public API error:", error);
                return json({
                    success: false,
                    message: "Internal server error"
                }, 500);
            }
        }
    }





//你目前写的是 Neon Public API，主要负责公开读取数据，不是写所有的controller
//request:the request send from fontend to backend
// Routes	判断请求应该交给哪个函数处理	router.get()
// Controller	执行具体的业务逻辑	getProducts()
// Response	后端返回给前端的结果	

// 之前（Express）：
// 请求 → Express Router → Controller → 数据库查询 → 数据库
//        app.get("/orders/:id", getOrder)

// 现在（Cloudflare Worker）：
// 请求 → fetch 里的 if 判断 → Controller → sql`...` → Neon 数据库
