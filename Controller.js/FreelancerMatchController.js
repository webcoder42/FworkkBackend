import User from "../Model/UserModel.js";
import PostProject from "../Model/PostProjectModel.js";
import SubmitProject from "../Model/SubmitProjectModel.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

// Utility: Check if bio matches project
function bioMatchesProject(bio, project) {
  if (!bio) return false;
  const text =
    (project.title || "") +
    " " +
    (project.description || "") +
    " " +
    (project.category || "");
  return (
    bio.toLowerCase().includes(project.category?.toLowerCase() || "") ||
    bio.toLowerCase().includes(project.title?.toLowerCase() || "") ||
    bio.toLowerCase().includes(project.description?.toLowerCase() || "")
  );
}

// Utility: Check if skills match project skillsRequired
function skillsMatch(userSkills, projectSkills) {
  if (!userSkills || !projectSkills) return false;
  const normalizedProjectSkills = projectSkills.map((s) =>
    typeof s === "string" ? s.toLowerCase() : String(s).toLowerCase()
  );
  return userSkills.some((skill) => {
    const skillName = typeof skill === "string" ? skill : skill.name || "";
    return normalizedProjectSkills.includes(skillName.toLowerCase());
  });
}

// Utility: Count completed projects matching project
function countMatchingCompletedProjects(submittedProjects, project) {
  if (!submittedProjects || !project) return 0;
  return submittedProjects.filter((p) => {
    return (
      (p.category &&
        p.category.toLowerCase() === (project.category || "").toLowerCase()) ||
      (p.title &&
        p.title.toLowerCase().includes((project.title || "").toLowerCase())) ||
      (p.description &&
        p.description
          .toLowerCase()
          .includes((project.description || "").toLowerCase()))
    );
  }).length;
}

// Utility: Check portfolio for project
function portfolioMatches(portfolio, project) {
  if (!portfolio || !project) return false;
  return portfolio.some((item) => {
    return (
      (item.title &&
        item.title
          .toLowerCase()
          .includes((project.title || "").toLowerCase())) ||
      (item.title &&
        item.title
          .toLowerCase()
          .includes((project.category || "").toLowerCase()))
    );
  });
}

