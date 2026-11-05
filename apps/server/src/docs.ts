const json = (schema: object) => ({ content: { 'application/json': { schema } } });
const obj = { type: 'object' } as const;
const str = { type: 'string' } as const;
const idParam = (name: string) => ({ name, in: 'path', required: true, schema: str });
const ok = (description = 'OK') => ({ description });
const cookie = [{ cookieAuth: [] }];
const agent = [{ agentToken: [] }];

const entityPaths = (kind: string, label: string) => ({
  [`/campaigns/{id}/${kind}/{entityId}`]: {
    put: {
      tags: ['Campaign data'],
      summary: `Create or replace a ${label}`,
      description: 'The id in the body must match the URL. Returns the updated campaign.',
      security: cookie,
      parameters: [idParam('id'), idParam('entityId')],
      requestBody: { required: true, ...json(obj) },
      responses: { 200: ok('Updated campaign'), 400: ok('Invalid input'), 404: ok('Campaign not found') },
    },
    delete: {
      tags: ['Campaign data'],
      summary: `Delete a ${label}`,
      security: cookie,
      parameters: [idParam('id'), idParam('entityId')],
      responses: { 200: ok('Updated campaign'), 404: ok('Campaign not found') },
    },
  },
});

const changeExamples = {
  add_item: { value: { id: 'c1', action: 'add_item', itemId: 'i-rope', name: 'Rope', quantity: 1 } },
  remove_item: { value: { id: 'c2', action: 'remove_item', itemId: 'i-rope' } },
  set_item_quantity: { value: { id: 'c3', action: 'set_item_quantity', itemId: 'i-rope', quantity: 2 } },
  set_quest_status: { value: { id: 'c4', action: 'set_quest_status', questId: '<quest id>', status: 'active' } },
  set_npc_disposition: { value: { id: 'c5', action: 'set_npc_disposition', npcId: '<npc id>', disposition: 'friendly' } },
  reveal: { value: { id: 'c6', action: 'reveal', type: 'npc', targetId: '<npc id>' } },
  add_session_note: { value: { id: 'c7', action: 'add_session_note', sessionId: '<session id>', text: 'The party found a hidden door.' } },
};

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Questkeeper API',
    version: '0.1.0',
    description:
      'Development docs. Sign in with **Auth → login** first: the session cookie is then sent automatically (use this page from the same origin as the API). ' +
      'For the agent endpoints, call **Dev → mint agent token** (local development only), then press Authorize and paste the token. ' +
      'In production the server mints agent tokens itself.',
  },
  servers: [{ url: '/api' }],
  tags: [{ name: 'Auth' }, { name: 'Campaigns' }, { name: 'Campaign data' }, { name: 'Approvals' }, { name: 'Share links' }, { name: 'Player' }, { name: 'Agent' }, { name: 'Dev' }],
  components: {
    securitySchemes: {
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'qk_session' },
      agentToken: { type: 'http', scheme: 'bearer', description: 'Short-lived token (5 minutes) for one campaign and one turn.' },
    },
  },
  paths: {
    '/health': { get: { summary: 'Health check', responses: { 200: ok() } } },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Create an account (also signs in)',
        requestBody: { required: true, ...json({ ...obj, properties: { email: str, password: str } }) },
        responses: { 201: ok('Created'), 400: ok('Invalid input'), 409: ok('Email taken') },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Sign in (sets the session cookie)',
        requestBody: { required: true, ...json({ ...obj, properties: { email: str, password: str } }) },
        responses: { 200: ok('Signed in'), 401: ok('Invalid email or password') },
      },
    },
    '/auth/logout': { post: { tags: ['Auth'], summary: 'Sign out', responses: { 204: ok() } } },
    '/auth/me': { get: { tags: ['Auth'], summary: 'Current user', security: cookie, responses: { 200: ok(), 401: ok() } } },

    '/campaigns': {
      get: { tags: ['Campaigns'], summary: 'List your campaigns', security: cookie, responses: { 200: ok() } },
      post: {
        tags: ['Campaigns'],
        summary: 'Create a campaign',
        security: cookie,
        requestBody: { required: true, ...json({ ...obj, properties: { name: str, sample: { type: 'boolean' } } }) },
        responses: { 201: ok('Created') },
      },
    },
    '/campaigns/{id}': {
      patch: {
        tags: ['Campaigns'],
        summary: 'Rename a campaign',
        security: cookie,
        parameters: [idParam('id')],
        requestBody: { required: true, ...json({ ...obj, properties: { name: str } }) },
        responses: { 200: ok() },
      },
      delete: { tags: ['Campaigns'], summary: 'Delete a campaign', security: cookie, parameters: [idParam('id')], responses: { 204: ok(), 404: ok() } },
    },
    ...entityPaths('characters', 'character'),
    ...entityPaths('npcs', 'NPC'),
    ...entityPaths('quests', 'quest'),
    ...entityPaths('sessions', 'session'),
    ...entityPaths('stats', 'stat'),
    ...entityPaths('races', 'race'),
    ...entityPaths('classes', 'class'),

    '/campaigns/{id}/pending': {
      get: { tags: ['Approvals'], summary: 'Changes the agent proposed that wait for approval', security: cookie, parameters: [idParam('id')], responses: { 200: ok() } },
    },
    '/campaigns/{id}/pending/{changeId}/approve': {
      post: { tags: ['Approvals'], summary: 'Approve and apply a pending change', security: cookie, parameters: [idParam('id'), idParam('changeId')], responses: { 200: ok('Updated campaign'), 400: ok(), 404: ok() } },
    },
    '/campaigns/{id}/pending/{changeId}/reject': {
      post: { tags: ['Approvals'], summary: 'Discard a pending change', security: cookie, parameters: [idParam('id'), idParam('changeId')], responses: { 200: ok('Updated campaign'), 404: ok() } },
    },
    '/campaigns/{id}/shares': {
      get: { tags: ['Share links'], summary: 'List share tokens for a campaign', security: cookie, parameters: [idParam('id')], responses: { 200: ok() } },
    },
    '/campaigns/{id}/characters/{characterId}/share': {
      post: { tags: ['Share links'], summary: 'Create (or replace) a character share link', security: cookie, parameters: [idParam('id'), idParam('characterId')], responses: { 201: ok('{ characterId, token }') } },
      delete: { tags: ['Share links'], summary: 'Revoke a character share link', security: cookie, parameters: [idParam('id'), idParam('characterId')], responses: { 204: ok() } },
    },

    '/play/{token}': {
      get: { tags: ['Player'], summary: 'A player’s own sheet (no sign-in; the token is the credential)', parameters: [idParam('token')], responses: { 200: ok(), 404: ok() } },
      put: {
        tags: ['Player'],
        summary: 'Update the player’s inventory and notes',
        parameters: [idParam('token')],
        requestBody: { required: true, ...json({ ...obj, properties: { inventory: { type: 'array', items: obj }, playerNotes: str } }) },
        responses: { 200: ok(), 400: ok(), 404: ok() },
      },
    },

    '/agent/v1/context/player': { get: { tags: ['Agent'], summary: 'What the acting player’s character can see', security: agent, responses: { 200: ok(), 401: ok() } } },
    '/agent/v1/context/dm': { get: { tags: ['Agent'], summary: 'Full campaign (recap and dm_turn tokens only)', security: agent, responses: { 200: ok(), 403: ok('player_action token') } } },
    '/agent/v1/events': {
      post: {
        tags: ['Agent'],
        summary: 'Append a log event (repeating an id does nothing)',
        security: agent,
        requestBody: {
          required: true,
          ...json({
            ...obj,
            required: ['id', 'kind', 'text', 'visibility'],
            properties: {
              id: str,
              kind: { type: 'string', enum: ['narration', 'roll', 'note', 'reveal', 'change'] },
              text: str,
              visibility: { type: 'string', enum: ['table', 'dm'] },
              sessionId: str,
            },
          }),
          content: { 'application/json': { schema: obj, example: { id: 'e1', kind: 'narration', text: 'The gate creaks open.', visibility: 'table' } } },
        },
        responses: { 201: ok(), 400: ok() },
      },
    },
    '/agent/v1/roll': {
      post: {
        tags: ['Agent'],
        summary: 'Roll dice on the server (repeating an id replays the result)',
        security: agent,
        requestBody: { required: true, content: { 'application/json': { schema: obj, example: { id: 'r1', dice: '2d6+1', reason: 'Perception' } } } },
        responses: { 200: ok(), 400: ok() },
      },
    },
    '/agent/v1/changes': {
      post: {
        tags: ['Agent'],
        summary: 'Propose a change: applied, pending_approval, or rejected',
        description: 'Deleting an item and completing or failing a quest wait for DM approval. Pick an example from the dropdown.',
        security: agent,
        requestBody: { required: true, content: { 'application/json': { schema: obj, examples: changeExamples } } },
        responses: { 200: ok('{ status: applied | pending_approval | rejected, reason? }'), 400: ok() },
      },
    },

    '/dev/agent-token': {
      post: {
        tags: ['Dev'],
        summary: 'Mint an agent token for one of your campaigns (local development only; 404 in production)',
        security: cookie,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: obj,
              example: { campaignId: '<campaign id>', mode: 'player_action', characterId: '<character id>' },
            },
          },
        },
        responses: { 200: ok('{ token, expiresInSeconds }'), 400: ok(), 404: ok() },
      },
    },
  },
};

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>Questkeeper API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head>
<body><div id="ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: '/api/docs/openapi.json', dom_id: '#ui', persistAuthorization: true });</script>
</body></html>`;

export const docsPage = () => page;
