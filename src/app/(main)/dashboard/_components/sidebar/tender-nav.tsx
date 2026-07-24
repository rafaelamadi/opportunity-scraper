"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { Briefcase } from "lucide-react";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface TenderNavProps {
  sources: string[];
}

export function TenderNav({ sources }: TenderNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSource = searchParams.get("source");

  const isActive = (source: string | null) => {
    return pathname.includes("/tenders") && currentSource === source;
  };

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Tender Sources</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={isActive("all")}>
            <Link href="/dashboard/tenders?source=all">
              <Briefcase className="h-4 w-4" />
              <span>All Sources</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>

        {sources.length > 0 ? (
          <>
            {sources.map((source) => (
              <SidebarMenuItem key={source}>
                <SidebarMenuButton asChild isActive={isActive(source)}>
                  <Link href={`/dashboard/tenders?source=${encodeURIComponent(source)}`}>
                    <Briefcase className="h-4 w-4" />
                    <span>{source}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </>
        ) : (
          <SidebarMenuItem>
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No sources found</div>
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}
