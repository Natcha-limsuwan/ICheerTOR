import { Router, Request, Response } from "express";
import { connectDB } from "../db/connection.js";
import VendorProfile from "../db/models/vendor-profile.js";
import { apiSuccess, Errors } from "../utils/api-response.js";
import { authenticate, requireScope } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { profileCreateBody, profileUpdateBody } from "../validation/schemas.js";

const router = Router();
router.use(authenticate, requireScope("profile:own"));

/*
 * The profile is always looked up by the session's userId, so there is no
 * profile id a client could change to reach another company's data (T07).
 * Bodies pass through an allowlist schema: userId, _id, timestamps and the
 * server-derived maxContractValue can never be written (T10).
 */

/** GET /api/profile — Get current user's vendor profile. */
router.get("/", async (req: Request, res: Response) => {
  await connectDB();
  const profile = await VendorProfile.findOne({ userId: req.user!.id }).lean();
  if (!profile) {
    Errors.notFound(res, "No vendor profile found");
    return;
  }
  apiSuccess(res, profile);
});

/** POST /api/profile — Create vendor profile. */
router.post("/", validate({ body: profileCreateBody }), async (req: Request, res: Response) => {
  await connectDB();

  const existing = await VendorProfile.exists({ userId: req.user!.id });
  if (existing) {
    Errors.conflict(res, "Vendor profile already exists");
    return;
  }

  try {
    // Owner comes from the session and is applied last, after the allowlisted fields.
    const profile = await VendorProfile.create({ ...req.body, userId: req.user!.id });
    apiSuccess(res, profile, undefined, 201);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      Errors.conflict(res, "Vendor profile already exists");
      return;
    }
    console.error("Profile creation error:", (error as Error).message);
    Errors.badRequest(res, "Invalid profile data");
  }
});

/** PUT /api/profile — Update vendor profile. */
router.put("/", validate({ body: profileUpdateBody }), async (req: Request, res: Response) => {
  await connectDB();

  try {
    const profile = await VendorProfile.findOne({ userId: req.user!.id });

    if (!profile) {
      Errors.notFound(res, "No vendor profile found");
      return;
    }

    // Loading and saving (rather than findOneAndUpdate) runs the pre-save hook
    // that recomputes maxContractValue — the matcher depends on it.
    profile.set(req.body);
    await profile.save();

    apiSuccess(res, profile);
  } catch (error) {
    console.error("Profile update error:", (error as Error).message);
    Errors.badRequest(res, "Invalid profile data");
  }
});

export default router;
