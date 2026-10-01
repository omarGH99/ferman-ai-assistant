import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

const SCREEN_HEIGHT = Dimensions.get("window").height;

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
}) {
  const { theme } = useTheme();
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = React.useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 220, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [visible, translateY, backdropOpacity]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: theme.bg, transform: [{ translateY }] },
        ]}
      >
        <Pressable style={styles.handleWrap} onPress={onClose}>
          <View style={[styles.handle, { backgroundColor: theme.line }]} />
        </Pressable>
        <Pressable style={[styles.close, { backgroundColor: theme.chip }]} onPress={onClose}>
          <Text style={{ color: theme.text, fontSize: 13 }}>✕</Text>
        </Pressable>
        {title ? <Text style={[styles.title, { color: theme.text }]}>{title}</Text> : null}
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "84%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  handleWrap: { alignItems: "center", paddingVertical: 10 },
  handle: { width: 38, height: 4, borderRadius: 8 },
  close: {
    position: "absolute",
    top: 12,
    right: 16,
    width: 30,
    height: 30,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 17, fontWeight: "700", marginBottom: 6 },
  scroll: { marginTop: 4 },
  scrollContent: { paddingBottom: 24 },
});
