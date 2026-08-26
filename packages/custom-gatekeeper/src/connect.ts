import { DurableObject } from "cloudflare:workers";
import type {
  GatekeeperConnectCallback,
  GatekeeperUser,
} from "@gadgets/workshop-shared/gatekeeper";

const CONNECT_LIFETIME_MS = 10 * 60 * 1000;

type PendingConnection = {
  nonce: string;
  expiresAt: number;
  state: "pending" | "completing";
};

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function generateConnectNonce(): string {
  return `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

export class AccessConnect extends DurableObject<Cloudflare.Env> {
  async prepare(
    callback: Fetcher<GatekeeperConnectCallback>,
    nonce: string,
  ): Promise<void> {
    const expiresAt = Date.now() + CONNECT_LIFETIME_MS;
    await this.ctx.storage.put("connection", {
      nonce,
      expiresAt,
      state: "pending",
    } satisfies PendingConnection);
    await this.ctx.storage.put("callback", callback);
    await this.ctx.storage.setAlarm(expiresAt);
  }

  async complete(nonce: string, email: string): Promise<boolean> {
    const connection = await this.ctx.storage.get<PendingConnection>("connection");
    if (!connection || connection.state !== "pending" ||
        connection.expiresAt <= Date.now() || !constantTimeEqual(connection.nonce, nonce)) {
      return false;
    }

    const callback = await this.ctx.storage.get<Fetcher<GatekeeperConnectCallback>>("callback");
    if (!callback) return false;

    await this.ctx.storage.put("connection", { ...connection, state: "completing" });
    const account = this.ctx.exports.CustomAccount({
      props: {
        accountId: this.ctx.id.toString(),
        principal: { type: "access_email", id: email },
      },
    }) as Fetcher<GatekeeperUser>;

    try {
      await callback.complete(account);
    } finally {
      await this.ctx.storage.deleteAll();
    }
    return true;
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