// Main matching function with improved matching algorithm
async function matchFreelancers(req, res) {
  const { project } = req.body;
  if (
    !project ||
    !(project.category || project.title || project.skillsRequired)
  ) {
    return res.status(400).json({ error: "Project category required" });
  }

  try {
    // Get all online or recently active freelancers (role: 'freelancer')
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const freelancers = await User.find({
      UserType: "freelancer",
      accountStatus: "active",
      $or: [{ availability: "online" }, { lastSeen: { $gte: oneDayAgo } }],
    }).select(
      "_id fullname name username bio skills portfolio profileImage availability accountStatus lastLogin lastSeen UserType"
    );

    console.log("[DEBUG] Online/recent freelancers count:", freelancers.length);

    const allSubmittedProjects = await SubmitProject.find({
      status: "approved",
    });
    console.log(
      "[DEBUG] Approved submitted projects:",
      allSubmittedProjects.length
    );

    // If no freelancers found, return empty array
    if (freelancers.length === 0) {
      return res.json({ freelancers: [] });
    }

    // Build dynamic keywords from project title, category, description, and skillsRequired
    const projectKeywords = [];
    if (project.title) projectKeywords.push(project.title);
    if (project.category) projectKeywords.push(project.category);
    if (project.description) projectKeywords.push(project.description);
    if (Array.isArray(project.skillsRequired))
      projectKeywords.push(...project.skillsRequired);
    // Add lowercased versions
    const normalizedKeywords = projectKeywords.map((kw) => kw.toLowerCase());

    // Enhanced matching algorithm
    const matchedFreelancers = await Promise.all(
      freelancers.map(async (user) => {
        const userSubmittedProjects = allSubmittedProjects.filter(
          (p) => p.user?.toString() === user._id.toString()
        );

        // Gather all user fields for keyword search
        const allTextFields = [
          user.bio || "",
          ...(user.skills || []).map((s) => (typeof s === "string" ? s : s.name || "")),
          ...(user.portfolio || []).map(
            (item) => (item.title || "") + " " + (item.description || "")
          ),
          user.username || "",
          user.fullname || user.name || "",
          ...(userSubmittedProjects || []).map(
            (p) =>
              (p.title || "") +
              " " +
              (p.category || "") +
              " " +
              (p.description || "")
          ),
        ]
          .join(" ")
          .toLowerCase();

        // Deep keyword match: any project keyword in any user field
        const deepKeywordMatch = normalizedKeywords.some((kw) =>
          allTextFields.includes(kw)
        );

        // Project-specific match
        const projectSkills = (project.skillsRequired || []).map((s) =>
          typeof s === "string" ? s.toLowerCase() : String(s).toLowerCase()
        );
        const userSkills = (user.skills || []).map((s) =>
          typeof s === "string" ? s.toLowerCase() : (s.name || "").toLowerCase()
        );
        const skillMatch = userSkills.some((skill) =>
          projectSkills.some((ps) => skill.includes(ps) || ps.includes(skill))
        );

        // Bio match
        const bioText = (user.bio || "").toLowerCase();
        const bioMatch = normalizedKeywords.some((kw) => bioText.includes(kw));

        // Completed projects: total and relevant
        const totalCompletedProjects = (userSubmittedProjects || []).length;
        const relevantCompletedProjects = (userSubmittedProjects || []).filter(
          (p) => {
            const cat = (p.category || "").toLowerCase();
            const title = (p.title || "").toLowerCase();
            const desc = (p.description || "").toLowerCase();
            return normalizedKeywords.some(
              (kw) =>
                cat.includes(kw) ||
                kw.includes(cat) ||
                title.includes(kw) ||
                kw.includes(title) ||
                desc.includes(kw) ||
                kw.includes(desc)
            );
          }
        ).length;

        // Portfolio: total and relevant
        const totalPortfolioItems = (user.portfolio || []).length;
        const relevantPortfolioItems = (user.portfolio || []).filter((item) => {
          const t = (item.title || "").toLowerCase();
          const d = (item.description || "").toLowerCase();
          return normalizedKeywords.some(
            (kw) =>
              t.includes(kw) ||
              kw.includes(t) ||
              d.includes(kw) ||
              kw.includes(d)
          );
        }).length;
        const portfolioMatch = relevantPortfolioItems > 0;

        // Weighted match percent - improved algorithm
        let matchPercent = 0;
        if (bioMatch) matchPercent += 15;
        if (skillMatch) matchPercent += 25;
        if (relevantCompletedProjects > 0)
          matchPercent += relevantCompletedProjects * 10;
        if (portfolioMatch) matchPercent += 15;
        if (deepKeywordMatch) matchPercent += 30;
        matchPercent = Math.min(matchPercent, 100);

        return {
          _id: user._id,
          name: user.fullname || user.name || user.username,
          avatar: user.profileImage || "/default-avatar.png",
          bio: user.bio,
          skills: user.skills || [],
          completedProjects: `${totalCompletedProjects} (${relevantCompletedProjects} relevant)`,
          portfolioPreview:
            totalPortfolioItems > 0
              ? `${totalPortfolioItems} (${relevantPortfolioItems} relevant)`
              : "No portfolio",
          matchPercent,
        };
      })
    );

    // Sort by match percentage (highest first)
    matchedFreelancers.sort((a, b) => b.matchPercent - a.matchPercent);

    // Only show 40%+ matches, or if none, show all with matchPercent > 0, or fallback to all available freelancers
    let filteredResults = matchedFreelancers.filter(
      (f) => f.matchPercent >= 40
    );

    if (filteredResults.length === 0) {
      filteredResults = matchedFreelancers.filter((f) => f.matchPercent > 0);
    }
    // If still empty, show all available freelancers (with matchPercent 0)
    if (filteredResults.length === 0) {
      filteredResults = matchedFreelancers;
    }

    console.log(
      "[DEBUG] Final filtered results count:",
      filteredResults.length
    );
    res.json({ freelancers: filteredResults });
  } catch (error) {
    console.error("Error in matchFreelancers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export { matchFreelancers };
