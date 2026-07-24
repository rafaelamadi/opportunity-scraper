import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard/tenders?source=all");
  return <>Coming Soon</>;
}
