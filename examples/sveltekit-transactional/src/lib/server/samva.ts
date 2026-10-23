import { SAMVA_API_KEY } from "$app/env/private";
import { createClient } from "samva";
import type { SamvaClient } from "samva";

let samva: SamvaClient | undefined;

export function getSamva(): SamvaClient {
  if (!SAMVA_API_KEY) {
    throw new Error("SAMVA_API_KEY is not set. Copy .env.example to .env and add your key.");
  }

  return (samva ??= createClient({ apiKey: SAMVA_API_KEY }));
}
