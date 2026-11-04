import { describe, expect, it } from "vitest";
import { formatTime, localDate, localToISO, mapsUrl, weekDays, weekStart } from "@/lib/calendar";

describe("calendário", () => {
  it("semana começa na segunda (inclusive quando a data é domingo)", () => {
    expect(weekStart("2026-11-04")).toBe("2026-11-02"); // quarta
    expect(weekStart("2026-11-08")).toBe("2026-11-02"); // domingo
    expect(weekStart("2026-11-02")).toBe("2026-11-02"); // segunda
    expect(weekDays("2026-11-02")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
  });
  it("horários no fuso da Bahia, ida e volta", () => {
    const iso = localToISO("2026-11-05", "09:30");
    expect(iso).toBe("2026-11-05T09:30:00-03:00");
    expect(formatTime(iso)).toBe("09:30");
    expect(localDate("2026-11-06T01:00:00Z")).toBe("2026-11-05"); // 22h do dia 5 na Bahia
  });
  it("link de mapa codifica o endereço", () => {
    expect(mapsUrl("Rua A, 10 - Salvador")).toBe("https://www.google.com/maps/search/?api=1&query=Rua%20A%2C%2010%20-%20Salvador");
  });
});
