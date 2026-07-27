"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Bookmark, CircleHelp, ClipboardList, Command, Database, File, Search, Settings } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { APP_CONFIG } from "@/config/app-config";
import { rootUser } from "@/data/users";
import type { ScrapeStatus } from "@/lib/get-scrape-status";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { NavUser } from "./nav-user";
import { ScrapeStatusCard } from "./scrape-status-card";
import { SidebarSupportCard } from "./sidebar-support-card";
import { TenderNav } from "./tender-nav";

const _data = {
  navSecondary: [
    {
      title: "Settings",
      url: "#",
      icon: Settings,
    },
    {
      title: "Get Help",
      url: "#",
      icon: CircleHelp,
    },
    {
      title: "Search",
      url: "#",
      icon: Search,
    },
  ],
  documents: [
    {
      name: "Data Library",
      url: "#",
      icon: Database,
    },
    {
      name: "Reports",
      url: "#",
      icon: ClipboardList,
    },
    {
      name: "Word Assistant",
      url: "#",
      icon: File,
    },
  ],
};

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  sources?: string[];
  scrapeStatus?: ScrapeStatus;
}

export function AppSidebar({ sources = [], scrapeStatus = null, ...props }: AppSidebarProps) {
  const pathname = usePathname();
  const { sidebarVariant, sidebarCollapsible, isSynced } = usePreferencesStore(
    useShallow((s) => ({
      sidebarVariant: s.values.sidebar_variant,
      sidebarCollapsible: s.values.sidebar_collapsible,
      isSynced: s.isSynced,
    })),
  );

  const variant = isSynced ? sidebarVariant : props.variant;
  const collapsible = isSynced ? sidebarCollapsible : props.collapsible;

  return (
    <Sidebar {...props} variant={variant} collapsible={collapsible}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link prefetch={false} href="/dashboard/tenders?source=all">
                <Command />
                <span className="font-semibold text-base">Opportunity Scraper</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.includes("/bookmarks")}>
                <Link href="/dashboard/bookmarks">
                  <Bookmark className="h-4 w-4" />
                  <span>My Bookmarks</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <TenderNav sources={sources} />
      </SidebarContent>
      <SidebarFooter>
        <ScrapeStatusCard status={scrapeStatus} />
        <SidebarSupportCard />
        <NavUser user={rootUser} />
      </SidebarFooter>
    </Sidebar>
  );
}
