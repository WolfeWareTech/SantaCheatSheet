type Event = { payload: { event: string } };
const listeners = new Set<(event: Event) => void>();
export const authFixture = {
  props: {} as Record<string, unknown>,
  emit(event: string) { for (const listener of listeners) listener({ payload: { event } }); },
  listenerCount: () => listeners.size,
};
export const Hub = {
  listen(_channel: string, listener: (event: Event) => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
