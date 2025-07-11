import chunk from 'lodash/chunk.js';
import { AsyncTask } from 'toad-scheduler';

import createLogger from '@/src/lib/pino.js';
import { getAllUserIds_db, updateUserMessageId_db } from '@/src/prisma/users.js';
import { notifyUserStatsMessage } from '@/src/scheduler/tasks/notifyUserStatsMessage.js';
import { handleError } from '@/src/utils/errors/handleError.js';

export async function updateUsersStatsImp(userId?: number) {
  //const users = await getAllUserIds_db(userId);
  const users = (await getAllUserIds_db(userId)).filter((user) => user.username === 'xxx');

  const userChunks = chunk(users, 5);

  for (const currentChunk of userChunks) {
    await Promise.all(
      currentChunk.map(async (user) => {
        const logger = createLogger(`notify user: ${user.username}`);
        try {
          const messageIdStats = await notifyUserStatsMessage(user.userId, logger);

          if (messageIdStats && messageIdStats !== Number(user.messageId)) {
            await updateUserMessageId_db(Number(user.id), messageIdStats);
          }
        } catch (error) {
          console.error(`Error processing user ${user.username}:`, error);
        }
      }),
    );
  }
}

export const updateUsersStats = new AsyncTask('notifyUser', () =>
  updateUsersStatsImp().catch((error) => handleError(error)),
);
