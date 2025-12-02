import { Schema, model, models } from "mongoose";
const MessageSchema = new Schema(
  {
    conversation_id: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    sender_uid: {
      type: String,
      required: true,
    },
    recipient_uid: {
      type: String,
      required: true,
    },

    text: {
      type: String,
      required: true,
      trim: true,
    },
    readAt: {
      type: Date,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false, 
    },
  }
);

const Message = models.Message || model("Message", MessageSchema);

export default Message;
