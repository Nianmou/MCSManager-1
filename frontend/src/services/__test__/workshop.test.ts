import { describe, expect, it, vi } from "vitest";
const subscribe = vi.hoisted(() => vi.fn());
vi.mock("@/services/apiService", () => ({ apiService: { subscribe } }));
import { requestWorkshopDownload, WORKSHOP_DOWNLOAD_COMMAND } from "../apis/workshop";
describe("fixed Workshop API", () => {
  it("sends only the exact immutable command through the existing instance route", async () => {
    const signal = new AbortController().signal;
    await requestWorkshopDownload({ daemonId: 'node', instanceUuid: 'instance', command: 'quit' } as any, signal);
    expect(WORKSHOP_DOWNLOAD_COMMAND).toBe('sw_downloadaddon 3801682815');
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({
      url: '/api/protected_instance/command', method: 'POST', signal, forceRequest: true,
      params: { daemonId: 'node', uuid: 'instance', command: 'sw_downloadaddon 3801682815' }
    }));
  });
});
