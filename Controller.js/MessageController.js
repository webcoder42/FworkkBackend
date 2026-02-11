import MessageModel from "../Model/MessageModel.js";
import PostProjectModel from "../Model/PostProjectModel.js";
import UserModel from "../Model/UserModel.js";
import { updateUserActivity } from "../services/ActivityTrackingService.js";

import mongoose from "mongoose";

let ioGlobal = null;

export { ioGlobal };

export const setupSocketIO = (io) => {
  ioGlobal = io;
  io.on("connection", (socket) => {
    socket.on("join", (userId) => {
      if (mongoose.Types.ObjectId.isValid(userId)) {
        socket.join(userId);
        // Update user availability to online when they join
        updateUserActivity(userId);
      }
    });

    socket.on("user-activity", async (userId) => {
      if (mongoose.Types.ObjectId.isValid(userId)) {
        await updateUserActivity(userId);
      }
    });

    socket.on("sendMessage", async (data) => {
      try {
        const { sender, receiver, content } = data;

        if (
          !mongoose.Types.ObjectId.isValid(sender) ||
          !mongoose.Types.ObjectId.isValid(receiver)
        ) {
          return socket.emit("error", "Invalid user IDs");
        }

        const [senderExists, receiverExists] = await Promise.all([
          UserModel.findById(sender),
          UserModel.findById(receiver),
        ]);

        if (!senderExists || !receiverExists) {
          return socket.emit("error", "User not found");
        }

        const msg = await MessageModel.create({ sender, receiver, content });
        const populated = await MessageModel.findById(msg._id)
          .populate("sender", "username email profileImage")
          .populate("receiver", "username email profileImage");

        io.to(receiver.toString()).emit("receiveMessage", populated);
        io.to(sender.toString()).emit("messageSent", populated);
      } catch (err) {
        console.error("Socket message error:", err);
        socket.emit("error", "Failed to send message");
      }
    });

    socket.on("markAsRead", async (data) => {
      try {
        const { senderId, receiverId } = data;

        if (
          !mongoose.Types.ObjectId.isValid(senderId) ||
          !mongoose.Types.ObjectId.isValid(receiverId)
        ) {
          return socket.emit("error", "Invalid user IDs");
        }

        await MessageModel.updateMany(
          {
            sender: senderId,
            receiver: receiverId,
            isRead: false,
          },
          {
            $set: { isRead: true },
          }
        );

        // Notify the sender that their messages were read
        io.to(senderId.toString()).emit("messagesRead", { by: receiverId });
      } catch (err) {
        console.error("Socket markAsRead error:", err);
        socket.emit("error", "Failed to mark messages as read");
      }
    });

    socket.on("typing", (data) => {
      const { to } = data;
      socket.to(to).emit("typing", socket.user?._id);
    });

    socket.on("stopTyping", (data) => {
      const { to } = data;
      socket.to(to).emit("stopTyping", socket.user?._id);
    });

    socket.on("disconnect", async () => {
      // Set user offline when they disconnect
      if (socket.userId) {
        await UserModel.findByIdAndUpdate(socket.userId, {
          availability: "offline",
          lastSeen: new Date(),
        });
      }
    });
  });
};

// ✅ Updated Controller
export const clientSendMessage = async (req, res) => {
  try {
    const sender = req.user.id; // logged-in user
    const { receiver, content } = req.body;

    // Validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(sender) ||
      !mongoose.Types.ObjectId.isValid(receiver)
    ) {
      return res.status(400).json({ error: "Invalid user IDs" });
    }

    const [senderExists, receiverExists] = await Promise.all([
      UserModel.findById(sender),
      UserModel.findById(receiver),
    ]);

    if (!senderExists || !receiverExists) {
      return res.status(404).json({ error: "User not found" });
    }

    const msg = await MessageModel.create({ sender, receiver, content });
    const populated = await MessageModel.findById(msg._id)
      .populate("sender", "username email profileImage")
      .populate("receiver", "username email profileImage");

    res.status(201).json(populated);
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ error: err.message || "Failed to send message" });
  }
};

