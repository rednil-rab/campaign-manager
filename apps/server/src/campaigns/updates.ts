export type CampaignUpdateEvent = 'update' | 'revoked';
type Listener = (event: CampaignUpdateEvent) => void;

export interface CampaignUpdateHub {
  subscribe(campaignId: string, token: string, listener: Listener): () => void;
  publishCampaignUpdate(campaignId: string): void;
  revokeToken(token: string): void;
}

export function createCampaignUpdateHub(): CampaignUpdateHub {
  const campaigns = new Map<string, Set<Listener>>();
  const tokens = new Map<string, Set<Listener>>();

  const add = (subscriptions: Map<string, Set<Listener>>, key: string, listener: Listener) => {
    let listeners = subscriptions.get(key);
    if (!listeners) {
      listeners = new Set();
      subscriptions.set(key, listeners);
    }
    listeners.add(listener);
  };
  const remove = (subscriptions: Map<string, Set<Listener>>, key: string, listener: Listener) => {
    const listeners = subscriptions.get(key);
    listeners?.delete(listener);
    if (listeners?.size === 0) subscriptions.delete(key);
  };

  return {
    subscribe(campaignId, token, listener) {
      add(campaigns, campaignId, listener);
      add(tokens, token, listener);
      return () => {
        remove(campaigns, campaignId, listener);
        remove(tokens, token, listener);
      };
    },
    publishCampaignUpdate(campaignId) {
      for (const listener of campaigns.get(campaignId) ?? []) listener('update');
    },
    revokeToken(token) {
      for (const listener of tokens.get(token) ?? []) listener('revoked');
    },
  };
}
