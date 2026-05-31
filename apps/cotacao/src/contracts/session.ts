import type { Uuid } from "./common.js";

export interface CotacaoUser {
  id: number;
  username: string;
  role: string;
}

export interface CotacaoSessionState {
  user?: CotacaoUser;
  csrfToken?: string;
  loginRateLimit?: Record<string, unknown>;
  homeSsoTraceId?: Uuid;
}

declare module "express-session" {
  interface SessionData extends CotacaoSessionState {}
}
