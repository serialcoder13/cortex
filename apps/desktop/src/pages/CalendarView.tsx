import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { storage } from "../lib/storage";
import { CalendarSkeleton } from "../components/Skeleton";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function dailyNotePath(year: number, month: number, day: number): string {
  return `dates/${year}-${pad2(month + 1)}/${pad2(day)}.md`;
}

export function CalendarView() {
  const navigate = useNavigate();
  const today = new Date();

  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [loading, setLoading] = useState(true);

  // Set of paths that exist for the current month (e.g. "dates/2026-03/21.md")
  const [existingPaths, setExistingPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const allDocs = await storage.listDocuments();
        if (cancelled) return;

        const prefix = `dates/${currentYear}-${pad2(currentMonth + 1)}/`;
        const paths = new Set<string>(
          allDocs.filter((d) => d.path.startsWith(prefix)).map((d) => d.path),
        );
        setExistingPaths(paths);
      } catch (err) {
        console.error("Failed to list documents:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [currentYear, currentMonth]);

  const goToPrevMonth = useCallback(() => {
    setCurrentMonth((m) => {
      if (m === 0) {
        setCurrentYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setCurrentMonth((m) => {
      if (m === 11) {
        setCurrentYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }, []);

  const goToToday = useCallback(() => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  }, []);

  const handleDayClick = useCallback(
    async (day: number) => {
      const path = dailyNotePath(currentYear, currentMonth, day);

      if (existingPaths.has(path)) {
        navigate(`/doc?path=${encodeURIComponent(path)}`);
        return;
      }

      // Check if clicking today's date — use the dedicated createDailyNote
      const isToday =
        currentYear === today.getFullYear() &&
        currentMonth === today.getMonth() &&
        day === today.getDate();

      try {
        if (isToday) {
          const createdPath = await storage.createDailyNote();
          navigate(`/doc?path=${encodeURIComponent(createdPath)}`);
        } else {
          // For non-today dates, create a blank daily note manually
          const title = `${MONTH_NAMES[currentMonth]} ${day}, ${currentYear}`;
          const content = `---\ntitle: "${title}"\ndoc_type: daily\ncreated: ${currentYear}-${pad2(currentMonth + 1)}-${pad2(day)}T00:00:00Z\n---\n\n# ${title}\n\n`;
          await storage.writeDocument(path, content);
          navigate(`/doc?path=${encodeURIComponent(path)}`);
        }
      } catch (err) {
        console.error("Failed to create daily note:", err);
      }
    },
    [currentYear, currentMonth, existingPaths, navigate],
  );

  // Build grid cells with stable keys
  const totalDays = daysInMonth(currentYear, currentMonth);
  const startDay = firstDayOfWeek(currentYear, currentMonth);
  const cells: { key: string; day: number | null }[] = [];

  // Leading empty cells
  for (let i = 0; i < startDay; i++) {
    cells.push({ key: `empty-start-${i}`, day: null });
  }
  // Day cells
  for (let d = 1; d <= totalDays; d++) {
    cells.push({ key: `day-${d}`, day: d });
  }
  // Trailing empty cells to fill last row
  let trailIdx = 0;
  while (cells.length % 7 !== 0) {
    cells.push({ key: `empty-end-${trailIdx++}`, day: null });
  }

  const isToday = (day: number) =>
    day === today.getDate() &&
    currentMonth === today.getMonth() &&
    currentYear === today.getFullYear();

  const hasNote = (day: number) =>
    existingPaths.has(dailyNotePath(currentYear, currentMonth, day));

  return (
    <div className="mx-auto max-w-2xl p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">
          {MONTH_NAMES[currentMonth]} {currentYear}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToToday}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          >
            Today
          </button>
          <button
            type="button"
            onClick={goToPrevMonth}
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
            aria-label="Previous month"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path
                fillRule="evenodd"
                d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={goToNextMonth}
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
            aria-label="Next month"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      {loading ? (
        <CalendarSkeleton />
      ) : (
        <>
          {/* Day-of-week headers */}
          <div className="mb-2 grid grid-cols-7 text-center text-xs font-medium text-neutral-500">
            {DAY_NAMES.map((name) => (
              <div key={name} className="py-2">
                {name}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-px rounded-lg border border-neutral-800 bg-neutral-800">
            {cells.map(({ key, day }, idx) => {
              const cornerClasses = [
                idx < 7 && idx === 0 ? "rounded-tl-lg" : "",
                idx < 7 && idx === 6 ? "rounded-tr-lg" : "",
                idx >= cells.length - 7 && idx % 7 === 0 ? "rounded-bl-lg" : "",
                idx >= cells.length - 7 && idx % 7 === 6 ? "rounded-br-lg" : "",
              ]
                .filter(Boolean)
                .join(" ");

              if (day === null) {
                return (
                  <div
                    key={key}
                    className={`min-h-[4.5rem] bg-neutral-950 p-2 ${cornerClasses}`}
                  />
                );
              }

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  className={`relative flex min-h-[4.5rem] flex-col items-center bg-neutral-950 p-2 transition-colors hover:bg-neutral-900 ${cornerClasses}`}
                >
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                      isToday(day)
                        ? "ring-2 ring-blue-500 font-semibold text-blue-400"
                        : "text-neutral-300"
                    }`}
                  >
                    {day}
                  </span>
                  {hasNote(day) && (
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-500" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
