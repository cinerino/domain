import * as GMO from '@motionpicture/gmo-service';

import { IConnectionSettings, IOperation } from '../task';

import * as factory from '../../factory';

import { RedisRepository as AccountNumberRepo } from '../../repo/accountNumber';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { RedisRepository as RegisterProgramMembershipInProgressRepo } from '../../repo/action/registerProgramMembershipInProgress';
import { MongoRepository as OrderRepo } from '../../repo/order';
import { RedisRepository as OrderNumberRepo } from '../../repo/orderNumber';
import { MongoRepository as OwnershipInfoRepo } from '../../repo/ownershipInfo';
import { GMORepository as CreditCardRepo } from '../../repo/paymentMethod/creditCard';
import { CognitoRepository as PersonRepo } from '../../repo/person';
import { MongoRepository as ProjectRepo } from '../../repo/project';
import { MongoRepository as SellerRepo } from '../../repo/seller';
import { MongoRepository as TaskRepo } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import * as ProgramMembershipService from '../programMembership';
import { orderProgramMembership } from '../transaction/orderProgramMembership';

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

        const projectRepo = new ProjectRepo(settings.connection);
        const project = await projectRepo.findById({ id: data.project.id });
        if (project.settings === undefined
            || project.settings.gmo === undefined
            || project.settings.cognito === undefined) {
            throw new factory.errors.ServiceUnavailable('Project settings undefined');
        }

        const personRepo = new PersonRepo({
            userPoolId: project.settings.cognito.customerUserPool.id
        });

        switch (data.object.typeOf) {
            // 旧メンバーシップ注文タスクへの互換性維持のため
            case <any>'Offer':
                const creditCardRepo = new CreditCardRepo({
                    siteId: project.settings.gmo.siteId,
                    sitePass: project.settings.gmo.sitePass,
                    cardService: new GMO.service.Card({ endpoint: project.settings.gmo.endpoint })
                });

                await orderProgramMembership(<any>data)({
                    accountNumber: new AccountNumberRepo(settings.redisClient),
                    action: new ActionRepo(settings.connection),
                    creditCard: creditCardRepo,
                    orderNumber: new OrderNumberRepo(settings.redisClient),
                    seller: new SellerRepo(settings.connection),
                    ownershipInfo: new OwnershipInfoRepo(settings.connection),
                    person: personRepo,
                    project: new ProjectRepo(settings.connection),
                    registerActionInProgressRepo: new RegisterProgramMembershipInProgressRepo(settings.redisClient),
                    transaction: new TransactionRepo(settings.connection)
                });

                break;

            case factory.chevre.programMembership.ProgramMembershipType.ProgramMembership:
                await ProgramMembershipService.register(data)({
                    action: new ActionRepo(settings.connection),
                    order: new OrderRepo(settings.connection),
                    person: personRepo,
                    project: new ProjectRepo(settings.connection),
                    task: new TaskRepo(settings.connection)
                });

                break;

            default:
                throw new factory.errors.Argument('Object', `Invalid object type: ${(<any>data.object).typeOf}`);
        }
    };
}
