import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import type { Request, Response } from "express";

type RequestWithLog = Request & {
  log?: {
    warn: (obj: Record<string, unknown>, msg?: string) => void;
  };
};

interface AuthRateLimitOptions {
  route: string;
  windowMs: number;
  limit: number;
  message: string;
  skipSuccessfulRequests?: boolean;
}

function createAuthRateLimiter(options: AuthRateLimitOptions): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
    handler: (req: Request, res: Response, _next, handlerOptions) => {
      const log = (req as RequestWithLog).log;
      log?.warn(
        { event: "rate_limit_exceeded", route: options.route, ip: req.ip },
        "Rate limit exceeded",
      );
      res.status(handlerOptions.statusCode).json({ error: options.message });
    },
  });
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

export const loginLimiter = createAuthRateLimiter({
  route: "POST /api/auth/login",
  windowMs: FIFTEEN_MINUTES,
  limit: 5,
  skipSuccessfulRequests: true,
  message: "Слишком много попыток входа. Попробуйте снова через 15 минут.",
});

export const registerLimiter = createAuthRateLimiter({
  route: "POST /api/auth/register",
  windowMs: ONE_HOUR,
  limit: 5,
  message: "Слишком много попыток регистрации. Попробуйте позже.",
});

export const forgotPasswordLimiter = createAuthRateLimiter({
  route: "POST /api/auth/forgot-password",
  windowMs: ONE_HOUR,
  limit: 3,
  message: "Слишком много запросов на восстановление пароля. Попробуйте позже.",
});

export const resetPasswordLimiter = createAuthRateLimiter({
  route: "POST /api/auth/reset-password",
  windowMs: ONE_HOUR,
  limit: 10,
  message: "Слишком много попыток смены пароля. Попробуйте позже.",
});

export const changePasswordLimiter = createAuthRateLimiter({
  route: "PATCH /api/auth/password",
  windowMs: ONE_HOUR,
  limit: 10,
  message: "Слишком много попыток смены пароля. Попробуйте позже.",
});
