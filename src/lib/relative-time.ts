/**
 * 相对时间：设计说明 §7 规定的唯一一套文案。
 *
 * 「刚刚」「N 分钟前」「N 小时前」「昨天」「N 天前」「上周」。
 * 超过两周就退回绝对日期——再往上「N 周前」没人真能换算成哪天。
 *
 * 用 UTC 天数差而不是毫秒差算「昨天」：毫秒差 24 小时在
 * 23:59 收藏、00:01 打开时会把「昨天」说成「今天」。
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** 只保留年月日，用来算跨了几天 */
function startOfDay(t: number): number {
  const d = new Date(t);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

export function relativeTime(at: Date | string | number, now: Date | number = Date.now()): string {
  const t = at instanceof Date ? at.getTime() : typeof at === "number" ? at : new Date(at).getTime();
  if (!Number.isFinite(t)) return "";

  const current = now instanceof Date ? now.getTime() : now;
  const diff = current - t;

  // 未来时间（时钟偏差）按「刚刚」处理，不显示「-3 分钟前」这种
  if (diff < MINUTE) return "刚刚";

  const days = startOfDay(current) - startOfDay(t);
  if (days === 0) {
    if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`;
    return `${Math.floor(diff / HOUR)} 小时前`;
  }
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 14) return "上周";

  const d = new Date(t);
  const sameYear = d.getFullYear() === new Date(current).getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return sameYear ? `${mm}-${dd}` : `${d.getFullYear()}-${mm}-${dd}`;
}
