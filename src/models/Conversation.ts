import mongoose, { Schema, model } from "mongoose";

const ConversationSchema = new Schema(
  {
    participants: {
      type: [String],
      required: true,
      validate: {
        validator: (arr: string[]) => arr.length === 2,
        message: "Conversation must have exactly 2 participants",
      },
    },
    lastMessageText: {
      type: String,
    },
    lastMessageAt: {
      type: Date,
    },
  },
  {
    timestamps: true, 
  }
);

export default mongoose.models.Conversation || model("Conversation", ConversationSchema);
