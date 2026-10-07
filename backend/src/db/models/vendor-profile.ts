import mongoose, { Schema, Document, Model, Types } from "mongoose";

/* ─── Interfaces ────────────────────────────────────────────────────── */

export interface IPastContract {
  description: string;
  value: number;
  year: number;
  agencyName?: string;
}

export interface ICredential {
  name: string;
  issuedBy?: string;
  expiresAt?: Date;
}

export interface IPersonnel {
  /** e.g. "Project Manager", "System Analyst". */
  role: string;
  count: number;
  /** Certifications held by people in this role, e.g. ["PMP"]. */
  certifications: string[];
}

export interface IVendorProfile extends Document {
  userId: Types.ObjectId;
  companyName: string;
  /** @deprecated Goes stale every year — prefer foundedYear. Kept because the
   *  profile form and matcher still use it. */
  companyAge: number;
  /** Gregorian year of incorporation; the age is derived from it at match time. */
  foundedYear?: number;
  /** ทุนจดทะเบียน in THB — the most common hard qualification in BMA TORs. */
  registeredCapital?: number;
  pastContracts: IPastContract[];
  maxContractValue: number;
  techStacks: string[];
  interestedCategories?: string[];
  credentials: ICredential[];
  teamSize?: number;
  /** Key staff by role — TORs often require e.g. "PM ≥ 1 คน มี PMP". */
  personnel: IPersonnel[];
  createdAt: Date;
  updatedAt: Date;
}

/* ─── Schema ────────────────────────────────────────────────────────── */

const PastContractSchema = new Schema<IPastContract>(
  {
    description: { type: String, required: true },
    value: { type: Number, required: true, min: 0 },
    year: { type: Number, required: true },
    agencyName: { type: String },
  },
  { _id: false },
);

const CredentialSchema = new Schema<ICredential>(
  {
    name: { type: String, required: true },
    issuedBy: { type: String },
    expiresAt: { type: Date },
  },
  { _id: false },
);

const PersonnelSchema = new Schema<IPersonnel>(
  {
    role: { type: String, required: true },
    count: { type: Number, required: true, min: 0 },
    certifications: { type: [String], default: [] },
  },
  { _id: false },
);

const VendorProfileSchema = new Schema<IVendorProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    companyName: { type: String, required: true },
    companyAge: { type: Number, required: true, min: 0 },
    foundedYear: { type: Number, min: 1900, max: 2100 },
    registeredCapital: { type: Number, min: 0 },
    pastContracts: { type: [PastContractSchema], default: [] },
    maxContractValue: { type: Number, default: 0 },
    techStacks: { type: [String], default: [] },
    interestedCategories: { type: [String], default: [] },
    credentials: { type: [CredentialSchema], default: [] },
    teamSize: { type: Number, min: 1 },
    personnel: { type: [PersonnelSchema], default: [] },
  },
  { timestamps: true },
);

// Pre-save hook to compute maxContractValue
VendorProfileSchema.pre("save", function () {
  if (this.pastContracts && this.pastContracts.length > 0) {
    this.maxContractValue = Math.max(...this.pastContracts.map((c) => c.value));
  } else {
    this.maxContractValue = 0;
  }
});

/* ─── Model ─────────────────────────────────────────────────────────── */

const VendorProfile: Model<IVendorProfile> =
  mongoose.models.VendorProfile ||
  mongoose.model<IVendorProfile>("VendorProfile", VendorProfileSchema);

export default VendorProfile;
