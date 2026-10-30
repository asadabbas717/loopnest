import { backend } from './client';
import { createChatApi } from './chat-api';
import { createAccountApi } from './account-api';
export type { Profile, Conversation, ConversationSummary, Message } from './chat-api';
export async function accountState(): Promise<'active' | 'erasing' | 'suspended'> {
  const { data, error } = await backend().rpc('account_state');
  if (error || (data !== 'active' && data !== 'erasing' && data !== 'suspended'))
    throw error ?? new Error('Account unavailable.');
  return data;
}
export const { deleteAccount } = createAccountApi(backend);
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
  setRetention,
  clearChat,
  deleteMessage,
  pendingMessageDeletions,
} = createChatApi(backend);
