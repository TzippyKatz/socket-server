import dotenv from "dotenv";
dotenv.config({ path: ".env" }); 

import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI!;
// console.log("process.env.MONGODB_URI:", process.env.MONGODB_URI);
if (!MONGODB_URI) throw new Error("Missing MONGODB_URI");

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}


let cached: MongooseCache = global.mongoose ?? { conn: null, promise: null };

global.mongoose = cached;

export async function dbConnect() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
