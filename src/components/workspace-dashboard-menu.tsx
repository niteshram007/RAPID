"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { ChartColumnIncreasing, CheckCheck, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getCurrentFinancialYear } from "@/lib/financial-years";

type DashboardTimeframe = "annual" | "mtd" | "ytd" | "quarter";
type DashboardQuarter = "Q1" | "Q2" | "Q3" | "Q4";
type MtdMode = "current" | "prior" | "custom";
type DashboardDraftSelection = {
  financialYear: string;
  dashboardTimeframe: DashboardTimeframe;
  dashboardMonth: FiscalMonth;
  dashboardQuarter: DashboardQuarter;
};

type FiscalMonth = (typeof FISCAL_MONTH_OPTIONS)[number];

const FISCAL_MONTH_OPTIONS = [
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
  "Jan",
  "Feb",
  "Mar",
] as const;

const QUARTER_OPTIONS: DashboardQuarter[] = ["Q1", "Q2", "Q3", "Q4"];

const FISCAL_MONTH_LABELS: Record<FiscalMonth, string> = {
  Apr: "April",
  May: "May",
  Jun: "June",
  Jul: "July",
  Aug: "August",
  Sep: "September",
  Oct: "October",
  Nov: "November",
  Dec: "December",
  Jan: "January",
  Feb: "February",
  Mar: "March",
};

const QUARTER_MONTH_MAP: Record<DashboardQuarter, readonly FiscalMonth[]> = {
  Q1: ["Apr", "May", "Jun"],
  Q2: ["Jul", "Aug", "Sep"],
  Q3: ["Oct", "Nov", "Dec"],
  Q4: ["Jan", "Feb", "Mar"],
};

const STORAGE_KEY = "rapid-analytics-kiosk-v2";

function resolveDashboardTimeframe(
  value: string | null,
  legacyQuarter: string | null,
): DashboardTimeframe {
  if (value === "annual" || value === "mtd" || value === "ytd" || value === "quarter") {
    return value;
  }
  if (value === "fy") {
    return "annual";
  }
  if (value === "q1" || value === "q2" || value === "q3" || value === "q4" || value === "quarter") {
    return "quarter";
  }
  if (legacyQuarter === "Q1" || legacyQuarter === "Q2" || legacyQuarter === "Q3" || legacyQuarter === "Q4") {
    return "quarter";
  }
  return "annual";
}

function resolveCurrentFiscalMonth(): FiscalMonth {
  const shortMonth = new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date());
  return FISCAL_MONTH_OPTIONS.includes(shortMonth as FiscalMonth)
    ? (shortMonth as FiscalMonth)
    : "Apr";
}

function resolveDashboardMonth(value: string | null | undefined): FiscalMonth {
  const normalized = String(value ?? "").trim();
  return FISCAL_MONTH_OPTIONS.includes(normalized as FiscalMonth)
    ? (normalized as FiscalMonth)
    : resolveCurrentFiscalMonth();
}

function quarterForMonth(month: FiscalMonth): DashboardQuarter {
  if (QUARTER_MONTH_MAP.Q1.includes(month)) {
    return "Q1";
  }
  if (QUARTER_MONTH_MAP.Q2.includes(month)) {
    return "Q2";
  }
  if (QUARTER_MONTH_MAP.Q3.includes(month)) {
    return "Q3";
  }
  return "Q4";
}

function resolveDashboardQuarter(
  value: string | null | undefined,
  legacyTimeframe: string | null,
  month: FiscalMonth,
): DashboardQuarter {
  if (value === "Q1" || value === "Q2" || value === "Q3" || value === "Q4") {
    return value;
  }
  if (legacyTimeframe === "q1") {
    return "Q1";
  }
  if (legacyTimeframe === "q2") {
    return "Q2";
  }
  if (legacyTimeframe === "q3") {
    return "Q3";
  }
  if (legacyTimeframe === "q4") {
    return "Q4";
  }
  return quarterForMonth(month);
}

