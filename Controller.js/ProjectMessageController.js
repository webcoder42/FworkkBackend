import MessageModel from "../Model/MessageModel.js";
import PostProjectModel from "../Model/PostProjectModel.js";
import UserModel from "../Model/UserModel.js";
import sanitize from "mongo-sanitize";

// Simple controller to get project creator and send message
export const sendProjectMessage = async (req, res) => {
  try {
    const { projectId } = req.params;
    const message = sanitize(req.body.message);
    const senderId = req.user.id;  // Current logged in user

    // Find project and its creator
    const project = await PostProjectModel.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Get project creator details
    const projectCreator = await UserModel.findById(project.userId);
    if (!projectCreator) {
      return res.status(404).json({ error: "Project creator not found" });
    }

    // Create and send message
    const newMessage = await MessageModel.create({
      sender: senderId,
      receiver: projectCreator._id,
      content: message
    });

    // Get populated message
    const populatedMessage = await MessageModel.findById(newMessage._id)
      .populate("sender", "username email")
      .populate("receiver", "username email");

    res.status(200).json({
      success: true,
      message: populatedMessage,
      projectCreator: {
        _id: projectCreator._id,
        username: projectCreator.username,
        email: projectCreator.email
      }
    });

  } catch (error) {
    console.error("Error sending project message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
}; 
