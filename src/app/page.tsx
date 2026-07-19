import { redirect } from "next/navigation";

/** The service has no public pages — the root is the admin's front door. */
export default function Home() {
  redirect("/admin");
}
