import { useState } from "react";
import { ListFilter, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useJournal } from "../../app/JournalProvider";

export function SearchFilters() {
  const { authors, filters, updateFilter, resetFilters } = useJournal();
  const { search, parameter, author, dateFrom, dateTo } = filters;
  const [open, setOpen] = useState(false);
  const filtered = Object.values(filters).some(Boolean);
  const advancedCount = [author, parameter, dateFrom, dateTo].filter(
    Boolean,
  ).length;
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section className="journal-search" aria-label="Поиск и фильтры">
        <div className="journal-search__toolbar">
          <div className="journal-search__field">
            <Search className="journal-search__icon" aria-hidden="true" />
            <Input
              aria-label="Поиск экспериментов"
              placeholder="Поиск по названию, параметрам и результатам"
              value={search}
              onChange={(event) => updateFilter("search", event.target.value)}
              className="journal-search__input"
            />
            {search && (
              <Button
                variant="ghost"
                size="icon"
                className="journal-search__clear"
                onClick={() => updateFilter("search", "")}
                aria-label="Очистить поиск"
              >
                <X />
              </Button>
            )}
          </div>
          <CollapsibleTrigger asChild>
            <Button
              variant={open ? "secondary" : "outline"}
              className="journal-search__toggle"
            >
              <ListFilter />
              Фильтры
              {advancedCount > 0 && (
                <Badge variant="outline">{advancedCount}</Badge>
              )}
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="journal-search__filters">
            <div className="journal-search__filter journal-search__author">
              <Label htmlFor="filter-author">Участник</Label>
              <NativeSelect
                id="filter-author"
                aria-label="Фильтр по автору"
                value={author}
                onChange={(event) => updateFilter("author", event.target.value)}
              >
                <NativeSelectOption value="">Все участники</NativeSelectOption>
                {authors.map((member) => (
                  <NativeSelectOption key={member.id} value={member.id}>
                    {member.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="journal-search__filter">
              <Label htmlFor="filter-parameter">
                Параметр, значение или единица
              </Label>
              <Input
                id="filter-parameter"
                placeholder="Например, температура или 40"
                value={parameter}
                onChange={(event) =>
                  updateFilter("parameter", event.target.value)
                }
              />
            </div>
            <div className="journal-search__filter">
              <Label htmlFor="filter-date-from">Дата эксперимента: с</Label>
              <Input
                id="filter-date-from"
                type="date"
                value={dateFrom}
                onChange={(event) =>
                  updateFilter("dateFrom", event.target.value)
                }
              />
            </div>
            <div className="journal-search__filter">
              <Label htmlFor="filter-date-to">По</Label>
              <Input
                id="filter-date-to"
                type="date"
                value={dateTo}
                onChange={(event) => updateFilter("dateTo", event.target.value)}
              />
            </div>
            <Button variant="ghost" onClick={resetFilters} disabled={!filtered}>
              Сбросить
            </Button>
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
