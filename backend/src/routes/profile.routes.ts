import { Router, Request, Response } from "express";
import { connectDB } from "../db/connection.js";
import VendorProfile from "../db/models/vendor-profile.js";
import { apiSuccess, Errors } from "../utils/api-response.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

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
router.post("/", async (req: Request, res: Response) => {
  await connectDB();

  const existing = await VendorProfile.findOne({ userId: req.user!.id });
  if (existing) {
    Errors.conflict(res, "Vendor profile already exists");
    return;
  }

  try {
    const profile = await VendorProfile.create({ ...req.body, userId: req.user!.id });
    apiSuccess(res, profile, undefined, 201);
  } catch (error) {
    console.error("Profile creation error:", error);
    Errors.badRequest(res, "Invalid profile data");
  }
});

/** PUT /api/profile — Update vendor profile. */
router.put("/", async (req: Request, res: Response) => {
  await connectDB();

  try {
    const profile = await VendorProfile.findOne({ userId: req.user!.id });

    if (!profile) {
      Errors.notFound(res, "No vendor profile found");
      return;
    }

    // Owner and identity fields are never client-writable. Loading and
    // saving (rather than findOneAndUpdate) runs the pre-save hook that
    // recomputes maxContractValue — the matcher depends on it.
    const { userId: _userId, _id, createdAt, updatedAt, maxContractValue, ...changes } = req.body ?? {};
    profile.set(changes);
    await profile.save();

    apiSuccess(res, profile);
  } catch (error) {
    console.error("Profile update error:", error);
    Errors.badRequest(res, "Invalid profile data");
  }
});

export default router;
