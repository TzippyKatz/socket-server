import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });


import { createServer } from "http";
import { Server } from "socket.io";

import { dbConnect } from "../../src/lib/mongoose";
import ConversationModel from "../models/Conversation";
import MessageModel from "../models/Message";
import UserModel from "../models/User";
const Conversation: any = ConversationModel;
const Message: any = MessageModel;
const User: any = UserModel;

const PORT = Number(process.env.SOCKET_PORT || 4000);

async function start() {
  await dbConnect();
  console.log("Mongo connected (socket server)");

  const httpServer = createServer();

  const io = new Server(httpServer, {
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);
    socket.on(
      "joinConversation",
      (payload: { conversationId: string; userUid: string }) => {
        const { conversationId } = payload;
        socket.join(conversationId);
        console.log("Socket joined room", conversationId);
      }
    );
    socket.on(
      "startConversation",
      async (
        payload: { currentUserUid: string; otherUserUid: string },
        callback?: (data: any) => void
      ) => {
        try {
          const { currentUserUid, otherUserUid } = payload;

          if (!currentUserUid || !otherUserUid) {
            callback?.({
              ok: false,
              error: "currentUserUid and otherUserUid are required",
            });
            return;
          }

          const participants = [currentUserUid, otherUserUid].sort();

          let conversation = await Conversation.findOne({
            participants,
          }).lean();

          if (!conversation) {
            const created = await Conversation.create({
              participants,
              lastMessageText: "",
              lastMessageAt: null,
            });
            conversation = created.toObject();
          }

          const otherUser = await User.findOne({
            firebase_uid: otherUserUid,
          }).lean();

          const data = {
            ok: true,
            conversation: {
              _id: conversation._id,
              participants: conversation.participants,
              lastMessageText: conversation.lastMessageText,
              lastMessageAt: conversation.lastMessageAt,
            },
            otherUser: otherUser
              ? {
                  firebase_uid: otherUser.firebase_uid,
                  username: otherUser.username,
                  name: otherUser.name,
                  profil_url: otherUser.profil_url,
                }
              : null,
          };

          callback?.(data);
        } catch (err) {
          console.error("startConversation error:", err);
          callback?.({ ok: false, error: "Failed to start conversation" });
        }
      }
    );
    socket.on(
      "getConversations",
      async (
        payload: { userUid: string },
        callback?: (data: any) => void
      ) => {
        try {
          const { userUid } = payload;
          if (!userUid) {
            callback?.({ ok: false, error: "userUid is required" });
            return;
          }

          const conversations = await Conversation.find({
            participants: userUid,
          })
            .sort({ lastMessageAt: -1, updatedAt: -1 })
            .lean();

          const otherUids = Array.from(
            new Set(
              conversations
                .map((c: any) =>
                  (c.participants as string[]).find((p) => p !== userUid)
                )
                .filter((x): x is string => !!x)
            )
          );

          const otherUsers = await User.find({
            firebase_uid: { $in: otherUids },
          }).lean();

          const otherUsersByUid = new Map(
            otherUsers.map((u: any) => [u.firebase_uid, u])
          );

          const result = conversations.map((c: any) => {
            const otherUid = (c.participants as string[]).find(
              (p) => p !== userUid
            );
            const otherUser: any = otherUid
              ? otherUsersByUid.get(otherUid)
              : null;

            return {
              _id: c._id,
              participants: c.participants,
              lastMessageText: c.lastMessageText,
              lastMessageAt: c.lastMessageAt,
              otherUser: otherUser
                ? {
                    firebase_uid: otherUser.firebase_uid,
                    username: otherUser.username,
                    name: otherUser.name,
                    profil_url: otherUser.profil_url,
                  }
                : null,
            };
          });

          callback?.({ ok: true, conversations: result });
        } catch (err) {
          console.error("getConversations error:", err);
          callback?.({ ok: false, error: "Failed to load conversations" });
        }
      }
    );
    socket.on(
      "getMessages",
      async (
        payload: { conversationId: string },
        callback?: (data: any) => void
      ) => {
        try {
          const { conversationId } = payload;
          if (!conversationId) {
            callback?.({ ok: false, error: "conversationId is required" });
            return;
          }

          const messages = await Message.find({
            conversation_id: conversationId,
          })
            .sort({ createdAt: 1 })
            .lean();

          callback?.({ ok: true, messages });
        } catch (err) {
          console.error("getMessages error:", err);
          callback?.({ ok: false, error: "Failed to load messages" });
        }
      }
    );
    socket.on(
      "sendMessage",
      async (
        payload: { conversationId: string; senderUid: string; text: string },
        callback?: (data: any) => void
      ) => {
        try {
          const { conversationId, senderUid, text } = payload;

          if (!conversationId || !senderUid || !text) {
            callback?.({
              ok: false,
              error: "conversationId, senderUid and text are required",
            });
            return;
          }

          const conversation = await Conversation.findById(
            conversationId
          ).lean();

          if (!conversation) {
            callback?.({ ok: false, error: "Conversation not found" });
            return;
          }

          const participants = conversation.participants as string[];
          const recipientUid = participants.find((p) => p !== senderUid);

          if (!recipientUid) {
            callback?.({
              ok: false,
              error: "senderUid must be one of the participants",
            });
            return;
          }

          const newMessage = await Message.create({
            conversation_id: conversationId,
            sender_uid: senderUid,
            recipient_uid: recipientUid,
            text,
          });

          await Conversation.findByIdAndUpdate(conversationId, {
            lastMessageText: text,
            lastMessageAt: new Date(),
          });

          const messageData = {
            _id: newMessage._id,
            conversation_id: newMessage.conversation_id,
            sender_uid: newMessage.sender_uid,
            recipient_uid: newMessage.recipient_uid,
            text: newMessage.text,
            createdAt: newMessage.createdAt,
          };
          io.to(conversationId).emit("message", {
            conversationId,
            message: messageData,
          });

          callback?.({ ok: true, message: messageData });
        } catch (err) {
          console.error("sendMessage error:", err);
          callback?.({ ok: false, error: "Failed to send message" });
        }
      }
    );

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });

  httpServer.listen(PORT, () => {
    console.log(`Socket.io server listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Socket server failed to start:", err);
  process.exit(1);
});
