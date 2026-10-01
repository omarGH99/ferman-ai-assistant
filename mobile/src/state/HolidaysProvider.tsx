import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getHolidays, Holiday } from "../services/api";

/** Upcoming holidays, fetched once per app session and shared.
 *
 * They are deliberately NOT written into AppState as events. Holidays are
 * reference data, not the user's data: inserting them would duplicate on every
 * load, sync a copy into every account's state blob, let them be deleted or
 * marked done like tasks, and schedule reminder notifications nobody asked for.
 * Keeping them a read-only layer means the calendar can show them while the
 * user's own events stay entirely theirs.
 */
interface HolidaysContextValue {
  holidays: Holiday[];
  loading: boolean;
  /** The holiday falling on an ISO date, if any. */
  holidayOn: (iso: string) => Holiday | null;
  /** Translated display name, falling back to the source's English name. */
  labelFor: (h: Holiday, t: (k: string) => string) => string;
}

const HolidaysContext = createContext<HolidaysContextValue | null>(null);

export function HolidaysProvider({ children }: { children: React.ReactNode }) {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getHolidays().then((d) => {
      if (!alive) return;
      setHolidays(d.ok ? d.items : []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo<HolidaysContextValue>(() => {
    const byDate = new Map(holidays.map((h) => [h.date, h]));
    return {
      holidays,
      loading,
      holidayOn: (iso: string) => byDate.get(iso) || null,
      labelFor: (h, t) => {
        if (!h.key) return h.name;
        const translated = t(`hol_${h.key}`);
        return translated === `hol_${h.key}` ? h.name : translated;
      },
    };
  }, [holidays, loading]);

  return <HolidaysContext.Provider value={value}>{children}</HolidaysContext.Provider>;
}

export function useHolidays() {
  const ctx = useContext(HolidaysContext);
  if (!ctx) throw new Error("useHolidays must be used within HolidaysProvider");
  return ctx;
}
