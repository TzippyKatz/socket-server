import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { dbConnect } from "../../src/lib/mongoose";
import Conversation from "../../src/models/Conversation";
import Message from "../../src/models/Message";
import User from "../../src/models/User";

const ConversationModel = Conversation as any;
const MessageModel = Message as any;
const UserModel = User as any;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

function getUnreadForUser(unreadByUser: any, uid: string): number {
  if (!unreadByUser) return 0;

  if (typeof unreadByUser.get === "function") {
    return Number(unreadByUser.get(uid) ?? 0);
  }

  return Number((unreadByUser as Record<string, number>)[uid] ?? 0);
}

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);
  socket.on(
    "startConversation",
    async (
      payload: { currentUserUid?: string; otherUserUid?: string },
      callback?: (res: { ok: boolean; conversation?: any; error?: string }) => void
    ) => {
      try {
        const { currentUserUid, otherUserUid } = payload || {};

        if (!currentUserUid || !otherUserUid) {
          callback?.({
            ok: false,
            error: "currentUserUid and otherUserUid are required",
          });
          return;
        }

        await dbConnect();

        const participants = [currentUserUid, otherUserUid].sort();
        let conversation = await ConversationModel.findOne({
          participants: { $all: participants, $size: 2 },
        } as any).lean();

        if (!conversation) {
          const created = await ConversationModel.create({
            participants,
            lastMessageText: "",
            lastMessageAt: null,
            unreadByUser: {},
          } as any);
          conversation = created.toObject();
        }

        callback?.({ ok: true, conversation });
      } catch (err) {
        console.error("startConversation error:", err);
        callback?.({
          ok: false,
          error: "Failed to start conversation",
        });
      }
    }
  );
  socket.on(
    "getConversations",
    async (
      payload: { userUid?: string },
      callback?: (res: {
        ok: boolean;
        conversations?: any[];
        error?: string;
      }) => void
    ) => {
      try {
        const { userUid } = payload || {};
        if (!userUid) {
          callback?.({ ok: false, error: "userUid is required" });
          return;
        }

        await dbConnect();

        const conversations = await ConversationModel.find({
          participants: userUid,
        } as any)
          .sort({ lastMessageAt: -1, updatedAt: -1 })
          .lean();

        const enriched = await Promise.all(
          conversations.map(async (conv: any) => {
            const participants: string[] = conv.participants || [];
            const otherUid =
              participants.find((p) => p !== userUid) || userUid;

            const otherUserDoc = await UserModel.findOne({
              firebase_uid: otherUid,
            }).lean();

            const unread = getUnreadForUser(conv.unreadByUser, userUid);

            return {
              _id: conv._id.toString(),
              lastMessageText: conv.lastMessageText || "",
              lastMessageAt: conv.lastMessageAt || conv.updatedAt || null,
              unread_count: unread,
              unreadByUser: conv.unreadByUser || {},
              otherUser: otherUserDoc
                ? {
                  firebase_uid: otherUserDoc.firebase_uid,
                  username: otherUserDoc.username,
                  name: otherUserDoc.name,
                  profil_url: otherUserDoc.profil_url,
                }
                : null,
            };
          })
        );

        callback?.({ ok: true, conversations: enriched });
      } catch (err) {
        console.error("getConversations error:", err);
        callback?.({
          ok: false,
          error: "Failed to load conversations",
        });
      }
    }
  );
  socket.on(
    "joinConversation",
    (payload: { conversationId?: string; userUid?: string }) => {
      const { conversationId } = payload || {};
      if (!conversationId) {
        console.warn("joinConversation without conversationId");
        return;
      }
      console.log(
        `Socket ${socket.id} joining room conversation ${conversationId}`
      );
      socket.join(conversationId);
    }
  );
  socket.on(
    "getMessages",
    async (
      payload: { conversationId?: string },
      callback?: (res: {
        ok: boolean;
        messages?: any[];
        error?: string;
      }) => void
    ) => {
      try {
        const { conversationId } = payload || {};
        if (!conversationId) {
          callback?.({
            ok: false,
            error: "conversationId is required",
          });
          return;
        }

        await dbConnect();

        const msgs = await MessageModel.find({
          conversation_id: conversationId,
        } as any)
          .sort({ createdAt: 1 })
          .lean();

        const mapped = msgs.map((m: any) => ({
          _id: m._id.toString(),
          conversation_id: m.conversation_id.toString(),
          sender_uid: m.sender_uid,
          recipient_uid: m.recipient_uid,
          text: m.text,
          createdAt: m.createdAt,
        }));

        callback?.({ ok: true, messages: mapped });
      } catch (err) {
        console.error("getMessages error:", err);
        callback?.({
          ok: false,
          error: "Failed to load messages",
        });
      }
    }
  );
  socket.on(
    "sendMessage",
    async (
      payload: {
        conversationId?: string;
        senderUid?: string;
        text?: string;
      },
      callback?: (res: { ok: boolean; message?: any; error?: string }) => void
    ) => {
      try {
        const { conversationId, senderUid, text } = payload || {};
        if (!conversationId || !senderUid || !text?.trim()) {
          callback?.({
            ok: false,
            error: "conversationId, senderUid and text are required",
          });
          return;
        }

        await dbConnect();

        const conv = await ConversationModel.findById(
          conversationId as any
        );
        if (!conv) {
          callback?.({
            ok: false,
            error: "Conversation not found",
          });
          return;
        }

        const participants: string[] = (conv as any).participants || [];
        const recipientUid =
          participants.find((p) => p !== senderUid) || senderUid;

        const createdAt = new Date();

        const msgDoc = await MessageModel.create({
          conversation_id: conversationId,
          sender_uid: senderUid,
          recipient_uid: recipientUid,
          text: text.trim(),
          createdAt,
        } as any);
        const unreadByUser: Map<string, number> =
          (conv as any).unreadByUser || new Map();
        for (const p of participants) {
          if (p === senderUid) continue;
          const current = getUnreadForUser(unreadByUser, p);
          (unreadByUser as any).set
            ? (unreadByUser as any).set(p, current + 1)
            : ((unreadByUser as any)[p] = current + 1);
        }

        (conv as any).lastMessageText = text.trim();
        (conv as any).lastMessageAt = createdAt;
        (conv as any).unreadByUser = unreadByUser;
        await conv.save();

        const messagePayload = {
          _id: msgDoc._id.toString(),
          conversation_id: conversationId,
          sender_uid: senderUid,
          recipient_uid: recipientUid,
          text: text.trim(),
          createdAt,
        };

        io.to(conversationId).emit("message", {
          conversationId,
          message: messagePayload,
        });

        callback?.({ ok: true, message: messagePayload });
      } catch (err) {
        console.error("sendMessage error:", err);
        callback?.({
          ok: false,
          error: "Failed to send message",
        });
      }
    }
  );
  socket.on(
    "deleteConversation",
    async (
      { conversationId, userUid }: { conversationId?: string; userUid?: string },
      callback: (res: { ok: boolean; error?: string }) => void
    ) => {
      try {
        if (!conversationId || !userUid) {
          callback({ ok: false, error: "Missing data" });
          return;
        }

        await dbConnect();

        await ConversationModel.deleteOne({
          _id: conversationId,
          participants: { $in: [userUid] },
        });

        await MessageModel.deleteMany({ conversation_id: conversationId });

        callback({ ok: true });
      } catch (e: any) {
        console.error("deleteConversation error:", e);
        callback({ ok: false, error: e.message });
      }
    }
  );
  socket.on(
    "deleteMessage",
    async (
      { messageId, userUid }: { messageId: string; userUid: string },
      callback: (res: { ok: boolean; error?: string }) => void
    ) => {
      try {
        await dbConnect();

        const msg: any = await MessageModel.findById(messageId as any);
        if (!msg) {
          return callback({ ok: true });
        }

        if (msg.sender_uid !== userUid) {
          return callback({ ok: false, error: "Not allowed" });
        }

        await MessageModel.deleteOne({ _id: messageId });

        io.to(String(msg.conversation_id)).emit("messageDeleted", {
          messageId,
        });

        callback({ ok: true });
      } catch (e: any) {
        console.error("deleteMessage error:", e);
        callback({ ok: false, error: e.message });
      }
    }
  );

  socket.on(
    "editMessage",
    async (
      {
        messageId,
        userUid,
        text,
      }: { messageId: string; userUid: string; text: string },
      callback: (res: { ok: boolean; message?: any; error?: string }) => void
    ) => {
      try {
        await dbConnect();

        const msg: any = await MessageModel.findById(messageId as any);
        if (!msg) return callback({ ok: false, error: "Message not found" });

        if (msg.sender_uid !== userUid) {
          return callback({ ok: false, error: "Not allowed" });
        }

        msg.text = text;
        await msg.save();

        const plain = msg.toObject();
        io.to(String(msg.conversation_id)).emit("messageEdited", {
          message: plain,
        });

        callback({ ok: true, message: plain });
      } catch (e: any) {
        console.error("editMessage error:", e);
        callback({ ok: false, error: e.message });
      }
    }
  );
  socket.on(
    "markConversationRead",
    async (payload: { conversationId?: string; userUid?: string }) => {
      try {
        const { conversationId, userUid } = payload || {};
        if (!conversationId || !userUid) return;

        await dbConnect();

        const conv = await ConversationModel.findById(
          conversationId as any
        );
        if (!conv) return;

        const unreadByUser: Map<string, number> =
          (conv as any).unreadByUser || new Map();

        (unreadByUser as any).set
          ? (unreadByUser as any).set(userUid, 0)
          : ((unreadByUser as any)[userUid] = 0);

        (conv as any).unreadByUser = unreadByUser;
        await conv.save();
      } catch (err) {
        console.error("markConversationRead error:", err);
      }
    }
  );
  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

const PORT = 4000;

server.listen(PORT, () => {
  console.log("Socket.io server running on port", PORT);
});
