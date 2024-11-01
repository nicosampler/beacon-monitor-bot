"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.botStats = botStats;
var users_js_1 = require("@/src/prisma/users.js");
var validatros_js_1 = require("@/src/prisma/validatros.js");
var messaging_js_1 = require("@/src/telegram/utils/messaging.js");
var getUserIdFromCtx_js_1 = require("@/src/telegram/utils/getUserIdFromCtx.js");
var handleError_js_1 = require("@/src/utils/errors/handleError.js");
var index_js_1 = require("@/src/constants/index.js");
var AppError_js_1 = require("@/src/utils/errors/AppError.js");
function botStats(ctx) {
    return __awaiter(this, void 0, void 0, function () {
        var userId, users, validators, allValidators, error_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 4, , 6]);
                    userId = (0, getUserIdFromCtx_js_1.getDataFromContext)(ctx).userId;
                    if (!index_js_1.TG_ADMIN_USER_IDS.includes(userId)) {
                        throw new AppError_js_1.AppError("You are not allowed to use this command", "UNAUTHORIZED");
                    }
                    return [4 /*yield*/, (0, users_js_1.countUsers_db)()];
                case 1:
                    users = _b.sent();
                    return [4 /*yield*/, (0, validatros_js_1.countAllValidatorsLoaded)()];
                case 2:
                    validators = _b.sent();
                    allValidators = [];
                    //  (
                    //   await Promise.all(
                    //     (await getWithdrawalAddresses_db()).map((a) =>
                    //       getValidatorsByWithdrawalAddresses(a.address)
                    //     )
                    //   )
                    // ).flat();
                    return [4 /*yield*/, (0, messaging_js_1.sendMessage)(ctx.chat.id, "\n        \uD83E\uDD16 Bot Stats:\n        - Users: ".concat(users, "\n        - Loaded Validators: ").concat(validators, "\n        - Limited validators: ").concat(allValidators.length, "\n      "))];
                case 3:
                    //  (
                    //   await Promise.all(
                    //     (await getWithdrawalAddresses_db()).map((a) =>
                    //       getValidatorsByWithdrawalAddresses(a.address)
                    //     )
                    //   )
                    // ).flat();
                    _b.sent();
                    return [3 /*break*/, 6];
                case 4:
                    error_1 = _b.sent();
                    return [4 /*yield*/, (0, handleError_js_1.handleError)(error_1, (_a = ctx.chat) === null || _a === void 0 ? void 0 : _a.id)];
                case 5:
                    _b.sent();
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
