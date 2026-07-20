import { createSessionCookieValue, sessionSetCookie, verifyAdminPassword } from "@/lib/admin-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/** Admin login — form POST; 5 attempts/min/IP (brute-force guard). */
export async function POST(req: Request): Promise<Response> {
  const rl = rateLimit("admin-login", clientIp(req), 5, 60_000);
  if (!rl.allowed) return Response.redirect(new URL("/admin/login?error=rate", req.url), 303);

  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  if (!(await verifyAdminPassword(password))) {
    return Response.redirect(new URL("/admin/login?error=bad", req.url), 303);
  }
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL("/admin", req.url).toString(),
      "set-cookie": sessionSetCookie(createSessionCookieValue()),
    },
  });
}
