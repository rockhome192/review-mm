import { getCatalog, toCard } from "@/lib/data";

// Every card the home page searches and filters, built once with the site. The home
// page embeds only its first screen of cards and fetches this after it has painted,
// so its HTML stays small however many titles there are.
export const dynamic = "force-static";

export async function GET() {
  return Response.json((await getCatalog()).map(toCard));
}
