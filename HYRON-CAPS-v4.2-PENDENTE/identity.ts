/** CAPS v4.2 - Resolve nomes visíveis sem alterar a autoria persistida. */
export type Participant = {
  id: string;
  username?: string | null;
  displayName?: string | null;
};
export type CapsMessage = {
  senderId?: string | null;
  senderName?: string | null;
  role?: string | null;
  content: string;
};

const safe = (s: unknown) => typeof s === 'string' ? s.trim() : '';
const BOT_NAMES: Record<string,string> = {
  garra_de_prata: 'Garra de Prata',
  bicuco: 'Bicuço',
  basilisco: 'Basilisco',
  bunga: 'Bunga',
};

/** user IDs are not inferred from text; unknown IDs remain neutral. */
export function displaySender(msg: CapsMessage, participants: ReadonlyMap<string, Participant>): string {
  const id = safe(msg.senderId);
  const known = id ? participants.get(id) : undefined;
  const name = safe(known?.displayName) || safe(known?.username);
  if (name) return name;
  if (id && BOT_NAMES[id]) return BOT_NAMES[id];
  const explicitName = safe(msg.senderName);
  if (explicitName) return explicitName;
  if (msg.role === 'assistant') return 'Assistente';
  if (msg.role === 'user') return 'Usuário';
  return 'Participante';
}

/** Output for model context: do not expose internal IDs as names. */
export function formatCapsHistory(
  messages: readonly CapsMessage[],
  participants: ReadonlyMap<string, Participant>,
  maxMessages = 60,
): string {
  return messages.slice(-Math.max(0, maxMessages)).map(m =>
    `${displaySender(m, participants)}: ${m.content}`
  ).join('\n');
}
