import { useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { BookOpen, LogOut, LoaderCircle, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useJournal } from "./JournalProvider";
import { useQuery } from "../api/useQuery";
import { initials } from "../shared/format";
import { useAuth, useAuthenticatedUser } from "../auth/AuthProvider";
import { errorMessage } from "../api/client";

function JournalWorkspace({ children }: { children: ReactNode }) {
  const { authors, currentAuthor, selectedId, navigate, store, reportError } =
    useJournal();
  const { logout } = useAuth();
  const user = useAuthenticatedUser();
  const { isMobile, setOpenMobile } = useSidebar();
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutPending = useRef(false);
  const signOut = async () => {
    if (logoutPending.current) return;
    logoutPending.current = true;
    setLoggingOut(true);
    reportError("");
    try {
      await logout();
    } catch (error) {
      reportError(errorMessage(error));
    } finally {
      logoutPending.current = false;
      setLoggingOut(false);
    }
  };
  const allItems = useQuery(store.list()).data ?? [];
  const colleagues = authors.filter((author) => author.id !== currentAuthor.id);
  const selectedExperiment = allItems.find((item) => item.id === selectedId);
  const goTo = (id: number | null) => {
    navigate(id);
    if (isMobile) setOpenMobile(false);
  };
  return (
    <>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="journal-sidebar__header">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                className="journal-sidebar__brand"
                asChild
              >
                <a
                  href="#"
                  onClick={(event) => {
                    event.preventDefault();
                    goTo(null);
                  }}
                >
                  <strong className="journal-sidebar__brand-name">
                    PersonalJournal
                  </strong>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent className="journal-sidebar__content">
          <SidebarGroup>
            <SidebarGroupLabel>Исследования</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={selectedId === null}
                    onClick={() => goTo(null)}
                    className="journal-sidebar__overview"
                  >
                    <BookOpen aria-hidden="true" />
                    <span>Эксперименты</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge
                    className={
                      selectedId === null
                        ? "journal-sidebar__count journal-sidebar__count--active"
                        : "journal-sidebar__count"
                    }
                  >
                    {allItems.length}
                  </SidebarMenuBadge>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          {allItems.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel>Последние эксперименты</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {allItems.slice(0, 6).map((experiment) => (
                    <SidebarMenuItem key={experiment.id}>
                      <SidebarMenuButton
                        isActive={selectedId === experiment.id}
                        onClick={() => goTo(experiment.id)}
                        title={experiment.title}
                        className="journal-sidebar__experiment"
                      >
                        <span className="journal-sidebar__number">
                          {String(experiment.number).padStart(3, "0")}
                        </span>
                        <span>{experiment.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
          <SidebarGroup className="journal-sidebar__colleagues">
            <SidebarGroupLabel className="journal-sidebar__colleagues-label">
              <Users
                className="journal-sidebar__colleagues-icon"
                aria-hidden="true"
              />
              Соавторы
              <Badge
                variant="outline"
                className="journal-sidebar__colleagues-count"
              >
                {colleagues.length}
              </Badge>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              {!colleagues.length ? (
                <p className="journal-sidebar__empty-colleagues">
                  Пока нет совместных работ. Выберите участников при создании
                  эксперимента.
                </p>
              ) : (
                <ul className="journal-sidebar__people">
                  {colleagues.map((author) => (
                    <li className="journal-sidebar__person" key={author.id}>
                      <Avatar className="journal-sidebar__person-avatar">
                        <AvatarFallback className="journal-sidebar__person-initials">
                          {initials(author.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        className="journal-sidebar__person-name"
                        title={author.name}
                      >
                        {author.name}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="journal-sidebar__footer">
          <div className="journal-sidebar__identity">
            <Avatar className="journal-sidebar__user-avatar">
              <AvatarFallback className="journal-sidebar__user-initials">
                {initials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div
              className="journal-sidebar__user"
              title={`${user.name} · ${user.email}`}
            >
              <p className="journal-sidebar__user-name">{user.name}</p>
              <p className="journal-sidebar__email">{user.email}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="journal-sidebar__logout"
            onClick={() => void signOut()}
            disabled={loggingOut}
            aria-label="Выйти из учётной записи"
          >
            {loggingOut ? (
              <LoaderCircle className="journal-spinner" />
            ) : (
              <LogOut />
            )}
            {loggingOut ? "Выходим…" : "Выйти"}
          </Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="journal-shell__inset">
        <header className="journal-shell__header">
          <SidebarTrigger
            aria-label="Открыть меню журнала"
            className="journal-shell__trigger"
          />
          <Separator
            orientation="vertical"
            className="journal-shell__divider"
          />
          <Breadcrumb className="journal-shell__breadcrumb">
            <BreadcrumbList className="journal-shell__breadcrumbs">
              {selectedId !== null && (
                <>
                  <BreadcrumbItem className="journal-shell__breadcrumb-root">
                    <BreadcrumbLink asChild>
                      <a
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          goTo(null);
                        }}
                      >
                        Эксперименты
                      </a>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </>
              )}
              <BreadcrumbItem className="journal-shell__breadcrumb-current">
                <BreadcrumbPage
                  className="journal-shell__breadcrumb-page"
                  title={selectedExperiment?.title}
                >
                  {selectedId !== null
                    ? (selectedExperiment?.title ?? "Эксперимент")
                    : "Эксперименты"}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div
          className="journal-shell__content"
          data-view={selectedId === null ? "list" : "experiment"}
        >
          {children}
        </div>
      </SidebarInset>
    </>
  );
}

export function JournalShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider
      className="journal-shell"
      style={{ "--sidebar-width": "17.5rem" } as CSSProperties}
    >
      <JournalWorkspace>{children}</JournalWorkspace>
    </SidebarProvider>
  );
}
