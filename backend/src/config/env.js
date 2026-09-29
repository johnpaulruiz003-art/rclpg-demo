import dotenv from 'dotenv';

dotenv.config();

// For demo/no-db mode we allow DATABASE_URL to be unset. JWT_SECRET may still
// be required when running the real backend with authentication, but for the
// demo flow we avoid throwing here to make local frontend-only runs simpler.

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  seedAdminUsername: process.env.SEED_ADMIN_USERNAME || 'admin',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345',
  seedAdminName: process.env.SEED_ADMIN_NAME || 'System Admin',
};
