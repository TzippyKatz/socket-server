import mongoose, { Schema, model } from "mongoose";

export interface IUser extends Document {
  firebase_uid: string;
  name: string;
  email: string;
  username: string;
  profil_url?: string;
  bio?: string;
  location?: string;
  role: string;
  followers_count: number;
  following_count: number;
  created_at: Date;
}

const UserSchema = new Schema<IUser>(
  {
    firebase_uid: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    profil_url: {
      type: String,
    },
    bio: {
      type: String,
    },
    location: {
      type: String,
    },
    role: {
      type: String,
      default: "artist",
    },
    followers_count: {
      type: Number,
      default: 0,
    },
    following_count: {
      type: Number,
      default: 0,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

export default mongoose.models.User || model("User", UserSchema);