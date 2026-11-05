// iron-session 配置：与广坊其他站点同样的 SSO 方案，仅 cookie 名不同
import { SessionOptions } from "iron-session";

export interface SessionData {
  isLoggedIn: boolean;
  userId?: number;
  userName?: string;
  admin?: number;
  email?: string;
  realName?: string;
}

export const defaultSession: SessionData = {
  isLoggedIn: false,
};

export const sessionOptions: SessionOptions = {
  password: process.env.SECRET_COOKIE_PASSWORD as string,
  cookieName: "gxreading_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
  },
};
