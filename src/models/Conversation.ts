import { Schema, model, models } from "mongoose";

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
    unreadByUser: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const Conversation =
  models.Conversation || model("Conversation", ConversationSchema);

export default Conversation;
