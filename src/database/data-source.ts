import { config as loadDotenv } from 'dotenv';
import { DataSource } from 'typeorm';
import { createDatabaseOptionsFromEnvironment } from './database-options.factory';

loadDotenv({ quiet: true });

export default new DataSource(
  createDatabaseOptionsFromEnvironment(process.env),
);
