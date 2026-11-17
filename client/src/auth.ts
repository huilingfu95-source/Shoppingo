import { createAuthClient } from "@neondatabase/neon-js/auth";

export const authClient = createAuthClient(import.meta.env.VITE_NEON_AUTH_URL!);


// 意思就是告诉 SDK："我的 Neon Auth 地址是这个，帮我生成一个能登录的工具。"之后在别的文件里调 authClient.signIn...、authClient.signUp... 就行。

// 放在单独的 auth.ts 里，是为了整个 app 共用同一个实例，不用每个页面各建一个。

// client 本来就要跟好几个"服务"打交道，每个服务各配一个连接工具：
// 要连的服务	      连接工具	                              放在哪
// Express backend	axios.create(...) 建的 api	            config/api.ts
// Neon Functions	也是 HTTP 请求，只是地址不同	           config/api.ts
// Neon Auth	    createAuthClient(...) 建的authClient	auth.ts
// 做法都一样：先建一个配好地址的实例，export 出去，别的文件 import 来用。

// 有两点不同：

// Express 和 Neon Functions 是你自己写的代码，Neon Auth 是现成的托管服务。所以前面两个用通用的 axios 就能连，Neon Auth 则直接用官方 SDK，省得自己研究它的 API 格式。

// 它们有先后顺序：先用 authClient 登录拿到 JWT，再由 api 带着这个 JWT 去调 Express。Express 验证通过后才返回数据。所以 auth client 是"拿通行证"的那一步，后面的请求都靠这张通行证。