import { computed, onScopeDispose, ref } from "vue";
import {
  restartNoticeCancel, restartNoticeCreate, restartNoticeDetail, restartNoticeList,
  type RestartNoticeJob, type RestartNoticeTarget
} from "@/services/apis/restartNotice";

export const noticePending = (state: string) => ["pending", "countdown"].includes(state);
export const noticeRetryable = (state: string) => ["skipped", "interrupted", "failed"].includes(state);
export function validNoticeDraft(targets: RestartNoticeTarget[], seconds: number, message: string) {
  return targets.length > 0 && targets.length <= 100 && Number.isInteger(seconds) && seconds >= 10 &&
    seconds <= 3600 && message.trim().length > 0 && message.length <= 200 && !/[\u0000-\u001f\u007f]/.test(message);
}

export function useRestartNotice() {
  const jobs = ref<RestartNoticeJob[]>([]);
  const job = ref<RestartNoticeJob>();
  const loading = ref(false);
  const saving = ref(false);
  const error = ref("");
  const now = ref(Date.now());
  const { execute: list } = restartNoticeList();
  const { execute: create } = restartNoticeCreate();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let visible = false;
  const failed = computed(() => job.value?.targets.filter((target) => noticeRetryable(target.state)) || []);
  const cancelable = computed(() => job.value?.targets.some((target) => noticePending(target.state)) || false);
  const setJob = (value: RestartNoticeJob) => {
    job.value = value;
    jobs.value = [value, ...jobs.value.filter((item) => item.id !== value.id)]
      .sort((a, b) => b.createdAt - a.createdAt);
  };
  const report = (value: unknown) => { error.value = value instanceof Error ? value.message : String(value); };

  function schedule() {
    clearTimeout(timer);
    if (!visible) return;
    timer = setTimeout(async () => {
      const current = generation;
      now.value = Date.now();
      try {
        if (job.value && !job.value.finishedAt) {
          const id = job.value.id;
          const result = await restartNoticeDetail(id).execute();
          if (visible && generation === current && job.value?.id === id && result.value) setJob(result.value);
        }
      } catch (value) { if (generation === current) report(value); }
      if (visible && generation === current) schedule();
    }, 1000);
  }

  async function open() {
    visible = true;
    const current = ++generation;
    loading.value = true;
    error.value = "";
    try {
      const result = await list();
      if (!visible || generation !== current) return;
      jobs.value = result.value || [];
      job.value = jobs.value.find((item) => !item.finishedAt) || jobs.value[0];
    } catch (value) { if (generation === current) report(value); }
    finally { if (generation === current) { loading.value = false; schedule(); } }
  }
  function close() { visible = false; generation++; clearTimeout(timer); loading.value = false; }
  async function select(id: string) {
    const current = ++generation;
    clearTimeout(timer);
    job.value = jobs.value.find((item) => item.id === id);
    try {
      const result = await restartNoticeDetail(id).execute();
      if (visible && generation === current && result.value) setJob(result.value);
    } catch (value) { if (generation === current) report(value); }
    finally { if (generation === current) schedule(); }
  }
  async function submit(targets: RestartNoticeTarget[], seconds: number, message: string) {
    if (saving.value || !validNoticeDraft(targets, seconds, message)) return false;
    saving.value = true; error.value = "";
    try {
      const result = await create({ data: {
        targets: targets.map(({ daemonId, instanceUuid }) => ({ daemonId, instanceUuid })), seconds, message: message.trim()
      } });
      if (!result.value) return false;
      generation++;
      setJob(result.value);
      schedule();
      return true;
    } catch (value) { report(value); return false; }
    finally { saving.value = false; }
  }
  async function cancel(taskIds?: string[]) {
    if (!job.value || saving.value) return;
    saving.value = true; error.value = "";
    const id = job.value.id;
    generation++;
    try {
      const result = await restartNoticeCancel(id).execute({ data: { taskIds } });
      if (job.value?.id === id && result.value) setJob(result.value);
    } catch (value) { report(value); }
    finally { saving.value = false; schedule(); }
  }
  onScopeDispose(close);
  return { jobs, job, loading, saving, error, now, failed, cancelable, open, close, select, submit, cancel };
}
