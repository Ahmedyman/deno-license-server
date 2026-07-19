import { sessionClearCookie } from "@/lib/admin-auth";

export async function POST(req: Request): Promise<Response> {
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL("/admin/login", req.url).toString(),
      "set-cookie": sessionClearCookie(),
    },
  });
}
