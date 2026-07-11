import { Router, type IRouter } from "express";
import { execSync } from "node:child_process";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/version", (_req, res) => {
  let commit = "unknown";

  try {
    commit = execSync("git rev-parse --short HEAD")
      .toString()
      .trim();
  } catch {}

  res.json({
    status: "ok",
    commit,
    builtAt: new Date().toISOString(),
    node: process.version,
    environment: process.env.NODE_ENV ?? "unknown",
  });
});

export default router;