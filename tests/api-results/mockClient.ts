type Payload = Record<string, unknown>;
export const fixture = {
  list: async (options?: Payload): Promise<unknown> => { void options; return { data: [] }; },
  get: async (payload: Payload): Promise<unknown> => { void payload; return { data: null }; },
  create: async (payload: Payload): Promise<unknown> => ({ data: payload }),
  update: async (payload: Payload): Promise<unknown> => ({ data: payload }),
  notify: () => {},
};
export function generateClient() {
  return { models: { SantasSheet: {
    list: (options?: Payload) => fixture.list(options),
    get: (payload: Payload) => fixture.get(payload),
    create: (payload: Payload) => fixture.create(payload),
    update: (payload: Payload) => fixture.update(payload),
    observeQuery: () => ({ subscribe: (observer: { next: (value: unknown) => void }) => {
      fixture.notify = () => observer.next({ items: [], isSynced: true });
      return { unsubscribe: () => {} };
    } }),
  } } };
}
