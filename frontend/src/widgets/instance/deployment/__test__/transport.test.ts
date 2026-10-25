import { describe, expect, it, vi, beforeEach } from "vitest";
import { createDeploymentTransport } from "../transport";
const data = vi.hoisted(() => ({
  admin: true,
  pages: {} as Record<number, any>,
  nodes: [
    { uuid: "a", available: true },
    { uuid: "b", available: true }
  ],
  requests: vi.fn(),
  listPages: [] as any[],
  call: vi.fn(),
  append: vi.fn()
}));
vi.mock("@/lang/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/services/apis", () => ({
  remoteNodeList: () => ({ execute: async () => ({ value: data.nodes }) }),
  remoteInstancesGlobal: () => ({
    execute: async (options: any) => {
      data.requests(options);
      const page = data.pages[options.params.page];
      if (page instanceof Error) throw page;
      return { value: page };
    }
  })
}));
vi.mock("@/stores/useAppStateStore", () => ({
  useAppStateStore: () => ({ isAdmin: { value: data.admin } })
}));
vi.mock("@/services/apis/fileManager", () => ({
  fileList: () => ({
    execute: async (options: any) => {
      data.call(options);
      return { value: data.listPages[options.params.page] };
    }
  }),
  uploadAddress: () => ({
    execute: async (options: any) => {
      data.call(options);
      return { value: { password: "ticket", addr: "http://mapped" } };
    }
  }),
  addFolder: vi.fn(),
  compressFile: vi.fn(),
  copyFile: vi.fn(),
  fileContent: vi.fn(),
  getFileStatus: vi.fn()
}));
vi.mock("@/services/uploadService", () => ({
  default: {
    append: (...args: any[]) => {
      data.append(...args);
      args[4]?.({ addCallback: vi.fn(), instanceInfo: undefined });
      return { completion: Promise.resolve({ status: "success" }), stop: vi.fn() };
    }
  }
}));
vi.mock("@/hooks/useFileManager", () => ({ getFileConfigAddr: (config: any) => config.addr }));
vi.mock("@/tools/protocol", () => ({ parseForwardAddress: (address: string) => address }));
const instance = (id: string) => ({ instanceUuid: id, status: 0, config: { nickname: id } });
beforeEach(() => {
  data.admin = true;
  data.pages = {};
  data.nodes = [
    { uuid: "a", available: true },
    { uuid: "b", available: true }
  ];
  data.requests.mockClear();
  data.listPages = [];
  data.call.mockClear();
  data.append.mockClear();
});
describe("deployment legacy transport", () => {
  it("loads every instance page without repeating exhausted nodes", async () => {
    data.pages = {
      1: {
        a: { maxPage: 2, instances: [instance("same")] },
        b: { maxPage: 1, instances: [instance("same")] }
      },
      2: {
        a: { maxPage: 2, instances: [instance("last")] },
        b: { maxPage: 1, instances: [instance("same")] }
      }
    };
    const result = await createDeploymentTransport().discover();
    expect(result.instances.map((item) => `${item.daemonId}:${item.instanceUuid}`)).toEqual([
      "a:same",
      "b:same",
      "a:last"
    ]);
    expect(result.issues).toEqual({});
    expect(
      data.requests.mock.calls.every(
        ([options]) => options.timeout === 30000 && options.forceRequest
      )
    ).toBe(true);
  });
  it.each([undefined, { a: { error: "unreachable" } }, new Error("timeout")])(
    "retains incomplete node coverage when a later page fails (%s)",
    async (lastPage) => {
      data.pages = {
        1: { a: { maxPage: 2, instances: [instance("first")] }, b: { maxPage: 1, instances: [] } },
        2: lastPage
      };
      const result = await createDeploymentTransport().discover();
      expect(result.issues).toEqual({ a: "inventory" });
      expect(result.instances.map((row) => row.instanceUuid)).toEqual(["first"]);
    }
  );
  it("marks configured offline/missing nodes and deduplicates repeated identities", async () => {
    data.nodes.push({ uuid: "offline", available: false }, { uuid: "missing", available: true });
    data.pages = {
      1: {
        a: { maxPage: 1, instances: [instance("same"), instance("same")] },
        b: { maxPage: 0, instances: [] }
      }
    };
    const result = await createDeploymentTransport().discover();
    expect(result.instances).toHaveLength(1);
    expect(result.issues).toEqual({ offline: "offline", missing: "inventory" });
  });
  it("paginates standard global file listings without custom real-path options", async () => {
    data.listPages = [
      { absolutePath: "/game", items: [{ name: "first" }], total: 2 },
      { absolutePath: "/game", items: [{ name: "last" }], total: 2 }
    ];
    const result = await createDeploymentTransport().list("a", "/game");
    expect(result.items.map((item) => item.name)).toEqual(["first", "last"]);
    expect(data.call.mock.calls[0][0].params).toMatchObject({
      uuid: "global0001",
      target: "/game",
      page: 0
    });
    expect(data.call.mock.calls[0][0].params).not.toHaveProperty("real_path");
  });
  it("uses mapped transfer addresses and defers extraction until explicit verification", async () => {
    const file = {} as File;
    await createDeploymentTransport().upload("a", "/game", file);
    expect(data.append).toHaveBeenCalledWith(
      file,
      "http://mapped",
      "ticket",
      { overwrite: false, unzip: false, code: "utf-8" },
      expect.any(Function)
    );
  });
  it("denies a regular user before requesting a global upload credential", async () => {
    data.admin = false;
    await expect(
      createDeploymentTransport().upload("a", "/game", {} as File)
    ).rejects.toMatchObject({ code: "admin" });
    expect(data.call).not.toHaveBeenCalled();
    expect(data.append).not.toHaveBeenCalled();
  });
});
