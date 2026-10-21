import { backend } from './client';
import { createChatApi } from './chat-api';
export type { Profile, Conversation, Message } from './chat-api';
export async function accountState(): Promise<'active' | 'erasing'> {
  const { data, error } = await backend().rpc('account_state');
  if (error || (data !== 'active' && data !== 'erasing'))
    throw error ?? new Error('Account unavailable.');
  return data;
}
export async function deleteAccount(password: string, confirmation: string) {
  const { data, error } = await backend().functions.invoke('delete-account', {
    body: { password, confirmation },
  });
  if (error || data?.deleted !== true) throw error ?? new Error('Account deletion is pending.');
}
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
