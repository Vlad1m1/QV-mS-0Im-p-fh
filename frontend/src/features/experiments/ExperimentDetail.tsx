import { useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ChevronDown,
  CircleAlert,
  ChartNoAxesCombined,
  Clock3,
  GitCompareArrows,
  History,
  Microscope,
  Pencil,
  SlidersHorizontal,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useJournal } from "../../app/JournalProvider";
import { useQuery } from "../../api/useQuery";
import { errorMessage } from "../../api/client";
import { downloadExperiment } from "../../shared/download";
import type { ExportFormat } from "../../domain/models";
import { UserAvatar } from "../../shared/identity";
import { day } from "../../shared/format";
import { AttemptsPanel } from "../attempts/AttemptsPanel";
import { HistoryPanel } from "../history/HistoryPanel";
import { ComparePanel } from "../compare/ComparePanel";
import { SummaryPanel } from "../summary/SummaryPanel";
import { WorkModeBadge } from "./WorkModeBadge";

export function ExperimentDetail({ id }: { id: number }) {
  const { store, navigate, openModal, notify, reportError } = useJournal();
  const query = useQuery(store.detail(id));
  const detail = query.data;
  const [tab, setTab] = useState("attempts");
  const tabsRef = useRef<HTMLDivElement>(null);
  const changeTab = (next: string) => {
    if (next === tab) return;
    setTab(next);
    tabsRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  };
  async function download(format: ExportFormat) {
    try {
      if (!detail) return;
      await downloadExperiment(id, detail.number, format);
      notify(`Эксперимент выгружен в ${format.toUpperCase()}`);
    } catch (error) {
      reportError(errorMessage(error));
    }
  }
  if (!detail)
    return query.error ? (
      <Alert>
        <CircleAlert />
        <AlertTitle>Не удалось открыть эксперимент</AlertTitle>
        <AlertDescription className="journal-error">
          <p>{query.error}</p>
          <div className="experiment-detail__retry">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void store.detail(id).refresh()}
            >
              Повторить
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(null)}>
              Все эксперименты
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    ) : (
      <div
        className="experiment-detail__loading"
        role="status"
        aria-label="Открываем эксперимент"
      >
        <Skeleton />
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  return (
    <div className="experiment-detail">
      {query.error && (
        <Alert>
          <CircleAlert />
          <AlertDescription>{query.error}</AlertDescription>
        </Alert>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="experiment-detail__back"
        onClick={() => navigate(null)}
      >
        <ArrowLeft />
        Все эксперименты
      </Button>
      <div className="experiment-detail__heading">
        <div className="experiment-detail__heading-main">
          <div className="experiment-detail__kicker">
            <Badge variant="outline" className="experiment-detail__number">
              ЭКСПЕРИМЕНТ {String(detail.number).padStart(3, "0")}
            </Badge>
            <WorkModeBadge mode={detail.work_mode} />
          </div>
          <h1>{detail.title}</h1>
          <div className="experiment-detail__metadata">
            <span className="experiment-detail__author">
              <UserAvatar
                name={detail.author}
                className="experiment-detail__avatar"
              />
              <span>{detail.author}</span>
            </span>
            <span className="experiment-detail__date">
              <Clock3 aria-hidden="true" />
              <time dateTime={detail.date}>{day(detail.date)}</time>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="experiment-detail__edit"
              onClick={() => openModal({ kind: "experiment", edit: detail })}
            >
              <Pencil />
              Изменить карточку
            </Button>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="experiment-detail__export">
              <ArrowDownToLine />
              Экспорт
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="experiment-export">
            <DropdownMenuItem
              onSelect={() => void download("csv")}
              className="experiment-export__item"
            >
              <span>
                <span>Сводка CSV</span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => void download("json")}
              className="experiment-export__item"
            >
              <span>
                <span>Полный журнал JSON</span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Card className="experiment-objective">
        <CardContent>
          <Microscope aria-hidden="true" />
          <h2>Гипотеза и цель исследования</h2>
          <p>{detail.objective}</p>
        </CardContent>
      </Card>
      <div className="experiment-members" aria-label="Участники эксперимента">
        <span className="experiment-members__title">
          {detail.work_mode === "solo"
            ? "Личный доступ"
            : "Участники совместной работы"}
        </span>
        <div className="experiment-members__list">
          {detail.participants.map((member) => (
            <span key={member.id} className="experiment-members__member">
              <UserAvatar
                name={member.name}
                className="experiment-detail__avatar"
              />
              <span>{member.name}</span>
            </span>
          ))}
        </div>
      </div>
      <Tabs
        ref={tabsRef}
        value={tab}
        onValueChange={changeTab}
        className="experiment-tabs"
      >
        <div className="experiment-tabs__header">
          <TabsList
            className="experiment-tabs__list"
            aria-label="Разделы эксперимента"
          >
            <TabsTrigger value="attempts">
              <SlidersHorizontal className="experiment-tabs__icon" />
              Попытки
              <Badge variant="secondary" className="experiment-tabs__count">
                {detail.attempts.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="experiment-tabs__icon" />
              История
              <Badge variant="secondary" className="experiment-tabs__count">
                {detail.history.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="compare">
              <GitCompareArrows className="experiment-tabs__icon" />
              Сравнение
            </TabsTrigger>
            <TabsTrigger value="summary">
              <ChartNoAxesCombined className="experiment-tabs__icon" />
              Сводка
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="attempts" className="experiment-tabs__panel">
          <AttemptsPanel experiment={detail} />
        </TabsContent>
        <TabsContent value="history" className="experiment-tabs__panel">
          <HistoryPanel experiment={detail} />
        </TabsContent>
        <TabsContent value="compare" className="experiment-tabs__panel">
          <ComparePanel attempts={detail.attempts} />
        </TabsContent>
        <TabsContent value="summary" className="experiment-tabs__panel">
          <SummaryPanel key={id} experiment={detail} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