function resolveValidFinancialYear(value: string | null | undefined, options: string[]) {
  const normalized = String(value ?? "").trim();
  if (normalized && options.includes(normalized)) {
    return normalized;
  }
  const currentFinancialYear = getCurrentFinancialYear();
  if (options.includes(currentFinancialYear)) {
    return currentFinancialYear;
  }
  return options.at(-1) ?? currentFinancialYear;
}

function getRollingFinancialYears(count = 4) {
  const currentFinancialYear = getCurrentFinancialYear();
  const currentStart = Number(currentFinancialYear.split("-")[0]);
  const fallbackStart = new Date().getFullYear();
  const startYear = Number.isFinite(currentStart) ? currentStart : fallbackStart;

  return Array.from({ length: count }, (_, index) => {
    const year = startYear - count + 1 + index;
    return `${year}-${year + 1}`;
  });
}

function monthBefore(month: FiscalMonth) {
  const currentIndex = FISCAL_MONTH_OPTIONS.indexOf(month);
  if (currentIndex <= 0) {
    return FISCAL_MONTH_OPTIONS[FISCAL_MONTH_OPTIONS.length - 1];
  }
  return FISCAL_MONTH_OPTIONS[currentIndex - 1];
}

function resolveMtdMode(rawMode: string | null, selection: DashboardDraftSelection): MtdMode {
  if (rawMode === "current" || rawMode === "prior" || rawMode === "custom") {
    return rawMode;
  }
  if (selection.dashboardTimeframe !== "mtd") {
    return "current";
  }
  const currentMonth = resolveCurrentFiscalMonth();
  if (selection.dashboardMonth === currentMonth) {
    return "current";
  }
  if (selection.dashboardMonth === monthBefore(currentMonth)) {
    return "prior";
  }
  return "custom";
}

function resolveMtdModeForMonth(month: FiscalMonth): MtdMode {
  const currentMonth = resolveCurrentFiscalMonth();
  if (month === currentMonth) {
    return "current";
  }
  if (month === monthBefore(currentMonth)) {
    return "prior";
  }
  return "custom";
}

function applyPeriodWindow(
  next: URLSearchParams,
  timeframe: DashboardTimeframe,
  month: FiscalMonth,
  quarter: DashboardQuarter,
) {
  next.delete("dashboardMonth");
  next.delete("dashboardQuarter");

  if (timeframe === "annual") {
    next.set("periodFrom", "Apr");
    next.set("periodTo", "Mar");
    return;
  }

  if (timeframe === "quarter") {
    const quarterMonths = QUARTER_MONTH_MAP[quarter];
    next.set("dashboardQuarter", quarter);
    next.set("periodFrom", quarterMonths[0]);
    next.set("periodTo", quarterMonths[quarterMonths.length - 1]);
    return;
  }

  next.set("dashboardMonth", month);
  if (timeframe === "ytd") {
    next.set("periodFrom", "Apr");
    next.set("periodTo", month);
    return;
  }

  next.set("periodFrom", month);
  next.set("periodTo", month);
}

function formatTimeframeSummary(selection: DashboardDraftSelection) {
  if (selection.dashboardTimeframe === "annual") {
    return "Annual";
  }
  if (selection.dashboardTimeframe === "quarter") {
    return selection.dashboardQuarter;
  }
  if (selection.dashboardTimeframe === "ytd") {
    return `YTD ${selection.dashboardMonth}`;
  }
  return `MTD ${selection.dashboardMonth}`;
}

function angleFromPoint(event: PointerEvent | ReactPointerEvent<HTMLElement>, bounds: DOMRect) {
  const x = event.clientX - bounds.left - bounds.width / 2;
  const y = event.clientY - bounds.top - bounds.height / 2;
  const radius = Math.sqrt(x * x + y * y);
  const angle = (Math.atan2(y, x) * (180 / Math.PI) + 90 + 360) % 360;
  return { angle, radius };
}

