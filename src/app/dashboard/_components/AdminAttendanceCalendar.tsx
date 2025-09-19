"use client";

import { useState, useEffect, useMemo } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { getMonthlyAttendanceSummary } from '@/app/actions';
import { format, startOfMonth } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Users, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

type DailySummary = {
  total: number;
  byTeam: Record<string, { name: string; total: number; byGeneration: Record<number, number> }>;
};
type AttendanceSummary = Record<string, DailySummary>;

function TeamBreakdown({ date, summary }: { date: Date; summary: DailySummary }) {
    const sortedTeams = useMemo(() => {
        if (!summary || !summary.byTeam) return [];
        return Object.values(summary.byTeam).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    }, [summary]);

    if (!summary) {
        return null;
    }

    return (
        <Card className="mt-4">
            <CardHeader>
                <CardTitle className="text-lg flex justify-between items-center">
                    <span>{format(date, 'M月d日の出勤内訳', { locale: ja })} (合計: {summary.total}人)</span>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <Accordion type="multiple" className="w-full" defaultValue={sortedTeams.map(t => t.name)}>
                    {sortedTeams.map(team => (
                        <AccordionItem value={team.name} key={team.name}>
                            <AccordionTrigger className="text-base py-3">
                                <div className="flex justify-between w-full pr-2">
                                    <span className="font-semibold">{team.name}</span>
                                    <span className="font-normal">{team.total}人</span>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent>
                                <div className="pl-4 space-y-1">
                                    {Object.entries(team.byGeneration)
                                        .sort(([a], [b]) => Number(b) - Number(a))
                                        .map(([generation, count]) => (
                                            <div key={generation} className="flex justify-between items-center text-sm">
                                                <span className="text-muted-foreground">{generation}期生</span>
                                                <span className="font-medium">{count}人</span>
                                            </div>
                                        ))}
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            </CardContent>
        </Card>
    );
}

export default function AdminAttendanceCalendar() {
  const [date, setDate] = useState<Date>(new Date());
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<Date | undefined>();

  const fetchSummary = async (month: Date) => {
    setIsLoading(true);
    const data = await getMonthlyAttendanceSummary(month);
    setSummary(data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchSummary(date);
  }, [date]);
  
  const selectedDaySummary = selectedDay && summary ? summary[format(selectedDay, 'yyyy-MM-dd')] : null;

  const handleMonthChange = (month: Date) => {
    setDate(startOfMonth(month));
    setSelectedDay(undefined);
  };
  
  const handleDayClick = (day: Date) => {
    const dateKey = format(day, 'yyyy-MM-dd');
    if (summary && summary[dateKey] && summary[dateKey].total > 0) {
        if (selectedDay && format(selectedDay, 'yyyy-MM-dd') === dateKey) {
            setSelectedDay(undefined);
        } else {
            setSelectedDay(day);
        }
    } else {
        setSelectedDay(undefined);
    }
  }

  const goToPreviousMonth = () => {
    handleMonthChange(new Date(date.getFullYear(), date.getMonth() - 1, 1));
  }

  const goToNextMonth = () => {
    handleMonthChange(new Date(date.getFullYear(), date.getMonth() + 1, 1));
  }
  
  const refreshData = async () => {
      await fetchSummary(date);
  }
  
  const attendedDays = summary ? Object.keys(summary).filter(dateKey => summary[dateKey].total > 0).map(dateKey => new Date(dateKey)) : [];

  const formatDay = (day: Date) => {
    const dateKey = format(day, 'yyyy-MM-dd');
    const daySummary = summary?.[dateKey];
    return (
        <>
            {day.getDate()}
            {daySummary && daySummary.total > 0 && (
                <div className="attendance-count">
                    <Users className="h-3 w-3" />
                    {daySummary.total}人
                </div>
            )}
        </>
    );
  };


  return (
    <div>
      <div className="flex justify-between items-center mb-2 px-1">
          <h3 className="text-lg font-semibold">
              {format(date, 'yyyy年 M月', { locale: ja })}
          </h3>
          <div className='flex items-center gap-1'>
              <Button variant="ghost" size="icon" onClick={goToPreviousMonth} disabled={isLoading}>
                  <ChevronLeft />
              </Button>
              <Button variant="ghost" size="icon" onClick={goToNextMonth} disabled={isLoading}>
                  <ChevronRight />
              </Button>
              <Button variant="ghost" size="icon" onClick={refreshData} disabled={isLoading}>
                  <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
          </div>
      </div>
      <Calendar
        month={date}
        onMonthChange={handleMonthChange}
        onDayClick={handleDayClick}
        selected={selectedDay}
        disabled={isLoading}
        className="rounded-md border p-0"
        classNames={{
            day_selected: "bg-primary/20 text-primary-foreground font-bold border border-primary",
            months: "p-3",
            cell: "p-0",
            day: "h-20 w-full p-0 text-center text-sm",
        }}
        showOutsideDays
        components={{
          Caption: () => null,
        }}
        modifiers={{
            attended: attendedDays
        }}
        modifiersClassNames={{
            attended: 'has-attendance'
        }}
        formatters={{
            formatDay
        }}
      />
      {selectedDay && selectedDaySummary && (
        <TeamBreakdown date={selectedDay} summary={selectedDaySummary} />
      )}
    </div>
  );
}
