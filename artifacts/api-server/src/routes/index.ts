import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gameRouter from "./game";
import authRouter from "./auth";
import { areDebugRoutesEnabled } from "./debug-enabled";
import { registerDebugSessionsRoute } from "./debug-sessions";
import { registerDebugResourcesRoutes } from "./debug-resources";
import { registerDebugStreakRoute } from "./debug-streak";
import { registerDebugResetRoutes } from "./debug-reset";
import { registerDebugResetProgressRoute } from "./debug-reset-progress";
import { registerDebugDeleteAccountRoute } from "./debug-delete-account";
import { registerDebugEconomyV2PreviewRoute } from "./debug-economy-v2-preview";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(gameRouter);

if (areDebugRoutesEnabled()) {
  router.use((req: any, _res, next) => {
    const url = String(req.originalUrl ?? req.url ?? "");
    if (url.includes("/game/debug") || url.includes("/game/reset-progress")) {
      req.log?.info(
        {
          method: req.method,
          url,
          body: req.body,
          userId: req.session?.userId ?? req.userId,
        },
        "debug route request",
      );
    }
    next();
  });

  registerDebugSessionsRoute(router);
  registerDebugResourcesRoutes(router);
  registerDebugStreakRoute(router);
  registerDebugResetRoutes(router);
  registerDebugResetProgressRoute(router);
  registerDebugDeleteAccountRoute(router);
  registerDebugEconomyV2PreviewRoute(router);
}

export default router;