function indexFromAngle(
  angle: number,
  segmentCount: number,
  renderedRotationDegrees: number,
) {
  if (segmentCount <= 0) {
    return 0;
  }
  const segmentSize = 360 / segmentCount;
  const normalizedAngle =
    (angle - renderedRotationDegrees + 360) % 360;
  return Math.floor((normalizedAngle + segmentSize / 2) / segmentSize) % segmentCount;
}

let workspaceDialAudioContext: AudioContext | null = null;

function playWorkspaceDialTick() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const audioWindow = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioContextConstructor =
      audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextConstructor) {
      return;
    }

    if (!workspaceDialAudioContext) {
      workspaceDialAudioContext = new AudioContextConstructor();
    }
    const context = workspaceDialAudioContext;
    if (!context) {
      return;
    }
    if (context.state === "suspended") {
      void context.resume();
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime;
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(760, start);
    oscillator.frequency.exponentialRampToValueAtTime(520, start + 0.045);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.045, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.055);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.06);
  } catch {
    // Sound is cosmetic; keep the dial functional if WebAudio is blocked.
  }
}

function CompactWorkspaceDialCard({
  indexLabel,
  title,
  subtitle,
  selectionLabel,
  segments,
  selectedSegment,
  active,
  onSelect,
  onSegmentChange,
  onPrevious,
  onNext,
}: {
  indexLabel: string;
  title: string;
  subtitle: string;
  selectionLabel: string;
  segments: string[];
  selectedSegment: string;
  active: boolean;
  onSelect: () => void;
  onSegmentChange?: (segment: string) => void;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const gradientId = useId().replace(/:/g, "");
  const dialRef = useRef<HTMLDivElement | null>(null);
  const draggingPointerIdRef = useRef<number | null>(null);
  const wheelAccumulatorRef = useRef(0);
  const selectedIndex = Math.max(0, segments.findIndex((segment) => segment === selectedSegment));
  const step = segments.length > 0 ? 360 / segments.length : 360;
  const rotation = selectedIndex * step;
  const canStep = segments.length > 1 || Boolean(onPrevious && onNext);
  const labelRadius = segments.length <= 4 ? 60 : segments.length <= 8 ? 62 : 65;
  const tickCount = segments.length <= 4 ? 32 : 48;
  const maxLabelLength = segments.reduce((maximum, segment) => Math.max(maximum, segment.length), 0);
  const labelFontSize =
    segments.length <= 4
      ? 9.5
      : maxLabelLength >= 8
        ? 6.9
        : maxLabelLength >= 6
          ? 7.3
          : 8;

  function chooseSegment(index: number) {
    if (segments.length === 0) {
      onSelect();
      return;
    }
    const nextIndex = (index + segments.length) % segments.length;
    const nextSegment = segments[nextIndex];
    if (!nextSegment) {
      return;
    }

    onSelect();
    if (nextSegment !== selectedSegment) {
      if (onSegmentChange) {
        onSegmentChange(nextSegment);
      } else if (nextIndex < selectedIndex) {
        onPrevious?.();
      } else if (nextIndex > selectedIndex) {
        onNext?.();
      }
      playWorkspaceDialTick();
    }
  }

  function chooseFromPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = dialRef.current?.getBoundingClientRect();
    if (!bounds || segments.length === 0) {
      return;
    }
    const { angle } = angleFromPoint(event, bounds);
    chooseSegment(indexFromAngle(angle, segments.length, 0));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    draggingPointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    chooseFromPointer(event);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (draggingPointerIdRef.current !== event.pointerId) {
      return;
    }
    event.preventDefault();
    chooseFromPointer(event);
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (draggingPointerIdRef.current !== event.pointerId) {
      return;
    }
    draggingPointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!canStep) {
      return;
    }
    event.preventDefault();
    const dominantDelta =
      Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (dominantDelta === 0) {
      return;
    }
    wheelAccumulatorRef.current += dominantDelta;
    if (Math.abs(wheelAccumulatorRef.current) < 18) {
      return;
    }
    const direction = wheelAccumulatorRef.current > 0 ? 1 : -1;
    wheelAccumulatorRef.current = 0;
    chooseSegment(selectedIndex + direction);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      chooseSegment(selectedIndex - 1);
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      chooseSegment(selectedIndex + 1);
    }
  }

  return (
    <div
      className={`min-w-0 rounded-[18px] border p-2 transition ${
        active
          ? "border-[#003323]/35 bg-[linear-gradient(145deg,rgba(255,253,238,0.9),rgba(241,245,249,0.78),rgba(65,105,225,0.18))] shadow-[0_20px_42px_rgba(0,51,35,0.22)] backdrop-blur-2xl"
          : "border-[#003323]/18 bg-[linear-gradient(145deg,rgba(255,253,238,0.78),rgba(255,255,255,0.62),rgba(65,105,225,0.1))] shadow-[0_12px_28px_rgba(0,51,35,0.14)] backdrop-blur-xl hover:border-[#003323]/28"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="block w-full text-left"
      >
        <div className="px-0.5">
          <p className="truncate font-serif text-[0.92rem] font-semibold tracking-[0.02em] text-[#003323]">
            {indexLabel}. {title}
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-[#003323]/55">
            <span className="h-px flex-1 bg-[#003323]/18" />
            <span className="truncate text-[10.5px] font-semibold tracking-[0.03em] text-[#003323]/70">
              {subtitle}
            </span>
            <span className="h-px flex-1 bg-[#003323]/18" />
          </div>
        </div>
      </button>

      <div
        ref={dialRef}
        role="slider"
        tabIndex={0}
        aria-label={`${title} dial`}
        aria-valuemin={1}
        aria-valuemax={Math.max(1, segments.length)}
        aria-valuenow={selectedIndex + 1}
        aria-valuetext={selectionLabel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={() => {
          draggingPointerIdRef.current = null;
        }}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        className="relative mx-auto mt-1.5 aspect-square w-full max-w-[112px] touch-none select-none rounded-full outline-none cursor-grab focus-visible:ring-2 focus-visible:ring-[#4169e1]/50 active:cursor-grabbing"
      >
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_28%_24%,rgba(255,255,255,0.98),rgba(255,253,238,0.86)_45%,rgba(0,51,35,0.2)_100%)] shadow-[inset_0_2px_6px_rgba(255,255,255,0.92),inset_0_-10px_18px_rgba(0,51,35,0.14),0_14px_28px_rgba(0,51,35,0.2)]" />
        <svg viewBox="0 0 128 128" className="absolute inset-0 overflow-visible">
          <defs>
            <radialGradient id={`workspace-face-${gradientId}`} cx="32%" cy="26%">
              <stop offset="0%" stopColor="#8ea3ff" />
              <stop offset="52%" stopColor="#4169e1" />
              <stop offset="100%" stopColor="#17339d" />
            </radialGradient>
            <radialGradient id={`workspace-knob-${gradientId}`} cx="32%" cy="28%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="48%" stopColor="#fffdee" />
              <stop offset="100%" stopColor="#d9d1ad" />
            </radialGradient>
          </defs>

          <circle cx="64" cy="64" r="50" fill="none" stroke="#024a70" strokeOpacity="0.24" strokeWidth="1.2" />
          <circle cx="64" cy="64" r="46" fill="none" stroke="#4169e1" strokeOpacity="0.32" strokeWidth="0.8" />
          {segments.map((segment, index) => {
            const angle = -90 + index * step;
            const radians = (angle * Math.PI) / 180;
            const x = 64 + Math.cos(radians) * labelRadius;
            const y = 64 + Math.sin(radians) * labelRadius;
            const selected = index === selectedIndex;

            return (
              <text
                key={`${title}-label-${segment}`}
                x={x}
                y={y}
                fill={selected ? "#024a70" : "#24324f"}
                fontSize={selected ? labelFontSize + 0.7 : labelFontSize}
                fontWeight={selected ? "800" : "700"}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ textTransform: "uppercase" }}
              >
                {segment}
              </text>
            );
          })}

          <g transform={`rotate(${rotation} 64 64)`}>
            <path
              d="M64 4 L71 18 L57 18 Z"
              fill={active ? "#e43d46" : "#024a70"}
              stroke="rgba(255,253,238,0.86)"
              strokeWidth="0.8"
            />
            <circle
              cx="64"
              cy="64"
              r="38"
              fill={`url(#workspace-face-${gradientId})`}
              stroke="rgba(255,253,238,0.82)"
              strokeWidth="1.8"
            />
            <circle
              cx="64"
              cy="64"
              r="33.5"
              fill="none"
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="0.9"
            />
            {Array.from({ length: tickCount }).map((_, index) => {
              const angle = (index / tickCount) * Math.PI * 2 - Math.PI / 2;
              const major = index % Math.max(1, Math.round(tickCount / Math.max(segments.length, 1))) === 0;
              const innerRadius = major ? 39 : 42;
              const outerRadius = 45;
              const x1 = 64 + Math.cos(angle) * innerRadius;
              const y1 = 64 + Math.sin(angle) * innerRadius;
              const x2 = 64 + Math.cos(angle) * outerRadius;
              const y2 = 64 + Math.sin(angle) * outerRadius;
              return (
                <line
                  key={`${title}-tick-${index}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={major ? "#fffdee" : "#c9d6ff"}
                  strokeOpacity={major ? "0.9" : "0.58"}
                  strokeWidth={major ? "1.1" : "0.7"}
                  strokeLinecap="round"
                />
              );
            })}
          </g>

          <circle
            cx="64"
            cy="64"
            r="16.5"
            fill={`url(#workspace-knob-${gradientId})`}
            stroke="rgba(255,253,238,0.85)"
            strokeWidth="1.5"
          />
          <circle
            cx="64"
            cy="64"
            r="11.5"
            fill="none"
            stroke="rgba(0,51,35,0.26)"
            strokeWidth="0.9"
          />
        </svg>
      </div>

      <p className={`mt-1.5 truncate text-center font-bold tracking-tight text-[#003323] ${selectionLabel.includes("-") ? "text-[0.82rem]" : "text-[0.96rem]"}`}>
        {selectionLabel}
      </p>

      {canStep ? (
        <div className="mt-1.5 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => chooseSegment(selectedIndex - 1)}
            className="rounded-full border border-[#003323]/16 bg-white/55 p-1 text-[#003323] shadow-[0_6px_12px_rgba(0,51,35,0.12)] backdrop-blur hover:bg-[#fffdee]"
            aria-label={`Previous ${title}`}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => chooseSegment(selectedIndex + 1)}
            className="rounded-full border border-[#003323]/16 bg-white/55 p-1 text-[#003323] shadow-[0_6px_12px_rgba(0,51,35,0.12)] backdrop-blur hover:bg-[#fffdee]"
            aria-label={`Next ${title}`}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="mt-2 h-6" />
      )}
    </div>
  );
}

export function WorkspaceDashboardMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isWorkspacePath =
    pathname.startsWith("/executive") ||
    pathname.startsWith("/bdm") ||
    pathname.startsWith("/geo-head") ||
    pathname.startsWith("/practice-head") ||
    pathname.startsWith("/buh");
  const [open, setOpen] = useState(false);
  const financialYearOptions = useMemo(() => getRollingFinancialYears(4), []);
  const currentFinancialYear = useMemo(
    () => resolveValidFinancialYear(getCurrentFinancialYear(), financialYearOptions),
    [financialYearOptions],
  );

  const selectedMonth = resolveDashboardMonth(
    searchParams.get("dashboardMonth")?.trim() || searchParams.get("periodTo")?.trim(),
  );
  const selectedTimeframe = resolveDashboardTimeframe(
    searchParams.get("dashboardTimeframe"),
    searchParams.get("dashboardQuarter"),
  );
  const selectedQuarter = resolveDashboardQuarter(
    searchParams.get("dashboardQuarter"),
    searchParams.get("dashboardTimeframe"),
    selectedMonth,
  );
  const selectedFinancialYear = resolveValidFinancialYear(
    searchParams.get("financialYear")?.trim() || searchParams.getAll("financialYears")[0]?.trim(),
    financialYearOptions,
  );

  const currentSelection = useMemo(
    () => ({
      financialYear: selectedFinancialYear,
      dashboardTimeframe: selectedTimeframe,
      dashboardMonth: selectedMonth,
      dashboardQuarter: selectedQuarter,
    }),
    [selectedFinancialYear, selectedMonth, selectedQuarter, selectedTimeframe],
  );

  const [draftSelection, setDraftSelection] = useState<DashboardDraftSelection>(currentSelection);
  const [draftMtdMode, setDraftMtdMode] = useState<MtdMode>(() =>
    resolveMtdMode(searchParams.get("dashboardMtdMode"), currentSelection),
  );
  const restoredForPathRef = useRef<string>("");

  useEffect(() => {
    if (!isWorkspacePath || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...currentSelection, dashboardMtdMode: draftMtdMode }),
    );
  }, [currentSelection, draftMtdMode, isWorkspacePath]);

  useEffect(() => {
    if (!isWorkspacePath) {
      return;
    }
    if (restoredForPathRef.current === pathname) {
      return;
    }
    restoredForPathRef.current = pathname;

    const hasExplicitTimeframe = Boolean(searchParams.get("dashboardTimeframe")?.trim());
    const hasExplicitFinancialYear =
      Boolean(searchParams.get("financialYear")?.trim()) ||
      searchParams.getAll("financialYears").some((value) => value.trim().length > 0);
    const hasPeriodWindow =
      Boolean(searchParams.get("periodFrom")?.trim()) &&
      Boolean(searchParams.get("periodTo")?.trim());

    if (hasExplicitTimeframe && hasExplicitFinancialYear && hasPeriodWindow) {
      return;
    }

    const nextSelection: DashboardDraftSelection = {
      financialYear: currentFinancialYear,
      dashboardTimeframe: "annual",
      dashboardMonth: resolveCurrentFiscalMonth(),
      dashboardQuarter: quarterForMonth(resolveCurrentFiscalMonth()),
    };

    const next = new URLSearchParams(searchParams.toString());
    next.delete("dashboardDataset");
    next.delete("financialYears");
    next.set("financialYear", nextSelection.financialYear);
    next.set(
      "dashboardTimeframe",
      hasExplicitTimeframe ? selectedTimeframe : nextSelection.dashboardTimeframe,
    );
    applyPeriodWindow(
      next,
      hasExplicitTimeframe ? selectedTimeframe : nextSelection.dashboardTimeframe,
      nextSelection.dashboardMonth,
      nextSelection.dashboardQuarter,
    );

    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [
    currentFinancialYear,
    isWorkspacePath,
    pathname,
    router,
    searchParams,
    selectedTimeframe,
  ]);

  function resetDraftFromCurrentSelection() {
    const resolvedMtdMode = resolveMtdMode(searchParams.get("dashboardMtdMode"), currentSelection);
    setDraftSelection(currentSelection);
    setDraftMtdMode(resolvedMtdMode);
  }

  function handleOpenChange(nextOpen: boolean) {
    resetDraftFromCurrentSelection();
    setOpen(nextOpen);
  }

  function applyDashboardQuery(selection: DashboardDraftSelection, mtdMode: MtdMode) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("dashboardDataset");
    next.delete("financialYears");
    next.delete("dashboardMtdMode");
    next.set("financialYear", selection.financialYear);
    next.set("dashboardTimeframe", selection.dashboardTimeframe);
    if (selection.dashboardTimeframe === "mtd") {
      next.set("dashboardMtdMode", mtdMode);
    }
    applyPeriodWindow(
      next,
      selection.dashboardTimeframe,
      selection.dashboardMonth,
      selection.dashboardQuarter,
    );
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    handleOpenChange(false);
  }

  function setAnnualDial() {
    setDraftSelection((current) => ({ ...current, dashboardTimeframe: "annual" }));
  }

  function shiftFinancialYear(direction: -1 | 1) {
    const currentIndex = financialYearOptions.indexOf(draftSelection.financialYear);
    const nextIndex =
      (currentIndex + direction + financialYearOptions.length) % financialYearOptions.length;
    setDraftSelection((current) => ({
      ...current,
      financialYear: financialYearOptions[nextIndex] ?? current.financialYear,
      dashboardTimeframe: "annual",
    }));
  }

  function setMonthDial(timeframe: "mtd" | "ytd", month: FiscalMonth) {
    setDraftSelection((current) => ({
      ...current,
      dashboardTimeframe: timeframe,
      dashboardMonth: month,
      dashboardQuarter: quarterForMonth(month),
    }));
    if (timeframe === "mtd") {
      setDraftMtdMode(resolveMtdModeForMonth(month));
    }
  }

  function setQuarterDial(quarter: DashboardQuarter) {
    setDraftSelection((current) => ({
      ...current,
      dashboardTimeframe: "quarter",
      dashboardQuarter: quarter,
      dashboardMonth: QUARTER_MONTH_MAP[quarter][2],
    }));
  }

  function shiftMonth(timeframe: "mtd" | "ytd", direction: -1 | 1) {
    const currentIndex = FISCAL_MONTH_OPTIONS.indexOf(draftSelection.dashboardMonth);
    const nextIndex =
      (currentIndex + direction + FISCAL_MONTH_OPTIONS.length) % FISCAL_MONTH_OPTIONS.length;
    setMonthDial(timeframe, FISCAL_MONTH_OPTIONS[nextIndex]);
  }

  function shiftQuarter(direction: -1 | 1) {
    const currentIndex = QUARTER_OPTIONS.indexOf(draftSelection.dashboardQuarter);
    const nextIndex = (currentIndex + direction + QUARTER_OPTIONS.length) % QUARTER_OPTIONS.length;
    setQuarterDial(QUARTER_OPTIONS[nextIndex]);
  }

  const summary = [selectedFinancialYear, formatTimeframeSummary(currentSelection)].join(" | ");

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[#003323]/20 bg-[linear-gradient(135deg,rgba(255,253,238,0.92),rgba(255,255,255,0.7),rgba(65,105,225,0.16))] px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#003323] shadow-[0_10px_24px_rgba(0,51,35,0.16)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-[#003323]/35 ${
            open ? "border-[#4169e1]/45" : ""
          }`}
          aria-label={`Open workspace data controls for ${summary}`}
        >
          <ChartColumnIncreasing className="h-3.5 w-3.5" />
          <span className="max-w-[10rem] truncate text-[10.5px] font-semibold normal-case tracking-normal text-[#003323] sm:max-w-[13rem]">
            {summary}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={12}
        className="w-[min(96vw,42rem)] rounded-[24px] border border-[#003323]/18 bg-[linear-gradient(145deg,rgba(255,253,238,0.94),rgba(255,255,255,0.78),rgba(65,105,225,0.12))] p-0 shadow-[0_30px_80px_rgba(0,51,35,0.22)] backdrop-blur-2xl"
      >
        <div className="flex max-h-[78vh] flex-col overflow-hidden">
          <div className="overflow-y-auto px-3 py-3">
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  <CompactWorkspaceDialCard
                    indexLabel="1"
                    title="Annual"
                    subtitle="Select Year"
                    selectionLabel={draftSelection.financialYear}
                    segments={financialYearOptions.map((option) => option.split("-")[0] ?? option)}
                    selectedSegment={draftSelection.financialYear.split("-")[0] ?? draftSelection.financialYear}
                    active={draftSelection.dashboardTimeframe === "annual"}
                    onSelect={setAnnualDial}
                    onSegmentChange={(segment) => {
                      const matchingYear = financialYearOptions.find((option) =>
                        option.startsWith(`${segment}-`),
                      );
                      setDraftSelection((current) => ({
                        ...current,
                        financialYear: matchingYear ?? current.financialYear,
                        dashboardTimeframe: "annual",
                      }));
                    }}
                    onPrevious={() => shiftFinancialYear(-1)}
                    onNext={() => shiftFinancialYear(1)}
                  />
                  <CompactWorkspaceDialCard
                    indexLabel="2"
                    title="MTD"
                    subtitle="Select Month"
                    selectionLabel={draftSelection.dashboardMonth}
                    segments={[...FISCAL_MONTH_OPTIONS]}
                    selectedSegment={draftSelection.dashboardMonth}
                    active={draftSelection.dashboardTimeframe === "mtd"}
                    onSelect={() => setMonthDial("mtd", draftSelection.dashboardMonth)}
                    onSegmentChange={(segment) => {
                      if (FISCAL_MONTH_OPTIONS.includes(segment as FiscalMonth)) {
                        setMonthDial("mtd", segment as FiscalMonth);
                      }
                    }}
                    onPrevious={() => shiftMonth("mtd", -1)}
                    onNext={() => shiftMonth("mtd", 1)}
                  />
                  <CompactWorkspaceDialCard
                    indexLabel="3"
                    title="YTD"
                    subtitle="April to March"
                    selectionLabel={`April to ${FISCAL_MONTH_LABELS[draftSelection.dashboardMonth]}`}
                    segments={[...FISCAL_MONTH_OPTIONS]}
                    selectedSegment={draftSelection.dashboardMonth}
                    active={draftSelection.dashboardTimeframe === "ytd"}
                    onSelect={() => setMonthDial("ytd", draftSelection.dashboardMonth)}
                    onSegmentChange={(segment) => {
                      if (FISCAL_MONTH_OPTIONS.includes(segment as FiscalMonth)) {
                        setMonthDial("ytd", segment as FiscalMonth);
                      }
                    }}
                    onPrevious={() => shiftMonth("ytd", -1)}
                    onNext={() => shiftMonth("ytd", 1)}
                  />
                  <CompactWorkspaceDialCard
                    indexLabel="4"
                    title="Quarters"
                    subtitle="Select Quarter"
                    selectionLabel={draftSelection.dashboardQuarter}
                    segments={[...QUARTER_OPTIONS]}
                    selectedSegment={draftSelection.dashboardQuarter}
                    active={draftSelection.dashboardTimeframe === "quarter"}
                    onSelect={() => setQuarterDial(draftSelection.dashboardQuarter)}
                    onSegmentChange={(segment) => {
                      if (QUARTER_OPTIONS.includes(segment as DashboardQuarter)) {
                        setQuarterDial(segment as DashboardQuarter);
                      }
                    }}
                    onPrevious={() => shiftQuarter(-1)}
                    onNext={() => shiftQuarter(1)}
                  />
                </div>
          </div>

          <div className="border-t border-[#003323]/12 bg-white/45 px-4 py-3 backdrop-blur-xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold text-[#003323]">{formatTimeframeSummary(draftSelection)}</p>
              <div className="flex w-full gap-3 sm:w-auto">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-full border border-[#003323]/18 bg-white/60 px-3 py-1.5 text-xs font-semibold text-[#003323] hover:border-[#003323]/35 hover:bg-[#fffdee] sm:flex-none"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => applyDashboardQuery(draftSelection, draftMtdMode)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-[#024a70]/20 bg-[#024a70] px-4 py-1.5 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(2,74,112,0.24)] hover:bg-[#01324b] sm:flex-none"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Submit
                </button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
