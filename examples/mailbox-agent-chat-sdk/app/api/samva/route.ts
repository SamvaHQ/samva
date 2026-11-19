import { chat } from "../../../lib/bot";

export const POST = (request: Request) => chat.webhooks.samva(request);
