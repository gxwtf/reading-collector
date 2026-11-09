// 每个广学账号一份 WebDAV 凭据：账号表存在书库根目录的 .dav-users.json
// 结构：{ "<username>": { "userId": 2691, "password": "xxx" } }
// 用户名固定 u<userId>，避免重名；已有条目（如 reader）保持原名不动。
import { randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const BOOKS = process.env.READEST_BOOKS_DIR || "/home/gxwtf/reading-books";
const FILE = path.join(BOOKS, ".dav-users.json");

export type DavUser = { username: string; password: string; userId: number };

type Store = Record<string, { userId: number; password: string }>;

async function readStore(): Promise<Store> {
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as Store;
  } catch {
    return {};
  }
}

/** 按广学账号取（或首次创建）WebDAV 凭据；用户名固定 u<userId> 以避免重名 */
export async function ensureDavUser(userId: number): Promise<DavUser> {
  const store = await readStore();
  const username = `u${userId}`;

  for (const [name, info] of Object.entries(store)) {
    if (info.userId === userId) {
      return { username: name, password: info.password, userId };
    }
  }

  const password = randomBytes(8).toString("hex").slice(0, 16);
  store[username] = { userId, password };
  await writeFile(FILE, JSON.stringify(store, null, 1), "utf8");
  await chmod(FILE, 0o600).catch(() => null);
  return { username, password, userId };
}

export function davRoot(userId: number): string {
  return path.join(BOOKS, `u${userId}`);
}
