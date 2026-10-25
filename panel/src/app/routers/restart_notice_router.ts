import Router from "@koa/router";
import { ROLE } from "../entity/user";
import { $t } from "../i18n";
import permission from "../middleware/permission";
import { NoticeError } from "../service/restart_notice";
import { restartNotices } from "../service/restart_notice_service";

const router = new Router({ prefix: "/instance/restart_notice" });
router.use(permission({ level: ROLE.ADMIN }));
router.use(async (ctx, next) => {
  try { await next(); }
  catch (error) {
    ctx.body = error instanceof NoticeError
      ? new Error($t(`TXT_CODE_restartNotice.reason_${error.code}`)) : error;
  }
});
router.post("/", async (ctx) => { ctx.body = await restartNotices.create(ctx.request.body); });
router.get("/", (ctx) => { ctx.body = restartNotices.list(); });
router.get("/:id", (ctx) => { ctx.body = restartNotices.get(ctx.params.id); });
router.post("/:id/cancel", async (ctx) => {
  ctx.body = await restartNotices.cancel(ctx.params.id, ctx.request.body?.taskIds);
});
export default router;
