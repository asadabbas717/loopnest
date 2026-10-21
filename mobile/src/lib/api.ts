import { backend } from './client';
import { createChatApi } from './chat-api';
export type { Profile, Conversation, Message } from './chat-api';
export const {
  ownProfile,
  saveProfile,
  conversations,
  conversation,
  peerProfile,
  invite,
  respond,
  messages,
  send,
  blockUser,
} = createChatApi(backend);
