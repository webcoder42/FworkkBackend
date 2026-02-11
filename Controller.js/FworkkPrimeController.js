import FworkkPrimeModel from "../Model/FworkkPrimeModel.js";
import UserModel from "../Model/UserModel.js";
import { uploadImageToCloudinary } from "../services/cloudinaryService.js";
import { client as streamClient } from "../services/streamToken.js";
// sendEmail import removed, using EmailService instead

import { 
    sendTeamReadyEmail, 
    sendProjectLaunchedEmail, 
    sendProjectLaunchedClientEmail, 
    sendTaskAssignedEmail,
    sendTaskCancelledFreelancerEmail,
    sendTaskCancelledClientEmail,
    sendTaskApprovedFreelancerEmail,
    sendTaskSubmittedClientEmail,
    sendTaskRevisionFreelancerEmail,
    sendPrimeInvitationEmail,
    sendPrimeWelcomeEmail,
    sendTaskReminderEmail,
    sendEarningUpdateEmail
} from "../services/EmailService.js";
export const createProjectRequest = async (req, res) => {
    try {
        const clientId = req.user.id; // Assuming user is authenticated
        const user = await UserModel.findById(clientId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Validate required fields
        const requiredFields = [
            'title', 'description', 'budget', 'category', 
            'teamSize', 'timeline', 'teamRoles'
        ];
        
        for (const field of requiredFields) {
            if (!req.body[field]) {
                return res.status(400).json({
                    success: false,
                    message: `${field} is required`
                });
            }
        }

        const budget = Number(req.body.budget);

        // Validate minimum budget (1000)
        if (budget < 1000) {
            return res.status(400).json({
                success: false,
                message: "Minimum budget is 1000. Please enter a higher amount."
            });
        }

        // Check if user has enough balance
        const userBalance = user.totalEarnings || 0;
        if (userBalance < budget) {
            return res.status(400).json({
                success: false,
                message: `Insufficient balance. You have ${userBalance} but need ${budget}. Please add funds to your account.`,
                errorCode: "INSUFFICIENT_BALANCE",
                currentBalance: userBalance,
                requiredAmount: budget
            });
        }

        // Validate timeline dates
        if (new Date(req.body.timeline.startDate) >= new Date(req.body.timeline.endDate)) {
            return res.status(400).json({
                success: false,
                message: "End date must be after start date"
            });
        }

        // Calculate estimated duration
        const startDate = new Date(req.body.timeline.startDate);
        const endDate = new Date(req.body.timeline.endDate);
        const duration = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

        // Validate team roles total matches team size
        const totalRolesQuantity = req.body.teamRoles.reduce((sum, role) => sum + role.quantity, 0);
        if (totalRolesQuantity !== req.body.teamSize) {
            return res.status(400).json({
                success: false,
                message: `Total team roles quantity (${totalRolesQuantity}) must match team size (${req.body.teamSize})`
            });
        }

        // Deduct budget from user's totalEarnings and update totalSpend
        user.totalEarnings = userBalance - budget;
        user.totalSpend = (user.totalSpend || 0) + budget;
        
        // Add to spending logs (optional - for tracking)
        if (!user.EarningLogs) {
            user.EarningLogs = [];
        }
        user.EarningLogs.push({
            amount: -budget,
            date: new Date(),
            reason: `Fworkk Prime Project Request: ${req.body.title}`
        });

        await user.save();

        // Send email notification for deduction
        await sendEarningUpdateEmail(
          user.email,
          user.username || user.Fullname,
          budget,
          'decrement',
          `Deduction for creating Fworkk Prime project: "${req.body.title}"`
        );

        // Create project request
        const projectRequest = new FworkkPrimeModel({
            clientId,
            title: req.body.title,
            description: req.body.description,
            budget: budget,
            category: req.body.category,
            skillsRequired: req.body.skillsRequired || [],
            teamSize: req.body.teamSize,
            teamRoles: req.body.teamRoles,
            teamSelectionType: req.body.teamSelectionType || 'mixed',
            timeline: {
                startDate: req.body.timeline.startDate,
                endDate: req.body.timeline.endDate,
                estimatedDuration: duration
            },
            projectType: req.body.projectType || 'one-time',
            priority: req.body.priority || 'medium'
        });

        await projectRequest.save();
        
        // Trigger AI Auto-Hiring if requested
        if (projectRequest.teamSelectionType !== 'manual') {
            autoHireFreelancers(projectRequest._id);
        }

        // Populate client details for response
        await projectRequest.populate('clientId', 'Fullname email profileImage');

        res.status(201).json({
            success: true,
            message: "Project request created successfully",
            data: projectRequest,
            newBalance: user.totalEarnings
        });

    } catch (error) {
        console.error("Error creating project request:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// @desc    Get all project requests for a client
// @route   GET /api/project-requests/my-projects
// @access  Private (Client only)
export const getMyProjectRequests = async (req, res) => {
    try {
        await autoRejectPrimeInvitations();
        const clientId = req.user.id;
        
        const projects = await  FworkkPrimeModel.find({ clientId })
            .populate('clientId', 'Fullname email profileImage')
            .populate('selectedFreelancers.freelancerId', 'Fullname email profileImage skills rating availability hourlyRate')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: projects.length,
            data: projects
        });

    } catch (error) {
        console.error("Error fetching projects:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// @desc    Get single project request
// @route   GET /api/project-requests/:id
// @access  Private (Client/Admin)
export const getProjectRequest = async (req, res) => {
    try {
        await autoRejectPrimeInvitations();
        const project = await FworkkPrimeModel.findById(req.params.id)
            .populate('clientId', 'Fullname email phone profileImage')
            .populate('selectedFreelancers.freelancerId', 'Fullname email profileImage skills rating hourlyRate availability')
            .populate('callJoinRequests.user', 'Fullname username profileImage email');

        if (!project) {
            return res.status(404).json({
                success: false,
                message: "Project request not found"
            });
        }

        // Check authorization
        const clientId = project.clientId?._id || project.clientId;
        if (!clientId) {
            return res.status(500).json({ success: false, message: "Project has no client owner" });
        }
        const isClient = clientId.toString() === req.user.id.toString();
        const isAdmin = req.user.role === 'admin';
        const isFreelancerInTeam = (project.selectedFreelancers || []).some(
            f => f?.freelancerId && (f.freelancerId._id || f.freelancerId).toString() === req.user.id.toString()
        );

        if (!isClient && !isAdmin && !isFreelancerInTeam) {
            return res.status(403).json({
                success: false,
                message: "Not authorized to view this project"
            });
        }

        res.status(200).json({
            success: true,
            data: project
        });

    } catch (error) {
        console.error("Error fetching project:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// @desc    Update project request
// @route   PUT /api/project-requests/:id
// @access  Private (Client only)
export const updateProjectRequest = async (req, res) => {
    try {
        const clientId = req.user.id;
        const project = await FworkkPrimeModel.findById(req.params.id);

        if (!project) {
            return res.status(404).json({
                success: false,
                message: "Project request not found"
            });
        }

        // Check if owner or admin
        const isOwner = project.clientId.toString() === req.user.id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Not authorized to update this project"
            });
        }

        // Check if project can be updated
        // Allowed statuses for editing: Not_Started, Started, team_selection (basically before 'Worked Started')
        const allowedStatuses = ['Not_Started', 'Started', 'team_selection', 'Worked Started'];
        if (!allowedStatuses.includes(project.status)) {
            return res.status(400).json({
                success: false,
                message: "Cannot update project once work has started"
            });
        }

        const user = await UserModel.findById(clientId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Handle Budget Changes
        if (req.body.budget !== undefined) {
            const newBudget = Number(req.body.budget);
            const oldBudget = project.budget;

            if (newBudget < 1000) {
                return res.status(400).json({
                    success: false,
                    message: "Minimum budget is 1000"
                });
            }

            if (newBudget > oldBudget) {
                // Increase budget: Deduct from user balance
                const difference = newBudget - oldBudget;
                const userBalance = user.totalEarnings || 0;

                if (userBalance < difference) {
                    return res.status(400).json({
                        success: false,
                        message: `Insufficient balance for budget increase. You need an additional ${difference}.`,
                        errorCode: "INSUFFICIENT_BALANCE",
                        currentBalance: userBalance,
                        requiredAmount: difference 
                    });
                }

                user.totalEarnings -= difference;
                user.totalSpend = (user.totalSpend || 0) + difference;
                user.EarningLogs.push({
                    amount: -difference,
                    date: new Date(),
                    reason: `Budget increase for Fworkk Prime Project: ${project.title}`
                });

                await sendEarningUpdateEmail(
                    user.email,
                    user.username || user.Fullname,
                    difference,
                    'decrement',
                    `Deduction for budget increase of Fworkk Prime project: "${project.title}"`
                );
            } else if (newBudget < oldBudget) {
                // Decrease budget: Refund to user balance (with 2% tax)
                const difference = oldBudget - newBudget;
                const tax = difference * 0.02;
                const refundAmount = difference - tax;

                user.totalEarnings = (user.totalEarnings || 0) + refundAmount;
                // We update totalSpend to reflect actual spend
                user.totalSpend = (user.totalSpend || 0) - refundAmount;

                user.EarningLogs.push({
                    amount: refundAmount,
                    date: new Date(),
                    reason: `Budget decrease refund (2% tax deducted) for Fworkk Prime Project: ${project.title}`
                });

                await sendEarningUpdateEmail(
                    user.email,
                    user.username || user.Fullname,
                    refundAmount,
                    'increment',
                    `Refund for budget decrease (after 2% tax) of Fworkk Prime project: "${project.title}"`
                );
            }
            
            project.budget = newBudget;
            await user.save();
        }

        // Update other fields
        const updatableFields = [
            'title', 'description', 'category',
            'skillsRequired', 'links', 'attachments', 'teamSize',
            'teamRoles', 'teamSelectionType', 'timeline', 'priority',
            'projectType', 'privacy', 'additionalNotes'
        ];

        updatableFields.forEach(field => {
            if (req.body[field] !== undefined) {
                project[field] = req.body[field];
            }
        });

        // Recalculate duration if timeline changed
        if (req.body.timeline) {
            const startDate = new Date(req.body.timeline.startDate || project.timeline.startDate);
            const endDate = new Date(req.body.timeline.endDate || project.timeline.endDate);
            project.timeline.estimatedDuration = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
        }

        // Validate team roles total matches team size if either changed
        const finalTeamSize = project.teamSize;
        const totalRolesQuantity = project.teamRoles.reduce((sum, role) => sum + role.quantity, 0);
        
        if (finalTeamSize > totalRolesQuantity) {
            // Auto-adjust: Add difference to the last role or create a generic one if empty
            const diff = finalTeamSize - totalRolesQuantity;
            
            if (project.teamRoles.length > 0) {
                // Add to last role
                project.teamRoles[project.teamRoles.length - 1].quantity += diff;
            } else {
                // Create default role
                project.teamRoles.push({
                    role: 'Other',
                    quantity: diff,
                    skills: []
                });
            }
        } else if (totalRolesQuantity > finalTeamSize) {
             // If reducing size, we still enforce manual role reduction to avoid accidental data loss
             return res.status(400).json({
                success: false,
                message: `Total team roles quantity (${totalRolesQuantity}) exceeds new team size (${finalTeamSize}). Please reduce role quantities first.`
            });
        }

        await project.save();
        await project.populate('clientId', 'Fullname email profileImage');

        res.status(200).json({
            success: true,
            message: "Project request updated successfully",
            data: project,
            newBalance: user.totalEarnings
        });

    } catch (error) {
        console.error("Error updating project:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// @desc    Delete project request
// @route   DELETE /api/project-requests/:id
// @access  Private (Client only)
export const deleteProjectRequest = async (req, res) => {
    try {
        const clientId = req.user.id;
        const project = await FworkkPrimeModel.findById(req.params.id);

        if (!project) {
            return res.status(404).json({
                success: false,
                message: "Project request not found"
            });
        }

        // Check if owner or admin
        const isOwner = project.clientId.toString() === req.user.id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Not authorized to delete this project"
            });
        }

        // Check if project can be deleted
        if (project.status !== 'Not_Started') {
            return res.status(400).json({
                success: false,
                message: "Cannot delete project once it's started"
            });
        }

        await project.deleteOne();

        res.status(200).json({
            success: true,
            message: "Project request deleted successfully"
        });

    } catch (error) {
        console.error("Error deleting project:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// @desc    Get available roles/categories
// @route   GET /api/project-requests/roles
// @access  Public
export const getAvailableRoles = (req, res) => {
    const roles = [
        'Frontend Developer',
        'Backend Developer',
        'Full Stack Developer',
        'UI/UX Designer',
        'WordPress Developer',
        'Mobile App Developer',
        'Shopify Developer',
        'QA Tester',
        'Project Manager',
        'DevOps Engineer',
        'Database Administrator',
        'AI/ML Engineer',
        'Other'
    ];

    const categories = [
        'Website Development',
        'Frontend Development',
        'Backend Development',
        'Full Stack Development',
        'WordPress Development',
        'Shopify Development',
        'Ecommerce Website Development',
        'Mobile App Development',
        'Android App Development',
        'iOS App Development',
        'React Native Development',
        'Flutter App Development',
        'UI/UX Design',
        'Web App Bug Fixing',
        'API Integration',
        'Custom Software Development',
        'Landing Page Development',
        'Web Maintenance',
        'AI integration Management',
        'Other'
    ];

    res.status(200).json({
        success: true,
        data: {
            roles,
            categories
        }
    });
};

// @desc    Add freelancer to project (Client selection)
// @route   POST /api/project-requests/:id/freelancers
// @access  Private (Client only)
export const addFreelancerToProject = async (req, res) => {
    try {
        const clientId = req.user.id.toString();
        const { freelancerId, role } = req.body;

        const project = await FworkkPrimeModel.findById(req.params.id);

        if (!project) {
            return res.status(404).json({
                success: false,
                message: "Project not found"
            });
        }

        // Check authorization
        const isOwner = project.clientId.toString() === clientId;
        const userRole = (req.user.role || '').toLowerCase();
        const isAdmin = userRole === 'admin';


        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Not authorized. Only project owner or admin can add team members."
            });
        }

        // Check if freelancer exists
        const freelancer = await UserModel.findById(freelancerId);
        if (!freelancer || freelancer.UserType !== 'freelancer') {
            return res.status(404).json({
                success: false,
                message: "Freelancer not found"
            });
        }

        // Check if freelancer is already added
        const alreadyAdded = project.selectedFreelancers.find(
            f => f.freelancerId.toString() === freelancerId
        );

        if (alreadyAdded) {
            return res.status(400).json({
                success: false,
                message: "Freelancer already added to this project"
            });
        }

        // Check team size limit (exclude rejected members)
        const activeFreelancers = project.selectedFreelancers.filter(
            f => f.status !== 'Not Accepted'
        );

        if (activeFreelancers.length >= project.teamSize) {
             return res.status(400).json({
                success: false,
                message: `Team size limit reached (${project.teamSize} active/pending members). Please remove a member or wait for rejections to add another.`
            });
        }

        // Add freelancer
        project.selectedFreelancers.push({
            freelancerId,
            role,
            selectedAt: new Date(),
            selectedBy: isAdmin ? 'admin' : 'client',
            status: 'Checking'
        });

        // Auto-update project status to team_selection if it was Started or Not_Started
        if (project.status === 'Started' || project.status === 'Not_Started') {
            project.status = 'team_selection';
        }

        await project.save();

        // Send Invitation Email
        try {
             // Get client details for the email
             const clientUser = await UserModel.findById(clientId);
             
            await sendPrimeInvitationEmail(freelancer, project, role, clientUser);
        } catch (emailError) {
            console.error("Error sending invitation email:", emailError);
        }

        // Populate freelancer details for immediately updating UI
        const populatedProject = await FworkkPrimeModel.findById(req.params.id)
            .populate('selectedFreelancers.freelancerId', 'Fullname email profileImage role');

        res.status(200).json({
            success: true,
            message: "Freelancer added to project",
            data: populatedProject.selectedFreelancers,
            projectStatus: project.status
        });

    } catch (error) {
        console.error("Error adding freelancer:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

export const launchPrimeProject = async (req, res) => {
    try {
        const { id } = req.params;
        // Populate freelancers and client to send emails
        const project = await FworkkPrimeModel.findById(id)
            .populate('selectedFreelancers.freelancerId')
            .populate('clientId');

        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        // Check ownership
        const clientId = project.clientId._id || project.clientId;
        if (clientId.toString() !== req.user.id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: "Not authorized" });
        }

        project.status = 'Worked Started';
        await project.save();

        // Send Email to all ACCEPTED freelancers
        const acceptedFreelancers = project.selectedFreelancers.filter(
            member => member.status === 'Accepted' && member.freelancerId
        );

        console.log(`🚀 Project Launched. Sending emails to ${acceptedFreelancers.length} team members...`);

        // Send emails in parallel but don't block the response
        Promise.all(acceptedFreelancers.map(member => {
            return sendProjectLaunchedEmail(member.freelancerId, project, project.clientId);
        })).catch(err => console.error("Error sending launch emails:", err));

        // Send confirmation email to CLIENT as well
        await sendProjectLaunchedClientEmail(project.clientId, project);

        res.status(200).json({
            success: true,
            message: "Project launched successfully! Status is now Work Started.",
            data: project
        });
    } catch (error) {
        console.error("Error launching project:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// @desc    Get all project requests (Admin only)
// @route   GET /api/project-requests/all-requests
// @access  Private (Admin)
export const getAllProjectRequests = async (req, res) => {
    try {
        const projects = await FworkkPrimeModel.find({})
            .populate('clientId', 'Fullname email profileImage')
            .populate('selectedFreelancers.freelancerId', 'Fullname email profileImage skills rating')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: projects.length,
            data: projects
        });

    } catch (error) {
        console.error("Error fetching all projects:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

export const updateProjectStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const project = await FworkkPrimeModel.findById(id);

        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        // Authorization Check
        const isAdmin = req.user.role === 'admin';
        const userId = req.user.id || req.user._id; // Handle both cases for safety
        const isOwner = project.clientId.toString() === userId.toString();

        if (!isAdmin && !isOwner) {
            return res.status(403).json({ success: false, message: "Unauthorized: only Admin or Project Owner can update status" });
        }

        // Restriction Check: If status is 'On Hold' or 'completed', check tasks
        if (status === 'On Hold' || status === 'completed') {
            let hasIncompleteTasks = false;
            project.selectedFreelancers.forEach(f => {
                if (f.tasks && f.tasks.length > 0) {
                    f.tasks.forEach(t => {
                        // Only 'Approved' and 'Cancelled' are considered "finished"
                        if (['Pending', 'In Progress', 'Submitted', 'Revision'].includes(t.status)) {
                            hasIncompleteTasks = true;
                        }
                    });
                }
            });

            if (hasIncompleteTasks) {
                return res.status(400).json({
                    success: false,
                    message: "You have some task as a pending, please approved it or cancel it before completing/pausing the project."
                });
            }
        }

        // Handle Refund if Project is Completed
        if (status === 'completed' && project.status !== 'completed') {
            const totalAssigned = project.selectedFreelancers.reduce((acc, f) => {
                const p = f.payoutRecords?.reduce((pa, r) => pa + (r.status !== 'cancelled' ? r.amount : 0), 0) || 0;
                const t = f.tasks?.reduce((ta, rs) => ta + (rs.status !== 'Cancelled' ? rs.amount : 0), 0) || 0;
                return acc + p + t;
            }, 0);

            const remainingBudget = project.budget - totalAssigned;

            if (remainingBudget > 0) {
                const client = await UserModel.findById(project.clientId);
                if (client) {
                    // 2% Tax
                    const tax = remainingBudget * 0.02;
                    const refundAmount = remainingBudget - tax;

                    client.totalEarnings = (client.totalEarnings || 0) + refundAmount;
                    client.totalSpend = (client.totalSpend || 0) - refundAmount; // Reduce spend by what was actually returned

                    if (!client.EarningLogs) client.EarningLogs = [];
                    client.EarningLogs.push({
                        amount: refundAmount,
                        date: new Date(),
                        reason: `Remaining budget refund (2% tax deducted) for completed Fworkk Prime Project: ${project.title}`
                    });

                    await client.save();

                    // Send Email Update
                    await sendEarningUpdateEmail(
                        client.email,
                        client.username || client.Fullname,
                        refundAmount,
                        'increment',
                        `Refund for remaining project budget after 2% tax for: "${project.title}"`
                    );
                }
            }
            project.completedAt = new Date();
        }

        project.status = status;
        await project.save();

        res.status(200).json({
            success: true,
            data: project,
            message: `Status updated to ${status} successfully. ${status === 'completed' ? 'Remaining budget (if any) has been refunded to your wallet after 2% tax.' : ''}`
        });
    } catch (error) {
        console.error("Error updating status:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// @desc    Get Prime invitations for a freelancer
// @route   GET /api/project-requests/invitations
// @access  Private (Freelancer only)
export const getPrimeInvitations = async (req, res) => {
    try {
        await autoRejectPrimeInvitations();
        const freelancerId = req.user.id;
        console.log("Fetching Prime invitations for freelancer:", freelancerId);

        const invitations = await FworkkPrimeModel.find({
            "selectedFreelancers": {
                $elemMatch: {
                    freelancerId: freelancerId,
                    status: 'Checking'
                }
            }
        })
        .populate('clientId', 'Fullname email profileImage')
        .sort({ createdAt: -1 });

        console.log(`Found ${invitations.length} Prime invitations`);

        // Format invitations to include specific freelancer details for the frontend
        const formattedInvitations = invitations.map(project => {
            const freelancerInfo = project.selectedFreelancers.find(
                f => f.freelancerId.toString() === freelancerId.toString()
            );
            return {
                _id: project._id,
                title: project.title,
                description: project.description,
                budget: project.budget,
                category: project.category,
                role: freelancerInfo.role,
                status: freelancerInfo.status,
                client: project.clientId,
                selectedAt: freelancerInfo.selectedAt,
                createdAt: project.createdAt
            };
        });

        res.status(200).json({
            success: true,
            count: formattedInvitations.length,
            data: formattedInvitations
        });

    } catch (error) {
        console.error("Error fetching Prime invitations:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// @desc    Respond to Prime invitation
// @route   POST /api/project-requests/respond-invitation
// @access  Private (Freelancer only)
export const respondToInvitation = async (req, res) => {
    try {
        const freelancerId = req.user.id;
        const { projectId, status } = req.body;

        if (!['Accepted', 'Not Accepted'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status. Must be 'Accepted' or 'Not Accepted'."
            });
        }

        const project = await FworkkPrimeModel.findById(projectId);

        if (!project) {
            return res.status(404).json({
                success: false,
                message: "Project not found"
            });
        }

        const freelancerIndex = project.selectedFreelancers.findIndex(
            f => f.freelancerId.toString() === freelancerId.toString()
        );

        if (freelancerIndex === -1) {
            return res.status(403).json({
                success: false,
                message: "You are not invited to this project"
            });
        }

        project.selectedFreelancers[freelancerIndex].status = status;
        
        // If accepted, add to assignedAt if it's the first one? Or maybe handle project status
        // For now, just update the freelancer status as requested.
        await project.save();

        if (status === 'Not Accepted') {
            // Find a replacement automatically if project is auto/mixed
            autoHireFreelancers(project._id);
        }

        if (status === 'Accepted') {
            try {
                const freelancerUser = await UserModel.findById(freelancerId);
                
                if (freelancerUser) {
                    await sendPrimeWelcomeEmail(freelancerUser, project);
                }
            } catch (emailError) {
                console.error("Error sending welcome email:", emailError);
            }

            // Check if ALL team members have accepted
            const acceptedCount = project.selectedFreelancers.filter(f => f.status === 'Accepted').length;
            
            if (project.teamSize && acceptedCount >= project.teamSize) {
                try {
                    const projectOwner = await UserModel.findById(project.clientId);
                    if (projectOwner) {
                        await sendTeamReadyEmail(projectOwner, project);
                    }
                } catch (readyEmailError) {
                    console.error("Error sending team ready email:", readyEmailError);
                }
            }
        }

        res.status(200).json({
            success: true,
            message: `Invitation ${status.toLowerCase()} successfully`,
            data: project.selectedFreelancers[freelancerIndex]
        });

    } catch (error) {
        console.error("Error responding to invitation:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

export const autoRejectPrimeInvitations = async () => {
    try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const result = await FworkkPrimeModel.updateMany(
            { 
                "selectedFreelancers": { 
                    $elemMatch: { 
                        status: 'Checking',
                        selectedAt: { $lt: twentyFourHoursAgo }
                    } 
                } 
            },
            {
                $set: {
                    "selectedFreelancers.$[elem].status": 'Not Accepted'
                }
            },
            {
                arrayFilters: [
                    { 
                        "elem.status": 'Checking', 
                        "elem.selectedAt": { $lt: twentyFourHoursAgo }
                    }
                ]
            }
        );
        
        if (result.modifiedCount > 0) {
            console.log(`Auto-rejected ${result.modifiedCount} Prime invitations.`);
            
            // Find projects that now need replacements
            const projectsWithRejections = await FworkkPrimeModel.find({
                "selectedFreelancers.status": 'Not Accepted',
                "teamSelectionType": { $in: ['auto', 'mixed'] },
                "status": { $in: ['Not_Started', 'team_selection'] }
            }).select('_id');

            for (const p of projectsWithRejections) {
                autoHireFreelancers(p._id);
            }
        }
        return result;
    } catch (error) {
        console.error("Error in autoRejectPrimeInvitations:", error);
    }
};

// @desc    Send task reminder email
// @route   POST /email/reminder
// @access  Private (Client/Freelancer)
export const sendTaskReminder = async (req, res) => {
  try {
    const { type, taskId, taskName, assigneeEmail, assigneeName, dueDate, projectId, projectTitle } = req.body;
    await sendTaskReminderEmail(assigneeEmail, assigneeName, taskName, projectTitle, dueDate, projectId, type);
    res.status(200).json({ success: true, message: 'Reminder email sent' });
  } catch (error) {
    console.error('❌ Error sending task reminder:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

export const getFreelancersForHiring = async (req, res) => {
    try {
        const freelancers = await UserModel.find({ UserType: 'freelancer' })
            .select('Fullname profileImage rating completedProjects skills availability')
            .lean();

        // Custom sort: online first
        freelancers.sort((a, b) => {
            if (a.availability === 'online' && b.availability !== 'online') return -1;
            if (a.availability !== 'online' && b.availability === 'online') return 1;
            return 0;
        });

        res.status(200).json({
            success: true,
            count: freelancers.length,
            data: freelancers
        });
    } catch (error) {
        console.error("Error fetching freelancers:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// @desc    Get accepted Prime projects for a freelancer
// @route   GET /api/fworkprime/accepted-projects
// @access  Private (Freelancer only)
export const getAcceptedPrimeProjects = async (req, res) => {
    try {
        const freelancerId = req.user.id;
        
        const projects = await FworkkPrimeModel.find({
            "selectedFreelancers": {
                $elemMatch: {
                    freelancerId: freelancerId,
                    status: 'Accepted'
                }
            }
        }).select('_id title description budget category teamSize teamRoles timeline status priority skillsRequired createdAt selectedFreelancers');

        const formattedProjects = projects.map(project => {
            const myInfo = project.selectedFreelancers.find(f => f.freelancerId.toString() === freelancerId.toString());
            const projectObj = project.toObject();
            delete projectObj.selectedFreelancers;
            return {
                ...projectObj,
                myRole: myInfo ? myInfo.role : 'Member',
                payoutRecords: myInfo ? (myInfo.payoutRecords || []) : []
            };
        });

        res.status(200).json({
            success: true,
            count: formattedProjects.length,
            data: formattedProjects
        });

    } catch (error) {
        console.error("Error fetching accepted Prime projects:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// @desc    Get Prime projects history for any freelancer (public/client view)
// @route   GET /api/fworkprime/freelancer-history/:freelancerId
// @access  Private
export const getFreelancerPrimeHistory = async (req, res) => {
    try {
        const { freelancerId } = req.params;
        
        const projects = await FworkkPrimeModel.find({
            "selectedFreelancers": {
                $elemMatch: {
                    freelancerId: freelancerId,
                    status: 'Accepted'
                }
            }
        }).select('_id title description budget category status createdAt selectedFreelancers');

        const formattedProjects = projects.map(project => {
            const info = project.selectedFreelancers.find(f => f.freelancerId.toString() === freelancerId.toString());
            const projectObj = project.toObject();
            delete projectObj.selectedFreelancers;
            
            return {
                ...projectObj,
                role: info ? info.role : 'Member',
                tasks: info ? info.tasks : [],
                payoutRecords: info ? info.payoutRecords : []
            };
        });

        res.status(200).json({
            success: true,
            data: formattedProjects
        });

    } catch (error) {
        console.error("Error fetching freelancer prime history:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

export const addPayoutRecord = async (req, res) => {
    try {
        const { projectId, freelancerId, amount, description, type = "fixed" } = req.body;

        if (!projectId || !freelancerId || !amount) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        const project = await FworkkPrimeModel.findById(projectId);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        // Check authorization (Admin or Project Owner)
        if (project.clientId.toString() !== req.user.id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: "Not authorized" });
        }

        const freelancerIndex = project.selectedFreelancers.findIndex(
            f => f.freelancerId.toString() === freelancerId.toString()
        );

        if (freelancerIndex === -1) {
            return res.status(404).json({ success: false, message: "Freelancer not found in this project" });
        }

        // Create new payout record
        const newRecord = {
            amount: Number(amount),
            description: description || "Project Milestone",
            type,
            status: "locked",
            createdAt: new Date()
        };

        project.selectedFreelancers[freelancerIndex].payoutRecords.push(newRecord);
        const savedProject = await project.save();

        // Get the ID of the newly created payout record
        const updatedMember = savedProject.selectedFreelancers[freelancerIndex];
        const newPayoutRecord = updatedMember.payoutRecords[updatedMember.payoutRecords.length - 1];
        const payoutRecordId = newPayoutRecord._id;

        // Set timeout to release payout after 10 minutes (600,000 ms)
        setTimeout(async () => {
            try {
                const p = await FworkkPrimeModel.findById(projectId);
                if (!p) return;
                
                const fIndex = p.selectedFreelancers.findIndex(f => f.freelancerId.toString() === freelancerId.toString());
                if (fIndex === -1) return;
                
                const rIndex = p.selectedFreelancers[fIndex].payoutRecords.findIndex(r => r._id.toString() === payoutRecordId.toString());
                if (rIndex === -1) return;
                
                const record = p.selectedFreelancers[fIndex].payoutRecords[rIndex];
                
                if (record.status === 'locked') {
                    record.status = 'released';
                    await p.save();
                    
                    // Increment user total earnings
                    await UserModel.findByIdAndUpdate(freelancerId, {
                        $inc: { totalEarnings: Number(amount) },
                        $push: { EarningLogs: { 
                            amount: Number(amount), 
                            date: new Date(),
                            reason: `Fworkk Prime Payout: ${p.title} (${record.description})`
                        } }
                    });
                    
                    console.log(`Payout ${payoutRecordId} automatically released after 10 minutes for user ${freelancerId}`);
                }
            } catch (err) {
                console.error("Error in auto-releasing payout:", err);
            }
        }, 10 * 60 * 1000);

        res.status(200).json({
            success: true,
            message: "Payout record added successfully and will be released in 10 minutes",
            data: updatedMember.payoutRecords
        });

    } catch (error) {
        console.error("Error adding payout record:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

export const updatePayoutStatus = async (req, res) => {
    try {
        const { projectId, freelancerId, payoutRecordId, status } = req.body;

        if (!projectId || !freelancerId || !payoutRecordId || !status) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        if (!['released', 'cancelled', 'locked'].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status" });
        }

        const project = await FworkkPrimeModel.findById(projectId);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        // Check authorization (Admin or Project Owner)
        const clientId = project.clientId._id || project.clientId;
        if (clientId.toString() !== req.user.id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: "Not authorized" });
        }

        const freelancerIndex = project.selectedFreelancers.findIndex(
            f => f.freelancerId.toString() === freelancerId.toString()
        );

        if (freelancerIndex === -1) {
            return res.status(404).json({ success: false, message: "Freelancer not found in this project" });
        }

        const recordIndex = project.selectedFreelancers[freelancerIndex].payoutRecords.findIndex(
            r => r._id.toString() === payoutRecordId.toString()
        );

        if (recordIndex === -1) {
            return res.status(404).json({ success: false, message: "Payout record not found" });
        }

        const oldStatus = project.selectedFreelancers[freelancerIndex].payoutRecords[recordIndex].status;
        project.selectedFreelancers[freelancerIndex].payoutRecords[recordIndex].status = status;
        await project.save();

        // If status changed from locked to released, update user earnings
        if (oldStatus === 'locked' && status === 'released') {
            const amount = project.selectedFreelancers[freelancerIndex].payoutRecords[recordIndex].amount;
            await UserModel.findByIdAndUpdate(freelancerId, {
                $inc: { totalEarnings: Number(amount) },
                $push: { EarningLogs: { amount: Number(amount), date: new Date() } }
            });
            console.log(`Payout manually released for user ${freelancerId}. Amount: ${amount}`);
        }

        res.status(200).json({
            success: true,
            message: `Payout record ${status} successfully`,
            data: project.selectedFreelancers[freelancerIndex].payoutRecords[recordIndex]
        });

    } catch (error) {
        console.error("Error updating payout status:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

export const sendPrimeMessage = async (req, res) => {
    try {
        const { projectId, content, messageType = 'text', fileUrl, fileName, fileSize } = req.body;
        const senderId = req.user.id;

        if (!projectId || !content) {
            return res.status(400).json({ success: false, message: "Missing project ID or content" });
        }

        const project = await FworkkPrimeModel.findById(projectId);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        // Check authorization
        const clientId = project.clientId._id || project.clientId;
        const isClient = clientId.toString() === senderId.toString();
        const isAdmin = req.user.role === 'admin';
        const isFreelancerInTeam = project.selectedFreelancers.some(
            f => f.freelancerId && f.freelancerId.toString() === senderId.toString() && f.status === 'Accepted'
        );

        if (!isClient && !isAdmin && !isFreelancerInTeam) {
            return res.status(403).json({ success: false, message: "Not authorized to send messages in this project" });
        }

        let senderType = 'system';
        if (isAdmin) senderType = 'admin';
        else if (isClient) senderType = 'client';
        else if (isFreelancerInTeam) senderType = 'freelancer';

        let finalFileUrl = fileUrl;
        let finalMessageType = messageType;
        let finalFileName = fileName;
        let finalFileSize = fileSize;

        // Check for file in request (streamed via multer) or body (base64)
        let fileData = null;
        if (req.file) {
             fileData = {
                 buffer: req.file.buffer,
                 originalname: req.file.originalname,
                 mimetype: req.file.mimetype,
                 size: req.file.size
             };
        } else if (req.body.file && req.body.file.base64) {
             fileData = req.body.file;
        }

        // Upload to Cloudinary if file exists
        if (fileData) {
            try {
                const uploadResult = await uploadImageToCloudinary(fileData, 'prime-chat-files');
                finalFileUrl = uploadResult.url;
                finalFileName = uploadResult.filename;
                finalFileSize = uploadResult.size;

                // Determine message type based on mimetype
                const mimeType = fileData.mimetype || fileData.type;
                if (mimeType && mimeType.startsWith('image/')) {
                    finalMessageType = 'image';
                } else {
                    finalMessageType = 'file';
                }
            } catch (err) {
                console.error("Cloudinary upload failed in chat:", err);
                return res.status(500).json({ success: false, message: "File upload failed" });
            }
        }

        const newMessage = {
            senderId,
            senderType,
            messageType: finalMessageType,
            content,
            fileUrl: finalFileUrl,
            fileName: finalFileName,
            fileSize: finalFileSize,
            createdAt: new Date()
        };

        project.messages.push(newMessage);
        await project.save();

        // Populate the sender details before sending back
        const populatedProject = await FworkkPrimeModel.findById(projectId)
            .select('messages')
            .populate({
                path: 'messages.senderId',
                select: 'Fullname profileImage'
            });


        const savedMessage = populatedProject.messages[populatedProject.messages.length - 1];

        // Emit socket event for real-time chat
        if (req.io) {
            req.io.to(projectId).emit("receive_prime_message", savedMessage);
            console.log(`📡 Emitted receive_prime_message to room ${projectId}`);
        }

        res.status(200).json({
            success: true,
            message: "Message sent successfully",
            data: savedMessage
        });

    } catch (error) {
        console.error("Error sending Prime message:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

export const getPrimeMessages = async (req, res) => {
    try {
        const { id } = req.params;
        const project = await FworkkPrimeModel.findById(id).select('messages').populate('messages.senderId', 'Fullname profileImage');
        
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        res.status(200).json({
            success: true,
            data: project.messages
        });
    } catch (error) {
        console.error("Error fetching Prime messages:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

export const addTask = async (req, res) => {
    try {
        const { projectId, freelancerId, amount, title, description, dueDate, assignedTo } = req.body;

        if (!projectId || !freelancerId || !description) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        const project = await FworkkPrimeModel.findById(projectId);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        // Check authorization (Admin or Project Owner)
        const clientId = project.clientId._id || project.clientId;
        if (clientId.toString() !== req.user.id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: "Not authorized" });
        }

        const freelancerIndex = project.selectedFreelancers.findIndex(
            f => f.freelancerId.toString() === freelancerId.toString()
        );

        if (freelancerIndex === -1) {
            return res.status(404).json({ success: false, message: "Freelancer not found in this project" });
        }

        const taskAmount = Number(amount) || 0;

        // Calculate currently assigned budget (Active tasks + Active payouts)
        const totalAssigned = project.selectedFreelancers.reduce((acc, f) => {
            const p = f.payoutRecords?.reduce((pa, r) => pa + (r.status !== 'cancelled' ? r.amount : 0), 0) || 0;
            const t = f.tasks?.reduce((ta, rs) => ta + (rs.status !== 'Cancelled' ? rs.amount : 0), 0) || 0;
            return acc + p + t;
        }, 0) || 0;

        // Check if project has enough budget
        if (totalAssigned + taskAmount > project.budget) {
            return res.status(400).json({ 
                success: false, 
                message: `Insufficient project budget. Remaining: $${project.budget - totalAssigned}, Required: $${taskAmount}` 
            });
        }

        // Create new task
        const newTask = {
            title,
            assignedTo,
            description,
            amount: taskAmount,
            dueDate: dueDate ? new Date(dueDate) : null,
            status: "Pending",
            createdAt: new Date()
        };

        if (!project.selectedFreelancers[freelancerIndex].tasks) {
            project.selectedFreelancers[freelancerIndex].tasks = [];
        }

        project.selectedFreelancers[freelancerIndex].tasks.push(newTask);
        await project.save();

        // Send email notification to freelancer
        try {
            const freelancerUser = await UserModel.findById(freelancerId);
            if (freelancerUser) {
                await sendTaskAssignedEmail(freelancerUser, project, newTask);

                 // Send automated chat message in the project group
                 const systemMessage = {
                    senderId: clientId, // Or system ID, but client initiated it
                    senderType: 'system',
                    messageType: 'text',
                    content: `📋 **New Task Assigned**\n\nThe task **"${newTask.title}"** has been assigned to **${freelancerUser.Fullname || freelancerUser.username}**.\n\nDescription: ${newTask.description.substring(0, 100)}${newTask.description.length > 100 ? '...' : ''}\nDue Date: ${new Date(newTask.dueDate).toLocaleDateString()}`,
                    createdAt: new Date()
                };
                project.messages.push(systemMessage);
                await project.save();

                // Emit system message via socket
                if (req.io) {
                   req.io.to(projectId).emit("receive_prime_message", systemMessage);
                }
            }
        } catch (emailErr) {
            console.error("Error sending task assignment email or chat message:", emailErr);
        }

        res.status(200).json({
            success: true,
            message: "Task added successfully & email sent",
            data: project.selectedFreelancers[freelancerIndex].tasks
        });

    } catch (error) {
        console.error("Error adding task:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

export const updateTaskStatus = async (req, res) => {
    try {
        const { 
            projectId, 
            freelancerId, 
            taskId, 
            status, 
            cancellationReason, 
            cancellationCategory,
            rating,
            review 
        } = req.body;

        if (!projectId || !freelancerId || !taskId || !status) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        const project = await FworkkPrimeModel.findById(projectId)
            .populate('clientId', 'Fullname email')
            .populate('selectedFreelancers.freelancerId', 'Fullname email totalEarnings rating completedProjects');
            
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        const isFreelancer = freelancerId.toString() === req.user.id.toString();
        const clientUser = project.clientId;
        const isClient = clientUser._id.toString() === req.user.id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isFreelancer && !isClient && !isAdmin) {
             return res.status(403).json({ success: false, message: "Not authorized" });
        }

        const freelancerIndex = project.selectedFreelancers.findIndex(
            f => (f.freelancerId._id || f.freelancerId).toString() === freelancerId.toString()
        );

        if (freelancerIndex === -1) {
            return res.status(404).json({ success: false, message: "Freelancer not found in this project" });
        }

        const taskIndex = project.selectedFreelancers[freelancerIndex].tasks.findIndex(
            t => t._id.toString() === taskId.toString()
        );

        if (taskIndex === -1) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }

        const task = project.selectedFreelancers[freelancerIndex].tasks[taskIndex];
        const prevStatus = task.status;

        // Prevent redundant status updates for finished states
        if (prevStatus === 'Approved' || prevStatus === 'Cancelled') {
            return res.status(400).json({ success: false, message: `Task is already ${prevStatus}` });
        }

        const freelancerUser = await UserModel.findById(freelancerId);
        if (!freelancerUser) {
            return res.status(404).json({ success: false, message: "Freelancer user not found" });
        }

        // Logic for Cancelled
        if (status === 'Cancelled') {
            if (!isClient && !isAdmin) {
                return res.status(403).json({ success: false, message: "Only client or admin can cancel tasks" });
            }
            
            // Refund task amount back to project budget (Logic removed: budget is now constant total, remaining is calculated)
            task.cancellationReason = cancellationReason;
            task.cancellationCategory = cancellationCategory;
            task.status = 'Cancelled';
            
            await project.save();
            
            // Send emails
            await sendTaskCancelledFreelancerEmail(freelancerUser, project, task, { cancellationReason, cancellationCategory });
            await sendTaskCancelledClientEmail(clientUser, project, task);
        } 
        
        // Logic for Approved
        else if (status === 'Approved') {
            if (!isClient && !isAdmin) {
                return res.status(403).json({ success: false, message: "Only client or admin can approve tasks" });
            }

            // Update Rating and Completed Projects
            const taskRating = Number(rating) || 5;
            freelancerUser.completedProjects = (freelancerUser.completedProjects || 0) + 1;
            
            // Average rating logic
            if (freelancerUser.rating === 0 || !freelancerUser.rating) {
                freelancerUser.rating = taskRating;
            } else {
                freelancerUser.rating = ((freelancerUser.rating * (freelancerUser.completedProjects - 1)) + taskRating) / freelancerUser.completedProjects;
            }
            
            await freelancerUser.save();
            
            task.status = 'Approved';
            task.rating = taskRating;
            task.review = review;
            
            await project.save();
            
            // Send email
            await sendTaskApprovedFreelancerEmail(freelancerUser, project, task, { rating: taskRating, review });
        }
        
        // Other statuses (Pending -> In Progress -> Submitted -> Revision)
        else {
            const oldStatus = task.status;
            task.status = status;
            await project.save();

            // Notify client if task is submitted
            if (status === 'Submitted' && oldStatus !== 'Submitted') {
                try {
                    await sendTaskSubmittedClientEmail(clientUser, project, freelancerUser, task);
                } catch (err) {
                    console.error("Error sending submission notification:", err);
                }
            }
            
            // Notify freelancer if revision is requested
            if (status === 'Revision' && oldStatus !== 'Revision') {
                try {
                    await sendTaskRevisionFreelancerEmail(freelancerUser, project, task);
                } catch (err) {
                    console.error("Error sending revision notification:", err);
                }
            }
        }

        res.status(200).json({
            success: true,
            message: `Task status updated to ${status}`,
            data: project.selectedFreelancers[freelancerIndex].tasks[taskIndex]
        });

    } catch (error) {
        console.error("Error updating task status:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

export const requestPayout = async (req, res) => {
    try {
        const { projectId, amount, paymentMethod, paymentDetails } = req.body;
        const freelancerId = req.user.id;

        if (!projectId || !amount || !paymentMethod) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        const project = await FworkkPrimeModel.findById(projectId);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        const freelancerIndex = project.selectedFreelancers.findIndex(
            f => f.freelancerId.toString() === freelancerId.toString()
        );

        if (freelancerIndex === -1) {
            return res.status(404).json({ success: false, message: "You are not a member of this project" });
        }

        const member = project.selectedFreelancers[freelancerIndex];

        // Calculate available earnings
        const totalEarned = member.tasks?.reduce((acc, t) => acc + (t.status === 'Approved' ? t.amount : 0), 0) || 0;
        const totalPayouts = member.payoutRecords?.reduce((acc, p) => acc + (p.status !== 'cancelled' ? p.amount : 0), 0) || 0;
        const available = totalEarned - totalPayouts;

        if (Number(amount) > available) {
            return res.status(400).json({ 
                success: false, 
                message: `Insufficient balance. Available: $${available}`,
                available
            });
        }

        // Create new payout record
        const newRecord = {
            amount: Number(amount),
            description: `Withdrawal Request (${paymentMethod})`,
            type: "withdrawal",
            status: "locked",
            paymentMethod,
            paymentDetails,
            createdAt: new Date()
        };

        member.payoutRecords.push(newRecord);
        const savedProject = await project.save();
        
        // Get the ID of the newly created payout record
        const updatedMember = savedProject.selectedFreelancers[freelancerIndex];
        const newPayoutRecord = updatedMember.payoutRecords[updatedMember.payoutRecords.length - 1];
        const payoutRecordId = newPayoutRecord._id;

        // Set timeout to release payout after 10 minutes (600,000 ms)
        setTimeout(async () => {
            try {
                const p = await FworkkPrimeModel.findById(projectId);
                if (!p) return;
                
                const fIndex = p.selectedFreelancers.findIndex(f => f.freelancerId.toString() === freelancerId.toString());
                if (fIndex === -1) return;
                
                const rIndex = p.selectedFreelancers[fIndex].payoutRecords.findIndex(r => r._id.toString() === payoutRecordId.toString());
                if (rIndex === -1) return;
                
                const record = p.selectedFreelancers[fIndex].payoutRecords[rIndex];
                
                if (record.status === 'locked') {
                    record.status = 'released';
                    await p.save();
                    
                    // Increment user total earnings
                    await UserModel.findByIdAndUpdate(freelancerId, {
                        $inc: { totalEarnings: Number(amount) },
                        $push: { EarningLogs: { 
                            amount: Number(amount), 
                            date: new Date(),
                            reason: `Fworkk Prime Payout: ${p.title} (${record.description})`
                        } }
                    });
                    
                    console.log(`Payout ${payoutRecordId} automatically released after 10 minutes for user ${freelancerId}`);
                }
            } catch (err) {
                console.error("Error in auto-releasing payout:", err);
            }
        }, 10 * 60 * 1000);

        res.status(200).json({
            success: true,
            message: "Withdrawal request submitted successfully and will be released in 10 minutes.",
            data: updatedMember.payoutRecords
        });

    } catch (error) {
        console.error("Error requesting payout:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// @desc    Get new task notifications for freelancer
// @route   GET /api/fworkprime/task-notifications
// @access  Private (Freelancer)
export const getTaskNotifications = async (req, res) => {
    try {
        const freelancerId = req.user.id;
        
        // Find projects where user is a freelancer and has tasks with Status 'Pending' or 'Revision'
        const projects = await FworkkPrimeModel.find({
            "selectedFreelancers": {
                $elemMatch: {
                    freelancerId: freelancerId,
                    "tasks.status": { $in: ["Pending", "Revision"] } 
                }
            }
        }).select('_id title selectedFreelancers');

        let notifications = [];

        projects.forEach(project => {
            const member = project.selectedFreelancers.find(f => f.freelancerId.toString() === freelancerId.toString());
            if (member && member.tasks) {
                const notifyTasks = member.tasks.filter(t => ['Pending', 'Revision'].includes(t.status));
                
                notifyTasks.forEach(task => {
                    notifications.push({
                        _id: task._id, // task id
                        projectId: project._id,
                        projectTitle: project.title,
                        taskTitle: task.title,
                        description: task.description,
                        amount: task.amount,
                        dueDate: task.dueDate,
                        createdAt: task.createdAt,
                        type: task.status === 'Revision' ? 'task_revision' : 'task_assigned'
                    });
                });
            }
        });

        // Sort by newest first
        notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.status(200).json({
            success: true,
            count: notifications.length,
            data: notifications
        });

    } catch (error) {
        console.error("Error fetching task notifications:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// @desc    Get submitted task notifications for clients
// @route   GET /api/fworkprime/client-task-notifications
// @access  Private (Client)
export const getClientPrimeNotifications = async (req, res) => {
    try {
        const clientId = req.user.id;
        
        // Find projects where user is the client and has tasks with Status 'Submitted'
        const projects = await FworkkPrimeModel.find({
            clientId: clientId,
            "selectedFreelancers.tasks.status": "Submitted"
        }).populate('selectedFreelancers.freelancerId', 'Fullname username');

        let notifications = [];

        projects.forEach(project => {
            project.selectedFreelancers.forEach(member => {
                const submittedTasks = member.tasks.filter(t => t.status === 'Submitted');
                
                submittedTasks.forEach(task => {
                    notifications.push({
                        _id: task._id,
                        projectId: project._id,
                        projectTitle: project.title,
                        taskTitle: task.title,
                        submitterName: member.freelancerId?.Fullname || member.freelancerId?.username || "Expert",
                        submittedAt: task.updatedAt || task.createdAt,
                        type: 'prime_task_submitted'
                    });
                });
            });
        });

        // Sort by newest first
        notifications.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

        res.status(200).json({
            success: true,
            count: notifications.length,
            data: notifications
        });

    } catch (error) {
        console.error("Error fetching client prime notifications:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// @desc    Add funds to a project budget from user's earnings/balance
// @route   POST /api/fworkprime/add-funds
// @access  Private (Client/Admin)
export const addFundsToProject = async (req, res) => {
    try {
        const { projectId, amount } = req.body;
        const userId = req.user.id;

        if (!projectId || !amount || Number(amount) <= 0) {
            return res.status(400).json({ success: false, message: "Invalid project ID or amount" });
        }

        const project = await FworkkPrimeModel.findById(projectId);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        // Authorization check
        const isAdmin = req.user.role === 'admin';
        const isClient = project.clientId.toString() === userId.toString();

        if (!isAdmin && !isClient) {
            return res.status(403).json({ success: false, message: "Unauthorized to add funds to this project" });
        }

        // Check User Balance
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const addAmount = Number(amount);
        const userBalance = user.totalEarnings || 0;

        if (userBalance < addAmount) {
             return res.status(400).json({
                success: false,
                message: `Insufficient balance. Available: $${userBalance}, Required: $${addAmount}. Please go to Add Funds page and add some amount first.`
            });
        }



        // Deduct from user and add to project
        user.totalEarnings -= addAmount;
        project.budget += addAmount;

        // Log the spend
        user.totalSpend = (user.totalSpend || 0) + addAmount;
        if (!user.EarningLogs) user.EarningLogs = [];
        user.EarningLogs.push({
            amount: -addAmount,
            date: new Date(),
            reason: `Add Funds to Fworkk Prime Project: ${project.title}`
        });

        await user.save();
        await project.save();

        res.status(200).json({
            success: true,
            message: `Successfully added $${addAmount} to project budget`,
            newBudget: project.budget,
            userBalance: user.totalEarnings
        });
    } catch (error) {
        console.error("Error adding funds:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};
// Helper function to send invitation email
const sendPrimeInvitationHelper = async (freelancer, role, project, clientUser) => {
    try {
        await sendPrimeInvitationEmail(freelancer, project, role, clientUser);
    } catch (emailError) {
        console.error("Error sending invitation email helper:", emailError);
    }
};

// @desc    Logic for AI Auto-Hiring System
export const autoHireFreelancers = async (projectId) => {
    try {
        const project = await FworkkPrimeModel.findById(projectId);
        if (!project) return;

        // Only hire if selection type is 'auto' or 'mixed'
        if (project.teamSelectionType === 'manual') return;

        // Skip if project is already highly active
        if (['Worked Started', 'completed', 'cancelled'].includes(project.status)) return;

        const clientUser = await UserModel.findById(project.clientId);
        let updated = false;

        // Loop through each required role
        for (const roleObj of project.teamRoles) {
            const { role, quantity, skills: roleSkills } = roleObj;

            // Count how many freelancers are currently assigned/pending for THIS role
            const currentMembersCount = project.selectedFreelancers.filter(
                f => f.role === role && (f.status === 'Checking' || f.status === 'Accepted')
            ).length;

            const needed = quantity - currentMembersCount;
            if (needed <= 0) continue;

            const excludedIds = project.selectedFreelancers.map(f => f.freelancerId.toString());

            // Build search criteria (Combine role skills and general project skills for better matching)
            const searchSkills = Array.from(new Set([
                ...(roleSkills || []),
                ...(project.skillsRequired || [])
            ])).map(s => (typeof s === 'object' ? s?.name : s).toLowerCase());
            
            // Find ALL potential freelancers
            let potentialMatches = await UserModel.find({
                UserType: 'freelancer',
                _id: { $nin: excludedIds },
                accountStatus: 'active'
            }).select('Fullname email skills rating completedProjects availability profileImage').lean();

            // STRICT FILTER: Must have at least ONE matching skill
            potentialMatches = potentialMatches.filter(f => {
                const userSkills = (f.skills || []).map(s => (typeof s === 'object' ? s?.name : s).toLowerCase());
                return userSkills.some(us => searchSkills.includes(us));
            });

            // Score and Sort (Skills > Rating > Online > Projects)
            potentialMatches.sort((a, b) => {
                const getScore = (u) => {
                    let s = 0;
                    const uSkills = (u.skills || []).map(sk => (typeof sk === 'object' ? sk?.name : sk).toLowerCase());
                    const matchCount = uSkills.filter(sk => searchSkills.includes(sk)).length;
                    
                    // Priority 1: Skill Match (Major weight)
                    s += matchCount * 100;

                    // Priority 2: Quality (Rating)
                    if (u.rating >= 4.5) s += 80;
                    else if (u.rating >= 4) s += 40;

                    // Priority 3: Experience
                    s += (u.completedProjects || 0) * 10;

                    // Priority 4: Availability
                    if (u.availability === 'online') s += 30;

                    return s;
                };
                return getScore(b) - getScore(a);
            });

            // Take the best matches
            const toInvite = potentialMatches.slice(0, Math.min(needed, 5)); // Limit to avoid spamming but ensure we get enough

            for (const f of toInvite) {
                // Check if already added in this loop (safety)
                const alreadyAdded = project.selectedFreelancers.some(sf => sf.freelancerId.toString() === f._id.toString());
                if (alreadyAdded) continue;

                project.selectedFreelancers.push({
                    freelancerId: f._id,
                    role: role,
                    selectedAt: new Date(),
                    selectedBy: 'auto',
                    status: 'Checking'
                });
                updated = true;
                await sendPrimeInvitationHelper(f, role, project, clientUser);
            }
        }

        if (updated) {
            if (project.status === 'Not_Started') project.status = 'team_selection';
            await project.save();
            console.log(`AI Auto-Hired freelancers for project: ${project.title}`);
        }
    } catch (error) {
        console.error("AI Auto-Hire Logic Error:", error);
    }
};

// @desc    Manual Trigger for AI Auto-Hire
// @route   POST /api/fworkprime/:id/auto-hire
// @access  Private (Client/Admin)
export const triggerAutoHire = async (req, res) => {
    try {
        const project = await FworkkPrimeModel.findById(req.params.id);
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });

        // Authorization
        if (project.clientId.toString() !== req.user.id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: "Not authorized" });
        }

        await autoHireFreelancers(project._id);

        res.status(200).json({
            success: true,
            message: "AI system is searching for the best freelancers..."
        });
    } catch (error) {
        console.error("Trigger Auto Hire Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};


// Prime Video Call Logic
export const startPrimeCall = async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = req.user.id;

        const project = await FworkkPrimeModel.findById(projectId);
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });

        // Only owner or admin can start
        const isOwner = project.clientId.toString() === userId.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: "Only project owner or admin can start a video call" });
        }

        if (project.activeCallId) {
            return res.status(200).json({ 
                success: true, 
                message: "Call already in progress", 
                callId: project.activeCallId 
            });
        }

        const callId = `prime_${projectId}_${Date.now()}`;
        project.activeCallId = callId;
        project.callStartedAt = new Date();
        project.callStartedBy = userId;

        // Add system message
        project.messages.push({
            senderId: userId,
            senderType: 'system',
            content: `🎥 Video call started by ${isOwner ? 'Project Owner' : 'Fworkk Admin'}`,
            messageType: 'text',
            createdAt: new Date()
        });

        await project.save();

        if (req.io) {
            req.io.to(`project_${projectId}`).emit("primeCallStarted", {
                projectId,
                callId,
                startedBy: userId,
                startedByName: req.user.username || req.user.Fullname || "Owner"
            });
            
            // Sync messages/state
            req.io.to(`project_${projectId}`).emit("receive_prime_message", project.messages[project.messages.length - 1]);
        }

        res.status(200).json({
            success: true,
            callId,
            message: "Call started successfully"
        });
    } catch (error) {
        console.error("Error starting prime call:", error);
        res.status(500).json({ success: false, message: "Error starting call" });
    }
};

export const endPrimeCall = async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = req.user.id;
        const project = await FworkkPrimeModel.findById(projectId);
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });

        const isOwner = project.clientId.toString() === userId.toString();
        const isAdmin = req.user.role === 'admin';
        
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: "Only owner or admin can end calls" });
        }

        project.activeCallId = null;
        project.callStartedAt = null;
        project.callStartedBy = null;
        project.callJoinRequests = [];
        await project.save();

        if (req.io) {
            req.io.to(`project_${projectId}`).emit("primeCallEnded", { projectId });
        }

        res.status(200).json({ success: true, message: "Call ended successfully" });
    } catch (error) {
        console.error("Error ending prime call:", error);
        res.status(500).json({ success: false, message: "Error ending call" });
    }
};

export const joinPrimeCall = async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = req.user.id;

        const project = await FworkkPrimeModel.findById(projectId);
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });

        // Auto-approve owner and admin
        const isOwner = project.clientId.toString() === userId.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isAdmin) {
            // Check if user is in team first
            const isMember = project.selectedFreelancers.some(f => f.freelancerId?.toString() === userId.toString() && f.status === 'Accepted');
            if (!isMember) return res.status(403).json({ success: false, message: "You are not a member of this project" });

            // Allow direct join for team members
        }

        const token = streamClient.createToken(userId);
        
        res.status(200).json({
            success: true,
            token,
            apiKey: process.env.STREAM_API_KEY,
            appId: process.env.STREAM_APP_ID
        });
    } catch (error) {
        console.error("Error joining prime call:", error);
        res.status(500).json({ success: false, message: "Error getting token" });
    }
};

export const requestPrimeCallJoin = async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = req.user.id;

        const project = await FworkkPrimeModel.findById(projectId);
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });

        if (!project.activeCallId) return res.status(400).json({ success: false, message: "No active call" });

        // Check if already requested
        const existingRequest = (project.callJoinRequests || []).find(r => r.user?.toString() === userId.toString());
        if (existingRequest) {
            if (existingRequest.status === 'approved') return res.status(200).json({ success: true, message: "Already approved" });
            if (existingRequest.status === 'pending') return res.status(200).json({ success: true, message: "Request already pending" });
            // If denied, allow re-requesting? For now let's just update to pending
            existingRequest.status = 'pending';
            existingRequest.requestedAt = new Date();
        } else {
            project.callJoinRequests.push({ user: userId, status: 'pending' });
        }

        await project.save();

        if (req.io) {
            req.io.to(`project_${projectId}`).emit("primeCallJoinRequested", {
                projectId,
                userId,
                userName: req.user.username || req.user.Fullname || "A member"
            });
        }

        res.status(200).json({ success: true, message: "Join request sent" });
    } catch (error) {
        console.error("Error requesting call join:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export const approvePrimeCallJoin = async (req, res) => {
    try {
        const { projectId, userId: targetUserId } = req.params;
        const userId = req.user.id;

        const project = await FworkkPrimeModel.findById(projectId);
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });

        const isOwner = project.clientId.toString() === userId.toString();
        const isAdmin = req.user.role === 'admin';
        if (!isOwner && !isAdmin) return res.status(403).json({ success: false, message: "Unauthorized" });

        const request = (project.callJoinRequests || []).find(r => (r.user?._id || r.user)?.toString() === targetUserId.toString());
        if (!request) return res.status(404).json({ success: false, message: "Request not found" });

        request.status = 'approved';
        await project.save();

        if (req.io) {
            req.io.to(`project_${projectId}`).emit("primeCallJoinApproved", {
                projectId,
                userId: targetUserId
            });
        }

        res.status(200).json({ success: true, message: "Request approved" });
    } catch (error) {
        console.error("Error approving call join:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export const denyPrimeCallJoin = async (req, res) => {
    try {
        const { projectId, userId: targetUserId } = req.params;
        const userId = req.user.id;

        const project = await FworkkPrimeModel.findById(projectId);
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });

        const isOwner = project.clientId.toString() === userId.toString();
        const isAdmin = req.user.role === 'admin';
        if (!isOwner && !isAdmin) return res.status(403).json({ success: false, message: "Unauthorized" });

        const request = (project.callJoinRequests || []).find(r => (r.user?._id || r.user)?.toString() === targetUserId.toString());
        if (!request) return res.status(404).json({ success: false, message: "Request not found" });

        request.status = 'denied';
        await project.save();

        if (req.io) {
            req.io.to(`project_${projectId}`).emit("primeCallJoinDenied", {
                projectId,
                userId: targetUserId
            });
        }

        res.status(200).json({ success: true, message: "Request denied" });
    } catch (error) {
        console.error("Error denying call join:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

