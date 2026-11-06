# 数据库结构

PostgreSQL 库名 `gxwtf_reading`，Prisma 7 管理。

| 表 | 作用 | 关键约束 |
| --- | --- | --- |
| `User` | 广学账号镜像 | `userId`（账号 ID）唯一；`prefs` 存精确播放开关，`aiSettings` 存 BYOK |
| `Entry` | 一条收藏 | `@@unique([userId, urlHash])` 保证重复收藏幂等 |
| `FetchJob` | 抓取/转写队列 | `status + createdAt` 索引，供 worker 轮询 |
| `Transcript` | 音视频逐字稿 | 一条收藏一份，`segments` 内含分段与词级时间 |
| `Highlight` | 划线批注 | `anchor` 存相对正文根节点的字符偏移 |
| `Keyframe` | 视频关键帧 | 时间戳 + 备注，可跳转 |
| `Tag` / `EntryTag` / `TagConfig` | 标签与用户级配色 | 标签名全局唯一 |
| `Collection` / `CollectionEntry` | 手动分组 | 用户级命名唯一 |

## 状态字段

- `Entry.state`：`pending` 待抓取 / `ready` 可用 / `failed` 失败
- `Entry.readState`：`unread` / `reading` / `done`
- `Entry.mediaState`：`none` / `pending` / `ready` / `failed`（精确播放的本地转码）

## 常用查询

```sql
-- 队列积压
select status, count(*) from "FetchJob" group by 1;

-- 抓取失败的条目
select id, left(url, 60), state from "Entry" where state = 'failed' order by id desc limit 10;

-- 某个用户的空间占用
select pg_size_pretty(sum(length("contentMd"))) from "Entry" where "userId" = 2691;
```
