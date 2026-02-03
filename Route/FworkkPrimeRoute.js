
// routes/projectRequestRoutes.js
import express from 'express';
import { isAdmin, requireSignIn } from '../middleware/UserMiddleware.js';
import { 
    addFreelancerToProject, 
    createProjectRequest, 
    deleteProjectRequest, 
    getAvailableRoles, 
    getMyProjectRequests, 
    getProjectRequest, 
    updateProjectRequest, 
    getAllProjectRequests, 
    updateProjectStatus, 
    getFreelancersForHiring, 
    getPrimeInvitations, 
    respondToInvitation, 
    getAcceptedPrimeProjects, 
    launchPrimeProject, 
    addPayoutRecord, 
    updatePayoutStatus, 
    sendPrimeMessage, 
    getPrimeMessages, 
    addTask, 
    updateTaskStatus, 
    requestPayout, 
    getTaskNotifications, 
    sendTaskReminder, 
    getClientPrimeNotifications, 
    addFundsToProject,
    triggerAutoHire
} from '../Controller.js/FworkkPrimeController.js';


const router = express.Router();

// Public routes
router.get('/roles', getAvailableRoles);

// Protected routes (Client only)
router.post('/request', requireSignIn,  createProjectRequest);
router.get('/my-projects', requireSignIn, getMyProjectRequests);
router.get('/freelancers-for-hiring', requireSignIn, getFreelancersForHiring);
router.get('/invitations', requireSignIn, getPrimeInvitations);
router.get('/accepted-projects', requireSignIn, getAcceptedPrimeProjects);
router.post('/respond-invitation', requireSignIn, respondToInvitation);
router.put('/launch/:id', requireSignIn, launchPrimeProject);
router.post('/add-payout', requireSignIn, addPayoutRecord);
router.put('/update-payout-status', requireSignIn, updatePayoutStatus);
router.post('/add-task', requireSignIn, addTask);
router.put('/update-task-status', requireSignIn, updateTaskStatus);
// Import chatUpload middleware
import chatUpload from '../middleware/chatUpload.js';

router.post('/send-message', requireSignIn, chatUpload.single('file'), sendPrimeMessage);
router.get('/messages/:id', requireSignIn, getPrimeMessages);
router.get('/request/:id', requireSignIn, getProjectRequest);
router.post('/request-payout', requireSignIn, requestPayout);
router.get('/task-notifications', requireSignIn, getTaskNotifications);
router.get('/client-task-notifications', requireSignIn, getClientPrimeNotifications);
router.post('/add-funds', requireSignIn, addFundsToProject);
router.post('/email/reminder', requireSignIn, sendTaskReminder);
router.post('/:id/auto-hire', requireSignIn, triggerAutoHire);

// Admin routes
router.get('/all-requests', requireSignIn, isAdmin, getAllProjectRequests);
router.put('/update-status/:id', requireSignIn, updateProjectStatus);

router.get('/:id', requireSignIn, getProjectRequest);
router.put('/:id', requireSignIn, updateProjectRequest);
router.delete('/:id', requireSignIn, deleteProjectRequest);
router.put('/:id/freelancers', requireSignIn, addFreelancerToProject);

export default router;
