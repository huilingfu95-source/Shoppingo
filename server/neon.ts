import { defineConfig } from "@neon/config/v1";

export default defineConfig({
    auth: true, // Express middleware/auth.ts needs NEON_AUTH_BASE_URL / NEON_AUTH_JWKS_URL
    functions: {
        // slug "publicapi": permanent id used in the URL and CLI (lowercase letters/digits only, no hyphens)
        publicapi: {
            name: "Public API", // display label only
            source: "./functions/index.ts", // entry file, relative to this neon.ts
            dev: {
                port: 8787, // `neon dev` serves this function at http://localhost:8787
            },
        },
    },
    // Branch policy: same as the root neon.ts
    branch: (branch) => {
        if (branch.isDefault) return {};
        if (!branch.exists) return { ttl: "7d" };
        return {};
    },
});
