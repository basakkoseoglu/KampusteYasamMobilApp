import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ToastAndroid,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { firestore } from "@/config/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
} from "firebase/firestore";
import { useAuth } from "@/contexts/authContext";
import { Image } from "expo-image";
import { Trash } from "phosphor-react-native";
import { deleteChatWithMessages } from "@/services/chatService";

interface ChatPreview {
  chatId: string;
  otherUserName: string;
  lastMessage: string;
  updatedAt: number;
  otherUserImage?: string | null;
}

const formatTimestamp = (timestamp: number) => {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay)
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  const diff = now.getTime() - date.getTime();
  if (diff < 1000 * 60 * 60 * 24 * 2) return "Dün";
  return `${date.getDate()}/${date.getMonth() + 1}`;
};

const ChatScreen: React.FC = () => {
  const [chatList, setChatList] = useState<ChatPreview[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const { user } = useAuth();
  const currentUserId = user?.uid;
  const router = useRouter();

  useEffect(() => {
    if (!currentUserId) return;

    console.log("Current user:", currentUserId, "image:", user?.image);
    setLoading(true);

    const q = query(
      collection(firestore, "chats"),
      where("participants", "array-contains", currentUserId),
      orderBy("updatedAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        try {
          console.log(`Found ${snapshot.docs.length} chats`);

          const updatedChats: ChatPreview[] = await Promise.all(
            snapshot.docs.map(async (docSnap) => {
              const chatData = docSnap.data();
              const docRef = doc(firestore, "chats", docSnap.id);
              const participantsInfo = Array.isArray(chatData.participantsInfo)
                ? chatData.participantsInfo
                : [];

              console.log(`Processing chat ${docSnap.id}:`, participantsInfo);

              // Find current user and the other participant
              const myInfo = participantsInfo.find(
                (p: any) => p.id === currentUserId
              );
              const otherInfo = participantsInfo.find(
                (p: any) => p.id !== currentUserId
              );

              // Update current user's image if it has changed
              if (myInfo && user?.image && myInfo.image !== user.image) {
                console.log("Updating user image in chat");
                const newParticipantsInfo = participantsInfo.map((p: any) =>
                  p.id === currentUserId ? { ...p, image: user.image } : p
                );

                await updateDoc(docRef, {
                  participantsInfo: newParticipantsInfo,
                });
              }

              return {
                chatId: docSnap.id,
                otherUserName: otherInfo?.name || "Bilinmeyen",
                otherUserImage: otherInfo?.image,
                lastMessage: chatData.lastMessage || "",
                updatedAt: chatData.updatedAt || Date.now(),
              };
            })
          );

          setChatList(updatedChats);
        } catch (error) {
          console.error("Error processing chats:", error);
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        console.error("Chat listener error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUserId, user?.image]);

  const goToChat = (
    chatId: string,
    otherUserName: string,
    otherUserImage?: string | null
  ) => {
    router.push({
      pathname: "/MessagingScreen",
      params: {
        chatId,
        receiverName: otherUserName,
        receiverImage: otherUserImage || "",
      },
    });
  };

  const handleDeleteChat = async (chatId: string) => {
    Alert.alert(
      "Sohbeti Sil",
      "Bu sohbeti ve tüm mesajlarınızı silmek istiyor musunuz?",
      [
        { text: "İptal", style: "cancel" },
        {
          text: "Sil",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteChatWithMessages(chatId);
              if (Platform.OS === "android") {
                ToastAndroid.show("Sohbet silindi ✅", ToastAndroid.SHORT);
              }
            } catch (error) {
              console.error("Sohbet silme hatası:", error);
              if (Platform.OS === "android") {
                ToastAndroid.show("Sohbet silinemedi", ToastAndroid.SHORT);
              }
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Sohbetler yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.title}>Sohbetler</Text>
      </View>

      {chatList.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Henüz sohbet bulunmuyor</Text>
        </View>
      ) : (
        <FlatList
          data={chatList}
          keyExtractor={(item) => item.chatId}
          renderItem={({ item }) => (
            <View style={styles.chatItem}>
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() =>
                  goToChat(item.chatId, item.otherUserName, item.otherUserImage)
                }
              >
                <View style={styles.chatRow}>
                  <View style={styles.avatar}>
                    {item.otherUserImage ? (
                      <Image
                        source={{ uri: item.otherUserImage }}
                        style={styles.avatarImage}
                        contentFit="cover"
                      />
                    ) : (
                      <Text style={styles.avatarText}>
                        {item.otherUserName
                          .split(" ")
                          .map((p) => p[0])
                          .join("")
                          .toUpperCase()
                          .substring(0, 2)}
                      </Text>
                    )}
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={styles.headerRow}>
                      <Text style={styles.chatName}>{item.otherUserName}</Text>
                      <Text style={styles.timeText}>
                        {formatTimestamp(item.updatedAt)}
                      </Text>
                    </View>
                    <Text style={styles.lastMessage} numberOfLines={1}>
                      {item.lastMessage || "Yeni sohbet başlat"}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleDeleteChat(item.chatId)}
                style={styles.trashButton}
              >
                <Trash size={20} color="#D32F2F" />
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
};

export default ChatScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    paddingTop: 50,
    paddingHorizontal: 20,
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
  chatItem: {
    backgroundColor: "#fff",
    padding: 14,
    marginBottom: 12,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
    flexDirection: "row",
    alignItems: "center",
  },
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#4CAF50",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chatName: {
    fontSize: 16,
    fontWeight: "bold",
    flexShrink: 1,
  },
  timeText: {
    fontSize: 12,
    color: "#888",
    alignSelf: "flex-start",
  },
  lastMessage: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  trashButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
