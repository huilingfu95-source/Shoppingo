import { Request, Response, NextFunction } from "express";

// simple fixed-window rate limiter keyed by client IP, kept in memory.
// fine for a single server process; use a shared store (e.g. Redis) when running multiple instances.
// behind a reverse proxy, set app.set("trust proxy", 1) so req.ip is the real client IP.
export const rateLimit = ({ windowMs, max, message }: { windowMs: number; max: number; message: string }) => {
    const hits = new Map<string, { count: number; resetAt: number }>();

    // drop expired windows so the map doesn't grow forever
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
    }, windowMs).unref();

    return (req: Request, res: Response, next: NextFunction): void => {
        const now = Date.now();
        const key = req.ip ?? "unknown";
        let entry = hits.get(key);
        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs };
            hits.set(key, entry);
        }
        entry.count++;
        if (entry.count > max) {
            res.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
            res.status(429).json({ success: false, message });
            return;
        }
        next();
    };
};
