import { Platform, Share } from "react-native";

/** Web gets a real file download (Blob + a throwaway anchor, the standard
 * way to trigger "Save As" from JS). Native has no filesystem download
 * equivalent without a new dependency (expo-sharing isn't installed), so it
 * hands the CSV text to the OS share sheet instead -- the user picks where
 * it goes (Files, Mail, WhatsApp, ...) rather than it landing silently in
 * app storage. */
export async function saveOrShareCsv(csvText: string, filename: string) {
  if (Platform.OS === "web") {
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ message: csvText, title: filename });
}
