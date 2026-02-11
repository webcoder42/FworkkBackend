import { Server } from "socket.io";
import CallModel from "../Model/CallModel.js";
import startAIModerationScheduler from '../utils/AIModerationScheduler.js';
import jwt from "jsonwebtoken";
import TeamHub from "../Model/TeamHubModel.js";
import cookie from "cookie";

const onlineUsers = {};
const recentCallUserEvents = new Map();
const DEDUP_WINDOW = 2000;

export const setupSocket = (server, uniqueAllowedOrigins) => {
  const io = new Server(server, {
    cors: {
      origin: function (origin, callback) {
        if (!origin || uniqueAllowedOrigins.includes(origin) || uniqueAllowedOrigins.includes(origin + '/')) {
          callback(null, true);
        } else {
          console.warn(`❌ Socket.IO CORS blocked for origin: ${origin}`);
          callback(new Error("Socket.IO CORS blocked."));
        }
      },
      methods: ["GET", "POST"],
      credentials: false, // Changed to false to avoid third-party cookie issues on mobile
    },
    transports: ["websocket", "polling"],
  });

  // Start AI Moderation Scheduler
  startAIModerationScheduler(io);

  io.use((socket, next) => {
    try {
      // Get token only from handshake auth (ignoring cookies)
      const token = socket.handshake.auth?.token;

      if (!token) {
        console.warn(`⚠️ Socket connection rejected: No token provided for socket ${socket.id}`);
        return next(new Error("Authentication error: No token provided"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // Attach user data to socket
      socket.user = {
        id: decoded.id || decoded._id,
        email: decoded.email,
        role: decoded.role
      };
      
      console.log(`🔒 Socket authenticated: ${socket.user.id} (${socket.id})`);
      next();
    } catch (err) {
      console.error(`❌ Socket authentication failed for socket ${socket.id}:`, err.message);
      next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    console.log("✅ User connected:", socket.id);

    // Register User (Securely)
    socket.on("registerUser", () => {
      // We ignore client-provided ID and use the authenticated user ID from token
      const userId = String(socket.user.id);
      if (!userId) return;
      
      onlineUsers[userId] = socket.id;
      console.log(`📱 User registered (Auth): ${userId} -> ${socket.id}`);
      socket.broadcast.emit("userOnline", { userId, socketId: socket.id });

      // Join all user's teams for background notifications
      TeamHub.find({ "members.user": userId }).select("_id").then(teams => {
        teams.forEach(team => {
          socket.join(`team_${team._id}`);
        });
      }).catch(err => console.error("Error joining teams on connect:", err));
    });

    // Handle Call
    socket.on("callUser", async (data) => {
      try {
        const { to, signal, callType, from, callerName, callerPhoto } = data;
        const toUserId = String(to);
        const fromUserId = String(from);

        const dupKey = `${fromUserId}-${toUserId}`;
        const lastEventTime = recentCallUserEvents.get(dupKey);
        const now = Date.now();

        if (lastEventTime && now - lastEventTime < DEDUP_WINDOW) return;
        recentCallUserEvents.set(dupKey, now);
        if (recentCallUserEvents.size > 1000) recentCallUserEvents.clear();

        try {
          const call = await CallModel.create({
            caller: fromUserId,
            receiver: toUserId,
            callType,
            status: "missed",
          });

          // System message for the call
          try {
            const MessageModel = (await import("../Model/MessageModel.js")).default;
            await MessageModel.create({
              sender: fromUserId,
              receiver: toUserId,
              content: `📞 Incoming ${callType} call`,
              isCall: true,
              system: true,
              callType,
              callId: call._id.toString(),
              isRead: false,
            });
          } catch (msgErr) {
            console.error("Error saving call message:", msgErr);
          }

          const receiverSocket = onlineUsers[toUserId];
          if (receiverSocket) {
            io.to(receiverSocket).emit("incomingCall", {
              callId: call._id.toString(),
              from: fromUserId,
              signal,
              callType,
              callerName,
              callerPhoto,
            });
            
            const payload = {
              callId: call._id.toString(),
              caller: fromUserId,
              receiver: toUserId,
              callType,
              createdAt: call.createdAt,
              signal,
              callerName,
              callerPhoto,
            };
            socket.emit("callCreated", payload);
            io.to(receiverSocket).emit("callCreated", payload);
          } else {
            socket.emit("userNotOnline", { userId: toUserId });
          }
        } catch (dbError) {
          console.error("Error creating call in DB:", dbError);
        }
      } catch (err) {
        console.error("Error handling callUser:", err);
      }
    });

    // Answer Call
    socket.on("answerCall", (data) => {
      const { to, signal } = data;
      const callerSocket = onlineUsers[to];
      if (callerSocket) {
        io.to(callerSocket).emit("callAccepted", { from: socket.id, signal });
      }
    });

    // Call Accepted
    socket.on("callAccepted", (data) => {
      const { to } = data;
      const receiverSocket = onlineUsers[to];
      if (receiverSocket) {
        io.to(receiverSocket).emit("callAcceptedByReceiver", { from: socket.id });
      }
    });

    // Reject Call
    socket.on("rejectCall", (data) => {
      const { to } = data;
      const callerSocket = onlineUsers[to];
      if (callerSocket) {
        io.to(callerSocket).emit("callRejected", { from: socket.id });
      }
    });

    // End Call
    socket.on("endCall", (data) => {
      const { to } = data;
      const otherSocket = onlineUsers[to];
      if (otherSocket) {
        io.to(otherSocket).emit("callEnded", { from: socket.id });
      }
    });

    // ICE Candidate
    socket.on("iceCandidate", (data) => {
      const { to, candidate } = data;
      const targetSocket = onlineUsers[to];
      if (targetSocket) {
        io.to(targetSocket).emit("iceCandidate", { from: socket.id, candidate });
      }
    });

    // Missed Call Notification
    socket.on("missedCall", (data) => {
      const { to, callType, missedAt } = data;
      const receiverSocket = onlineUsers[to];
      if (receiverSocket) {
        io.to(receiverSocket).emit("missedCallNotification", { from: socket.id, callType, missedAt });
      }
    });

    // Voice Message
    socket.on("voiceMessage", (data) => {
      const { to, audioBase64, duration, fromUserId, fromUserName } = data;
      const receiverSocket = onlineUsers[to];
      if (receiverSocket) {
        io.to(receiverSocket).emit("voiceMessage", { audioBase64, duration, fromUserId, fromUserName });
      }
    });

    // Call Ended Details
    socket.on("callEndedDetails", (data) => {
      const { to, call } = data;
      const targetSocket = onlineUsers[to];
      if (targetSocket) {
        io.to(targetSocket).emit("callEndedDetails", { call });
      }
    });

    // Team Chats
    socket.on("joinTeam", (teamId) => {
      socket.join(`team_${teamId}`);
    });

    socket.on("leaveTeam", (teamId) => {
      socket.leave(`team_${teamId}`);
    });

    // Team Calls Join Request
    socket.on("requestJoinTeamCall", (data) => {
        const { teamId, ownerId, requestorId, requestorName, requestorPhoto } = data;
        const ownerSocketId = onlineUsers[String(ownerId)];
        if (ownerSocketId) {
            io.to(ownerSocketId).emit("joinTeamCallRequest", {
                teamId,
                requestorId,
                requestorName,
                requestorPhoto,
                socketId: socket.id
            });
        }
    });

    socket.on("approveJoinTeamCall", (data) => {
        const { targetSocketId, teamId, callId } = data;
        io.to(targetSocketId).emit("joinTeamCallApproved", { teamId, callId });
    });

    socket.on("rejectJoinTeamCall", (data) => {
        const { targetSocketId, teamId, reason } = data;
        io.to(targetSocketId).emit("joinTeamCallRejected", { teamId, reason: reason || "Owner declined your request" });
    });

    // Project Chats
    socket.on("join_project", (projectId) => {
      socket.join(projectId);
    });

    // Disconnect
    socket.on("disconnect", () => {
      for (let userId in onlineUsers) {
        if (onlineUsers[userId] === socket.id) {
          delete onlineUsers[userId];
          break;
        }
      }
      console.log("❌ User disconnected:", socket.id);
    });
  });

  return io;
};
