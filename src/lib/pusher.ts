import Pusher from "pusher";

// Singleton server-side (para triggers desde API routes)
const globalForPusher = globalThis as unknown as { pusherServer: Pusher };

export const pusherServer: Pusher =
  globalForPusher.pusherServer ??
  new Pusher({
    appId:   process.env.PUSHER_APP_ID!,
    key:     process.env.PUSHER_KEY!,
    secret:  process.env.PUSHER_SECRET!,
    cluster: process.env.PUSHER_CLUSTER!,
    useTLS:  true,
  });

if (process.env.NODE_ENV !== "production") globalForPusher.pusherServer = pusherServer;

// El canal se nombra con el displayToken del local:
// "display-{displayToken}"
// Canal público (sin auth de Pusher) → el token largo es el secreto.
export function displayChannel(displayToken: string): string {
  return `display-${displayToken}`;
}

export const PUSHER_EVENTS = {
  COMANDA_NUEVA:    "comanda.nueva",
  COMANDA_RETIRADA: "comanda.retirada",
} as const;
