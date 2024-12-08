import { isAddress } from "ethers/lib/utils.js";
import { Conversation } from "@grammyjs/conversations";
import { MyContext } from "@/src/config/session.js";
import { handleError } from "@/src/utils/errors/handleError.js";
import { editMessage } from "@/src/telegram/utils/messaging.js";
import { getDataFromContext } from "@/src/telegram/utils/getUserIdFromCtx.js";
import { getPrisma } from "@/src/config/prisma.js";

const prisma = getPrisma();

async function _waitForWithdrawalAddress(
  conversation: LoadValidatorsConversation,
  ctx: MyContext
) {
  let validAddressEntered = false;
  let withdrawalAddress: string = "";

  while (!validAddressEntered) {
    const { message } = await conversation.wait();
    const input = message?.text?.trim() ?? "";

    if (input.toLowerCase() === "exit") {
      return;
    }

    // check if it is a valid eth address
    if (!isAddress(input)) {
      await ctx.reply(
        `Invalid address! Please try again. (type "exit" to abort)`
      );
      continue;
    } else {
      validAddressEntered = true;
      withdrawalAddress = input.toLowerCase();
    }
  }

  return withdrawalAddress;
}

async function _checkValidatorsLimits(ctx: MyContext) {
  return 600;
  // const totalValidators = await countAllValidatorsLoaded();
  // if (totalValidators >= MAX_VALIDATORS_SUPPORTED) {
  //   throw new AppError(
  //     `The bot has reached the maximum number of validators (${MAX_VALIDATORS_SUPPORTED}).`,
  //     "BOT_LIMIT_REACHED"
  //   );
  // }
  // return totalValidators;
}

type LoadValidatorsConversation = Conversation<MyContext>;
export async function loadValidators(
  conversation: LoadValidatorsConversation,
  ctx: MyContext
) {
  try {
    //const loadedValidatorsCount = await _checkValidatorsLimits(ctx);
    //const availableValidatorsSpotsCount = 600;
    //MAX_VALIDATORS_SUPPORTED - loadedValidatorsCount;

    // get uerId
    const { userId, username } = await getDataFromContext(ctx);

    // ask for the withdrawal address
    await ctx.reply("Enter your withdrawal address.");
    const withdrawalAddress = await _waitForWithdrawalAddress(
      conversation,
      ctx
    );

    // check if the user has aborted the process
    if (withdrawalAddress == undefined) {
      return;
    }

    // Loading validators message
    let tmpReply = await ctx.reply(`🔄 Loading validators...!`);

    // recover user data from the database
    // const userDB = await getFullUsers_db(userId);

    // check if the user has already reached the maximum number of validators allowed
    // const currentUserValidators = userDB?.validators ?? [];

    // await editMessage(
    //   tmpReply,
    //   `You have reached the maximum number of validators per user (${MAX_VALIDATORS_PER_USER}).`
    // );
    // return;

    // call the api to bring all the validators associated with the address
    // const userValidators = await prisma.validator.findMany({
    //   where: {
    //     withdrawalAddress: {
    //       equals: withdrawalAddress,
    //       mode: "insensitive",
    //     },
    //     NOT: {
    //       users: {
    //         some: {
    //           id: userId,
    //         },
    //       },
    //     },
    //   },
    // });

    // // check if there are validators for the address
    // if (!userValidators.length) {
    //   await editMessage(
    //     tmpReply,
    //     `👎 No new validators have been found for this address.`
    //   );
    //   return;
    // }

    // limit validators to the maximum number of validators per user
    //const availableSeats = 600;
    // Math.min(
    //   availableValidatorsSpotsCount,
    //   MAX_VALIDATORS_PER_USER,
    //   newUserValidators.length
    // );

    // Get the validators to be added
    // const validatorsToBeAdded = newUserValidators.slice(0, availableSeats);
    // const validatorsNotAddedCount =
    //   newUserValidators.length - validatorsToBeAdded.length;

    // // get the new withdrawal addresses
    // const newWithdrawalAddresses = userDB?.withdrawalAddresses || [];
    // if (!newWithdrawalAddresses.some((o) => o.address === withdrawalAddress)) {
    //   newWithdrawalAddresses.push({ address: withdrawalAddress });
    // }

    // create or update user
    const userData = {
      id: userId,
      userId,
      chatId: userId,
      username,
      messageId: null,
      withdrawalAddresses: {
        connectOrCreate: {
          where: { address: withdrawalAddress },
          create: { address: withdrawalAddress },
        },
      },
    };

    await prisma.user.upsert({
      where: { id: userId },
      update: userData,
      create: userData,
    });

    // Conectar validadores - el resultado será el número de filas insertadas
    const result = await prisma.$executeRaw`
      INSERT INTO "_UserToValidator" ("A", "B")
      SELECT ${userId}, "id"
      FROM "Validator"
      WHERE LOWER("withdrawalAddress") = LOWER(${withdrawalAddress})
      AND NOT EXISTS (
        SELECT 1 FROM "_UserToValidator"
        WHERE "A" = ${userId} AND "B" = "Validator"."id"
      )
    `;

    await editMessage(
      tmpReply,
      `${result} validators were added to your account 💪!
- It will take some minutes to start providing stats -`
    );

    //await dashboard(ctx);
  } catch (error) {
    await handleError(error, ctx.message?.chat.id);
  }
}
