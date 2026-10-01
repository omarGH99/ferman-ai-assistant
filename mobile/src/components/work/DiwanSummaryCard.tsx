import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { FeedCard, FeedMuted } from "../feed/FeedCard";
import { useTheme } from "../../theme/ThemeProvider";
import { space, type, weight } from "../../theme/tokens";
import { useI18n } from "../../i18n/I18nProvider";
import { useAuth } from "../../state/AuthProvider";
import { useWorkspace } from "../../state/WorkspaceProvider";
import { useSheets } from "../../ui/SheetsProvider";
import { DiwanEntry, listDiwanApi } from "../../services/workspace";

/** The one work-feed card that exists so far — Diwan is the only office
 * feature with a backend behind it. More cards register here the same way
 * personal widgets register in WIDGET_COMPONENTS, once there's a second one
 * to justify that generalization. */
export function DiwanSummaryCard() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { openDiwan, openDiwanEntry } = useSheets();
  const [entries, setEntries] = useState<DiwanEntry[] | null>(null);

  useEffect(() => {
    if (!token || !activeWorkspace) return;
    let alive = true;
    listDiwanApi(token, activeWorkspace.id).then((list) => {
      if (!alive) return;
      const recent = list.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3);
      setEntries(recent);
    });
    return () => {
      alive = false;
    };
  }, [token, activeWorkspace]);

  return (
    <FeedCard title={t("diwan_title")} onPressTitle={openDiwan}>
      {entries === null ? (
        <FeedMuted text={t("f_loading")} />
      ) : entries.length === 0 ? (
        <FeedMuted text={t("diwan_empty")} />
      ) : (
        <View style={{ gap: space.sm }}>
          {entries.map((e) => (
            <Pressable key={e.id} onPress={() => openDiwanEntry(e.id)}>
              <Text style={{ color: theme.text, fontSize: type.base, fontWeight: weight.semibold }} numberOfLines={1}>
                {e.entity_name}
              </Text>
              {!!e.subject && (
                <Text style={{ color: theme.muted, fontSize: type.sm }} numberOfLines={1}>
                  {e.subject}
                </Text>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </FeedCard>
  );
}
