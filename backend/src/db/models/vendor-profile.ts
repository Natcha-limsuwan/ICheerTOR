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

export interface IVendorProfile extends Document {
  userId: Types.ObjectId;
  companyName: string;
  companyAge: number;
  pastContracts: IPastContract[];
  maxContractValue: number;
  techStacks: string[];
  credentials: ICredential[];
  teamSize?: number;
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
    pastContracts: { type: [PastContractSchema], default: [] },
    maxContractValue: { type: Number, default: 0 },
    techStacks: { type: [String], default: [] },
    credentials: { type: [CredentialSchema], default: [] },
    teamSize: { type: Number, min: 1 },
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
