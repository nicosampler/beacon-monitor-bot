import { isAddress } from "ethers/lib/utils.js";
import { User } from "@prisma/client";
import { inMemoryUsers, resetUser } from "@/src/utils/inMemoryDB.js";
import { countAllValidatorsLoaded } from "@/src/prisma/validatros.js";
import { Conversation } from "@grammyjs/conversations";
import { MyContext } from "@/src/config/session.js";
import { handleError } from "@/src/utils/errors/handleError.js";
import { AppError } from "@/src/utils/errors/AppError.js";
import { editMessage } from "@/src/telegram/utils/messaging.js";
import { getUserFull_db, upsertUser_db } from "@/src/prisma/users.js";
import { dashboard } from "@/src/telegram/commands/dashboard.js";
import { getDataFromContext } from "@/src/telegram/utils/getUserIdFromCtx.js";

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
    const loadedValidatorsCount = await _checkValidatorsLimits(ctx);
    const availableValidatorsSpotsCount = 600;
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
    let tmpReply = await ctx.reply(
      `🔄 Loading validators... Please be patient, it may take a few minutes!`
    );

    // recover user data from the database
    const userDB = await getUserFull_db(userId);

    // check if the user has already reached the maximum number of validators allowed
    const currentUserValidators = userDB?.validators ?? [];

    // await editMessage(
    //   tmpReply,
    //   `You have reached the maximum number of validators per user (${MAX_VALIDATORS_PER_USER}).`
    // );
    // return;

    // call the api to bring all the validators associated with the address
    // and filter the ones that are not already in the user's validators list
    const newUserValidators = [];
    //  (
    //   await getValidatorsByWithdrawalAddresses(withdrawalAddress)
    // ).filter(
    //   (validatorId) =>
    //     !currentUserValidators.find(
    //       (userValidator) => userValidator.id == validatorId
    //     )
    // );

    // check if there are validators for the address
    if (!newUserValidators.length) {
      await editMessage(
        tmpReply,
        `No new validators have been found for this address.`
      );
      return;
    }

    // limit validators to the maximum number of validators per user
    const availableSeats = 600;
    // Math.min(
    //   availableValidatorsSpotsCount,
    //   MAX_VALIDATORS_PER_USER,
    //   newUserValidators.length
    // );

    // Get the validators to be added
    const validatorsToBeAdded = newUserValidators.slice(0, availableSeats);
    const validatorsNotAddedCount =
      newUserValidators.length - validatorsToBeAdded.length;

    // get the new withdrawal addresses
    const newWithdrawalAddresses = userDB?.withdrawalAddresses || [];
    if (!newWithdrawalAddresses.some((o) => o.address === withdrawalAddress)) {
      newWithdrawalAddresses.push({ address: withdrawalAddress });
    }

    // create or update user
    const userData: any = {
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
      validators: {
        connectOrCreate: validatorsToBeAdded.map((validatorindex) => ({
          where: { id: validatorindex },
          create: { id: validatorindex },
        })),
      },
    };

    await upsertUser_db(userId, userData, userData);

    // add user to inMemoryDB
    if (!inMemoryUsers[userId]) {
      inMemoryUsers[userId] = {
        id: userId,
        chatId: userId,
      };
    }

    // reset user inMemoryDB
    resetUser(userId);

    // Notify the user
    await editMessage(
      tmpReply,
      `${validatorsToBeAdded.length} validators were added to your account 💪!
${
  validatorsNotAddedCount
    ? "" //`⚠️ ${validatorsNotAddedCount} Validators weren't added. Allowed: ${MAX_VALIDATORS_PER_USER} per user and ${MAX_VALIDATORS_SUPPORTED} bot limit.`
    : ""
}
- It will take some minutes to start providing stats -
`
    );

    await dashboard(ctx);
  } catch (error) {
    await handleError(error, ctx.message?.chat.id);
  }
}
