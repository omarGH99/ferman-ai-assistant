import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File as FsFile } from "expo-file-system";
import * as XLSX from "xlsx";
import { useAppState } from "../state/StateProvider";
import { iso, todayISO } from "./date";
import { Status } from "../state/types";

function normDate(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date && !isNaN(v.getTime())) return iso(v);
  const d = new Date(v as any);
  return isNaN(d.getTime()) ? "" : iso(d);
}

function normStatus(v: unknown): Status {
  const s = String(v).toLowerCase();
  if (/done|complete|finish/.test(s)) return "done";
  if (/attend/.test(s)) return "attended";
  if (/progress|doing/.test(s)) return "inprogress";
  return "pending";
}

export function useExcelImport() {
  const st = useAppState();

  // Returns the number of rows imported, or null if the user cancelled /
  // the file couldn't be read.
  async function importFromDevice(): Promise<number | null> {
    const picked = await DocumentPicker.getDocumentAsync({
      type: [
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
      ],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets?.length) return null;

    const asset = picked.assets[0];

    // Reading a picked file differs by platform: on the web the picker returns a
    // browser File object (read as an ArrayBuffer); on native we read the file
    // URI as base64 through expo-file-system.
    let wb: XLSX.WorkBook;
    if (Platform.OS === "web") {
      const browserFile = (asset as any).file as { arrayBuffer(): Promise<ArrayBuffer> } | undefined;
      const buf = browserFile
        ? await browserFile.arrayBuffer()
        : await (await fetch(asset.uri)).arrayBuffer();
      wb = XLSX.read(buf, { type: "array", cellDates: true });
    } else {
      const base64 = await new FsFile(asset.uri).base64();
      wb = XLSX.read(base64, { type: "base64", cellDates: true });
    }

    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

    let n = 0;
    for (const row of rows.slice(0, 300)) {
      const keys = Object.keys(row);
      const get = (names: string[]) => {
        for (const k of keys) {
          if (names.includes(k.toLowerCase().trim())) return row[k];
        }
        return "";
      };
      const title = String(
        get(["task", "title", "name", "event", "description"]) ||
          Object.values(row)
            .map((v) => String(v).trim())
            .filter(Boolean)[0] ||
          ""
      ).trim();
      if (!title) continue;

      const date = normDate(get(["date", "day", "due"]));
      const time = String(get(["time", "hour"]) || "").trim();
      const status = normStatus(get(["status", "state"]) || "pending");
      const notes = String(get(["notes", "note", "comment"]) || "").trim();

      // Bulk import goes straight to calendar events — no per-row model call, so
      // it stays fast and works offline.
      st.addEvent({ title, date: date || todayISO(), time, status, notes });
      n++;
    }
    return n;
  }

  return { importFromDevice };
}
