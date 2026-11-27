import { config as loadDotenv } from 'dotenv';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { createDatabaseOptionsFromEnvironment } from '../../src/database/database-options.factory';

loadDotenv({ quiet: true });

const fixtureMigrationsGlob = join(__dirname, 'fixtures/*{.js,.ts}');

export default new DataSource(
  createDatabaseOptionsFromEnvironment(process.env, fixtureMigrationsGlob),
);
