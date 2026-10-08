import { UserTokenPayload, AdminTokenPayload } from "../utils/jwt";

declare global {
  namespace Express {
    interface Request {
      user?: UserTokenPayload;
      admin?: AdminTokenPayload;
    }
  }
}

export {};
