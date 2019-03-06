import * as pecorinoapi from '@pecorino/api-nodejs-client';

import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';

import { MongoRepository as ActionRepo } from '../../repo/action';
import { RedisRepository as RegisterProgramMembershipInProgressRepo } from '../../repo/action/registerProgramMembershipInProgress';
import { RedisRepository as OrderNumberRepo } from '../../repo/orderNumber';
import { MongoRepository as OwnershipInfoRepo } from '../../repo/ownershipInfo';
import { CognitoRepository as PersonRepo } from '../../repo/person';
import { MongoRepository as ProgramMembershipRepo } from '../../repo/programMembership';
import { MongoRepository as SellerRepo } from '../../repo/seller';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as ProgramMembershipService from '../programMembership';

/**
 * タスク実行関数
 */
export function call(data: factory.task.IData<factory.taskName.RegisterProgramMembership>): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (settings.redisClient === undefined) {
            throw new Error('settings.redisClient undefined.');
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (settings.cognitoIdentityServiceProvider === undefined) {
            throw new Error('settings.cognitoIdentityServiceProvider undefined.');
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (settings.pecorinoEndpoint === undefined) {
            throw new Error('settings.pecorinoEndpoint undefined.');
        }
        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore if */
        if (settings.pecorinoAuthClient === undefined) {
            throw new Error('settings.pecorinoAuthClient undefined.');
        }

        const depositService = new pecorinoapi.service.transaction.Deposit({
            endpoint: settings.pecorinoEndpoint,
            auth: settings.pecorinoAuthClient
        });

        await ProgramMembershipService.register(data)({
            action: new ActionRepo(settings.connection),
            orderNumber: new OrderNumberRepo(settings.redisClient),
            seller: new SellerRepo(settings.connection),
            ownershipInfo: new OwnershipInfoRepo(settings.connection),
            person: new PersonRepo(settings.cognitoIdentityServiceProvider),
            programMembership: new ProgramMembershipRepo(settings.connection),
            registerActionInProgressRepo: new RegisterProgramMembershipInProgressRepo(settings.redisClient),
            transaction: new TransactionRepo(settings.connection),
            depositService: depositService
        });
    };
}
