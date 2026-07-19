import { z } from "zod";
import { isValidSessionCookieValue, readSessionFromCookieHeader } from "@/lib/admin-auth";
import { createClinic } from "@/lib/clinics";

/**
 * Create clinic + license key (admin only). Responds with a one-time HTML page
 * showing the raw key — rendered inline rather than via redirect so the key
 * never lands in a URL, browser history, or request log. Not persisted.
 */

const Body = z.object({
  name: z.string().trim().min(2).max(200),
  contact: z.string().trim().max(300).default(""),
  plan: z.string().trim().min(1).max(50).default("standard"),
  expires_at: z.string().trim().optional().default(""),
});

export async function POST(req: Request): Promise<Response> {
  if (!isValidSessionCookieValue(readSessionFromCookieHeader(req.headers.get("cookie")))) {
    return Response.redirect(new URL("/admin/login", req.url), 303);
  }
  const form = await req.formData();
  const parsed = Body.safeParse({
    name: form.get("name") ?? "",
    contact: form.get("contact") ?? "",
    plan: form.get("plan") ?? "standard",
    expires_at: form.get("expires_at") ?? "",
  });
  if (!parsed.success) return Response.redirect(new URL("/admin/new?error=1", req.url), 303);

  const expiresAt = parsed.data.expires_at ? new Date(parsed.data.expires_at) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return Response.redirect(new URL("/admin/new?error=1", req.url), 303);
  }
  const { clinic, licenseKey } = await createClinic({
    name: parsed.data.name,
    contact: parsed.data.contact,
    plan: parsed.data.plan,
    expiresAt,
  });

  // The raw key is shown exactly once. It is NOT stored; losing this page
  // means issuing a new key. Rendered inline (no redirect) so the key never
  // appears in a URL or a request log.
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>License key created</title>
     <style>body{font-family:system-ui;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh}
     .card{background:#fff;border-radius:12px;padding:32px;box-shadow:0 4px 16px rgba(0,0,0,.08);max-width:560px}
     code{display:block;font-size:22px;background:#ecfeff;border:2px dashed #06b6d4;padding:14px;border-radius:8px;margin:16px 0;text-align:center}
     .warn{color:#b91c1c;font-weight:600}</style></head><body><div class="card">
     <h1>Clinic created: ${esc(clinic.name)}</h1>
     <p>License key — <span class="warn">shown ONCE, never stored. Copy it now and hand it to the clinic at install time.</span></p>
     <code>${esc(licenseKey)}</code>
     <p><a href="/admin">← Back to clinics</a></p>
     </div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
