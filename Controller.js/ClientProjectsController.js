import PostProjectModel from "../Model/PostProjectModel.js";
import ProjectApplyModel from "../Model/ProjectApplyModel.js";
import UserModel from "../Model/UserModel.js";

// Get all projects created by a specific client, with hired user info if any
export const getProjectsByClient = async (req, res) => {
  try {
    const { clientId } = req.params;
    // Validate client exists
    const client = await UserModel.findById(clientId).select("username email createdAt");
    if (!client) {
      return res.status(404).json({ success: false, message: "Client not found" });
    }
    // Get all projects by this client
    const projects = await PostProjectModel.find({ client: clientId })
      .sort({ createdAt: -1 })
      .lean();
    // For each project, find if someone is hired
    const projectsWithHired = await Promise.all(
      projects.map(async (project) => {
        // Find hired application for this project
        const hired = await ProjectApplyModel.findOne({ project: project._id, status: "hired" })
          .populate("user", "username email profileImage completedProjects rating")
          .lean();
        return {
          ...project,
          hiredUser: hired ? hired.user : null,
        };
      })
    );
    res.status(200).json({
      success: true,
      message: "Projects by client fetched successfully",
      client: {
        id: client._id,
        username: client.username,
        email: client.email,
        joinDate: client.createdAt,
      },
      totalProjects: projectsWithHired.length,
      data: projectsWithHired,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}; 
