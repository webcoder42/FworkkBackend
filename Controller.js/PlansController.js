import PlanSchemaModel from "../Model/PlanSchemaModel.js";

// Create a new plan
export const createPlan = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      duration,
      maxprojectPerDay,
      isActive,
      planType,
      planPurpose, // New field added here
    } = req.body;

    // Validation: Ensure planPurpose is provided
    if (!planPurpose || !["billing", "team"].includes(planPurpose)) {
      return res.status(400).json({
        message:
          "Invalid or missing planPurpose. It must be either 'billing' or 'team'.",
      });
    }

    const newPlan = new PlanSchemaModel({
      name,
      description,
      price,
      duration,
      maxprojectPerDay,
      isActive,
      planType: planType || "paid",
      planPurpose, // Add planPurpose here
      features: req.body.features || [], // Add features here
    });

    const savedPlan = await newPlan.save();

    res
      .status(201)
      .json({ message: "Plan created successfully", plan: savedPlan });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating plan", error: error.message });
  }
};

// Get all plans
export const getAllPlans = async (req, res) => {
  try {
    const plans = await PlanSchemaModel.find();
    res.status(200).json(plans);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching plans", error: error.message });
  }
};

// Get single plan by ID
export const getSinglePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const plan = await PlanSchemaModel.findById(id);
    if (!plan) {
      return res.status(404).json({ message: "Plan not found" });
    }
    res.status(200).json(plan);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching plan", error: error.message });
  }
};

// Update a plan
export const updatePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const { planPurpose } = req.body;

    // Optional: Validate planPurpose if it's being updated
    if (planPurpose && !["billing", "team"].includes(planPurpose)) {
      return res.status(400).json({
        message: "Invalid planPurpose. It must be either 'billing' or 'team'.",
      });
    }

    const updateData = {
      ...req.body,
      planType: req.body.planType || "paid",
    };

    const updatedPlan = await PlanSchemaModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    if (!updatedPlan) {
      return res.status(404).json({ message: "Plan not found" });
    }

    res
      .status(200)
      .json({ message: "Plan updated successfully", plan: updatedPlan });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating plan", error: error.message });
  }
};

// Delete a plan
export const deletePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedPlan = await PlanSchemaModel.findByIdAndDelete(id);
    if (!deletedPlan) {
      return res.status(404).json({ message: "Plan not found" });
    }
    res.status(200).json({ message: "Plan deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting plan", error: error.message });
  }
};

// Get all team-specific plans
export const getTeamPlans = async (req, res) => {
  try {
    // Find only those plans where planPurpose is "team"
    const teamPlans = await PlanSchemaModel.find({ planPurpose: "team" });

    res.status(200).json({
      message: "Team plans fetched successfully",
      plans: teamPlans,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching team plans",
      error: error.message,
    });
  }
};

// AI-powered auto plan generation
export const autoGeneratePlans = async (req, res) => {
  try {
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "Groq API key not configured.",
      });
    }

    const prompt = `Create exactly 14 unique subscription plans for a freelancing platform called "Fworkk".
    
    Structure:
    1. **Billing Plans (Individual)**:
       - Monthly: 
         * "Fworkk Starter" ($0, 5 days, 2 projects/day)
         * "Fworkk Pro" ($5, 30 days, 10 projects/day)
         * "Fworkk Business" ($10, 30 days, 20 projects/day)
         * "Fworkk Enterprise" ($15, 30 days, 50 projects/day)
       - Annual (No Free Plan):
         * "Fworkk Pro" ($48, 365 days, 10 projects/day)
         * "Fworkk Business" ($96, 365 days, 20 projects/day)
         * "Fworkk Enterprise" ($144, 365 days, 50 projects/day)

    2. **Team Plans (Agencies)**:
       - Monthly:
         * "Team Starter" ($0, 5 days, 2 teams)
         * "Team Pro" ($5, 30 days, 5 teams)
         * "Team Business" ($10, 30 days, 10 teams)
         * "Team Enterprise" ($15, 30 days, 20 teams)
       - Annual (No Free Plan):
         * "Team Pro" ($48, 365 days, 5 teams)
         * "Team Business" ($96, 365 days, 10 teams)
         * "Team Enterprise" ($144, 365 days, 20 teams)

    Requirements:
    - Use "planPurpose": "billing" or "team".
    - Use "planType": "free" (for $0) or "paid".
    - Include 4-5 relevant features for each from: "Multiple Projects", "Team Collaboration", "Premium Support", "API Access", "Advanced Analytics", "Custom Domain".
    - "maxprojectPerDay" represents strictly the number (e.g., 10).

    The response must be in ONLY valid JSON format like this:
    [
      {
        "name": "Fworkk Pro",
        "description": "Unlock your full potential...",
        "price": 5,
        "duration": 30,
        "planType": "paid",
        "planPurpose": "billing",
        "maxprojectPerDay": 10,
        "features": ["Multiple Projects", "Premium Support"]
      }
    ]`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: "You are an expert product manager. Respond only with JSON array of plan objects. Return ONLY the JSON, no markdown blocks.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errTxt = await response.text();
      console.error("Groq Raw Error:", errTxt);
      throw new Error("Failed to fetch from Groq API");
    }

    const data = await response.json();
    const aiContent = data.choices[0].message.content.trim();
    
    // Safety cleaning in case it returns markdown
    let cleanJson = aiContent;
    if (cleanJson.includes("```")) {
      cleanJson = cleanJson.replace(/```json/g, "").replace(/```/g, "").trim();
    }
    
    let generatedPlans = JSON.parse(cleanJson);

    // Save all generated plans to DB
    const savedPlans = await PlanSchemaModel.insertMany(generatedPlans);

    res.status(200).json({
      success: true,
      message: "8 AI plans generated and saved successfully!",
      plans: savedPlans,
    });
  } catch (error) {
    console.error("Auto Gen Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

