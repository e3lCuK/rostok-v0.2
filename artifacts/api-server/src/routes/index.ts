import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gameRouter from "./game";
import gameV2CareRouter from "./game-v2-care";
import gameV2RootsRouter from "./game-v2-roots";
import gameV2ExcessRouter from "./game-v2-excess";
import gameV3RootsRouter from "./game-v3-roots";
import gameV3CareRouter from "./game-v3-care";
import gameV3TutorialRouter from "./game-v3-tutorial";
import authRouter from "./auth";
import { areDebugRoutesEnabled } from "./debug-enabled";
import { registerDebugSessionsRoute } from "./debug-sessions";
import { registerDebugResourcesRoutes } from "./debug-resources";
import { registerDebugStreakRoute } from "./debug-streak";
import { registerDebugResetRoutes } from "./debug-reset";
import { registerDebugResetProgressRoute } from "./debug-reset-progress";
import { registerDebugDeleteAccountRoute } from "./debug-delete-account";
import { registerDebugEconomyV2PreviewRoute } from "./debug-economy-v2-preview";
import { registerDebugEconomyV2EnergyRoute } from "./debug-economy-v2-energy";
import { registerDebugEconomyV2RootsRoute } from "./debug-economy-v2-roots";
import { registerDebugEconomyV2ExcessRoute } from "./debug-economy-v2-excess";
import { registerDebugEconomyV3RootsRoute } from "./debug-economy-v3-roots";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(gameRouter);
router.use(gameV2CareRouter);
router.use(gameV2RootsRouter);
router.use(gameV2ExcessRouter);
router.use(gameV3RootsRouter);
router.use(gameV3CareRouter);
router.use(gameV3TutorialRouter);

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
  registerDebugEconomyV2EnergyRoute(router);
  registerDebugEconomyV2RootsRoute(router);
  registerDebugEconomyV2ExcessRoute(router);
  registerDebugEconomyV3RootsRoute(router);
}

export default router;
