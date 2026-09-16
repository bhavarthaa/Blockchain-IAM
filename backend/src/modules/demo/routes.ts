import { Router, Request, Response, NextFunction } from "express";
import { config } from "../../config/env.js";
import { ApiError } from "../../http/errors.js";

const DEMO_RESET_SECRET = process.env.DEMO_RESET_SECRET ?? "demo-reset-secret-change-in-production";

console.log("🔍 Demo routes loading, DEMO_MODE:", config.DEMO_MODE);

export const demoRouter = Router();

if (config.DEMO_MODE) {
  console.log("✅ Demo routes enabled");

  const checkAuth = (auth: string | undefined): boolean => {
    return auth === `Bearer ${DEMO_RESET_SECRET}`;
  };

  demoRouter.post("/reset", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.headers.authorization;
      if (!checkAuth(auth)) {
        throw ApiError.unauthorized("Invalid demo reset token");
      }

      res.json({ success: true, message: "Demo database reset (mock)" });
    } catch (error) {
      next(error);
    }
  });

  demoRouter.post("/seed", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.headers.authorization;
      if (!checkAuth(auth)) {
        throw ApiError.unauthorized("Invalid demo seed token");
      }

      res.json({
        success: true,
        message: "Demo database seeded (mock)",
        data: {
          identities: 4,
          assets: 1,
          roleAssignments: 4,
          auditRecords: 2,
          verifications: 1,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  demoRouter.get("/status", async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({
        demoMode: true,
        mockData: true,
        counts: {
          identities: 4,
          assets: 1,
          roleAssignments: 4,
          auditRecords: 2,
          verifications: 1,
        },
      });
    } catch (error) {
      next(error);
    }
  });
}

console.log("✅ Demo routes setup complete");