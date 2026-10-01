import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme } from "../../theme/ThemeProvider";
import { isoToDate, dateToIso, timeStrToDate, dateToTimeStr } from "../../utils/datetime";

// Native implementation (iOS/Android, incl. Expo Go). Web uses DateTimeField.web.tsx.
export function DateTimeField({
  mode,
  value,
  placeholder,
  onChange,
}: {
  mode: "date" | "time";
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const { theme } = useTheme();
  const [show, setShow] = useState(false);
  const current = mode === "date" ? isoToDate(value) : timeStrToDate(value);

  return (
    <>
      <Pressable
        onPress={() => setShow(true)}
        style={[styles.field, { borderColor: theme.line, backgroundColor: theme.bg }]}
      >
        <Text style={{ color: value ? theme.text : theme.muted, fontSize: 13 }}>
          {value || placeholder}
        </Text>
      </Pressable>
      {show && (
        <DateTimePicker
          value={current}
          mode={mode}
          is24Hour={false}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, picked) => {
            setShow(false);
            if (event.type === "dismissed" || !picked) return;
            onChange(mode === "date" ? dateToIso(picked) : dateToTimeStr(picked));
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  field: { borderWidth: 1, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 11 },
});
