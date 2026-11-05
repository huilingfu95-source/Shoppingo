import  { v2 as cloudinary } from "cloudinary";
//Software Development Kit：sdk,某个服务或平台官方提供的工具包，用来访问它家的服务
//sdk是general的，需要自己配置才完整
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
})

export default { cloudinary };