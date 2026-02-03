import cron from 'node-cron';
import FworkkPrimeModel from '../Model/FworkkPrimeModel.js';
import User from '../Model/UserModel.js';

const processPayouts = async () => {
    try {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        
        // Find projects that have at least one locked payout older than 10 minutes
        const projects = await FworkkPrimeModel.find({
            'selectedFreelancers.payoutRecords': {
                $elemMatch: {
                    status: 'locked',
                    createdAt: { $lte: tenMinutesAgo }
                }
            }
        });

        if (projects.length === 0) return;

        console.log(`[PayoutCron] Found ${projects.length} projects with potential pending payouts.`);

        for (const project of projects) {
            let projectUpdated = false;

            for (const freelancer of project.selectedFreelancers) {
                const freelancerId = freelancer.freelancerId;
                
                for (const payout of freelancer.payoutRecords) {
                    if (payout.status === 'locked' && new Date(payout.createdAt) <= tenMinutesAgo) {
                        payout.status = 'released';
                        projectUpdated = true;

                        // Update user earnings
                        const amount = Number(payout.amount);
                        await User.findByIdAndUpdate(freelancerId, {
                            $inc: { totalEarnings: amount },
                            $push: { 
                                EarningLogs: { 
                                    amount: amount, 
                                    date: new Date()
                                } 
                            }
                        });
                        console.log(`[PayoutCron] Released payout of $${amount} to freelancer ${freelancerId} for project ${project.title}`);
                    }
                }
            }

            if (projectUpdated) {
                await project.save();
            }
        }
    } catch (error) {
        console.error("[PayoutCron] Error:", error);
    }
};

// Run every minute
cron.schedule('* * * * *', processPayouts);

export default processPayouts;