export const getMessageHistoryBySenderGrouped = async (req, res) => {
  try {
    const senderId = req.user.id;

    // Get all messages sent by this user
    const messages = await MessageModel.find({ sender: senderId })
      .populate("receiver", "username email profileImage")
      .sort({ createdAt: -1 }); // Optional: latest first

    // Group messages by receiver
    const grouped = {};

    messages.forEach((msg) => {
      const receiverId = msg.receiver._id.toString();

      if (!grouped[receiverId]) {
        grouped[receiverId] = {
          receiver: msg.receiver,
          messages: [],
        };
      }

      grouped[receiverId].messages.push({
        _id: msg._id,
        content: msg.content,
        createdAt: msg.createdAt,
      });
    });

    // Convert object to array
    const result = Object.values(grouped);

    res.status(200).json(result);
  } catch (err) {
    console.error("Error fetching grouped message history:", err);
    res.status(500).json({ error: "Failed to get message history" });
  }
};

export const getMessagesReceivedByUser = async (req, res) => {
  try {
    const userId = req.user.id;

    const messages = await MessageModel.find({ receiver: userId })
      .populate("sender", "username email profileImage")
      .sort({ createdAt: -1 });

    const grouped = {};

    messages.forEach((msg) => {
      const senderId = msg.sender._id.toString();

      if (!grouped[senderId]) {
        grouped[senderId] = {
          sender: msg.sender,
          messages: [],
        };
      }

      grouped[senderId].messages.push({
        _id: msg._id,
        content: msg.content,
        createdAt: msg.createdAt,
      });
    });

    const result = Object.values(grouped);

    res.status(200).json(result);
  } catch (err) {
    console.error("❌ Error fetching received messages:", err);
    res.status(500).json({ error: "Failed to get messages" });
  }
};

export const getChatWithUser = async (req, res) => {
  try {
    const loginUserId = req.user.id;
    const { otherUserId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const chatMessages = await MessageModel.find({
      $or: [
        { sender: loginUserId, receiver: otherUserId },
        { sender: otherUserId, receiver: loginUserId },
      ],
    })
      .populate("sender", "username email profileImage")
      .populate("receiver", "username email profileImage")
      .sort({ createdAt: -1 }) // Get latest messages first for pagination
      .skip(skip)
      .limit(parseInt(limit));

    const totalMessages = await MessageModel.countDocuments({
      $or: [
        { sender: loginUserId, receiver: otherUserId },
        { sender: otherUserId, receiver: loginUserId },
      ],
    });

    res.status(200).json({
      success: true,
      messages: chatMessages.reverse(), // Reverse back to chronological order for UI
      hasMore: skip + chatMessages.length < totalMessages,
      totalMessages,
    });
  } catch (err) {
    console.error("❌ Error getting chat with user:", err);
    res.status(500).json({ error: "Failed to fetch chat messages" });
  }
};

export const replyToUser = async (req, res) => {
  try {
    const sender = req.user.id;
    const { receiver, content } = req.body;

    if (!receiver || !content) {
      return res.status(400).json({ error: "Receiver and content required" });
    }

    const msg = await MessageModel.create({ sender, receiver, content });

    const populated = await MessageModel.findById(msg._id)
      .populate("sender", "username email profileImage")
      .populate("receiver", "username email profileImage");

    res.status(201).json(populated);
  } catch (err) {
    console.error("❌ Error sending reply message:", err);
    res.status(500).json({ error: "Failed to reply to user" });
  }
};

export const getSendersToUser = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all messages where the user is either sender or receiver
    const messages = await MessageModel.find({
      $or: [{ sender: userId }, { receiver: userId }],
    })
      .populate("sender", "username email profileImage")
      .populate("receiver", "username email profileImage")
      .sort({ createdAt: -1 });

    const conversations = new Map();

    messages.forEach((msg) => {
      // Null checks for sender and receiver
      if (
        !msg.sender ||
        !msg.sender._id ||
        !msg.receiver ||
        !msg.receiver._id
      ) {
        // Skip this message if sender or receiver is missing
        return;
      }
      // Determine if the other user is sender or receiver - Robust comparison
      const otherUser =
        String(msg.sender._id) === String(userId) ? msg.receiver : msg.sender;
      if (!otherUser || !otherUser._id) {
        // Skip if otherUser is missing
        return;
      }
      const otherUserId = otherUser._id.toString();

      if (!conversations.has(otherUserId)) {
        conversations.set(otherUserId, {
          _id: otherUserId,
          user: {
            _id: otherUser._id,
            username: otherUser.username,
            email: otherUser.email,
            profileImage: otherUser.profileImage || "",
          },
          lastMessage: {
            _id: msg._id,
            content: msg.content,
            createdAt: msg.createdAt,
            sender: msg.sender,
            receiver: msg.receiver,
            isRead: msg.isRead,
          },
          unreadCount: 0,
          updatedAt: msg.createdAt,
        });
      }

      // Count unread messages
      if (msg.receiver._id.toString() === userId && !msg.isRead) {
        const conv = conversations.get(otherUserId);
        if (conv) {
          conv.unreadCount = (conv.unreadCount || 0) + 1;
        }
      }
    });

    // Convert Map to Array and sort by latest message
    const sortedConversations = Array.from(conversations.values()).sort(
      (a, b) => b.lastMessage.createdAt - a.lastMessage.createdAt
    );

    res.json(sortedConversations);
  } catch (err) {
    console.error("Error in getSendersToUser:", err);
    res.status(500).json({ error: err.message });
  }
};

