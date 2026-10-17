import { useId } from "react";
import {
  ArrowUpRight,
  FlaskConical,
  History,
  SlidersHorizontal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import type { ExperimentSummary } from "../../domain/models";
import { UserAvatar } from "../../shared/identity";
import { countLabel, day } from "../../shared/format";
import { WorkModeBadge } from "./WorkModeBadge";

export function ExperimentCard({
  experiment,
  onOpen,
}: {
  experiment: ExperimentSummary;
  onOpen: () => void;
}) {
  const titleId = useId();
  return (
    <a
      href={`#experiment=${experiment.id}`}
      aria-labelledby={titleId}
      className="experiment-card-link"
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        onOpen();
      }}
    >
      <Card className="experiment-card">
        <CardHeader className="experiment-card__header">
          <div className="experiment-card__top">
            <Badge variant="outline" className="experiment-card__number">
              <FlaskConical aria-hidden="true" />
              EXP · {String(experiment.number).padStart(3, "0")}
            </Badge>
            <WorkModeBadge mode={experiment.work_mode} />
          </div>
          <h3 id={titleId} className="card-title experiment-card__title">
            <span>{experiment.title}</span>
            <ArrowUpRight
              className="experiment-card__arrow"
              aria-hidden="true"
            />
          </h3>
        </CardHeader>
        <CardContent className="experiment-card__content">
          <p className="experiment-card__objective">{experiment.objective}</p>
          {experiment.work_mode === "shared" && (
            <p
              className="experiment-card__participants"
              title={experiment.participants
                .map((member) => member.name)
                .join(", ")}
            >
              Участники:{" "}
              {experiment.participants.map((member) => member.name).join(", ")}
            </p>
          )}
          <div className="experiment-card__metrics">
            <span>
              <SlidersHorizontal aria-hidden="true" />
              {countLabel(
                experiment.attempt_count,
                "попытка",
                "попытки",
                "попыток",
              )}
            </span>
            <span>
              <History aria-hidden="true" />
              {countLabel(
                experiment.event_count,
                "запись",
                "записи",
                "записей",
              )}
            </span>
          </div>
        </CardContent>
        <CardFooter className="experiment-card__footer">
          <div className="experiment-card__author">
            <UserAvatar
              name={experiment.author}
              className="experiment-card__avatar"
            />
            <span title={experiment.author}>{experiment.author}</span>
          </div>
          <time dateTime={experiment.date}>{day(experiment.date)}</time>
        </CardFooter>
      </Card>
    </a>
  );
}
