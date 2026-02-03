import logger from './logger.js';

const requiredEnvVars = [
  'MONGODB_URL',
  'JWT_SECRET',
  'REFRESH_TOKEN_SECRET',
  'EMAIL_USER',
  'EMAIL_PASS',
  'EMAIL_HOST',
  'EMAIL_PORT',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET'
];

export const validateEnv = () => {
  const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

  if (missingVars.length > 0) {
    console.error('❌ FATAL: Missing required environment variables:');
    missingVars.forEach(v => {
      console.error(`   - ${v}`);
      logger.error(`Missing variable: ${v}`);
    });
    
    if (process.env.NODE_ENV === 'production') {
      console.error('🛑 SHUTTING DOWN: Application cannot start in production without these variables.');
      process.exit(1);
    } else {
      console.warn('⚠️ WARNING: Missing variables in development. Some features will fail.');
    }
  } else {
    logger.info('✅ All required environment variables are present.');
  }
};
