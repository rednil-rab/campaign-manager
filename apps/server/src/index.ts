import { MongoClient } from 'mongodb';
import { createApp } from './app';
import { loadConfig } from './config';
import { createMongoCampaignRepo } from './campaigns/mongoCampaignRepo';
import { createMongoUserRepo } from './users/mongoUserRepo';

const config = loadConfig();
const client = new MongoClient(config.mongoUri);
await client.connect();
const db = client.db(config.mongoDb);

const app = createApp({
  users: await createMongoUserRepo(db),
  campaigns: await createMongoCampaignRepo(db),
  config,
});
const server = app.listen(config.port, () => {
  console.log(`Questkeeper API listening on http://localhost:${config.port}`);
});

const shutdown = () => {
  server.close(() => void client.close().then(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
