import { z } from "zod";
import { isValidSessionCookieValue, readSessionFromCookieHeader } from "@/lib/admin-auth";
import { getClinic, setClinicStatus, updatePlanExpiry } from "@/lib/clinics";

/** Admin actions on one clinic: suspend / reactivate / update plan+expiry. */

const Action = z.enum(["suspend", "reactivate", "update"]);

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isValidSessionCookieValue(readSessionFromCookieHeader(req.headers.get("cookie")))) {
    return Response.redirect(new URL("/admin/login", req.url), 303);
  }
  const { id } = await ctx.params;
  const clinic = await getClinic(id).catch(() => null);
  if (!clinic) return Response.redirect(new URL("/admin?error=notfound", req.url), 303);

  const form = await req.formData();
  const action = Action.safeParse(form.get("action"));
  if (!action.success) return Response.redirect(new URL("/admin?error=badaction", req.url), 303);

  if (action.data === "suspend") await setClinicStatus(id, "SUSPENDED");
  else if (action.data === "reactivate") await setClinicStatus(id, "ACTIVE");
  else {
    const plan = String(form.get("plan") ?? clinic.plan).trim() || clinic.plan;
    const expiresRaw = String(form.get("expires_at") ?? "").trim();
    const expiresAt = expiresRaw ? new Date(expiresRaw) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      return Response.redirect(new URL("/admin?error=baddate", req.url), 303);
    }
    await updatePlanExpiry(id, plan, expiresAt);
  }
  return Response.redirect(new URL("/admin", req.url), 303);
}
