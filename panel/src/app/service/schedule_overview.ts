import type RemoteRequest from "./remote_command";

// Use the established per-instance protocol, which is supported by older daemons too.
// Limit concurrent requests so opening the overview does not flood a large node.
export async function listNodeSchedules(remote: Pick<RemoteRequest, "request">) {
  const instances = await remote.request<{ instanceUuid: string }[]>("instance/overview");
  if (!Array.isArray(instances)) throw new Error("Invalid instance overview response");
  const tasks: Record<string, any>[] = [];
  let error = false;
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(5, instances.length) }, async () => {
      while (next < instances.length) {
        const { instanceUuid } = instances[next++];
        try {
          const list = await remote.request<Record<string, any>[]>("schedule/list", { instanceUuid });
          if (!Array.isArray(list)) throw new Error("Invalid schedule list response");
          tasks.push(...list.map((task) => ({ ...task, instanceUuid })));
        } catch {
          // Preserve successful reads, but never describe a failed read as an empty plan.
          error = true;
        }
      }
    })
  );
  return { tasks, ...(error ? { error: true } : {}) };
}
