import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { createApp } from './app';
import { loadConfig } from './config';
import { createMongoCampaignRepo } from './campaigns/mongoCampaignRepo';
import { createMongoUserRepo } from './users/mongoUserRepo';

const config = loadConfig();
const client = new MongoClient(config.mongoUri);
await client.connect();
const db = client.db(config.mongoDb);

// The built web app is served from the same origin when it exists; in development Vite serves it instead.
const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(process.env.WEB_DIR ?? path.join(here, '../../web/dist'));
const serveWeb = existsSync(path.join(webDir, 'index.html'));

const app = createApp({
  users: await createMongoUserRepo(db),
  campaigns: await createMongoCampaignRepo(db),
  config,
  webDir: serveWeb ? webDir : undefined,
});
const server = app.listen(config.port, () => {
  console.log(`Questkeeper listening on http://localhost:${config.port}${serveWeb ? '' : ' (API only)'}`);
});

const shutdown = () => {
  server.close(() => void client.close().then(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
