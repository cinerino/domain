/**
 * 取引バリデーション
 */
import * as waiter from '@waiter/domain';

import * as factory from '../../factory';

export type IPassportValidator = (params: { passport: factory.waiter.passport.IPassport }) => boolean;
export type IStartParams =
    (factory.transaction.placeOrder.IStartParamsWithoutDetail | factory.transaction.moneyTransfer.IStartParamsWithoutDetail) & {
        passportValidator?: IPassportValidator;
    };

export async function validateWaiterPassport(params: IStartParams): Promise<factory.waiter.passport.IPassport | undefined> {
    let passport: factory.waiter.passport.IPassport | undefined;

    // WAITER許可証トークンがあれば検証する
    if (typeof params.object?.passport?.token === 'string') {
        try {
            passport = await waiter.service.passport.verify({
                token: params.object.passport.token,
                secret: params.object.passport.secret
            });
        } catch (error) {
            throw new factory.errors.Argument('Passport Token', `Invalid token: ${error.message}`);
        }

        // 許可証バリデーション
        if (typeof params.passportValidator === 'function') {
            if (!params.passportValidator({ passport: passport })) {
                throw new factory.errors.Argument('Passport Token', 'Invalid passport');
            }
        }
    }

    return passport;
}