export const markMessagesAsRead = async (req, res) => {
  try {
    const receiverId = req.user.id;
    const { senderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(senderId)) {
      return res.status(400).json({ error: "Invalid sender ID" });
    }

    // Update all unread messages from this sender to this receiver
    const result = await MessageModel.updateMany(
      {
        sender: senderId,
        receiver: receiverId,
        isRead: false,
      },
      {
        $set: { isRead: true },
      }
    );

    // Emit socket event to update sender's UI
    if (ioGlobal) {
      ioGlobal.to(senderId).emit("messagesRead", { by: receiverId });
    }

    res.json({
      success: true,
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error("Error marking messages as read:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getUnreadMessages = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all unread messages for this user
    const unreadMessages = await MessageModel.find({
      receiver: userId,
      isRead: false,
    })
      .populate("sender", "username email profileImage")
      .sort({ createdAt: -1 });

    // Group messages by sender
    const groupedMessages = {};
    unreadMessages.forEach((msg) => {
      if (msg.sender && msg.sender._id) {
        const senderId = msg.sender._id.toString();
        if (!groupedMessages[senderId]) {
          groupedMessages[senderId] = {
            sender: msg.sender,
            messages: [],
            count: 0,
          };
        }
        groupedMessages[senderId].messages.push({
          _id: msg._id,
          content: msg.content,
          createdAt: msg.createdAt,
        });
        groupedMessages[senderId].count++;
      }
    });

    // Get total count and convert to array
    const totalUnreadCount = unreadMessages.length;
    const groupedArray = Object.values(groupedMessages);

    res.status(200).json({
      totalUnreadCount,
      groupedMessages: groupedArray,
    });
  } catch (err) {
    console.error("Error fetching unread messages:", err);
    res.status(500).json({ error: "Failed to get unread messages" });
  }
};

export const getMessageHistoryWithUser = async (req, res) => {
  try {
    const loginUserId = req.user.id;
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const messages = await MessageModel.find({
      $or: [
        { sender: loginUserId, receiver: userId },
        { sender: userId, receiver: loginUserId },
      ],
    })
      .populate("sender", "username email profileImage")
      .populate("receiver", "username email profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalMessages = await MessageModel.countDocuments({
      $or: [
        { sender: loginUserId, receiver: userId },
        { sender: userId, receiver: loginUserId },
      ],
    });

    res.status(200).json({
      success: true,
      messages: messages.reverse(),
      hasMore: skip + messages.length < totalMessages,
      totalMessages,
    });
  } catch (err) {
    console.error("Error fetching message history with user:", err);
    res.status(500).json({ error: "Failed to fetch message history" });
  }
};

export const adminGetChatHistory = async (req, res) => {
  try {
    const { user1Id, user2Id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    if (!user1Id || !user2Id) {
      return res.status(400).json({ error: "Both User IDs are required" });
    }

    const messages = await MessageModel.find({
      $or: [
        { sender: user1Id, receiver: user2Id },
        { sender: user2Id, receiver: user1Id },
      ],
    })
      .populate("sender", "username email profileImage")
      .populate("receiver", "username email profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalMessages = await MessageModel.countDocuments({
      $or: [
        { sender: user1Id, receiver: user2Id },
        { sender: user2Id, receiver: user1Id },
      ],
    });

    res.status(200).json({
      success: true,
      messages: messages.reverse(),
      hasMore: skip + messages.length < totalMessages,
      totalMessages,
    });
  } catch (err) {
    console.error("Error fetching admin message history:", err);
    res.status(500).json({ error: "Failed to fetch message history" });
  }
};
