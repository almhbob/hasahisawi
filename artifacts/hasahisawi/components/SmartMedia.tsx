import React from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Video, ResizeMode } from "expo-av";

const W = Dimensions.get("window").width - 28;

type Props = {
  imageUrl?: string | null;
  videoUrl?: string | null;
};

export default function SmartMedia({ imageUrl, videoUrl }: Props) {
  if (videoUrl && !imageUrl) {
    return (
      <View style={styles.box}>
        <Video source={{ uri: videoUrl }} style={styles.media} useNativeControls resizeMode={ResizeMode.CONTAIN} shouldPlay={false} />
      </View>
    );
  }

  if (imageUrl) {
    return (
      <View style={styles.box}>
        <ExpoImage source={{ uri: imageUrl }} style={styles.media} contentFit="contain" cachePolicy="memory-disk" transition={180} />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  box: {
    width: W,
    height: W * 0.78,
    alignSelf: "center",
    borderRadius: 18,
    overflow: "hidden",
    marginVertical: 10,
    backgroundColor: "#06120B",
  },
  media: {
    width: "100%",
    height: "100%",
  },
});
